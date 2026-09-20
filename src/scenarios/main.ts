// Live console: run any text world in front of an audience, with real Jev when the dev server proxies it.
import { CallEnv, REPLIES } from '../env/call/index'
import { CheckoutEnv, CLICKS } from '../env/checkout/index'
import { HabitsEnv, PROPOSALS } from '../env/habits/index'
import { RpsEnv } from '../env/rps/index'
import { lcg } from '../env/shared'
import { MOVES, TicketsEnv } from '../env/tickets/index'
import { Agent, type TickResult } from '../loop'
import { FableAccommodator } from '../model/fable'
import { JEV_USD_PER_INPUT_TOKEN, JevPredictor } from '../model/jev'
import { RuleAccommodator, RulePredictor } from '../model/rules'
import { createWorldModel } from '../model/worldmodel'
import { actionText, type Action, type Environment } from '../types'
import { Panel } from '../ui/panel'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEnv = Environment<any>
const WORLDS: Record<string, { seed: number; make: (seed: number) => AnyEnv; actions: readonly string[]; about: string }> = {
  call: { seed: 7, make: s => new CallEnv(lcg(s)), actions: REPLIES, about: 'A synthetic phone call: the caller has an intent and a mood the agent learns only through surprise; whether the request is urgent, and whether details were already asked for, stay hidden until a concept unlocks them.' },
  checkout: { seed: 11, make: s => new CheckoutEnv(lcg(s)), actions: CLICKS, about: 'A web shop with no documentation: the agent learns which button does what by clicking; whether the user is signed in and whether address and payment are valid are hidden until unlocked.' },
  tickets: { seed: 23, make: s => new TicketsEnv(lcg(s)), actions: MOVES, about: "A team's ticket queue: will this be closed by Friday depends on the assignee's load and on blockers the agent cannot see at first." },
  habits: { seed: 5, make: s => new HabitsEnv(lcg(s)), actions: PROPOSALS, about: "One person's routine: the agent proposes slots and learns when they say yes; weather, energy and recent refusals are hidden until unlocked." },
  rps: { seed: 42, make: s => new RpsEnv(lcg(s)), actions: ['play_rock', 'play_paper', 'play_scissors'], about: 'Rock-paper-scissors against an opponent with a hidden habit: the rules are known, but that the opponent counters or copies your last move (and switches every sixty rounds) is not.' },
}

const settings = {
  world: localStorage.getItem('sc.world') ?? 'call',
  predictor: localStorage.getItem('sc.predictor') ?? 'rules',
  accommodator: localStorage.getItem('sc.accommodator') ?? 'heuristic',
  anthropicKey: localStorage.getItem('anthropicKey') ?? '',
  fableModel: localStorage.getItem('fableModel') || 'claude-fable-5-1',
  ask: true, valid: true,
}
if (!(settings.world in WORLDS)) settings.world = 'call'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const panel = new Panel($('agent'))
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const pct = (x: number) => `${Math.round(x * 100)}%`
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

let seed = WORLDS[settings.world].seed
let env: AnyEnv = WORLDS[settings.world].make(seed)
let jev: JevPredictor | undefined
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let agent: Agent<any> = newAgent()
function newAgent() {
  return new Agent(env, createWorldModel(), { escalate: escalateFn() })
}
// undefined (not a resolver) so loop.ts does not record the question as asked
function escalateFn() {
  return settings.ask ? (q: { text: string }) => panel.ask(q.text) : undefined
}
function applyModels() {
  jev = undefined
  if (settings.predictor.startsWith('jev')) {
    const withRules = settings.predictor === 'jev'
    jev = new JevPredictor('via-proxy', import.meta.env.DEV ? { endpoint: './api/jev', withRules } : { withRules })
  }
  agent.predictor = jev ?? new RulePredictor()
  agent.accommodator = settings.accommodator === 'fable' && settings.anthropicKey ? new FableAccommodator(settings.anthropicKey, env.concepts, settings.fableModel) : new RuleAccommodator()
}

function statusOf(r?: TickResult, lead = '') {
  const parts = [lead, r && `via ${r.predictor}`, ...(r?.warnings ?? [])]
  if (jev?.stats.calls) parts.push(`jev ${Math.round(jev.stats.ms / jev.stats.calls)} ms mean · $${(jev.stats.inputTokens * JEV_USD_PER_INPUT_TOKEN).toFixed(4)} so far`)
  return parts.filter(Boolean).join(' · ')
}
function render(last = agent.log.at(-1), lead?: string) {
  $('world').textContent = JSON.stringify(env.observe(), null, 2)
  panel.render(agent, last, statusOf(last, lead))
  $('runlog').innerHTML = agent.log.slice(-40).reverse().map(t => {
    const qs = t.questions.map(q => {
      const p = t.predictions[q.id], truth = t.truths[q.id]
      const tag = t.surprised.includes(q.id) ? 'surprised' : t.escalated.includes(q.id) ? 'asked' : (p.prob > 0.5) === truth ? 'matched' : 'wrong, unsure'
      return `<div>${esc(q.text)} · p(yes) ${pct(p.prob)} → <b>${truth ? 'yes' : 'no'}</b><span class="tag">${tag}</span></div>`
    }).join('')
    const why = t.surprised.length ? t.diffs.filter(d => d.trigger.startsWith('surprise')).map(d => `<div class="why">v${d.version}: ${esc(d.explanation)}</div>`).join('') : ''
    return `<div class="tk${t.surprised.length ? ' surprised' : ''}"><div class="head">#${t.tick} ${esc(actionText(t.action))} <span class="muted">via ${esc(t.predictor)}</span></div>${qs}${why}</div>`
  }).join('') || '<span class="muted">No ticks yet.</span>'
}

let busy = false, autoplay = false, demo = false
async function run(action: Action, stage = 'manual') {
  if (busy) return
  busy = true
  try {
    render(agent.log.at(-1), `${stage}: ${actionText(action)}`)
    const r = await agent.step(action, stage)
    render(r, r.surprised.length ? `surprised → revised v${agent.wm.version}` : r.escalated.length ? 'asked human' : 'matched')
    return r
  } finally { busy = false }
}
async function autoplayLoop() { while (autoplay) { await run(env.randomAction(), 'autoplay'); await sleep(700) } }
async function demoRun() {
  document.body.classList.add('demo')
  for (let i = 0; i < 30 && demo; i++) {
    const r = await run(env.randomAction(), 'demo')
    await sleep(r?.surprised.length ? 1800 : 500)   // hold on a surprise so the audience can read it
  }
  demo = false; $('demo').classList.remove('on'); $('demo').setAttribute('aria-pressed', 'false'); document.body.classList.remove('demo')
}

function setWorld(name: string, keepModel = false) {
  settings.world = name; localStorage.setItem('sc.world', name)
  seed = keepModel ? seed : WORLDS[name].seed
  env = WORLDS[name].make(seed)
  if (keepModel) agent.env = env; else agent = newAgent()
  applyModels()
  $('about').textContent = WORLDS[name].about
  $('actions').innerHTML = WORLDS[name].actions.map(a => `<button class="btn ghost" data-a="${a}">${a.replace(/_/g, ' ')}</button>`).join('') +
    (name === 'checkout' ? `<label><input type="checkbox" id="valid" ${settings.valid ? 'checked' : ''}> fill with valid input</label>` : '')
  const v = document.getElementById('valid') as HTMLInputElement | null
  if (v) v.onchange = () => { settings.valid = v.checked }
}

// ---- controls (menu bar) ----
$('bar').innerHTML = `
  <select id="envSel" aria-label="environment">${Object.keys(WORLDS).map(k => `<option value="${k}">world: ${k}</option>`).join('')}</select>
  <select id="pred" aria-label="predictor"><option value="rules">predictor: rules</option><option value="jev">predictor: Jev (rules in context)</option><option value="jev0">predictor: Jev zero-shot</option></select>
  <select id="acc" aria-label="accommodator"><option value="heuristic">accommodator: heuristic</option><option value="fable">accommodator: Fable</option></select>
  <input id="anthropicKey" placeholder="Anthropic API key" aria-label="Anthropic API key" type="password">
  <input id="fableModel" placeholder="claude-fable-5-1" aria-label="Fable model">
  <label><input type="checkbox" id="ask" checked> ask me when unsure</label>
  <span class="sep"></span>
  <button id="step">step</button>
  <button id="step10">step ×10</button>
  <button id="auto" aria-pressed="false">autoplay</button>
  <button id="demo" aria-pressed="false">demo run</button>
  <span class="sep"></span>
  <button id="forget">reset world model</button>
  <button id="reseed">new seed</button>
  <button id="export">export model</button>`
$<HTMLSelectElement>('envSel').value = settings.world; $<HTMLSelectElement>('pred').value = settings.predictor; $<HTMLSelectElement>('acc').value = settings.accommodator
$<HTMLInputElement>('anthropicKey').value = settings.anthropicKey; $<HTMLInputElement>('fableModel').value = settings.fableModel
if (!import.meta.env.DEV) $('jev-notice').hidden = false

$('envSel').onchange = () => { setWorld($<HTMLSelectElement>('envSel').value); render(undefined, `world: ${settings.world}`) }
for (const id of ['pred', 'acc', 'anthropicKey', 'fableModel'] as const) {
  $(id).onchange = () => {
    settings.predictor = $<HTMLSelectElement>('pred').value; settings.accommodator = $<HTMLSelectElement>('acc').value
    settings.anthropicKey = $<HTMLInputElement>('anthropicKey').value; settings.fableModel = $<HTMLInputElement>('fableModel').value || 'claude-fable-5-1'
    localStorage.setItem('sc.predictor', settings.predictor); localStorage.setItem('sc.accommodator', settings.accommodator)
    localStorage.setItem('anthropicKey', settings.anthropicKey); localStorage.setItem('fableModel', settings.fableModel)
    applyModels(); render(agent.log.at(-1), `predictor ${agent.predictor.name}, accommodator ${agent.accommodator.name}`)
  }
}
$<HTMLInputElement>('ask').onchange = e => { settings.ask = (e.target as HTMLInputElement).checked; agent.opts.escalate = escalateFn() }
$('step').onclick = () => void run(env.randomAction(), 'random')
$('step10').onclick = async () => { for (let i = 0; i < 10; i++) await run(env.randomAction(), 'random') }
$('auto').onclick = () => { autoplay = !autoplay; $('auto').classList.toggle('on', autoplay); $('auto').setAttribute('aria-pressed', String(autoplay)); if (autoplay) void autoplayLoop() }
$('demo').onclick = () => { demo = !demo; $('demo').classList.toggle('on', demo); $('demo').setAttribute('aria-pressed', String(demo)); if (demo) void demoRun() }
$('forget').onclick = () => { agent.wm = createWorldModel(); agent.metrics.records = []; agent.metrics.accommodations = []; agent.log = []; agent.tick = 0; render(undefined, 'model forgotten, world kept') }
$('reseed').onclick = () => { seed = Math.floor(Math.random() * 1e6); setWorld(settings.world, true); render(agent.log.at(-1), `new seed ${seed}`) }
$('export').onclick = () => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(agent.wm, null, 2)], { type: 'application/json' }))
  a.download = `worldmodel-${settings.world}-v${agent.wm.version}.json`; a.click()
}
$('actions').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-a]'); if (!b) return
  const kind = b.dataset.a!
  void run(kind.startsWith('fill_') ? { kind, params: { valid: settings.valid ? 'yes' : 'no' } } : { kind })
})

setWorld(settings.world)
render(undefined, 'ready: pick a world, then step or demo run')

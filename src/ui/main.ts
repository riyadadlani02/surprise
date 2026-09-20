import { CURRICULUM } from '../curriculum'
import { PlayroomEnv } from '../env/playroom/index'
import { Playroom, initRapier, quatX, specOf, type ObjId } from '../env/playroom/physics'
import { Agent } from '../loop'
import { FableAccommodator } from '../model/fable'
import { JevPredictor } from '../model/jev'
import { RuleAccommodator, RulePredictor } from '../model/rules'
import { createWorldModel } from '../model/worldmodel'
import type { Action } from '../types'
import { Panel } from './panel'
import { View } from './render'

await initRapier()
const room = new Playroom()
const view = new View(document.getElementById('scene')!, room)
const env = new PlayroomEnv(room, () => new Promise<void>(res => {
  let n = 0
  const check = () => { n++; if ((n > 30 && room.isStill()) || n > 360) res(); else requestAnimationFrame(check) }
  requestAnimationFrame(check)
}))
const panel = new Panel(document.getElementById('panel')!)
const agent = new Agent(env, createWorldModel(), { escalate: q => settings.ask ? panel.ask(q.text) : Promise.resolve(undefined) })

const settings = {
  ask: true,
  jevKey: localStorage.getItem('jevKey') ?? '',
  anthropicKey: localStorage.getItem('anthropicKey') ?? '',
  fableModel: localStorage.getItem('fableModel') || 'claude-fable-5-1',
  predictor: localStorage.getItem('predictor') ?? 'rules',
  accommodator: localStorage.getItem('accommodator') ?? 'heuristic',
}
function applyModels() {
  agent.predictor = settings.predictor === 'jev' && settings.jevKey ? new JevPredictor(settings.jevKey) : new RulePredictor()
  agent.accommodator = settings.accommodator === 'fable' && settings.anthropicKey ? new FableAccommodator(settings.anthropicKey, env.concepts, settings.fableModel) : new RuleAccommodator()
}
applyModels()

// Physics runs every frame; agent actions wait for stillness (see env.settle above).
let paused = false
const loop = () => { if (!paused) room.step(2); view.frame(); requestAnimationFrame(loop) }
loop()

let busy = false, autoplay = false, status = 'idle'
async function run(action: Action, stage = 'free') {
  if (busy) return
  busy = true
  try {
    status = `${stage}: ${action.kind}${action.obj ? ' ' + action.obj : ''}`; panel.render(agent, agent.log.at(-1), status)
    if (action.obj) view.flash(action.obj as ObjId)
    const r = await agent.step(action, stage)
    for (const q of r.surprised) { void q; if (action.obj) view.flash(action.obj as ObjId) }
    status = r.surprised.length ? 'surprised → revised v' + agent.wm.version : r.escalated.length ? 'asked human' : 'matched'
    panel.render(agent, r, status)
  } finally { busy = false }
}
async function curriculumRound() {
  for (const t of CURRICULUM) { if (!autoplay && stopRound) break; t.setup(room); await run(t.action, t.stage) }
}
let stopRound = false
async function autoplayLoop() { while (autoplay) { await run(env.randomAction(), 'random'); await new Promise(r => setTimeout(r, 400)) } }

// ---- controls (top bar) ----
const bar = document.createElement('div'); bar.id = 'bar'
bar.innerHTML = `
  <button id="round">▶ Curriculum round</button>
  <button id="auto">⟳ Autoplay</button>
  <label><input type="checkbox" id="ask" checked> ask me when unsure</label>
  <span class="sep"></span>
  <select id="kind">${['lift', 'drop', 'stack', 'push', 'tilt', 'cover', 'uncover', 'place_on_ramp', 'wait'].map(k => `<option>${k}</option>`).join('')}</select>
  <select id="obj">${['red', 'blue', 'green', 'ball', 'cup', 'box'].map(k => `<option>${k}</option>`).join('')}</select>
  <select id="target">${['blue', 'red', 'green', 'box'].map(k => `<option>${k}</option>`).join('')}</select>
  <select id="param"><option value="">centred</option><option value="0.9">overhanging</option><option value="left">left</option><option value="right">right</option><option value="forward">forward</option><option value="back">back</option></select>
  <button id="do">Do it</button>
  <span class="sep"></span>
  <label>gravity <input type="range" id="g" min="0.5" max="15" step="0.5" value="9.81"></label>
  <button id="heavy">⚖ toggle heavy</button>
  <button id="hide">🥤 hide ball</button>
  <button id="reset">↺ reset scene</button>
  <button id="forget">🧹 forget model</button>
  <button id="export">⤓ export model</button>
  <span class="sep"></span>
  <select id="pred"><option value="rules">predictor: rules</option><option value="jev">predictor: Jev</option></select>
  <select id="acc"><option value="heuristic">accommodator: heuristic</option><option value="fable">accommodator: Fable</option></select>
  <input id="jevKey" placeholder="TypeSafe API key" type="password">
  <input id="anthropicKey" placeholder="Anthropic API key" type="password">
  <input id="fableModel" placeholder="claude-fable-5-1">`
document.getElementById('app')!.prepend(bar)
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
;($<HTMLSelectElement>('pred')).value = settings.predictor; ($<HTMLSelectElement>('acc')).value = settings.accommodator
;($<HTMLInputElement>('jevKey')).value = settings.jevKey; ($<HTMLInputElement>('anthropicKey')).value = settings.anthropicKey; ($<HTMLInputElement>('fableModel')).value = settings.fableModel

$('round').onclick = async () => { stopRound = false; await curriculumRound() }
$('auto').onclick = () => { autoplay = !autoplay; $('auto').classList.toggle('on', autoplay); if (autoplay) void autoplayLoop() }
$<HTMLInputElement>('ask').onchange = e => { settings.ask = (e.target as HTMLInputElement).checked }
$('do').onclick = () => {
  const kind = $<HTMLSelectElement>('kind').value, obj = $<HTMLSelectElement>('obj').value, target = $<HTMLSelectElement>('target').value, p = $<HTMLSelectElement>('param').value
  const a: Action = { kind, obj, target: kind === 'stack' ? target : undefined }
  if (kind === 'stack') a.params = { offset: p === '0.9' ? 0.9 : 0 }
  if (kind === 'push') a.params = { dir: ['left', 'right', 'forward', 'back'].includes(p) ? p : 'right' }
  if (kind === 'uncover' || kind === 'wait') delete a.obj
  void run(a, 'manual')
}
$<HTMLInputElement>('g').oninput = e => room.setGravity(-Number((e.target as HTMLInputElement).value))
$('heavy').onclick = () => { const o = $<HTMLSelectElement>('obj').value as ObjId; room.setHeavy(o, !room.isHeavy(o)); view.flash(o); status = `${o} is now ${room.isHeavy(o) ? 'heavy' : 'normal'}`; panel.render(agent, agent.log.at(-1), status) }
$('hide').onclick = () => { const p = room.pos('ball'); room.release('cup'); room.place('cup', p.x, specOf('cup').half[1] + 0.01, p.z, quatX(Math.PI)); status = 'you hid the ball'; panel.render(agent, agent.log.at(-1), status) }
$('reset').onclick = () => { room.reset(); status = 'scene reset'; panel.render(agent, agent.log.at(-1), status) }
$('forget').onclick = () => { agent.wm = createWorldModel(); agent.metrics.records = []; agent.metrics.accommodations = []; agent.log = []; agent.tick = 0; panel.render(agent, undefined, 'model forgotten') }
$('export').onclick = () => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(agent.wm, null, 2)], { type: 'application/json' }))
  a.download = `worldmodel-v${agent.wm.version}.json`; a.click()
}
for (const id of ['pred', 'acc', 'jevKey', 'anthropicKey', 'fableModel'] as const) {
  $(id).onchange = () => {
    settings.predictor = $<HTMLSelectElement>('pred').value; settings.accommodator = $<HTMLSelectElement>('acc').value
    settings.jevKey = $<HTMLInputElement>('jevKey').value; settings.anthropicKey = $<HTMLInputElement>('anthropicKey').value; settings.fableModel = $<HTMLInputElement>('fableModel').value || 'claude-fable-5-1'
    localStorage.setItem('predictor', settings.predictor); localStorage.setItem('accommodator', settings.accommodator)
    localStorage.setItem('jevKey', settings.jevKey); localStorage.setItem('anthropicKey', settings.anthropicKey); localStorage.setItem('fableModel', settings.fableModel)
    applyModels(); panel.render(agent, agent.log.at(-1), `predictor ${agent.predictor.name}, accommodator ${agent.accommodator.name}`)
  }
}
view.onDragEnd = id => { status = `you moved ${id}`; panel.render(agent, agent.log.at(-1), status) }
document.addEventListener('keydown', e => { if (e.key === ' ' && e.target === document.body) { paused = !paused; e.preventDefault() } })
panel.render(agent, undefined, 'ready — run a curriculum round, or drag things around')

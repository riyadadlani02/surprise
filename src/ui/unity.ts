// Unity playroom page: the Rapier demo's agent, panel and controls, with physics and picture from a Unity WebGL build.
import { CURRICULUM } from '../curriculum'
import { PlayroomEnv } from '../env/playroom/index'
import { quatX, specOf, type ObjId } from '../env/playroom/physics'
import { loadUnity, UnityRoom } from '../env/playroom/unityRoom'
import { Agent } from '../loop'
import { FableAccommodator } from '../model/fable'
import { JevPredictor } from '../model/jev'
import { RuleAccommodator, RulePredictor } from '../model/rules'
import { createWorldModel } from '../model/worldmodel'
import type { Action } from '../types'
import { Panel } from './panel'

const root = document.getElementById('unity')!
root.innerHTML = `
  <div class="head"><h1>Playroom, In Unity</h1><p class="label" style="margin:0">same agent · same world model · different physics engine</p></div>
  <div class="grid">
    <div>
      <div class="win"><div class="win-title"><span>playroom · unity</span><span id="status" aria-live="polite"></span></div>
        <div class="win-body"><div id="stage"><div class="missing mono" id="loading">loading unity build…</div></div><div id="bar"></div></div></div>
    </div>
    <div class="win"><div class="win-title"><span>agent</span><span class="dots">···</span></div><div class="win-body" id="panel"></div></div>
  </div>`
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const stage = $('stage')

let instance
try { instance = await loadUnity(stage) }
catch (e) {
  stage.innerHTML = `<div class="missing">
    <p class="label">unity build not found</p>
    <p class="statement" style="font-size:20px">Build it once with Unity 6 (WebGL module installed), then reload.</p>
    <pre class="mono">/Applications/Unity/Hub/Editor/&lt;version&gt;/Unity.app/Contents/MacOS/Unity -batchmode -quit -projectPath "$(pwd)/unity" -executeMethod BuildWebGL.Build -logFile -</pre>
    <p class="mono" style="font-size:12px">${String((e as Error).message)}</p>
    <p>Output lands in <code>public/unity/</code>. Details in <code>unity/README.md</code>. Meanwhile the <a href="./demo.html">Rapier playroom</a> runs the same agent in the browser.</p>
  </div>`
  $('panel').innerHTML = '<p class="muted mono">waiting for a unity build</p>'
  throw e
}
$('loading')?.remove()

const room = new UnityRoom(instance)
// Wait until Unity reports stillness (after 30 frames) or 6 s, so the viewer sees things fall.
const env = new PlayroomEnv(room, () => new Promise<void>(res => {
  let n = 0
  const check = () => { n++; if ((n > 30 && room.isStill()) || n > 360) res(); else requestAnimationFrame(check) }
  requestAnimationFrame(check)
}))
const panel = new Panel($('panel'))
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

let busy = false, autoplay = false, stopRound = false, status = 'idle'
const show = (s: string) => { status = s; panel.render(agent, agent.log.at(-1), status) }
async function run(action: Action, stage = 'free') {
  if (busy) return
  busy = true
  try {
    show(`${stage}: ${action.kind}${action.obj ? ' ' + action.obj : ''}`)
    const r = await agent.step(action, stage)
    status = r.surprised.length ? 'surprised → revised v' + agent.wm.version : r.escalated.length ? 'asked human' : 'matched'
    panel.render(agent, r, status)
  } finally { busy = false }
}
async function curriculumRound() {
  for (const t of CURRICULUM) { if (!autoplay && stopRound) break; t.setup(room); await env.settle(); await run(t.action, t.stage) }
}
async function autoplayLoop() { while (autoplay) { await run(env.randomAction(), 'random'); await new Promise(r => setTimeout(r, 400)) } }

$('bar').innerHTML = `
  <button id="round">curriculum round</button>
  <button id="auto" aria-pressed="false">autoplay</button>
  <label><input type="checkbox" id="ask" checked> ask me when unsure</label>
  <span class="sep"></span>
  <select id="kind" aria-label="action">${['lift', 'drop', 'stack', 'push', 'tilt', 'cover', 'uncover', 'place_on_ramp', 'wait'].map(k => `<option>${k}</option>`).join('')}</select>
  <select id="obj" aria-label="object">${['red', 'blue', 'green', 'ball', 'cup', 'box'].map(k => `<option>${k}</option>`).join('')}</select>
  <select id="target" aria-label="target">${['blue', 'red', 'green', 'box'].map(k => `<option>${k}</option>`).join('')}</select>
  <select id="param" aria-label="parameter"><option value="">centred</option><option value="0.9">overhanging</option><option value="left">left</option><option value="right">right</option><option value="forward">forward</option><option value="back">back</option></select>
  <button id="do">do it</button>
  <span class="sep"></span>
  <label>gravity <input type="range" id="g" min="0.5" max="15" step="0.5" value="9.81"></label>
  <button id="heavy">toggle heavy</button>
  <button id="hide">hide ball</button>
  <button id="reset">reset scene</button>
  <button id="forget">forget model</button>
  <span class="sep"></span>
  <select id="pred" aria-label="predictor"><option value="rules">predictor: rules</option><option value="jev">predictor: Jev</option></select>
  <select id="acc" aria-label="accommodator"><option value="heuristic">accommodator: heuristic</option><option value="fable">accommodator: Fable</option></select>
  <input id="jevKey" placeholder="TypeSafe API key" type="password" aria-label="TypeSafe API key">
  <input id="anthropicKey" placeholder="Anthropic API key" type="password" aria-label="Anthropic API key">
  <input id="fableModel" placeholder="claude-fable-5-1" aria-label="Fable model">`
$<HTMLSelectElement>('pred').value = settings.predictor; $<HTMLSelectElement>('acc').value = settings.accommodator
$<HTMLInputElement>('jevKey').value = settings.jevKey; $<HTMLInputElement>('anthropicKey').value = settings.anthropicKey; $<HTMLInputElement>('fableModel').value = settings.fableModel

$('round').onclick = async () => { stopRound = false; await curriculumRound() }
$('auto').onclick = () => { autoplay = !autoplay; $('auto').classList.toggle('on', autoplay); $('auto').setAttribute('aria-pressed', String(autoplay)); if (autoplay) void autoplayLoop() }
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
$('heavy').onclick = () => { const o = $<HTMLSelectElement>('obj').value as ObjId; room.setHeavy(o, !room.isHeavy(o)); show(`${o} is now ${room.isHeavy(o) ? 'heavy' : 'normal'}`) }
$('hide').onclick = () => { const p = room.pos('ball'); room.release('cup'); room.place('cup', p.x, specOf('cup').half[1] + 0.01, p.z, quatX(Math.PI)); show('you hid the ball') }
$('reset').onclick = () => { room.reset(); show('scene reset') }
$('forget').onclick = () => { agent.wm = createWorldModel(); agent.metrics.records = []; agent.metrics.accommodations = []; agent.log = []; agent.tick = 0; panel.render(agent, undefined, 'model forgotten') }
for (const id of ['pred', 'acc', 'jevKey', 'anthropicKey', 'fableModel'] as const) {
  $(id).onchange = () => {
    settings.predictor = $<HTMLSelectElement>('pred').value; settings.accommodator = $<HTMLSelectElement>('acc').value
    settings.jevKey = $<HTMLInputElement>('jevKey').value; settings.anthropicKey = $<HTMLInputElement>('anthropicKey').value; settings.fableModel = $<HTMLInputElement>('fableModel').value || 'claude-fable-5-1'
    localStorage.setItem('predictor', settings.predictor); localStorage.setItem('accommodator', settings.accommodator)
    localStorage.setItem('jevKey', settings.jevKey); localStorage.setItem('anthropicKey', settings.anthropicKey); localStorage.setItem('fableModel', settings.fableModel)
    applyModels(); show(`predictor ${agent.predictor.name}, accommodator ${agent.accommodator.name}`)
  }
}
panel.render(agent, undefined, 'ready. run a curriculum round or pick an action')

// Page wiring for the voice navigation aid: simulated room by default, live camera on request.
import * as THREE from 'three'
import { Playroom, initRapier, type ObjId } from '../env/playroom/physics'
import { Agent, type TickResult } from '../loop'
import { createWorldModel } from '../model/worldmodel'
import { ruleConfidence, ruleProb, type Action, type Environment, type Prediction, type Relation } from '../types'
import { View } from '../ui/render'
import { Camera, CameraEnv, DEFAULT_MODEL, describeFrame, type Report } from './camera'
import { NAMES, SAFETY, UNSURE, around, guidance, outcome, whereIs } from './guide'
import { NavEnv, TURN, headingName } from './navEnv'
import { Voice, type Command } from './voice'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const pct = (x: number) => `${Math.round(x * 100)}%`

// ---- simulated room ----
await initRapier()
const room = new Playroom(); room.settle()
const sim = new NavEnv(room, { settle: () => new Promise(r => setTimeout(r, 200)) })
const view = new View($('scene'), room)
const avatar = new THREE.Group()
avatar.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1, 20), new THREE.MeshStandardMaterial({ color: 0xfefefe, roughness: 0.6 })))
const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 12), new THREE.MeshStandardMaterial({ color: 0xf386a1 }))
arrow.rotation.x = -Math.PI / 2; arrow.position.set(0, 0.45, -0.4)   // tip toward -z, the heading-0 direction
avatar.add(arrow); view.scene.add(avatar)
const frame = () => {
  room.step(2)
  const p = sim.body.translation(); avatar.position.set(p.x, p.y, p.z); avatar.rotation.y = -sim.heading
  view.frame(); requestAnimationFrame(frame)
}
frame()

// ---- voice ----
const voice = new Voice($('said'))
const log = (k: string, text: string) => {
  const li = document.createElement('li'); li.innerHTML = `<span class="k">${esc(k)}</span>${esc(text)}`
  const ul = $('log'); ul.prepend(li); while (ul.children.length > 200) ul.lastChild!.remove()
}
voice.onSpoken = t => log('said', t)
voice.onHeard = t => log('heard', t)
voice.say(SAFETY)
// Browsers may refuse speech before a gesture; repeat the notice aloud on the first one if it never played.
const firstGesture = () => { if (!voice.everSpoke) voice.say(SAFETY); removeEventListener('pointerdown', firstGesture); removeEventListener('keydown', firstGesture) }
addEventListener('pointerdown', firstGesture); addEventListener('keydown', firstGesture)

// ---- agents: one per environment, both on the rule predictor ----
let pendingReport: ((r: Report | undefined) => void) | undefined
const REPORT_TIMEOUT = 20_000
/** Ask "clear or bumped?" and wait for the answer; undefined on stop, camera off or timeout. */
const askReport = () => new Promise<Report | undefined>(res => {
  voice.say('Clear or bumped?')
  const t = setTimeout(() => pendingReport?.(undefined), REPORT_TIMEOUT)
  pendingReport = r => { clearTimeout(t); pendingReport = undefined; res(r) }
})
const cam = new CameraEnv()
const agents = { sim: new Agent(sim, createWorldModel(), { escalate: async () => undefined }), cam: new Agent(cam, createWorldModel(), { escalate: async () => undefined }) }
let mode: 'sim' | 'cam' = 'sim'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agent = (): Agent<any> => agents[mode]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env = (): Environment<any> => agent().env
const relations = () => { const e = env(); return e.serialize(e.observe(), agent().wm.concepts) }

let busy = false, walking = false, cancelled = false
/** Predict, speak the guidance, act, speak the outcome. Returns the tick, or undefined when the guide refused to step. */
async function run(action: Action, opts: { stopIfUnsure?: boolean } = {}): Promise<TickResult | undefined> {
  if (busy) { voice.say(pendingReport ? 'Answer clear or bumped first.' : 'One moment.'); return }
  busy = true; cancelled = false
  try {
    const a = agent(), e = env(), pre = e.observe(), rels = e.serialize(pre, a.wm.concepts)
    const questions = e.questionsFor(action, pre).map(q => ({ id: q.id, text: q.text }))
    const preds: Record<string, Prediction> = questions.length ? await a.predictor.predict({ state: rels, action, questions, wm: a.wm }) : {}
    const say = guidance(action, preds, rels)
    if (say) voice.say(say)
    if (opts.stopIfUnsure && (say === UNSURE || (preds.blocked?.prob ?? 0) > 0.5)) { renderBeliefs(preds, rels); return }
    await voice.settled()
    if (cancelled) return
    if (mode === 'cam' && questions.length) {
      // The user takes the real step; their answer is the truth. No answer, no learning from this tick.
      cam.report = await askReport()
      if (cancelled) return
      if (!cam.report) { voice.say('No report taken; nothing learned from that step.'); return }
    }
    const r = await a.step(action)
    if (mode === 'sim') voice.say(outcome(action, (sim.observe()).blocked, headingName(sim.heading)))
    if (r.surprised.length) log('agent', `surprised → model v${a.wm.version}: ${a.wm.history.at(-1)?.explanation ?? ''}`)
    renderBeliefs(preds, rels, r)
    return r
  } finally { busy = false }
}

function renderBeliefs(preds: Record<string, Prediction>, rels: Relation[], last?: TickResult) {
  const wm = agent().wm
  const qs = Object.entries(preds).map(([id, p]) => {
    const t = last?.truths[id], tag = t === undefined ? '' : last?.surprised.includes(id) ? ' · surprised' : (p.prob > 0.5) === t ? ' · matched' : ' · wrong, unsure'
    return `<p class="pred">${esc(id)} <span class="meter" aria-hidden="true"><i style="width:${p.prob * 100}%"></i></span> p=${pct(p.prob)} conf=${pct(p.confidence)}<span class="muted">${tag}</span></p>`
  }).join('') || '<p class="pred muted">No prediction for this action.</p>'
  const rules = wm.rules.slice().sort((a, b) => a.action.localeCompare(b.action) || a.question.localeCompare(b.question)).map(r =>
    `<tr><td>${esc(r.action)}</td><td>${r.requires.map(esc).join('<br>') || '<span class="muted">always</span>'}</td><td>${esc(r.question)}</td><td>${pct(ruleProb(r))}</td><td>${pct(ruleConfidence(r))}</td><td>${r.yes}/${r.yes + r.no}</td></tr>`).join('')
  $('believes').innerHTML = `
    <p class="mono muted" style="margin:0 0 8px">state: ${rels.map(r => esc(`${r.pred}(${r.args.join(',')})`)).join(' ') || 'empty'}</p>
    ${qs}
    <p class="mono" style="margin:12px 0 6px">concepts: ${wm.concepts.map(c => `<span class="chip">${esc(c)}</span>`).join('') || '<span class="muted">none yet</span>'} · model v${wm.version} · ${wm.rules.length} rules · ${agent().tick} ticks</p>
    <table><thead><tr><th>action</th><th>when</th><th>question</th><th>p(yes)</th><th>conf</th><th>yes/n</th></tr></thead><tbody>${rules}</tbody></table>`
}

// ---- commands ----
const HELP = 'Say forward, back, left or right. Ask what is around me, where am I, or where is the cup. Say take me to the ball to walk there step by step. Say stop, repeat, mute or unmute.'
async function takeMeTo(id: ObjId) {
  sim.target = id; walking = true
  voice.say(`Taking you to ${NAMES[id]}. Say stop at any time.`)
  while (walking) {
    const o = sim.observe()
    if (o.targetDist < 0.7) { voice.say(`You have arrived at ${NAMES[id]}.`); break }
    const action: Action = Math.abs(o.targetBearing) > TURN / 2 ? { kind: o.targetBearing > 0 ? 'turn_right' : 'turn_left' } : { kind: 'step_forward' }
    const r = await run(action, { stopIfUnsure: true })
    if (!r) { voice.say('Paused. Say forward to try the step yourself, or stop.'); break }
    if (r.truths.blocked) { voice.say('Paused because the step was blocked. Turn and try again, or say stop.'); break }
  }
  walking = false
}
async function handle(c: Command) {
  if (pendingReport && (c.kind === 'clear' || c.kind === 'bumped')) { const res = pendingReport; pendingReport = undefined; res(c.raw.match(/block/) ? 'blocked' : c.kind); return }
  switch (c.kind) {
    case 'forward': return run({ kind: 'step_forward' })
    case 'back': return run({ kind: 'step_back' })
    case 'left': return run({ kind: 'turn_left' })
    case 'right': return run({ kind: 'turn_right' })
    case 'stop': walking = false; cancelled = true; voice.stopSpeaking(); pendingReport?.(undefined); return voice.say('Stopped.')
    case 'around': if (mode === 'cam' && !(photoB64 && cam.frame)) await look(); return voice.say(around(relations()))
    case 'where_am_i': return voice.say(mode === 'sim' ? `You face ${headingName(sim.heading)}. ${whereIs(relations())}` : around(relations()))
    case 'where_is': {
      if (mode === 'cam') return voice.say('The camera cannot find named objects yet; ask what is around me.')
      if (!c.obj) return voice.say('Which object? Say for example where is the cup.')
      const keep = sim.target; sim.target = c.obj as ObjId
      const s = whereIs(relations()); sim.target = keep
      return voice.say(s)
    }
    case 'take_me':
      if (mode === 'cam') return voice.say('Auto-walking needs the simulated room. Say forward when you are ready to step.')
      if (!c.obj) return voice.say('Take you where? Say for example take me to the cup.')
      return takeMeTo(c.obj as ObjId)
    case 'repeat': return voice.say(voice.last)
    case 'help': return voice.say(HELP)
    case 'mute': voice.muted = true; voice.stopSpeaking(); $('mute').setAttribute('aria-pressed', 'true'); return voice.say('Muted. Text continues here.')
    case 'unmute': voice.muted = false; $('mute').setAttribute('aria-pressed', 'false'); return voice.say('Sound on.')
    case 'look': return mode === 'cam' ? look() : voice.say('Turn on the camera first.')
    case 'clear': case 'bumped': return voice.say('Nothing to report right now.')
    default: return voice.say('I did not catch that. Say help for the commands.')
  }
}

// ---- camera mode ----
const camera = new Camera($<HTMLVideoElement>('cam'))
let camTimer: ReturnType<typeof setInterval> | undefined, looking = false
let photoB64: string | undefined   // a still photo standing in for the camera
const key = () => $<HTMLInputElement>('anthropicKey').value.trim()
async function look() {
  if (looking) return
  const b64 = photoB64 ?? camera.grab(); if (!b64) return
  looking = true
  try {
    cam.frame = await describeFrame(key(), b64, $<HTMLInputElement>('camModel').value.trim() || DEFAULT_MODEL)
    log('camera', `${cam.frame.ahead.kind} ${cam.frame.ahead.distance} ahead · conf ${pct(cam.frame.confidence)}${cam.frame.hazards.length ? ' · hazards: ' + cam.frame.hazards.join(', ') : ''}`)
    if (cam.frame.hazards.length) voice.say(`Hazard: ${cam.frame.hazards.join('. ')}.`)
    unsureFrame(cam.frame.confidence < 0.5)
    renderBeliefs({}, relations())
  } catch (e) { cam.frame = undefined; log('camera', `frame failed: ${(e as Error).message}`); unsureFrame(true) }
  finally { looking = false }
}
let wasUnsure = false
/** Say UNSURE once per unsure streak rather than every 2.5 s. */
function unsureFrame(unsure: boolean) { if (unsure && !wasUnsure) voice.say(UNSURE); wasUnsure = unsure }
async function setCamera(on: boolean) {
  const box = $<HTMLInputElement>('useCamera')
  if (!on) { clearInterval(camTimer); camera.stop(); pendingReport?.(undefined); photoB64 = undefined; $('photoView').hidden = true; mode = 'sim'; wasUnsure = false; $('cam').hidden = true; $('scene').hidden = false; $('mode').textContent = 'simulated'; voice.say('Back to the simulated room.'); return }
  const missing = [!navigator.mediaDevices?.getUserMedia && 'a camera', !key() && 'an Anthropic API key in camera settings'].filter(Boolean)
  if (missing.length) { box.checked = false; return voice.say(`Camera mode needs ${missing.join(' and ')}. Staying in the simulated room.`) }
  try { await camera.start() } catch (e) { box.checked = false; return voice.say(`The camera could not start: ${(e as Error).message}. Staying in the simulated room.`) }
  mode = 'cam'; $('cam').hidden = false; $('scene').hidden = true; $('mode').textContent = 'live camera'
  voice.say('Camera on. I will look every few seconds. After each step, tell me clear or bumped.')
  camTimer = setInterval(look, 2500)
}

// ---- photo mode: one still image stands in for the camera (a demo without a camera, or a place you are about to enter) ----
async function usePhoto(blob: Blob, label: string) {
  if (!key()) return voice.say('Photo mode needs an Anthropic API key in camera settings. Staying in the simulated room.')
  const b64 = await toJpegBase64(blob)
  clearInterval(camTimer); camera.stop(); $<HTMLInputElement>('useCamera').checked = false
  photoB64 = b64; cam.frame = undefined; mode = 'cam'; wasUnsure = false
  $('cam').hidden = true; $('scene').hidden = true
  const img = $<HTMLImageElement>('photoView'); img.src = 'data:image/jpeg;base64,' + b64; img.hidden = false
  $('mode').textContent = `photo · ${label}`
  log('photo', label)
  voice.say('Looking at the photo.')
  await look()
  voice.say(cam.frame ? around(relations()) : UNSURE)
}
function toJpegBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => {
      const s = Math.min(1, 800 / Math.max(img.width, img.height)), c = document.createElement('canvas')
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg', 0.8).split(',')[1])
    }
    img.onerror = () => rej(new Error('could not read the image'))
    img.src = URL.createObjectURL(blob)
  })
}
const photoFailed = (err: unknown) => voice.say(`The photo could not be used: ${(err as Error).message}`)
$('photoBtn').addEventListener('click', () => $('photo').click())
$('photo').addEventListener('change', e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) usePhoto(f, f.name).catch(photoFailed) })
$('samplePhoto').addEventListener('click', async () => {
  const r = await fetch('./photos/auditorium.jpg').catch(() => undefined)
  if (!r?.ok || !r.headers.get('content-type')?.startsWith('image/')) return voice.say('No sample photo yet. Add public/photos/auditorium.jpg to the repo, or use your own photo.')
  usePhoto(await r.blob(), 'auditorium').catch(photoFailed)
})
$('backToRoom').addEventListener('click', () => setCamera(false))

// ---- controls ----
$<HTMLInputElement>('anthropicKey').value = localStorage.getItem('anthropicKey') ?? ''
$<HTMLInputElement>('camModel').value = localStorage.getItem('navCamModel') || DEFAULT_MODEL
$('anthropicKey').addEventListener('change', () => localStorage.setItem('anthropicKey', key()))
$('camModel').addEventListener('change', () => localStorage.setItem('navCamModel', $<HTMLInputElement>('camModel').value.trim()))
$('useCamera').addEventListener('change', e => setCamera((e.target as HTMLInputElement).checked))
const listenButton = (on: boolean) => { const b = $('listen'); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Listening' : 'Listen' }
voice.onError = reason => { listenButton(false); voice.say(`${reason} Type commands instead, or allow the microphone and press Listen again.`) }
$('listen').addEventListener('click', () => {
  if (voice.listening) { voice.stopListening(); listenButton(false); return }
  if (!voice.startListening(handle)) return voice.say('Speech recognition is not available here; type commands instead.')
  listenButton(true)
})
$('mute').addEventListener('click', () => handle({ kind: voice.muted ? 'unmute' : 'mute', raw: '' }))
$('repeat').addEventListener('click', () => handle({ kind: 'repeat', raw: '' }))
$('help').addEventListener('click', () => handle({ kind: 'help', raw: '' }))
$('cmd').addEventListener('submit', e => {
  e.preventDefault()
  const input = $<HTMLInputElement>('cmdInput'), t = input.value.trim(); if (!t) return
  input.value = ''; log('typed', t); void handle(voice.parse(t))
})
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-cmd]')) b.addEventListener('click', () => handle(voice.parse(b.dataset.cmd!)))
$('explore').addEventListener('click', async () => {
  if (mode !== 'sim') return voice.say('Exploring needs the simulated room.')
  if (busy) return voice.say('One moment.')
  busy = true
  voice.say('Exploring the room with forty random moves.')
  const slow = sim.settle; sim.settle = () => { room.step(6) }
  try {
    const before = agents.sim.wm.rules.length
    for (let i = 0; i < 40; i++) await agents.sim.step(sim.randomAction(), 'explore')
    renderBeliefs({}, relations())
    voice.say(`Done. ${agents.sim.wm.rules.length - before} new rules, ${agents.sim.wm.concepts.length ? 'concepts: ' + agents.sim.wm.concepts.join(', ') : 'no new concepts yet'}.`)
  } finally { sim.settle = slow; busy = false }
})
renderBeliefs({}, relations())
voice.say('Ready. Say help for the commands.')

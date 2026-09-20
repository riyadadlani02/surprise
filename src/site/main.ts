// Landing page: results charts from ./results/*.json and one animated real surprise. Everything degrades to static text if a fetch fails.
import { calibrationPlot, lineChart, marker, type Series } from './charts'

type PredictorId = 'rules' | 'jev-zero-shot' | 'jev'
interface Third { slice: number; rate: number; accuracy: number; brier: number }
interface Jev { calls: number; ms: number; inputTokens: number; outputTokens: number; errors: number; msPerCall: number; costUsd: number }
interface IndexRun { scenario: string; title: string; kind: string; predictor: PredictorId; predictions: number; accuracy: number; brier: number; thirds: Third[]; concepts: string[]; rules: number; revisions: number; escalationRate: number; jev?: Jev; warnings: number }
interface Run extends IndexRun { calibration?: { lo: number; hi: number; n: number; meanProb: number; hitRate: number }[]; surprises?: { tick: number; action: string; question: string; prob: number; truth: boolean; explanation: string }[] }

// Validated with dataviz/scripts/validate_palette.js --mode light: all checks pass.
const PRED: Record<PredictorId, { name: string; color: string; shape: Series['shape'] }> = {
  rules: { name: 'rules', color: '#4747A8', shape: 'circle' },
  'jev-zero-shot': { name: 'jev zero-shot', color: '#D45BB6', shape: 'square' },
  jev: { name: 'jev + rules', color: '#0F8A6E', shape: 'diamond' },
}
const ORDER: PredictorId[] = ['rules', 'jev-zero-shot', 'jev']
const THIRDS = ['first', 'middle', 'last']
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const pct = (n: number) => `${Math.round(n * 100)}%`
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null

async function getJson<T>(url: string): Promise<T | undefined> {
  try { const r = await fetch(url); return r.ok ? await r.json() as T : undefined } catch { return undefined }
}

// ---- results -------------------------------------------------------------
function legendHtml() {
  return ORDER.map(p => `<span><svg width="14" height="14" viewBox="0 0 14 14">${marker(PRED[p].shape, 7, 7, PRED[p].color)}</svg>${PRED[p].name}</span>`).join('')
}

function scenarioCard(title: string, runs: Partial<Record<PredictorId, Run>>) {
  const present = ORDER.filter(p => runs[p])
  const brier: Series[] = present.map(p => ({ ...PRED[p], values: runs[p]!.thirds.map(t => t.brier) }))
  const esc_: Series[] = present.map(p => ({ ...PRED[p], values: runs[p]!.thirds.map(t => t.rate) }))
  const brierMax = Math.max(0.3, ...brier.flatMap(s => s.values.filter((v): v is number => v !== undefined)))
  const yMax = Math.ceil(brierMax * 10) / 10
  const jev = runs.jev
  const cal = jev?.calibration?.length ? calibrationPlot(`${title}: calibration, jev`, jev.calibration, PRED.jev.color) : `<p class="small mono">no jev run for this scenario</p>`
  const meta = present.map(p => {
    const r = runs[p]!
    return `<div><b>${esc(PRED[p].name)}</b>acc ${pct(r.accuracy)} · brier ${r.brier.toFixed(3)}<br>${r.rules} rules · ${r.revisions} revisions<br><span class="concepts">concepts: ${r.concepts.length ? esc(r.concepts.join(', ')) : 'none'}</span>${r.warnings ? `<br>${r.warnings} fallbacks to rules` : ''}</div>`
  }).join('')
  return `<div class="win scn"><div class="win-title"><span>${esc(title)}</span><span class="dots">${runs[present[0]]?.predictions ?? 0} predictions</span></div><div class="win-body">
    <div class="charts">
      <div class="chart"><h4>brier by third · lower is better</h4>${lineChart(`${title}: brier by third`, brier, THIRDS, yMax)}</div>
      <div class="chart"><h4>escalation rate by third</h4>${lineChart(`${title}: escalation rate by third`, esc_, THIRDS, 1, { fmt: pct, yTicks: [0, 0.5, 1] })}</div>
      <div class="chart"><h4>calibration · jev + rules</h4>${cal}</div>
    </div>
    <div class="scn-meta mono">${meta}</div></div></div>`
}

function summaryTable(runs: IndexRun[]) {
  const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN
  const fmt = (n: number, d = 3) => Number.isFinite(n) ? n.toFixed(d) : 'n/a'
  const rows = ORDER.map(p => {
    const rs = runs.filter(r => r.predictor === p)
    if (!rs.length) return ''
    const js = rs.map(r => r.jev).filter((j): j is Jev => !!j)
    const preds = rs.reduce((n, r) => n + r.predictions, 0)
    const cost = js.length ? js.reduce((n, j) => n + j.costUsd, 0) / Math.max(1, preds) : NaN
    const ms = js.length ? js.reduce((n, j) => n + j.ms, 0) / Math.max(1, js.reduce((n, j) => n + j.calls, 0)) : NaN
    const errors = js.length ? js.reduce((n, j) => n + j.errors, 0) : NaN
    return `<tr><td><i class="swatch" style="background:${PRED[p].color}"></i>${PRED[p].name}</td><td class="num">${fmt(mean(rs.map(r => r.brier)))}</td><td class="num">${fmt(mean(rs.map(r => r.accuracy)) * 100, 1)}%</td><td class="num">${Number.isFinite(ms) ? Math.round(ms) : 'n/a'}</td><td class="num">${Number.isFinite(cost) ? '$' + cost.toFixed(6) : 'n/a'}</td><td class="num">${Number.isFinite(errors) ? errors : 'n/a'}</td><td class="num">${rs.length}</td></tr>`
  }).join('')
  return `<thead><tr><th>predictor</th><th class="num">mean brier</th><th class="num">mean accuracy</th><th class="num">jev ms / call</th><th class="num">jev cost / prediction</th><th class="num">jev errors</th><th class="num">runs</th></tr></thead><tbody>${rows}</tbody>`
}

async function renderResults() {
  const grid = $('scenarios')!, legend = $('legend')!, table = $('summary')!
  legend.innerHTML = legendHtml()
  const index = await getJson<{ generatedAt: string; jevModel: string; runs: IndexRun[] }>('./results/index.json')
  if (!index?.runs?.length) {
    grid.innerHTML = `<p class="mono">No results found at ./results/index.json. Run <code>npm run scenarios</code> to generate them.</p>`
    return
  }
  const byScenario = new Map<string, { title: string; runs: Partial<Record<PredictorId, Run>> }>()
  for (const r of index.runs) {
    if (!byScenario.has(r.scenario)) byScenario.set(r.scenario, { title: r.title, runs: {} })
    byScenario.get(r.scenario)!.runs[r.predictor] = r
  }
  // Per-run files carry calibration; the index alone is enough for everything else.
  await Promise.all(index.runs.filter(r => r.predictor === 'jev').map(async r => {
    const full = await getJson<Run>(`./results/${r.scenario}--${r.predictor}.json`)
    if (full) byScenario.get(r.scenario)!.runs.jev = full
  }))
  grid.innerHTML = [...byScenario.values()].map(s => scenarioCard(s.title, s.runs)).join('')
  table.innerHTML = summaryTable(index.runs)
  const js = index.runs.map(r => r.jev).filter((j): j is Jev => !!j)
  if (js.length) {
    const ms = js.reduce((n, j) => n + j.ms, 0) / Math.max(1, js.reduce((n, j) => n + j.calls, 0))
    $('measure-note')!.insertAdjacentHTML('afterbegin', `<span class="mono">Recorded ${new Date(index.generatedAt).toISOString().slice(0, 10)} with ${esc(index.jevModel)}: ${Math.round(ms)} ms per Jev call over ${js.reduce((n, j) => n + j.calls, 0)} calls.</span> `)
  }
}

// ---- hero transcript -------------------------------------------------------
const FALLBACK = {
  scenario: 'call', predictor: 'jev', tick: 3, action: 'ask_details', question: 'Will the caller get more frustrated?', prob: 0.25, truth: true,
  explanation: 'Expected "Will the caller get more frustrated?" = no (p=0.25) but saw yes. Splitting on urgent(caller); the agent could not see it, so the concept urgency is now active.',
}

async function pickSurprise() {
  for (const file of ['call--jev', 'playroom-curriculum--jev', 'call--rules', 'playroom-curriculum--rules']) {
    const run = await getJson<Run>(`./results/${file}.json`)
    const list = run?.surprises ?? []
    const s = list.find(x => /concept .* is now active/.test(x.explanation)) ?? list.find(x => x.explanation) ?? list[0]
    if (run && s) return { scenario: run.scenario, predictor: run.predictor, ...s }
  }
  return FALLBACK
}

function transcriptLines(s: typeof FALLBACK) {
  const p = s.prob, said = p >= 0.5 ? 'yes' : 'no', saw = s.truth ? 'yes' : 'no'
  return [
    `<span class="m">$</span> surprise run <span class="k">${esc(s.scenario)}</span> --predictor ${esc(s.predictor)}`,
    `<span class="m">tick ${s.tick}</span>  act      ${esc(s.action)}`,
    `<span class="m">tick ${s.tick}</span>  ask      ${esc(s.question)}`,
    `<span class="m">tick ${s.tick}</span>  predict  p(yes)=${p.toFixed(2)}  →  ${said}`,
    `<span class="m">tick ${s.tick}</span>  observe  ${saw}`,
    `<span class="m">tick ${s.tick}</span>  <span class="s">SURPRISE</span>  confident ${said}, saw ${saw}`,
    `<span class="m">fable</span>    ${esc(s.explanation)}`,
    `<span class="m">model</span>    version bumped · diff appended to history`,
  ]
}

let termTimer = 0
function playTranscript(lines: string[]) {
  const el = $('term')!
  clearTimeout(termTimer)
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) { el.innerHTML = lines.join('\n'); return }
  el.innerHTML = ''
  let i = 0
  const step = () => {
    el.querySelector('.cursor')?.classList.remove('cursor')
    if (i >= lines.length) return
    el.insertAdjacentHTML('beforeend', `<span class="cursor">${lines[i]}</span>\n`)
    i++
    termTimer = window.setTimeout(step, i === lines.length ? 0 : lines[i - 1].includes('SURPRISE') ? 900 : 450)
  }
  step()
}

async function renderHero() {
  const s = await pickSurprise()
  const lines = transcriptLines(s)
  $('term-src')!.textContent = s === FALLBACK ? 'static example · results not loaded' : `from ./results/${s.scenario}--${s.predictor}.json`
  playTranscript(lines)
  $('replay')?.addEventListener('click', () => playTranscript(lines))
}

renderHero()
renderResults()

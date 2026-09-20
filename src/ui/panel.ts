// Side panel: live state graph, prediction panel, world model, surprise log, calibration curve.
import type { Agent } from '../loop'
import type { TickResult } from '../loop'
import { relText, ruleConfidence, ruleProb, type Relation } from '../types'

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const pct = (x: number) => Number.isNaN(x) ? '–' : `${Math.round(x * 100)}%`

export class Panel {
  constructor(private root: HTMLElement) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(agent: Agent<any>, last?: TickResult, status = '') {
    const m = agent.metrics, wm = agent.wm
    const stats = `
      <div class="stats">
        ${stat('ticks', agent.tick)} ${stat('accuracy', pct(m.accuracy()))} ${stat('brier', m.brier().toFixed(3))}
        ${stat('escalation', pct(m.escalationRate()))} ${stat('version', 'v' + wm.version)} ${stat('rules', wm.rules.length)}
      </div>`
    const prediction = last ? `
      <div class="action">${esc(last.stage)} · <b>${esc(actionLabel(last))}</b> <span class="muted">via ${esc(last.predictor)}</span></div>
      ${last.questions.map(q => {
        const p = last.predictions[q.id], t = last.truths[q.id]
        const right = (p.prob > 0.5) === t
        const tag = last.surprised.includes(q.id) ? '<span class="tag bad">surprised</span>' : last.escalated.includes(q.id) ? '<span class="tag warn">asked human</span>' : right ? '<span class="tag ok">matched</span>' : '<span class="tag">wrong, unsure</span>'
        return `<div class="q"><div class="qt">${esc(q.text)} ${tag}</div>
          <div class="bar"><div class="fill" style="width:${p.prob * 100}%"></div><span>${pct(p.prob)} yes · conf ${pct(p.confidence)}</span></div>
          <div class="muted">actual: <b>${t ? 'yes' : 'no'}</b></div></div>`
      }).join('')}
      ${last.warnings.map(w => `<div class="warn-line">${esc(w)}</div>`).join('')}` : '<div class="muted">No action yet.</div>'

    const concepts = wm.concepts.length ? wm.concepts.map(c => `<span class="chip">${esc(c)}</span>`).join('') : '<span class="muted">none yet</span>'
    const rules = wm.rules.slice().sort((a, b) => a.action.localeCompare(b.action) || a.question.localeCompare(b.question)).map(r => `
      <tr><td>${esc(r.action)}</td><td class="req">${r.requires.map(esc).join('<br>') || '<span class="muted">always</span>'}</td>
      <td>${esc(r.question)}</td><td>${pct(ruleProb(r))}</td><td>${pct(ruleConfidence(r))}</td><td>${r.yes}/${r.yes + r.no}</td><td class="muted">${esc(r.source)}</td></tr>`).join('')

    const log = wm.history.slice().reverse().slice(0, 40).map(d => `
      <div class="diff"><div><b>v${d.version}</b> <span class="muted">${esc(d.trigger)}</span></div>
      <div>${esc(d.explanation)}</div>
      ${d.conceptsAdded.map(c => `<div class="add">+ concept ${esc(c)}</div>`).join('')}
      ${d.added.map(a => `<div class="add">+ ${esc(a)}</div>`).join('')}
      ${d.removed.map(a => `<div class="rm">− ${esc(a)}</div>`).join('')}</div>`).join('') || '<div class="muted">No revisions yet.</div>'

    const stages = m.accuracyByStage().map(s => `<div class="stage"><span>${esc(s.stage)}</span><div class="bar small"><div class="fill" style="width:${s.accuracy * 100}%"></div></div><span>${pct(s.accuracy)} <span class="muted">n=${s.n}</span></span></div>`).join('')
    const value = m.accommodationValue().slice(-8).map(v => `<span class="chip ${v.delta > 0 ? 'ok' : v.delta < 0 ? 'bad' : ''}">v${v.version} ${v.delta >= 0 ? '+' : ''}${Math.round(v.delta * 100)}</span>`).join('') || '<span class="muted">–</span>'

    this.root.innerHTML = `
      <h1>surprise <span class="muted">· ${esc(status)}</span></h1>
      ${stats}
      <section><h2>Prediction</h2>${prediction}</section>
      <section><h2>State</h2><div id="graph">${graphSvg(last?.post ?? [])}</div></section>
      <section><h2>World model</h2><div class="chips">${concepts}</div>
        <details open><summary>${wm.rules.length} rules</summary>
        <table><thead><tr><th>action</th><th>when</th><th>question</th><th>p(yes)</th><th>conf</th><th>yes/n</th><th></th></tr></thead><tbody>${rules}</tbody></table></details></section>
      <section><h2>Surprise log</h2>${log}</section>
      <section><h2>Metrics</h2>
        <div class="stages">${stages || '<span class="muted">–</span>'}</div>
        <div class="row"><div><h3>Calibration</h3><canvas id="cal" width="220" height="220"></canvas></div>
        <div><h3>Accommodation value</h3><div class="chips">${value}</div><h3>Escalation curve</h3><div class="chips">${m.escalationCurve().map(s => `<span class="chip">${pct(s.rate)}</span>`).join('')}</div></div></div>
      </section>`
    drawCalibration(this.root.querySelector('#cal') as HTMLCanvasElement, m.calibration())
  }

  /** Escalation: ask the human. Resolves undefined if they don't know. */
  ask(text: string): Promise<boolean | undefined> {
    return new Promise(res => {
      const d = document.createElement('div'); d.className = 'modal'
      d.innerHTML = `<div class="card"><div class="muted">The agent isn't sure.</div><h2>${esc(text)}</h2>
        <div class="btns"><button data-v="1">Yes</button><button data-v="0">No</button><button data-v="">Don't know</button></div></div>`
      d.addEventListener('click', e => {
        const b = (e.target as HTMLElement).closest('button'); if (!b) return
        d.remove(); res(b.dataset.v === '' ? undefined : b.dataset.v === '1')
      })
      document.body.appendChild(d)
    })
  }
}

const stat = (k: string, v: unknown) => `<div class="stat"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`
const actionLabel = (t: TickResult) => [t.action.kind, t.action.obj, t.action.target, t.action.params && Object.entries(t.action.params).map(([k, v]) => `${k}=${v}`).join(' ')].filter(Boolean).join(' ')

function graphSvg(state: Relation[]) {
  const nodes = [...new Set(state.flatMap(r => r.args.filter(a => /^[a-z]+$/.test(a) && !['low', 'floor'].includes(a))))].sort()
  if (!nodes.length) return '<div class="muted">empty</div>'
  const W = 380, H = 300, cx = W / 2, cy = H / 2, R = 110
  const pos = new Map(nodes.map((n, i) => [n, [cx + R * Math.cos((i / nodes.length) * 2 * Math.PI - Math.PI / 2), cy + R * Math.sin((i / nodes.length) * 2 * Math.PI - Math.PI / 2)] as const]))
  const unary = new Map<string, string[]>()
  const edges: string[] = []
  for (const r of state) {
    if (r.args.length === 2 && pos.has(r.args[0]) && pos.has(r.args[1])) {
      const [a, b] = r.args, [x1, y1] = pos.get(a)!, [x2, y2] = pos.get(b)!
      edges.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#m)"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 4}" class="e">${esc(r.pred)}</text>`)
    } else if (pos.has(r.args[0])) unary.set(r.args[0], [...(unary.get(r.args[0]) ?? []), r.args.length > 1 ? `${r.pred} ${r.args.slice(1).join(' ')}` : r.pred])
    else if (r.pred === 'tower' || r.pred === 'gravity') unary.set('_', [...(unary.get('_') ?? []), relText(r)])
  }
  return `<svg viewBox="0 0 ${W} ${H}"><defs><marker id="m" markerWidth="8" markerHeight="8" refX="16" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8892b0"/></marker></defs>
    ${edges.join('')}
    ${nodes.map(n => { const [x, y] = pos.get(n)!; return `<g><circle cx="${x}" cy="${y}" r="16"/><text x="${x}" y="${y + 4}" class="n">${esc(n)}</text><text x="${x}" y="${y + 30}" class="u">${esc((unary.get(n) ?? []).join(', '))}</text></g>` }).join('')}
    <text x="${cx}" y="${cy + 4}" class="u">${esc((unary.get('_') ?? []).join(' '))}</text></svg>`
}

function drawCalibration(c: HTMLCanvasElement | null, bins: { meanProb: number; hitRate: number; n: number }[]) {
  if (!c) return
  const g = c.getContext('2d')!, S = c.width, pad = 22
  g.clearRect(0, 0, S, S)
  g.strokeStyle = '#3a4152'; g.lineWidth = 1
  g.beginPath(); g.moveTo(pad, S - pad); g.lineTo(S - pad, pad); g.stroke()
  g.strokeRect(pad, pad, S - 2 * pad, S - 2 * pad)
  g.fillStyle = '#8892b0'; g.font = '10px system-ui'
  g.fillText('predicted →', pad, S - 6); g.save(); g.translate(8, S - pad); g.rotate(-Math.PI / 2); g.fillText('observed →', 0, 0); g.restore()
  const maxN = Math.max(1, ...bins.map(b => b.n))
  for (const b of bins) {
    if (!b.n) continue
    const x = pad + b.meanProb * (S - 2 * pad), y = S - pad - b.hitRate * (S - 2 * pad)
    g.fillStyle = '#f2b134'; g.beginPath(); g.arc(x, y, 4 + 8 * Math.sqrt(b.n / maxN), 0, 2 * Math.PI); g.fill()
    g.fillStyle = '#14161c'; g.fillText(String(b.n), x - 3, y + 3)
  }
}

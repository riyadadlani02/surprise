// Hand-written SVG charts. Text uses ink tokens; only marks carry series colour. Marker shape is the second encoding.
export interface Series { name: string; color: string; shape: 'circle' | 'square' | 'diamond'; values: (number | undefined)[] }

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const f2 = (n: number) => n.toFixed(2)

export const marker = (shape: Series['shape'], x: number, y: number, color: string, r = 4.5) => {
  const a = { class: 'mk', fill: color } as Record<string, string | number>
  const attrs = Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ')
  if (shape === 'circle') return `<circle ${attrs} cx="${x}" cy="${y}" r="${r}"/>`
  if (shape === 'square') return `<rect ${attrs} x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}"/>`
  return `<polygon ${attrs} points="${x},${y - r - 1} ${x + r + 1},${y} ${x},${y + r + 1} ${x - r - 1},${y}"/>`
}

/** Small line chart over categorical x (the three thirds of a run). y from 0 to yMax. */
export function lineChart(name: string, series: Series[], xLabels: string[], yMax: number, opts: { w?: number; h?: number; yTicks?: number[]; fmt?: (n: number) => string } = {}) {
  const w = opts.w ?? 260, h = opts.h ?? 150, L = 30, R = 10, T = 8, B = 22
  const fmt = opts.fmt ?? f2
  const px = (i: number) => L + (i / Math.max(1, xLabels.length - 1)) * (w - L - R)
  const py = (v: number) => T + (1 - Math.min(v, yMax) / yMax) * (h - T - B)
  const ticks = opts.yTicks ?? [0, yMax / 2, yMax]
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img"><title>${esc(name)}</title>`
  for (const t of ticks) s += `<line class="grid" x1="${L}" x2="${w - R}" y1="${py(t)}" y2="${py(t)}"/><text x="${L - 4}" y="${py(t) + 3}" text-anchor="end">${fmt(t)}</text>`
  s += `<line class="axis" x1="${L}" x2="${w - R}" y1="${py(0)}" y2="${py(0)}"/>`
  xLabels.forEach((l, i) => { s += `<text x="${px(i)}" y="${h - 6}" text-anchor="middle">${esc(l)}</text>` })
  for (const sr of series) {
    const pts = sr.values.map((v, i) => v === undefined ? undefined : [px(i), py(v), v] as const).filter((p): p is readonly [number, number, number] => !!p)
    if (!pts.length) continue
    s += `<polyline class="line" stroke="${sr.color}" points="${pts.map(p => `${p[0]},${p[1]}`).join(' ')}"/>`
    pts.forEach((p, i) => { s += `<g>${marker(sr.shape, p[0], p[1], sr.color)}<title>${esc(sr.name)} · ${esc(xLabels[i] ?? '')}: ${fmt(p[2])}</title></g>` })
  }
  return s + '</svg>'
}

/** Calibration: predicted probability against observed hit rate, dot size by count, diagonal reference. */
export function calibrationPlot(name: string, bins: { meanProb: number; hitRate: number; n: number }[], color: string, opts: { w?: number; h?: number } = {}) {
  const w = opts.w ?? 260, h = opts.h ?? 150, L = 30, R = 10, T = 8, B = 22
  const px = (v: number) => L + v * (w - L - R), py = (v: number) => T + (1 - v) * (h - T - B)
  const maxN = Math.max(1, ...bins.map(b => b.n))
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img"><title>${esc(name)}</title>`
  for (const t of [0, 0.5, 1]) s += `<line class="grid" x1="${L}" x2="${w - R}" y1="${py(t)}" y2="${py(t)}"/><line class="grid" y1="${T}" y2="${h - B}" x1="${px(t)}" x2="${px(t)}"/><text x="${L - 4}" y="${py(t) + 3}" text-anchor="end">${t}</text><text x="${px(t)}" y="${h - 6}" text-anchor="middle">${t}</text>`
  s += `<line class="ref" x1="${px(0)}" y1="${py(0)}" x2="${px(1)}" y2="${py(1)}"/>`
  s += `<text x="${w - R}" y="${h - 6}" text-anchor="end">predicted</text><text x="${L + 4}" y="${T + 8}">observed</text>`
  for (const b of bins) {
    if (!b.n) continue
    const r = 4 + 10 * Math.sqrt(b.n / maxN)
    s += `<g><circle class="dot" cx="${px(b.meanProb)}" cy="${py(b.hitRate)}" r="${r}" fill="${color}" stroke="${color}"/><title>predicted ${f2(b.meanProb)} · observed ${f2(b.hitRate)} · n=${b.n}</title></g>`
  }
  return s + '</svg>'
}

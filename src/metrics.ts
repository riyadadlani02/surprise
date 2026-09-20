// The four numbers that show learning is real: accuracy, calibration, accommodation value, escalation rate.
export interface Record_ { tick: number; stage: string; prob: number; truth: boolean; escalated: boolean; version: number }

export class Metrics {
  records: Record_[] = []
  accommodations: { tick: number; version: number }[] = []

  add(r: Record_) { this.records.push(r) }
  markAccommodation(tick: number, version: number) { this.accommodations.push({ tick, version }) }

  correct = (r: Record_) => (r.prob > 0.5) === r.truth

  accuracyByStage() {
    const m = new Map<string, { n: number; correct: number }>()
    for (const r of this.records) {
      const s = m.get(r.stage) ?? { n: 0, correct: 0 }
      s.n++; if (this.correct(r)) s.correct++
      m.set(r.stage, s)
    }
    return [...m].map(([stage, s]) => ({ stage, ...s, accuracy: s.correct / s.n }))
  }

  accuracy(records = this.records) { return records.length ? records.filter(this.correct).length / records.length : 0 }

  brier(records = this.records) { return records.length ? records.reduce((a, r) => a + (r.prob - (r.truth ? 1 : 0)) ** 2, 0) / records.length : 0 }

  /** Bins of predicted probability vs observed hit rate. Calibrated means meanProb ≈ hitRate. */
  calibration(bins = 5) {
    const out = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, sumProb: 0, hits: 0 }))
    for (const r of this.records) {
      const b = out[Math.min(bins - 1, Math.floor(r.prob * bins))]
      b.n++; b.sumProb += r.prob; if (r.truth) b.hits++
    }
    return out.map(b => ({ ...b, meanProb: b.n ? b.sumProb / b.n : NaN, hitRate: b.n ? b.hits / b.n : NaN }))
  }

  /** For each accommodation: accuracy over the next k predictions minus the previous k. Positive = the revision helped. */
  accommodationValue(k = 6) {
    return this.accommodations.map(a => {
      const before = this.records.filter(r => r.tick < a.tick).slice(-k)
      const after = this.records.filter(r => r.tick > a.tick).slice(0, k)
      return { version: a.version, tick: a.tick, before: this.accuracy(before), after: this.accuracy(after), delta: this.accuracy(after) - this.accuracy(before), n: Math.min(before.length, after.length) }
    })
  }

  escalationRate(window = 20) {
    const w = this.records.slice(-window)
    return w.length ? w.filter(r => r.escalated).length / w.length : 0
  }

  /** Escalation rate per equal slice of the run; should fall as the model matures. */
  escalationCurve(slices = 5) {
    const size = Math.ceil(this.records.length / slices) || 1
    return Array.from({ length: Math.ceil(this.records.length / size) }, (_, i) => {
      const s = this.records.slice(i * size, (i + 1) * size)
      return { slice: i, rate: s.filter(r => r.escalated).length / s.length, accuracy: this.accuracy(s), brier: this.brier(s) }
    })
  }
}

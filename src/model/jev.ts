// Jev (TypeSafe AI) as the fast predictor: one call, one noul question per outcome, calibrated probabilities back.
// Raw HTTP per https://api.typesafe.ai/v1/systemone; no SDK needed.
import { actionText, ruleProb, stateText, type PredictContext, type Prediction, type Predictor } from '../types'
import { matchRules } from './worldmodel'

export class JevPredictor implements Predictor {
  name = 'jev'
  constructor(private apiKey: string, private endpoint = 'https://api.typesafe.ai/v1/systemone', private model = 'jev-latest') {}

  async predict({ state, action, questions, wm }: PredictContext) {
    const knownRules = questions.flatMap(q => matchRules(wm, state, action, q.id).slice(0, 3)
      .map(r => `${q.id}: when ${r.requires.join(' & ') || 'always'} after ${r.action}, "${q.text}" has been yes ${r.yes}/${r.yes + r.no} times`))
    const body = {
      model: this.model,
      state: { world: stateText(state), action: actionText(action), concepts_active: wm.concepts, known_rules: knownRules },
      questions: Object.fromEntries(questions.map(q => [q.id, { type: 'noul', instructions: `After \`action\` runs in \`world\`: ${q.text}` }])),
    }
    const res = await fetch(this.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`jev ${res.status}: ${await res.text()}`)
    const data = (await res.json()) as { answers: Record<string, { noul: number }> }
    const out: Record<string, Prediction> = {}
    for (const q of questions) {
      const p = data.answers[q.id]?.noul ?? 0.5
      const rule = matchRules(wm, state, action, q.id)[0]
      // Jev's noul is the probability; confidence is how far from a coin flip it is.
      out[q.id] = { prob: p, confidence: Math.abs(2 * p - 1), ruleId: rule && Math.abs(ruleProb(rule) - p) < 0.5 ? rule.id : undefined }
    }
    return out
  }
}

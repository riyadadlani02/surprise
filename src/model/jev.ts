// Jev (TypeSafe AI) as the fast predictor: one call, one noul question per outcome, calibrated probabilities back.
// Raw HTTP per https://api.typesafe.ai/v1/systemone; no SDK needed.
import { actionText, stateText, type PredictContext, type Prediction, type Predictor } from '../types'
import { matchRules } from './worldmodel'

export interface JevStats { calls: number; ms: number; inputTokens: number; outputTokens: number; errors: number }
export const JEV_USD_PER_INPUT_TOKEN = 0.042 / 1e6   // output tokens are free

export class JevPredictor implements Predictor {
  name: string
  stats: JevStats = { calls: 0, ms: 0, inputTokens: 0, outputTokens: 0, errors: 0 }
  constructor(private apiKey: string, private opts: { withRules?: boolean; endpoint?: string; model?: string } = {}) {
    this.name = opts.withRules === false ? 'jev-zero-shot' : 'jev'
  }

  async predict({ state, action, questions, wm }: PredictContext) {
    const withRules = this.opts.withRules !== false
    const knownRules = withRules ? questions.flatMap(q => matchRules(wm, state, action, q.id).slice(0, 3)
      .map(r => `${q.id}: when ${r.requires.join(' & ') || 'always'} after ${r.action}, "${q.text}" has been yes ${r.yes}/${r.yes + r.no} times`)) : []
    const body = {
      model: this.opts.model ?? 'jev-latest',
      state: { world: stateText(state), action: actionText(action), ...(withRules ? { concepts_active: wm.concepts, known_rules: knownRules } : {}) },
      questions: Object.fromEntries(questions.map(q => [q.id, { type: 'noul', instructions: `After \`action\` runs in \`world\`: ${q.text}` }])),
    }
    const t0 = performance.now()
    let res: Response
    try { res = await fetch(this.opts.endpoint ?? 'https://api.typesafe.ai/v1/systemone', { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
    catch (e) { this.stats.errors++; throw e }
    this.stats.calls++; this.stats.ms += performance.now() - t0
    if (!res.ok) { this.stats.errors++; throw new Error(`jev ${res.status}: ${await res.text()}`) }
    const data = (await res.json()) as { answers: Record<string, { noul: number }>; usage?: { input_tokens: number; output_tokens: number } }
    this.stats.inputTokens += data.usage?.input_tokens ?? 0; this.stats.outputTokens += data.usage?.output_tokens ?? 0
    const out: Record<string, Prediction> = {}
    for (const q of questions) {
      const p = data.answers[q.id]?.noul ?? 0.5
      // Jev's noul is the probability; confidence is how far from a coin flip it is. The matching rule still absorbs the outcome.
      out[q.id] = { prob: p, confidence: Math.abs(2 * p - 1), ruleId: matchRules(wm, state, action, q.id)[0]?.id }
    }
    return out
  }
}

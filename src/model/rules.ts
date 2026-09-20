// Hand-written predictor and accommodator. They run the whole loop with no API keys and stay as the fallback.
import { relText, ruleConfidence, ruleProb, type Accommodator, type Action, type Patch, type PredictContext, type Prediction, type Predictor, type Relation, type Surprise, type Tagged, type WorldModel } from '../types'
import { matchRules, paramRelations, template } from './worldmodel'

export class RulePredictor implements Predictor {
  name = 'rules'
  async predict({ state, action, questions, wm }: PredictContext) {
    const out: Record<string, Prediction> = {}
    for (const q of questions) {
      const best = matchRules(wm, state, action, q.id)[0]
      out[q.id] = best ? { prob: ruleProb(best), confidence: ruleConfidence(best), ruleId: best.id } : { prob: 0.5, confidence: 0 }
    }
    return out
  }
}

const NOISE = new Set(['moving', 'tower'])

/** The pre-state as rule templates, tagged with the concept that gates each one (undefined = visible now). */
export function contextTemplates(state: Relation[], latent: Tagged[], a: Action) {
  const mentions = (args: string[]) => (a.obj && args.includes(a.obj)) || (a.target && args.includes(a.target)) || (!a.obj && !a.target)
  return [
    ...state.filter(r => !NOISE.has(r.pred) && mentions(r.args)).map(r => ({ t: template(r, a), r, concept: undefined as string | undefined })),
    ...paramRelations(a).map(r => ({ t: template(r, a), r, concept: undefined as string | undefined })),
    ...latent.filter(x => mentions(x.r.args)).map(x => ({ t: template(x.r, a), r: x.r, concept: x.concept })),
  ]
}

/** Explains a surprise by contrasting this pre-state with the last one where the failed rule was right,
 *  and splitting the rule on a relation that differs. Falls back to any relevant relation. */
export class RuleAccommodator implements Accommodator {
  name = 'heuristic'
  async accommodate(s: Surprise, wm: WorldModel): Promise<Patch> {
    const a = s.action
    const ctx = contextTemplates(s.state, s.latent, a)
    const failed = wm.rules.find(r => r.id === s.predicted.ruleId)
    const differs = failed?.example ? ctx.filter(c => !failed.example!.includes(c.t)) : []
    // visible binary relations first (on, inside, above), then parameters, then not-yet-active concepts, then visible unary facts
    const rank = (c: typeof ctx[number]) => c.concept ? 2 : c.r.pred === 'param' ? 1 : c.r.args.length === 2 ? 0 : 3
    const pick = (differs.length ? differs : ctx).sort((x, y) => rank(x) - rank(y))[0]
    const seen = s.truth ? 'yes' : 'no', expected = s.predicted.prob > 0.5 ? 'yes' : 'no'
    const head = `Expected "${s.question.text}" = ${expected} (p=${s.predicted.prob.toFixed(2)}) but saw ${seen}. `
    if (!pick) return { explanation: head + 'No distinguishing context found; counts updated only.', conceptsAdd: [], rulesAdd: [], rulesRemove: [] }
    const why = differs.length ? `Unlike the last time this rule was right, ${relText(pick.r)} holds now` : `Splitting on ${relText(pick.r)}`
    const explanation = head + (pick.concept ? `${why}; the agent could not see it, so the concept ${pick.concept} is now active.` : `${why}.`)
    const requires = [pick.t, ...(pick.r.pred !== 'param' ? ctx.filter(c => c.r.pred === 'param').map(c => c.t) : [])]
    return { explanation, conceptsAdd: pick.concept ? [pick.concept] : [], rulesAdd: [{ action: a.kind, requires, question: s.question.id, source: 'accommodate', note: explanation }], rulesRemove: [] }
  }
}

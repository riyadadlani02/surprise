// Hand-written predictor and accommodator. They run the whole loop with no API keys and stay as the fallback.
import { relText, ruleConfidence, ruleProb, type Accommodator, type Patch, type PredictContext, type Prediction, type Predictor, type Surprise, type WorldModel } from '../types'
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

/** Explains a surprise by finding context that the failed rule did not look at, preferring a not-yet-active concept. */
export class RuleAccommodator implements Accommodator {
  name = 'heuristic'
  async accommodate(s: Surprise, _wm: WorldModel): Promise<Patch> {
    const a = s.action
    const mentions = (args: string[]) => (a.obj && args.includes(a.obj)) || (a.target && args.includes(a.target)) || (!a.obj && !a.target)
    const latent = s.latent.filter(x => mentions(x.r.args))
    const params = paramRelations(a)
    const context = s.state.filter(r => !NOISE.has(r.pred) && mentions(r.args))
    const requires: string[] = []
    const conceptsAdd: string[] = []
    if (latent[0]) { requires.push(template(latent[0].r, a)); conceptsAdd.push(latent[0].concept) }
    if (params[0]) requires.push(template(params[0], a))
    if (context[0] && !latent[0]) requires.push(template(context[0], a))
    const seen = s.truth ? 'yes' : 'no'
    const expected = s.predicted.prob > 0.5 ? 'yes' : 'no'
    const explanation = `Expected "${s.question.text}" = ${expected} (p=${s.predicted.prob.toFixed(2)}) but saw ${seen}. ` +
      (latent[0] ? `The state did not represent ${latent[0].concept}; activating it and splitting the rule on ${relText(latent[0].r)}.`
        : requires.length ? `Splitting the rule on ${requires.join(' & ')}.` : 'No distinguishing context found; counts updated only.')
    return { explanation, conceptsAdd, rulesAdd: requires.length ? [{ action: a.kind, requires, question: s.question.id, source: 'accommodate', note: explanation }] : [], rulesRemove: [] }
  }
}

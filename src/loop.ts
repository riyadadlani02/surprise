// Perceive → predict → act → compare → (assimilate | accommodate | escalate). Environment-agnostic.
import { Metrics } from './metrics'
import { RuleAccommodator, RulePredictor, contextTemplates } from './model/rules'
import { applyPatch, learnGeneral, matchRules, recordOutcome } from './model/worldmodel'
import { actionText, type Accommodator, type Action, type Diff, type Environment, type Prediction, type Predictor, type Relation, type WorldModel } from './types'

export interface TickResult {
  tick: number; stage: string; action: Action
  pre: Relation[]; post: Relation[]
  questions: { id: string; text: string }[]
  predictions: Record<string, Prediction>
  truths: Record<string, boolean>
  surprised: string[]; escalated: string[]
  diffs: Diff[]; predictor: string; warnings: string[]
}

export interface AgentOptions {
  predictor?: Predictor
  accommodator?: Accommodator
  /** Ask a human. Return undefined when nobody answers. */
  escalate?: (q: { id: string; text: string }, ctx: { state: Relation[]; action: Action }) => Promise<boolean | undefined>
  threshold?: number
}

export class Agent<Obs> {
  metrics = new Metrics()
  log: TickResult[] = []
  tick = 0
  predictor: Predictor
  accommodator: Accommodator
  private fallback = new RulePredictor()
  private heuristic = new RuleAccommodator()

  constructor(public env: Environment<Obs>, public wm: WorldModel, public opts: AgentOptions = {}) {
    this.predictor = opts.predictor ?? this.fallback
    this.accommodator = opts.accommodator ?? this.heuristic
  }

  async step(action: Action, stage = 'free'): Promise<TickResult> {
    const t = ++this.tick, threshold = this.opts.threshold ?? 0.3, warnings: string[] = []
    const preObs = this.env.observe()
    const pre = this.env.serialize(preObs, this.wm.concepts)
    const latent = this.env.latent(preObs, this.wm.concepts)
    const qs = this.env.questionsFor(action, preObs)
    const questions = qs.map(q => ({ id: q.id, text: q.text }))

    let predictions: Record<string, Prediction> = {}, predictorName = this.predictor.name
    if (questions.length) {
      try { predictions = await this.predictor.predict({ state: pre, action, questions, wm: this.wm }) }
      catch (e) { warnings.push(`${this.predictor.name} failed (${(e as Error).message}); used rules`); predictions = await this.fallback.predict({ state: pre, action, questions, wm: this.wm }); predictorName = 'rules' }
    }

    // Escalate low-confidence questions before acting; the answer becomes a labelled example.
    const escalated: string[] = [], labels: Record<string, boolean> = {}
    for (const q of questions) {
      if (predictions[q.id].confidence >= threshold || !this.opts.escalate) continue
      escalated.push(q.id)
      const ans = await this.opts.escalate(q, { state: pre, action })
      if (ans !== undefined) labels[q.id] = ans
    }

    await this.env.act(action)
    const postObs = this.env.observe()
    const post = this.env.serialize(postObs, this.wm.concepts)

    const truths: Record<string, boolean> = {}, surprised: string[] = [], diffs: Diff[] = []
    for (const q of qs) {
      const truth = q.truth(preObs, postObs), p = predictions[q.id]
      truths[q.id] = truth
      this.metrics.add({ tick: t, stage, prob: p.prob, truth, escalated: escalated.includes(q.id), version: this.wm.version })

      if (q.id in labels) {
        const r = learnGeneral(this.wm, action, q.id, labels[q.id], 'human', `human answered "${q.text}" = ${labels[q.id] ? 'yes' : 'no'}`)
        if (labels[q.id] !== truth) recordOutcome(this.wm, r.id, truth) // the world overrules the human
        diffs.push(...this.wm.history.slice(-1))
        continue
      }
      if (p.ruleId) {                                                  // assimilation
        recordOutcome(this.wm, p.ruleId, truth)
        const r = this.wm.rules.find(x => x.id === p.ruleId)
        if (r && (p.prob > 0.5) === truth) r.example = contextTemplates(pre, latent, action).map(c => c.t)
      }
      else if (!matchRules(this.wm, pre, action, q.id).length) {       // nothing knew this; start a rule
        learnGeneral(this.wm, action, q.id, truth, 'assimilate', `${actionText(action)} → ${q.text}`)
        diffs.push(...this.wm.history.slice(-1))
      }

      const wrong = (p.prob > 0.5) !== truth
      if (p.confidence >= threshold && wrong) {
        surprised.push(q.id)
        const surprise = { state: pre, action, question: { id: q.id, text: q.text }, predicted: p, truth, postState: post, latent }
        let patch
        try { patch = await this.accommodator.accommodate(surprise, this.wm) }
        catch (e) { warnings.push(`${this.accommodator.name} failed (${(e as Error).message}); used heuristic`); patch = await this.heuristic.accommodate(surprise, this.wm) }
        const { diff, added } = applyPatch(this.wm, patch, `surprise: ${actionText(action)} → ${q.text}`)
        for (const r of added) if (matchRules(this.wm, pre, action, q.id).includes(r)) recordOutcome(this.wm, r.id, truth)
        diffs.push(diff)
        this.metrics.markAccommodation(t, diff.version)
      }
    }
    const result: TickResult = { tick: t, stage, action, pre, post, questions, predictions, truths, surprised, escalated, diffs, predictor: predictorName, warnings }
    this.log.push(result)
    return result
  }
}

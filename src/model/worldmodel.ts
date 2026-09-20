// The explicit, versioned world model: named concepts plus causal rules with observed counts.
// Every change goes through applyPatch so the history is a readable list of diffs.
import { relText, ruleConfidence, ruleProb, type Action, type Diff, type Patch, type Relation, type Rule, type WorldModel } from '../types'

export const createWorldModel = (): WorldModel => ({ version: 0, concepts: [], rules: [], history: [] })

/** Action parameters as relations, bucketed so a text-only predictor never sees a raw number. */
export function paramRelations(a: Action): Relation[] {
  return Object.entries(a.params ?? {}).map(([k, v]) => ({ pred: 'param', args: [k, bucket(k, v)] }))
}
function bucket(k: string, v: number | string) {
  if (typeof v === 'string') return v
  if (k === 'offset') return v < 0.6 ? 'centred' : 'overhanging'
  if (k === 'strength') return v < 1.5 ? 'gentle' : 'hard'
  return v < 0.5 ? 'low' : 'high'
}

export const template = (r: Relation, a: Action) =>
  relText({ pred: r.pred, args: r.args.map(x => (x === a.obj ? '$obj' : x === a.target ? '$target' : x)) })
export const instantiate = (t: string, a: Action) => t.replace(/\$obj/g, a.obj ?? '?').replace(/\$target/g, a.target ?? '?')

/** Rules that apply to this (state, action, question), most specific first. */
export function matchRules(wm: WorldModel, state: Relation[], a: Action, question: string): Rule[] {
  const ctx = new Set([...state, ...paramRelations(a)].map(relText))
  return wm.rules
    .filter(r => r.question === question && (r.action === a.kind || r.action === '*') && r.requires.every(t => ctx.has(instantiate(t, a))))
    .sort((x, y) => y.requires.length - x.requires.length || (y.yes + y.no) - (x.yes + x.no))
}

let seq = 0
const newId = (prefix: string) => `${prefix}${(++seq).toString(36)}${Date.now().toString(36).slice(-3)}`

/** Assimilation: the rule that made the prediction absorbs the outcome. */
export function recordOutcome(wm: WorldModel, ruleId: string, truth: boolean) {
  const r = wm.rules.find(x => x.id === ruleId)
  if (r) truth ? r.yes++ : r.no++
}

/** A rule with no requirements beyond the action's parameters; created when nothing matched. */
export function learnGeneral(wm: WorldModel, a: Action, question: string, truth: boolean, source: Rule['source'], trigger: string) {
  const requires = paramRelations(a).map(r => template(r, a))
  const existing = wm.rules.find(r => r.action === a.kind && r.question === question && sameSet(r.requires, requires))
  if (existing) { recordOutcome(wm, existing.id, truth); return existing }
  const { added: [rule] } = applyPatch(wm, { explanation: `No rule covered "${question}" after ${a.kind}; started one from this observation.`, conceptsAdd: [],
    rulesAdd: [{ action: a.kind, requires, question, source }], rulesRemove: [] }, trigger)
  recordOutcome(wm, rule.id, truth)
  return rule
}

/** Accommodation: apply a patch, prune, and record the diff. Returns the new rules' ids. */
export function applyPatch(wm: WorldModel, patch: Patch, trigger: string): { diff: Diff; added: Rule[] } {
  const conceptsAdded = patch.conceptsAdd.filter(c => !wm.concepts.includes(c))
  wm.concepts.push(...conceptsAdded)
  const removed = wm.rules.filter(r => patch.rulesRemove.includes(r.id)).map(describe)
  wm.rules = wm.rules.filter(r => !patch.rulesRemove.includes(r.id))
  const added: Rule[] = []
  for (const p of patch.rulesAdd) {
    const rule: Rule = { yes: 0, no: 0, id: (p as Rule).id ?? newId('r'), ...p }
    const dup = wm.rules.find(r => r.action === rule.action && r.question === rule.question && sameSet(r.requires, rule.requires))
    if (dup) { added.push(dup); continue }
    wm.rules.push(rule); added.push(rule)
  }
  removed.push(...prune(wm).map(describe))
  wm.version++
  const diff: Diff = { version: wm.version, at: new Date().toISOString(), trigger, explanation: patch.explanation,
    added: added.map(describe), removed, conceptsAdded }
  wm.history.push(diff)
  return { diff, added }
}

/** Pruning keeps the schema from growing without bound: drop rules that stayed uninformative after enough evidence. */
export function prune(wm: WorldModel): Rule[] {
  const gone: Rule[] = []
  wm.rules = wm.rules.filter(r => {
    const n = r.yes + r.no
    const informative = Math.max(ruleProb(r), 1 - ruleProb(r)) >= 0.6
    const siblings = wm.rules.filter(o => o !== r && o.action === r.action && o.question === r.question)
    const keep = n < 6 || informative || siblings.length === 0
    if (!keep) gone.push(r)
    return keep
  })
  return gone
}

export const describe = (r: Rule) =>
  `${r.id}: ${r.action}${r.requires.length ? ' when ' + r.requires.join(' & ') : ''} → ${r.question} p=${ruleProb(r).toFixed(2)} conf=${ruleConfidence(r).toFixed(2)} [${r.source}]`
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x))

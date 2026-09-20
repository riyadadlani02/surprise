// Shared vocabulary for every environment. Nothing in here knows about physics or phone calls.

export interface Relation { pred: string; args: string[] }
export const rel = (pred: string, ...args: string[]): Relation => ({ pred, args })
export const relText = (r: Relation) => `${r.pred}(${r.args.join(',')})`
export const stateText = (rs: Relation[]) => rs.map(relText).sort().join('\n')

export interface Tagged { r: Relation; concept: string }

export interface Action { kind: string; obj?: string; target?: string; params?: Record<string, number | string> }
export const actionText = (a: Action) =>
  [a.kind, a.obj, a.target].filter(Boolean).join(' ') +
  (a.params && Object.keys(a.params).length ? ' ' + JSON.stringify(a.params) : '')

/** A yes/no question about what the action will do. `truth` is evaluated after the action settles. */
export interface Question<Obs = unknown> { id: string; text: string; truth: (pre: Obs, post: Obs) => boolean }

export interface Prediction { prob: number; confidence: number; ruleId?: string }

export interface Rule {
  id: string
  action: string            // action kind or '*'
  requires: string[]        // relation templates over $obj/$target, all must hold in the pre-state
  question: string
  yes: number               // observed outcome counts while this rule matched
  no: number
  source: 'assimilate' | 'accommodate' | 'human' | 'fable'
  note?: string
  example?: string[]        // templated context of the last pre-state where this rule predicted correctly
}
export const ruleProb = (r: Rule) => (r.yes + 1) / (r.yes + r.no + 2)
export const ruleConfidence = (r: Rule) => (r.yes + r.no) / (r.yes + r.no + 2)

export interface Diff {
  version: number
  at: string
  trigger: string           // what happened
  explanation: string       // why the model changed
  added: string[]
  removed: string[]
  conceptsAdded: string[]
}

export interface WorldModel {
  version: number
  concepts: string[]        // active serializer concepts
  rules: Rule[]
  history: Diff[]
}

export interface PredictContext {
  state: Relation[]
  action: Action
  questions: { id: string; text: string }[]
  wm: WorldModel
}
export interface Predictor {
  name: string
  predict(ctx: PredictContext): Promise<Record<string, Prediction>>
}

export interface Surprise {
  state: Relation[]
  action: Action
  question: { id: string; text: string }
  predicted: Prediction
  truth: boolean
  postState: Relation[]
  latent: Tagged[]          // relations the serializer could emit if the concept were active
}
export interface Patch { explanation: string; conceptsAdd: string[]; rulesAdd: Omit<Rule, 'id' | 'yes' | 'no'>[]; rulesRemove: string[] }
export interface Accommodator {
  name: string
  accommodate(s: Surprise, wm: WorldModel): Promise<Patch>
}

export interface Environment<Obs = unknown> {
  name: string
  concepts: { name: string; description: string }[]   // latent vocabulary the model may activate
  observe(): Obs
  /** Turn an observation into relations. Only relations whose concept is active (or has none) are returned. */
  serialize(obs: Obs, concepts: string[]): Relation[]
  latent(obs: Obs, concepts: string[]): Tagged[]       // what the inactive concepts would have said
  act(a: Action): Promise<void>
  questionsFor(a: Action, pre: Obs): Question<Obs>[]
  randomAction(): Action
}

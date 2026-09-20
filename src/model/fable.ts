// Claude Fable 5.1 as the slow accommodator: reads a surprise trace and returns a patch to the world model.
import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { describe } from './worldmodel'
import { relText, stateText, type Accommodator, type Patch, type Surprise, type WorldModel } from '../types'

const PATCH_SCHEMA = {
  type: 'object',
  properties: {
    explanation: { type: 'string', description: 'Why the prediction failed and what the model now believes. Two or three sentences.' },
    conceptsAdd: { type: 'array', items: { type: 'string' }, description: 'Concept names to activate, only from the available list.' },
    rulesAdd: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          requires: { type: 'array', items: { type: 'string' }, description: 'Relation templates such as on($obj,$target), param(offset,overhanging), hidden(ball,cup). All must hold before the action.' },
          question: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['action', 'requires', 'question', 'note'],
        additionalProperties: false,
      },
    },
    rulesRemove: { type: 'array', items: { type: 'string' }, description: 'Ids of rules that are now wrong or redundant.' },
  },
  required: ['explanation', 'conceptsAdd', 'rulesAdd', 'rulesRemove'],
  additionalProperties: false,
} as const

const SYSTEM = `You maintain the explicit world model of an agent that learns by being surprised.
The model is a list of causal rules: for an action, when some relations hold beforehand, a yes/no question about the outcome has some probability.
A rule's requires are templates over the pre-state; $obj and $target stand for the action's object and target, param(name,value) relations describe bucketed action parameters, and literal object names are allowed.
Prefer the smallest change that would have made the failed prediction right: split the failed rule on one distinguishing relation, activating a concept only when the distinguishing relation is not yet visible to the agent. Remove a rule only when it is contradicted by the evidence. Never add a concept that is not in the available list.`

export class FableAccommodator implements Accommodator {
  name = 'fable'
  private client: Anthropic
  constructor(apiKey: string, private concepts: { name: string; description: string }[], private model = 'claude-fable-5-1') {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  }

  async accommodate(s: Surprise, wm: WorldModel): Promise<Patch> {
    const relevant = wm.rules.filter(r => r.action === s.action.kind && r.question === s.question.id)
    const trace = [
      `Action: ${s.action.kind} obj=${s.action.obj ?? '-'} target=${s.action.target ?? '-'} params=${JSON.stringify(s.action.params ?? {})}`,
      `Question (${s.question.id}): ${s.question.text}`,
      `Predicted: p(yes)=${s.predicted.prob.toFixed(2)} confidence=${s.predicted.confidence.toFixed(2)} via rule ${s.predicted.ruleId ?? 'none'}`,
      `Observed: ${s.truth ? 'yes' : 'no'}`,
      `Pre-state:\n${stateText(s.state)}`,
      `Post-state:\n${stateText(s.postState)}`,
      `Relations the agent could not see (inactive concepts):\n${s.latent.map(x => `${relText(x.r)}  [concept ${x.concept}]`).join('\n') || 'none'}`,
      `Active concepts: ${wm.concepts.join(', ') || 'none'}`,
      `Available concepts:\n${this.concepts.filter(c => !wm.concepts.includes(c.name)).map(c => `${c.name}: ${c.description}`).join('\n') || 'none'}`,
      `Rules for this action and question:\n${relevant.map(describe).join('\n') || 'none'}`,
    ].join('\n\n')
    const res = await this.client.messages.parse({
      model: this.model,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: trace }],
      output_config: { format: jsonSchemaOutputFormat(PATCH_SCHEMA), effort: 'medium' },
    })
    if (res.stop_reason === 'refusal' || !res.parsed_output) throw new Error(`fable returned no patch (${res.stop_reason})`)
    const p = res.parsed_output
    return {
      explanation: p.explanation,
      conceptsAdd: p.conceptsAdd.filter(c => this.concepts.some(k => k.name === c)),
      rulesAdd: p.rulesAdd.map(r => ({ ...r, source: 'fable' as const })),
      rulesRemove: p.rulesRemove,
    }
  }
}

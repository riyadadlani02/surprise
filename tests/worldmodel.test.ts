import { describe, expect, it } from 'vitest'
import { applyPatch, createWorldModel, learnGeneral, matchRules, prune, recordOutcome } from '../src/model/worldmodel'
import { RuleAccommodator, RulePredictor } from '../src/model/rules'
import { rel, ruleProb } from '../src/types'

describe('world model', () => {
  it('learns a general rule, then a more specific one wins', async () => {
    const wm = createWorldModel()
    const stackC = { kind: 'stack', obj: 'green', target: 'blue', params: { offset: 0 } }
    const stackO = { kind: 'stack', obj: 'green', target: 'blue', params: { offset: 0.9 } }
    const state = [rel('on', 'green', 'floor'), rel('on', 'blue', 'floor')]
    const g = learnGeneral(wm, stackC, 'rests_on_target', true, 'assimilate', 't')
    expect(g.requires).toEqual(['param(offset,centred)'])
    expect(matchRules(wm, state, stackO, 'rests_on_target')).toHaveLength(0)  // bucketed params separate the cases
    expect(wm.version).toBe(1)
    // an accommodation with a latent concept activates it and adds a specific rule
    const acc = new RuleAccommodator()
    const patch = await acc.accommodate({ state, action: stackC, question: { id: 'rests_on_target', text: 'q' }, predicted: { prob: 0.9, confidence: 0.8, ruleId: g.id },
      truth: false, postState: [], latent: [{ r: rel('heavy', 'green'), concept: 'mass' }] }, wm)
    expect(patch.conceptsAdd).toEqual(['mass'])
    const { added } = applyPatch(wm, patch, 'test')
    expect(wm.concepts).toEqual(['mass'])
    recordOutcome(wm, added[0].id, false)
    const best = matchRules(wm, [...state, rel('heavy', 'green')], stackC, 'rests_on_target')[0]
    expect(best.id).toBe(added[0].id)
    expect(ruleProb(best)).toBeLessThan(0.5)
    expect(wm.history).toHaveLength(2)
  })
  it('predictor returns a coin flip with zero confidence when nothing matches', async () => {
    const wm = createWorldModel()
    const p = await new RulePredictor().predict({ state: [], action: { kind: 'wait' }, questions: [{ id: 'x', text: 'x' }], wm })
    expect(p.x).toEqual({ prob: 0.5, confidence: 0 })
  })
  it('prunes uninformative rules that have a sibling', () => {
    const wm = createWorldModel()
    applyPatch(wm, { explanation: '', conceptsAdd: [], rulesRemove: [], rulesAdd: [
      { action: 'push', requires: [], question: 'moves', source: 'assimilate' },
      { action: 'push', requires: ['heavy($obj)'], question: 'moves', source: 'accommodate' },
    ] }, 'seed')
    const [general] = wm.rules
    general.yes = 4; general.no = 4
    expect(prune(wm).map(r => r.id)).toEqual([general.id])
    expect(wm.rules).toHaveLength(1)
  })
})

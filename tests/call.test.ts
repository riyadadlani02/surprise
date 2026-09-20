import { describe, expect, it } from 'vitest'
import { CallEnv } from '../src/env/call/index'
import { Agent } from '../src/loop'
import { createWorldModel } from '../src/model/worldmodel'

// deterministic rng so the learning curve is reproducible
const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296

describe('phone-call adapter', () => {
  it('the same loop learns caller dynamics from random play', async () => {
    const env = new CallEnv(lcg(7))
    const agent = new Agent(env, createWorldModel(), { escalate: async () => undefined })
    for (let i = 0; i < 300; i++) await agent.step(env.randomAction())
    const curve = agent.metrics.escalationCurve(3)
    // most outcomes are "no", so accuracy flatters a coin flip; Brier does not
    expect(curve[2].brier).toBeLessThan(curve[0].brier)
    expect(curve[2].brier).toBeLessThan(0.12)
    expect(curve[2].rate).toBeLessThan(curve[0].rate)
    expect(agent.wm.concepts).toContain('urgency')
  })
})

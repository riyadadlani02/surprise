import { beforeAll, describe, expect, it } from 'vitest'
import { CURRICULUM } from '../src/curriculum'
import { Playroom, initRapier } from '../src/env/playroom/physics'
import { PlayroomEnv } from '../src/env/playroom/index'
import { Agent } from '../src/loop'
import { createWorldModel } from '../src/model/worldmodel'

beforeAll(() => initRapier())

describe('curriculum', () => {
  it('every trial\'s expected outcome matches the physics', async () => {
    const env = new PlayroomEnv(new Playroom())
    for (const t of CURRICULUM) {
      t.setup(env.room)
      const pre = env.observe(), qs = env.questionsFor(t.action, pre)
      await env.act(t.action)
      const post = env.observe()
      for (const [id, want] of Object.entries(t.expect ?? {})) {
        const q = qs.find(x => x.id === id)
        expect(q, `${t.stage} ${t.action.kind} has question ${id}`).toBeDefined()
        expect(q!.truth(pre, post), `${t.stage} ${JSON.stringify(t.action)} ${id}`).toBe(want)
      }
    }
  })
  it('the agent gets better over rounds and escalates less', async () => {
    const env = new PlayroomEnv(new Playroom())
    const agent = new Agent(env, createWorldModel(), { escalate: async () => undefined })
    const rounds: number[] = []
    for (let round = 0; round < 3; round++) {
      const start = agent.metrics.records.length
      for (const t of CURRICULUM) { t.setup(env.room); await agent.step(t.action, t.stage) }
      rounds.push(agent.metrics.accuracy(agent.metrics.records.slice(start)))
    }
    const curve = agent.metrics.escalationCurve(3)
    expect(curve[0].rate).toBeGreaterThan(curve[2].rate)
    expect(rounds[2]).toBeGreaterThan(0.85)
    expect(agent.wm.history.length).toBeGreaterThan(5)
    // the accommodations found concepts the seed vocabulary did not have
    expect(agent.wm.concepts.length).toBeGreaterThan(0)
  }, 60000)
})

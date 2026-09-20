import { beforeAll, describe, expect, it } from 'vitest'
import { Playroom, initRapier, quatX, specOf } from '../src/env/playroom/physics'
import { PlayroomEnv } from '../src/env/playroom/index'
import { serialize, latent } from '../src/env/playroom/serializer'
import { relText } from '../src/types'

beforeAll(() => initRapier())
const has = (rs: { pred: string; args: string[] }[], s: string) => rs.map(relText).includes(s)

describe('playroom truths', () => {
  it('everything starts resting on the floor', () => {
    const r = new Playroom(); r.settle()
    const st = serialize(r.snapshot(), [])
    for (const id of ['red', 'blue', 'green', 'ball', 'cup', 'box']) expect(has(st, `on(${id},floor)`)).toBe(true)
  })
  it('held things do not fall; dropped things do', async () => {
    const env = new PlayroomEnv(new Playroom())
    const pre = env.observe(); await env.act({ kind: 'lift', obj: 'red' })
    const post = env.observe()
    expect(env.questionsFor({ kind: 'lift', obj: 'red' }, pre)[0].truth(pre, post)).toBe(false)
    expect(has(serialize(post, []), 'held(red)')).toBe(true)
    await env.act({ kind: 'drop', obj: 'red' })
    expect(has(serialize(env.observe(), []), 'on(red,floor)')).toBe(true)
  })
  it('a centred block rests, an overhanging one falls', async () => {
    const env = new PlayroomEnv(new Playroom())
    await env.act({ kind: 'stack', obj: 'green', target: 'blue', params: { offset: 0 } })
    expect(has(serialize(env.observe(), ['support']), 'on(green,blue)')).toBe(true)
    expect(has(serialize(env.observe(), ['support']), 'centred(green,blue)')).toBe(true)
    env.room.reset()
    await env.act({ kind: 'stack', obj: 'green', target: 'blue', params: { offset: 0.9 } })
    expect(has(serialize(env.observe(), []), 'on(green,blue)')).toBe(false)
    expect(has(serialize(env.observe(), []), 'on(green,floor)')).toBe(true)
  })
  it('a ball dropped over the cup lands inside it; tilting spills it', async () => {
    const env = new PlayroomEnv(new Playroom())
    env.room.place('ball', 0, 1.4, 1.3); env.room.hold('ball')
    expect(has(serialize(env.observe(), []), 'above(ball,cup)')).toBe(true)
    await env.act({ kind: 'drop', obj: 'ball' })
    expect(has(serialize(env.observe(), []), 'inside(ball,cup)')).toBe(true)
    const pre = env.observe()
    const q = env.questionsFor({ kind: 'tilt', obj: 'cup' }, pre)
    expect(q.map(x => x.id)).toEqual(['keeps_ball'])
    await env.act({ kind: 'tilt', obj: 'cup' })
    expect(q[0].truth(pre, env.observe())).toBe(false)
  })
  it('a covered ball is hidden unless object_permanence is active', async () => {
    const env = new PlayroomEnv(new Playroom())
    await env.act({ kind: 'cover', obj: 'ball' })
    const snap = env.observe()
    expect(serialize(snap, []).some(r => r.args.includes('ball'))).toBe(false)
    expect(has(latent(snap, []).map(x => x.r), 'hidden(ball,cup)')).toBe(true)
    expect(has(serialize(snap, ['object_permanence']), 'hidden(ball,cup)')).toBe(true)
    const pre = env.observe()
    const q = env.questionsFor({ kind: 'uncover' }, pre)[0]
    await env.act({ kind: 'uncover' })
    expect(q.truth(pre, env.observe())).toBe(true)
    expect(has(serialize(env.observe(), []), 'on(ball,floor)')).toBe(true)
  })
  it('an empty inverted cup reveals nothing', async () => {
    const env = new PlayroomEnv(new Playroom())
    env.room.place('cup', 0, specOf('cup').half[1] + 0.01, 1.3, quatX(Math.PI)); env.room.settle()
    const pre = env.observe()
    expect(env.questionsFor({ kind: 'uncover' }, pre)[0].truth(pre, pre)).toBe(false)
  })
  it('balls roll down the ramp, blocks stay', async () => {
    const env = new PlayroomEnv(new Playroom())
    for (const [obj, expected] of [['ball', true], ['red', false], ['green', false]] as const) {
      env.room.reset()
      const pre = env.observe(), a = { kind: 'place_on_ramp', obj }
      const q = env.questionsFor(a, pre)[0]
      await env.act(a)
      expect(q.truth(pre, env.observe()), obj).toBe(expected)
    }
  })
  it('pushing a block into the ball moves the ball; pushing away does not', async () => {
    const env = new PlayroomEnv(new Playroom())
    env.room.place('red', 0.85, 0.2, 0); env.room.settle()
    let pre = env.observe(), a = { kind: 'push', obj: 'red', params: { dir: 'right' } }
    let q = env.questionsFor(a, pre).find(x => x.id === 'ball_moves')!
    await env.act(a)
    expect(q.truth(pre, env.observe())).toBe(true)
    env.room.reset()
    pre = env.observe(); a = { kind: 'push', obj: 'red', params: { dir: 'left' } }
    q = env.questionsFor(a, pre).find(x => x.id === 'ball_moves')!
    await env.act(a)
    expect(q.truth(pre, env.observe())).toBe(false)
  })
  it('low gravity is a latent relation', () => {
    const r = new Playroom(); r.setGravity(-1)
    expect(has(latent(r.snapshot(), []).map(x => x.r), 'gravity(low)')).toBe(true)
  })
})

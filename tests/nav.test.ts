import { beforeAll, describe, expect, it } from 'vitest'
import { Playroom, initRapier } from '../src/env/playroom/physics'
import { Agent } from '../src/loop'
import { createWorldModel } from '../src/model/worldmodel'
import { NavEnv } from '../src/nav/navEnv'
import { UNSURE, around, guidance } from '../src/nav/guide'
import { parseCommand } from '../src/nav/voice'
import { relText } from '../src/types'

beforeAll(() => initRapier())
const has = (rs: { pred: string; args: string[] }[], s: string) => rs.map(relText).includes(s)
const make = (opts: ConstructorParameters<typeof NavEnv>[1] = {}) => { const room = new Playroom(); room.settle(); return new NavEnv(room, opts) }

describe('nav environment', () => {
  it('starts unblocked', () => {
    const env = make()
    expect(env.observe().blocked).toBe(false)
    expect(has(env.serialize(env.observe(), []), 'ahead(clear)')).toBe(true)
  })
  it('a step toward a wall from 0.3 m is blocked and the avatar stays', async () => {
    const env = make({ start: [3.6, 0], heading: Math.PI / 2 })
    const before = env.observe().pos
    await env.act({ kind: 'step_forward' })
    const o = env.observe()
    expect(o.blocked).toBe(true)
    expect(Math.hypot(o.pos.x - before.x, o.pos.z - before.z)).toBeLessThan(0.05)
  })
  it('a clear step moves the avatar about 0.5 m', async () => {
    const env = make()
    const before = env.observe().pos
    await env.act({ kind: 'step_forward' })
    const o = env.observe()
    expect(o.blocked).toBe(false)
    expect(Math.hypot(o.pos.x - before.x, o.pos.z - before.z)).toBeCloseTo(0.5, 1)
  })
  it('sees the blue block one step ahead at chest height', () => {
    const env = make({ start: [0, 3], heading: 0 })
    env.room.place('blue', 0, 0.25, 2); env.room.step()   // resting on the floor, one step ahead; scene queries refresh on step
    const rs = env.serialize(env.observe(), [])
    expect(has(rs, 'ahead(blocked)') || has(rs, 'ahead_object(blue)')).toBe(true)
    expect(has(rs, 'ahead_distance(one_step)')).toBe(true)
  })
  it('a low green block is invisible to the chest ray but latent under height', () => {
    const env = make({ start: [0, 3], heading: 0 })
    env.room.place('green', 0, 0.15, 2.2); env.room.step()
    const o = env.observe()
    expect(has(env.serialize(o, []), 'ahead_object(green)')).toBe(false)
    expect(env.latent(o, []).some(t => t.concept === 'height' && relText(t.r) === 'low_obstacle(green)')).toBe(true)
    expect(has(env.serialize(o, ['height']), 'low_obstacle(green)')).toBe(true)
  })
  it('a learning run completes and produces rules', async () => {
    const env = make()
    const agent = new Agent(env, createWorldModel(), { escalate: async () => undefined })
    for (let i = 0; i < 60; i++) await agent.step(env.randomAction())
    expect(agent.tick).toBe(60)
    expect(agent.wm.rules.length).toBeGreaterThan(0)
  })
})

describe('guide', () => {
  it('says likely clear at 82 percent', () => {
    const s = guidance({ kind: 'step_forward' }, { blocked: { prob: 0.18, confidence: 0.8 } }, [])
    expect(s).toContain('likely clear')
    expect(s).toContain('80 percent')
    expect(s).not.toMatch(/\bsafe\b/)
  })
  it('says stop and names the thing ahead', () => {
    const s = guidance({ kind: 'step_forward' }, { blocked: { prob: 0.9, confidence: 0.8 } }, [{ pred: 'ahead_object', args: ['blue'] }, { pred: 'ahead_distance', args: ['one_step'] }])
    expect(s).toBe('Stop. The blue block is one step ahead.')
  })
  it('does not claim clear around you without data', () => {
    expect(around([{ pred: 'ahead', args: ['unknown'] }])).toBe(UNSURE)
    expect(around([])).toBe(UNSURE)
    expect(around([{ pred: 'ahead', args: ['clear'] }, { pred: 'ahead_object', args: ['none'] }, { pred: 'left', args: ['clear'] }, { pred: 'right', args: ['near'] }])).toBe('Nothing close ahead. Left: clear. Right: something near.')
  })
  it('the knee ray catches the lid as a low obstacle', () => {
    const env = make({ start: [0, 3], heading: 0 })
    env.room.place('lid', 0, 0.03, 2.2); env.room.step()
    const o = env.observe()
    expect(has(env.serialize(o, []), 'ahead_object(lid)')).toBe(false)
    expect(has(env.serialize(o, ['height']), 'low_obstacle(lid)')).toBe(true)
  })
  it('admits uncertainty below 0.3 confidence', () => {
    expect(guidance({ kind: 'step_forward' }, { blocked: { prob: 0.5, confidence: 0 } }, [])).toContain('check with your cane')
  })
})

describe('voice commands', () => {
  it('parses tolerant phrasings', () => {
    expect(parseCommand('Go forward please').kind).toBe('forward')
    expect(parseCommand("what's ahead").kind).toBe('around')
    expect(parseCommand('where is the blue block')).toMatchObject({ kind: 'where_is', obj: 'blue' })
    expect(parseCommand('take me to the cup')).toMatchObject({ kind: 'take_me', obj: 'cup' })
    expect(parseCommand('go left').kind).toBe('left')
    expect(parseCommand('step right').kind).toBe('right')
    expect(parseCommand('bumped').kind).toBe('bumped')
    expect(parseCommand('gibberish').kind).toBe('unknown')
  })
})

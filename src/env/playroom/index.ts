// The playroom as an Environment: actions the agent can take and the questions each action raises.
import type { Action, Environment, Question } from '../../types'
import { OBJ_IDS, Playroom, quatX, quatZ, specOf, type ObjId, type Snapshot } from './physics'
import { CONCEPTS, coveredBy, displaced, fallen, isInside, isOn, latent, restsOnFloor, serialize } from './serializer'

const MOVABLE = OBJ_IDS.filter(id => id !== 'ramp' && id !== 'lid')
const BLOCKS: ObjId[] = ['red', 'blue', 'green']
const DIRS: Record<string, [number, number, number]> = { left: [-1, 0, 0], right: [1, 0, 0], forward: [0, 0, -1], back: [0, 0, 1] }

export class PlayroomEnv implements Environment<Snapshot> {
  name = 'playroom'
  concepts = CONCEPTS
  /** `settle` is swapped for a frame-by-frame version in the browser so the viewer sees things fall. */
  constructor(public room: Playroom, public settle: () => void | Promise<void> = () => { room.settle() }) {}

  observe() { return this.room.snapshot() }
  serialize(obs: Snapshot, concepts: string[]) { return serialize(obs, concepts) }
  latent(obs: Snapshot, concepts: string[]) { return latent(obs, concepts) }

  async act(a: Action) {
    const r = this.room, o = a.obj as ObjId, t = a.target as ObjId
    switch (a.kind) {
      case 'lift': { const p = r.bodies[o].translation(); r.release(o); r.place(o, p.x, p.y + 1.2, p.z); r.hold(o); break }
      case 'drop': r.release(o); break
      case 'stack': {
        const b = r.bodies[t].translation(), off = Number(a.params?.offset ?? 0)
        r.release(o)
        r.place(o, b.x + off * (specOf(t).half[0] + specOf(o).half[0]), r.topOf(t) + specOf(o).half[1] + 0.02, b.z)
        break
      }
      case 'push': r.release(o); r.push(o, DIRS[String(a.params?.dir ?? 'right')], Number(a.params?.strength ?? 1)); break
      case 'tilt': { const p = r.bodies[o].translation(); r.release(o); r.place(o, p.x, p.y + 0.15, p.z, quatZ(1.1)); break }
      case 'cover': { const p = r.bodies[o].translation(); r.release('cup'); r.place('cup', p.x, specOf('cup').half[1] + 0.01, p.z, quatX(Math.PI)); break }
      case 'uncover': r.release('cup'); r.place('cup', 0, specOf('cup').half[1], 1.3); break
      case 'place_on_ramp': {
        // Sit the object flat on the slope, a hair above the surface, so friction alone decides whether it moves.
        const p = r.bodies.ramp.translation(), q = r.bodies.ramp.rotation()
        const ang = 2 * Math.atan2(q.z, q.w), dx = 0.45, dy = specOf('ramp').half[1] + specOf(o).half[1] + 0.01
        r.release(o)
        r.place(o, p.x + dx * Math.cos(ang) - dy * Math.sin(ang), p.y + dx * Math.sin(ang) + dy * Math.cos(ang), p.z, q)
        break
      }
      case 'wait': break
    }
    await this.settle()
  }

  questionsFor(a: Action, pre: Snapshot): Question<Snapshot>[] {
    const o = a.obj as ObjId, t = a.target as ObjId
    const q = (id: string, text: string, truth: (pre: Snapshot, post: Snapshot) => boolean) => ({ id, text, truth })
    switch (a.kind) {
      case 'lift': return [q('falls', `Will ${o} fall while held?`, (p, s) => s.objs[o].pos[1] < p.objs[o].pos[1] + 0.6)]
      case 'drop': return [
        q('reaches_floor', `Will ${o} reach the floor?`, (_, s) => restsOnFloor(s, o)),
        q('rests_on_something', `Will ${o} come to rest on another object?`, (_, s) => OBJ_IDS.some(b => isOn(s.objs[o], s.objs[b]))),
      ]
      case 'stack': return [
        q('rests_on_target', `Will ${o} rest on ${t}?`, (_, s) => isOn(s.objs[o], s.objs[t])),
        q('falls_to_floor', `Will ${o} end up on the floor?`, (_, s) => restsOnFloor(s, o)),
      ]
      case 'push': {
        const qs = [q('moves', `Will ${o} move?`, (p, s) => displaced(p.objs[o], s.objs[o]))]
        if (BLOCKS.includes(o)) qs.push(q('topples', `Will ${o} topple?`, (p, s) => !fallen(p.objs[o]) && fallen(s.objs[o])))
        if (o !== 'ball') qs.push(q('ball_moves', `Will the ball move?`, (p, s) => displaced(p.objs.ball, s.objs.ball, 0.1)))
        return qs
      }
      case 'tilt': return OBJ_IDS.filter(x => isInside(pre.objs[x], pre.objs[o]))
        .map(x => q(`keeps_${x}`, `Will ${x} stay inside ${o}?`, (_, s) => isInside(s.objs[x], s.objs[o])))
      case 'cover': return [q('still_there', `Will ${o} still be under the cup?`, (_, s) => coveredBy(s, o) === 'cup')]
      case 'uncover': return [q('reveals', `Will lifting the cup reveal something underneath?`, (p) => OBJ_IDS.some(id => coveredBy(p, id) === 'cup'))]
      case 'place_on_ramp': return [q('goes_down', `Will ${o} go down the ramp to the floor?`, (_, s) => restsOnFloor(s, o))]
      case 'wait': return [q('anything_moves', 'Will anything move?', (p, s) => OBJ_IDS.some(id => displaced(p.objs[id], s.objs[id])))]
    }
    return []
  }

  randomAction(): Action {
    const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]
    const o = pick(MOVABLE)
    switch (pick(['lift', 'drop', 'stack', 'push', 'tilt', 'cover', 'uncover', 'place_on_ramp', 'wait'])) {
      case 'lift': return { kind: 'lift', obj: o }
      case 'drop': return { kind: 'drop', obj: this.room.held.size ? [...this.room.held][0] : o }
      case 'stack': return { kind: 'stack', obj: pick(BLOCKS.concat('ball')), target: pick(BLOCKS.concat('box')), params: { offset: pick([0, 0, 0.3, 0.9]) } }
      case 'push': return { kind: 'push', obj: o, params: { dir: pick(Object.keys(DIRS)) } }
      case 'tilt': return { kind: 'tilt', obj: pick(['cup', 'box']) }
      case 'cover': return { kind: 'cover', obj: pick(['ball', 'green', 'red']) }
      case 'uncover': return { kind: 'uncover' }
      case 'place_on_ramp': return { kind: 'place_on_ramp', obj: pick(['ball', 'red', 'green']) }
      default: return { kind: 'wait' }
    }
  }
}

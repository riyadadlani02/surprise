// Six developmental stages, in roughly the order children acquire them. Each trial is one loop tick.
import type { Action } from './types'
import { Playroom, quatX, specOf } from './env/playroom/physics'

export interface Trial { stage: string; setup: (r: Playroom) => void; action: Action; expect?: Record<string, boolean> }

const at = (r: Playroom, id: Parameters<Playroom['place']>[0], x: number, y: number, z: number) => r.place(id, x, y, z)
const holdAbove = (r: Playroom, id: Parameters<Playroom['hold']>[0], x: number, z: number, y = 1.4) => { r.place(id, x, y, z); r.hold(id) }

export const CURRICULUM: Trial[] = [
  // 1. objects fall
  { stage: 'objects_fall', setup: r => { r.reset() }, action: { kind: 'lift', obj: 'red' }, expect: { falls: false } },
  { stage: 'objects_fall', setup: r => { r.reset(); holdAbove(r, 'red', -1.5, 0) }, action: { kind: 'drop', obj: 'red' }, expect: { reaches_floor: true } },
  { stage: 'objects_fall', setup: r => { r.reset(); holdAbove(r, 'ball', 1.3, 0) }, action: { kind: 'drop', obj: 'ball' }, expect: { reaches_floor: true } },
  { stage: 'objects_fall', setup: r => { r.reset(); holdAbove(r, 'green', 0.4, 0) }, action: { kind: 'drop', obj: 'green' }, expect: { reaches_floor: true } },
  // 2. objects persist when hidden
  { stage: 'object_permanence', setup: r => { r.reset() }, action: { kind: 'cover', obj: 'ball' }, expect: { still_there: true } },
  { stage: 'object_permanence', setup: r => { r.reset(); r.place('cup', 1.3, specOf('cup').half[1] + 0.01, 0, quatX(Math.PI)); r.settle() }, action: { kind: 'uncover' }, expect: { reveals: true } },
  { stage: 'object_permanence', setup: r => { r.reset(); r.place('cup', 0, specOf('cup').half[1] + 0.01, 1.3, quatX(Math.PI)); r.settle() }, action: { kind: 'uncover' }, expect: { reveals: false } },
  { stage: 'object_permanence', setup: r => { r.reset(); r.place('cup', 0.4, specOf('cup').half[1] + 0.01, 0, quatX(Math.PI)); r.settle() }, action: { kind: 'uncover' }, expect: { reveals: true } },
  // 3. containers hold things
  { stage: 'containers', setup: r => { r.reset(); holdAbove(r, 'ball', 0, 1.3) }, action: { kind: 'drop', obj: 'ball' }, expect: { reaches_floor: false } },
  { stage: 'containers', setup: r => { r.reset(); at(r, 'ball', 0, 0.2, 1.3); r.settle() }, action: { kind: 'tilt', obj: 'cup' }, expect: { keeps_ball: false } },
  { stage: 'containers', setup: r => { r.reset(); holdAbove(r, 'green', 0, 1.3) }, action: { kind: 'drop', obj: 'green' }, expect: { reaches_floor: false } },
  { stage: 'containers', setup: r => { r.reset(); holdAbove(r, 'green', 0.4, 0) }, action: { kind: 'drop', obj: 'green' }, expect: { reaches_floor: true } },
  // 4. supports need to be under things
  { stage: 'support', setup: r => { r.reset() }, action: { kind: 'stack', obj: 'green', target: 'blue', params: { offset: 0 } }, expect: { rests_on_target: true } },
  { stage: 'support', setup: r => { r.reset() }, action: { kind: 'stack', obj: 'green', target: 'blue', params: { offset: 0.9 } }, expect: { rests_on_target: false } },
  { stage: 'support', setup: r => { r.reset() }, action: { kind: 'stack', obj: 'red', target: 'blue', params: { offset: 0.3 } }, expect: { rests_on_target: true } },
  { stage: 'support', setup: r => { r.reset() }, action: { kind: 'stack', obj: 'red', target: 'blue', params: { offset: 0.95 } }, expect: { rests_on_target: false } },
  // 5. ramps make things roll
  { stage: 'ramps', setup: r => { r.reset() }, action: { kind: 'place_on_ramp', obj: 'ball' }, expect: { goes_down: true } },
  { stage: 'ramps', setup: r => { r.reset() }, action: { kind: 'place_on_ramp', obj: 'red' }, expect: { goes_down: false } },
  { stage: 'ramps', setup: r => { r.reset() }, action: { kind: 'place_on_ramp', obj: 'green' }, expect: { goes_down: false } },
  // 6. tools extend reach: one object moves another
  { stage: 'tools', setup: r => { r.reset(); at(r, 'red', 0.85, 0.2, 0); r.settle() }, action: { kind: 'push', obj: 'red', params: { dir: 'right' } }, expect: { ball_moves: true } },
  { stage: 'tools', setup: r => { r.reset() }, action: { kind: 'push', obj: 'red', params: { dir: 'left' } }, expect: { ball_moves: false } },
  { stage: 'tools', setup: r => { r.reset(); at(r, 'green', 0.9, 0.15, 0); r.settle() }, action: { kind: 'push', obj: 'green', params: { dir: 'right' } }, expect: { ball_moves: true } },
  { stage: 'tools', setup: r => { r.reset(); at(r, 'green', 0.9, 0.15, 0); r.settle() }, action: { kind: 'push', obj: 'green', params: { dir: 'back' } }, expect: { ball_moves: false } },
]
export const STAGES = [...new Set(CURRICULUM.map(t => t.stage))]

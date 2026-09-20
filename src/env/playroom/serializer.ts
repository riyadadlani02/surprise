// Scene -> symbolic relations. This vocabulary is the agent's sensory system.
// Base relations are always emitted; concept-gated ones only when the world model has activated the concept.
import { rel, type Relation, type Tagged } from '../../types'
import { OBJ_IDS, type ObjId, type ObjSnap, type Snapshot } from './physics'

export const CONCEPTS = [
  { name: 'object_permanence', description: 'A covered object still exists: emits hidden(x,container).' },
  { name: 'support', description: 'Whether a resting object\'s centre is over its base: centred(x,y) / overhang(x,y).' },
  { name: 'shape', description: 'round(x) vs flat(x); round things roll.' },
  { name: 'mass', description: 'heavy(x) for dense objects.' },
  { name: 'gravity', description: 'gravity(low) when the world\'s gravity has been weakened.' },
  { name: 'layout', description: 'near(x,y) when two objects are within reach of each other.' },
]

const FOOT = 0.04
const xzIn = (a: ObjSnap, b: ObjSnap, margin = 0) =>
  Math.abs(a.pos[0] - b.pos[0]) <= b.half[0] + margin && Math.abs(a.pos[2] - b.pos[2]) <= b.half[2] + margin
export const bottom = (o: ObjSnap) => o.pos[1] - o.half[1]
export const top = (o: ObjSnap) => o.pos[1] + o.half[1]
const upright = (o: ObjSnap) => o.up[1] > 0.85
export const inverted = (o: ObjSnap) => o.up[1] < -0.85
const isContainer = (o: ObjSnap) => o.kind === 'cup' || o.kind === 'box'

export function onFloor(o: ObjSnap) { return bottom(o) < 0.08 && !o.held }
/** On the floor proper, not sitting in the bottom of a cup or box. */
export function restsOnFloor(s: Snapshot, id: ObjId) {
  return onFloor(s.objs[id]) && !OBJ_IDS.some(c => isInside(s.objs[id], s.objs[c]))
}
export function isOn(a: ObjSnap, b: ObjSnap) {
  if (a.id === b.id || a.held) return false
  const bTop = isContainer(b) && upright(b) ? bottom(b) + 0.06 : top(b)
  return Math.abs(bottom(a) - bTop) < 0.08 && xzIn(a, b, a.half[0] * 0.9) && a.pos[1] > b.pos[1]
}
export function isInside(a: ObjSnap, c: ObjSnap) {
  return isContainer(c) && upright(c) && a.id !== c.id && xzIn(a, c, -FOOT) && a.pos[1] < top(c) && a.pos[1] > bottom(c)
}
export function isCovered(a: ObjSnap, c: ObjSnap) {
  return isContainer(c) && inverted(c) && a.id !== c.id && xzIn(a, c, 0) && top(a) < top(c) + 0.05 && a.pos[1] < top(c)
}
export function fallen(o: ObjSnap) { return o.kind === 'block' && o.up[1] < 0.7 }
export const speed = (o: ObjSnap) => Math.hypot(...o.vel)
export function displaced(pre: ObjSnap, post: ObjSnap, d = 0.15) {
  return Math.hypot(post.pos[0] - pre.pos[0], post.pos[1] - pre.pos[1], post.pos[2] - pre.pos[2]) > d
}
export function coveredBy(s: Snapshot, id: ObjId): ObjId | undefined {
  return OBJ_IDS.find(c => isCovered(s.objs[id], s.objs[c]))
}

/** Every relation the vocabulary can express, tagged with the concept that gates it (undefined = always on). */
export function allRelations(s: Snapshot): { r: Relation; concept?: string }[] {
  const out: { r: Relation; concept?: string }[] = []
  const objs = OBJ_IDS.map(id => s.objs[id])
  const hidden = new Map<ObjId, ObjId>()
  for (const o of objs) { const c = coveredBy(s, o.id); if (c) hidden.set(o.id, c) }

  for (const a of objs) {
    if (hidden.has(a.id)) { out.push({ r: rel('hidden', a.id, hidden.get(a.id)!), concept: 'object_permanence' }); continue }
    if (a.held) out.push({ r: rel('held', a.id) })
    else if (restsOnFloor(s, a.id)) out.push({ r: rel('on', a.id, 'floor') })
    if (fallen(a)) out.push({ r: rel('fallen', a.id) })
    if (speed(a) > 0.1) out.push({ r: rel('moving', a.id) })
    if (isContainer(a)) out.push({ r: rel(upright(a) ? 'upright' : inverted(a) ? 'inverted' : 'tilted', a.id) })
    out.push({ r: rel(a.kind === 'ball' ? 'round' : 'flat', a.id), concept: 'shape' })
    if (a.heavy) out.push({ r: rel('heavy', a.id), concept: 'mass' })
    for (const b of objs) {
      if (a === b || hidden.has(b.id)) continue
      if (isOn(a, b)) {
        out.push({ r: rel('on', a.id, b.id) })
        const off = Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2])
        out.push({ r: rel(off > Math.min(b.half[0], b.half[2]) ? 'overhang' : 'centred', a.id, b.id), concept: 'support' })
      }
      if (isInside(a, b)) out.push({ r: rel('inside', a.id, b.id) })
      else if (!isOn(a, b) && a.pos[1] > top(b) && xzIn(a, b, 0)) out.push({ r: rel('above', a.id, b.id) })
      if (a.id < b.id) {
        const d = Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2])
        if (d < a.half[0] + b.half[0] + 0.5) out.push({ r: rel('near', a.id, b.id), concept: 'layout' })
      }
    }
  }
  const towers = objs.filter(o => o.kind === 'block' && !hidden.has(o.id)).map(o => chain(s, o.id))
  const h = Math.max(1, ...towers)
  if (h > 1) out.push({ r: rel('tower', String(h)) })
  if (s.gravity > -5) out.push({ r: rel('gravity', 'low'), concept: 'gravity' })
  return out
}
function chain(s: Snapshot, id: ObjId, depth = 0): number {
  if (depth > 5) return depth
  const below = OBJ_IDS.find(b => isOn(s.objs[id], s.objs[b]))
  return below ? 1 + chain(s, below, depth + 1) : 1
}
export const serialize = (s: Snapshot, concepts: string[]) =>
  allRelations(s).filter(x => !x.concept || concepts.includes(x.concept)).map(x => x.r)
export const latent = (s: Snapshot, concepts: string[]): Tagged[] =>
  allRelations(s).filter(x => x.concept && !concepts.includes(x.concept)).map(x => ({ r: x.r, concept: x.concept! }))

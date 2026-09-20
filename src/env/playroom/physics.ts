// Rapier world with a handful of toys. Source of truth for the scene; the renderer only draws it.
import RAPIER from '@dimforge/rapier3d-compat'

export type ObjId = 'red' | 'blue' | 'green' | 'ball' | 'cup' | 'box' | 'lid' | 'ramp'
export type Kind = 'block' | 'ball' | 'cup' | 'box' | 'lid' | 'ramp'
export interface ObjSnap {
  id: ObjId; kind: Kind
  pos: [number, number, number]
  rot: [number, number, number, number]
  half: [number, number, number]       // half extents of the bounding shape (radius for ball)
  vel: [number, number, number]
  up: [number, number, number]         // local +y in world space
  held: boolean
  heavy: boolean
}
export interface Snapshot { objs: Record<ObjId, ObjSnap>; gravity: number }

const SPEC: Record<ObjId, { kind: Kind; half: [number, number, number]; color: number; home: [number, number, number] }> = {
  red:   { kind: 'block', half: [0.2, 0.2, 0.2],    color: 0xd94a3d, home: [-1.5, 0.2, 0] },
  blue:  { kind: 'block', half: [0.25, 0.25, 0.25], color: 0x3b6fd9, home: [-0.5, 0.25, 0] },
  green: { kind: 'block', half: [0.15, 0.15, 0.15], color: 0x3fa35b, home: [0.4, 0.15, 0] },
  ball:  { kind: 'ball',  half: [0.18, 0.18, 0.18], color: 0xf2b134, home: [1.3, 0.18, 0] },
  cup:   { kind: 'cup',   half: [0.32, 0.3, 0.32],  color: 0xcfcfd6, home: [0, 0.3, 1.3] },
  box:   { kind: 'box',   half: [0.45, 0.35, 0.45], color: 0x8a6a4a, home: [-1.6, 0.35, -1.4] },
  lid:   { kind: 'lid',   half: [0.45, 0.03, 0.45], color: 0x6a4a2a, home: [-0.5, 0.03, -1.6] },
  ramp:  { kind: 'ramp',  half: [0.9, 0.05, 0.6],   color: 0x7a7a88, home: [1.6, 0.35, -1.3] },
}
export const OBJ_IDS = Object.keys(SPEC) as ObjId[]
export const specOf = (id: ObjId) => SPEC[id]

let ready: Promise<void> | null = null
export const initRapier = () => (ready ??= RAPIER.init())

export class Playroom {
  world: RAPIER.World
  bodies = {} as Record<ObjId, RAPIER.RigidBody>
  held = new Set<ObjId>()
  private density: Partial<Record<ObjId, number>> = {}

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(6, 0.1, 6).setTranslation(0, -0.1, 0).setFriction(0.8))
    for (const [x, z, hx, hz] of [[4, 0, 0.1, 4], [-4, 0, 0.1, 4], [0, 4, 4, 0.1], [0, -4, 4, 0.1]])
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, 0.4, hz).setTranslation(x, 0.4, z))
    for (const id of OBJ_IDS) this.spawn(id)
  }

  private spawn(id: ObjId) {
    const s = SPEC[id]
    const fixed = id === 'ramp'
    const desc = (fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic())
      .setTranslation(...s.home).setLinearDamping(0.2).setAngularDamping(0.5)
    if (fixed) desc.setRotation(quatZ(-0.42))
    const body = this.world.createRigidBody(desc)
    const [hx, hy, hz] = s.half
    const add = (c: RAPIER.ColliderDesc) => this.world.createCollider(c.setFriction(0.7).setRestitution(id === 'ball' ? 0.3 : 0.05), body)
    switch (s.kind) {
      case 'ball': add(RAPIER.ColliderDesc.ball(hx)); break
      case 'cup': case 'box': {
        const t = 0.03
        add(RAPIER.ColliderDesc.cuboid(hx, t, hz).setTranslation(0, -hy + t, 0))
        add(RAPIER.ColliderDesc.cuboid(t, hy, hz).setTranslation(-hx + t, 0, 0))
        add(RAPIER.ColliderDesc.cuboid(t, hy, hz).setTranslation(hx - t, 0, 0))
        add(RAPIER.ColliderDesc.cuboid(hx, hy, t).setTranslation(0, 0, -hz + t))
        add(RAPIER.ColliderDesc.cuboid(hx, hy, t).setTranslation(0, 0, hz - t))
        break
      }
      default: add(RAPIER.ColliderDesc.cuboid(hx, hy, hz))
    }
    this.bodies[id] = body
  }

  step(n = 1) { for (let i = 0; i < n; i++) this.world.step() }
  isStill() { return OBJ_IDS.every(id => len(this.bodies[id].linvel()) < 0.02 && len(this.bodies[id].angvel()) < 0.05) }
  /** Run until everything is still (or 4 s). Returns steps taken. */
  settle(max = 240) {
    for (let i = 0; i < max; i++) { this.world.step(); if (i > 20 && this.isStill()) return i }
    return max
  }

  snapshot(): Snapshot {
    const objs = {} as Record<ObjId, ObjSnap>
    for (const id of OBJ_IDS) {
      const b = this.bodies[id], p = b.translation(), r = b.rotation(), v = b.linvel()
      objs[id] = { id, kind: SPEC[id].kind, half: SPEC[id].half, pos: [p.x, p.y, p.z], rot: [r.x, r.y, r.z, r.w],
        vel: [v.x, v.y, v.z], up: rotY(r), held: this.held.has(id), heavy: this.isHeavy(id) }
    }
    return { objs, gravity: this.world.gravity.y }
  }

  // ---- primitives used by actions and by the viewer ----
  place(id: ObjId, x: number, y: number, z: number, rot: RAPIER.Rotation = { x: 0, y: 0, z: 0, w: 1 }) {
    const b = this.bodies[id]
    b.setTranslation({ x, y, z }, true); b.setRotation(rot, true)
    b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }
  reset() { for (const id of OBJ_IDS) { this.release(id); this.place(id, ...SPEC[id].home, id === 'ramp' ? quatZ(-0.42) : undefined) } this.setGravity(-9.81) }
  hold(id: ObjId) { if (id === 'ramp') return; this.bodies[id].setBodyType(RAPIER.RigidBodyType.Fixed, true); this.held.add(id) }
  release(id: ObjId) { if (id === 'ramp' || !this.held.has(id)) return; this.bodies[id].setBodyType(RAPIER.RigidBodyType.Dynamic, true); this.held.delete(id) }
  push(id: ObjId, dir: [number, number, number], strength = 1) {
    const m = this.bodies[id].mass() || 1
    this.bodies[id].applyImpulse({ x: dir[0] * strength * m * 2.2, y: 0.2 * m, z: dir[2] * strength * m * 2.2 }, true)
  }
  setGravity(g: number) { this.world.gravity = { x: 0, y: g, z: 0 } }
  setHeavy(id: ObjId, heavy: boolean) {
    const b = this.bodies[id]
    for (let i = 0; i < b.numColliders(); i++) b.collider(i).setDensity(heavy ? 8 : 1)
    this.density[id] = heavy ? 8 : 1
  }
  isHeavy(id: ObjId) { return (this.density[id] ?? 1) > 1 }
  topOf(id: ObjId) { const p = this.bodies[id].translation(); return p.y + SPEC[id].half[1] }
}

export const quatZ = (a: number): RAPIER.Rotation => ({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) })
export const quatX = (a: number): RAPIER.Rotation => ({ x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) })
const len = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z)
function rotY(q: RAPIER.Rotation): [number, number, number] {
  // rotate (0,1,0) by q
  const { x, y, z, w } = q
  return [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)]
}

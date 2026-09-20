// Simulated navigation: an avatar walking the playroom by 0.5 m steps and 45° turns.
// Sensing is deliberately imperfect (a single ray at CHEST height) so the agent gets surprised by low things until it acquires 'height'.
// CHEST sits between the red block (0.40) and the ball (0.36): blocks, cup and box are seen; ball, green block and lid are not.
import RAPIER from '@dimforge/rapier3d-compat'
import { OBJ_IDS, Playroom, specOf, type ObjId, type Snapshot } from '../env/playroom/physics'
import { coveredBy } from '../env/playroom/serializer'
import { rel, type Action, type Environment, type Question, type Relation, type Tagged } from '../types'

export const DIRS = ['ahead', 'left45', 'right45', 'left', 'right'] as const
export type Dir = typeof DIRS[number]
const DIR_ANGLE: Record<Dir, number> = { ahead: 0, left45: -Math.PI / 4, right45: Math.PI / 4, left: -Math.PI / 2, right: Math.PI / 2 }
export interface Hit { dist: number; obj: string }   // obj: object id | 'wall' | 'none'

export interface NavObs {
  pos: { x: number; y: number; z: number }
  heading: number
  blocked: boolean
  chest: Record<Dir, Hit>
  knee: Record<Dir, Hit>
  nearest: number            // closest sensed thing in any direction, centre-based
  target: ObjId
  targetBearing: number      // relative angle; positive = to the right
  targetDist: number
  onRamp: boolean
  snap: Snapshot
}

export const CONCEPTS = [
  { name: 'height', description: 'Knee-height sensing: low_obstacle(x) for things below the chest ray that a cane finds.' },
  { name: 'object_permanence', description: 'A covered object still exists: hidden(x,container).' },
  { name: 'slope', description: 'slope_ahead when the ramp is in the path.' },
]

export const STEP = 0.5, TURN = Math.PI / 4, RADIUS = 0.25, HALF_H = 0.25, CHEST = 0.38, KNEE = 0.04, WALL = 3.9
const dirOf = (h: number) => ({ x: Math.sin(h), y: 0, z: -Math.cos(h) })   // heading 0 = north = -z
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
export const distBucket = (d: number) => d < 0.6 ? 'touching' : d < 1.2 ? 'one_step' : d < 2.4 ? 'two_steps' : 'far'
const sideBucket = (d: number) => d < 1.2 ? 'near' : d < 2.4 ? 'far' : 'clear'
export const headingName = (h: number) => ['north', 'east', 'south', 'west'][((Math.round(h / (Math.PI / 2)) % 4) + 4) % 4]
export const bearingName = (b: number) => Math.abs(b) < Math.PI / 4 ? 'ahead' : Math.abs(b) > 3 * Math.PI / 4 ? 'behind' : b > 0 ? 'right' : 'left'
export const OBJECT_IDS = OBJ_IDS

export class NavEnv implements Environment<NavObs> {
  name = 'nav'
  concepts = CONCEPTS
  body: RAPIER.RigidBody
  heading: number
  target: ObjId
  private lastBlocked = false
  private shape = new RAPIER.Capsule(HALF_H, RADIUS)

  constructor(public room: Playroom, opts: { start?: [number, number]; heading?: number; target?: ObjId; settle?: () => void | Promise<void> } = {}) {
    const [x, z] = opts.start ?? [-2.5, 2.5]
    this.heading = opts.heading ?? 0
    this.target = opts.target ?? 'cup'
    this.settle = opts.settle ?? (() => { room.settle() })
    this.body = room.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, HALF_H + RADIUS, z).lockRotations().setLinearDamping(20))
    room.world.createCollider(RAPIER.ColliderDesc.capsule(HALF_H, RADIUS).setFriction(0.5), this.body)
  }
  settle: () => void | Promise<void>

  setPose(x: number, z: number, heading = this.heading) {
    this.heading = heading
    this.body.setTranslation({ x, y: HALF_H + RADIUS, z }, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  }

  /** Who owns a collider: an object id, or 'wall' for the static room. */
  private owner(c: RAPIER.Collider): string {
    const h = c.parent()?.handle
    return OBJ_IDS.find(id => this.room.bodies[id].handle === h) ?? 'wall'
  }
  private notFloor = (c: RAPIER.Collider) => !(c.parent() === null && c.translation().y < 0)

  /** Horizontal ray from the avatar at a given height, plus the known room boundary. */
  private ray(height: number, angle: number): Hit {
    const p = this.body.translation(), d = dirOf(this.heading + angle)
    const hit = this.room.world.castRay(new RAPIER.Ray({ x: p.x, y: height, z: p.z }, d), 10, true, undefined, undefined, undefined, this.body, this.notFloor)
    const wall = Math.min(d.x > 0 ? (WALL - p.x) / d.x : d.x < 0 ? (-WALL - p.x) / d.x : Infinity, d.z > 0 ? (WALL - p.z) / d.z : d.z < 0 ? (-WALL - p.z) / d.z : Infinity)
    if (hit && hit.timeOfImpact < wall) return { dist: hit.timeOfImpact, obj: this.owner(hit.collider) }
    return { dist: wall, obj: 'wall' }
  }

  /** Whether the avatar's capsule can travel `dist` along `angle` from its heading without hitting anything but the floor. */
  private pathBlocked(angle: number, dist = STEP) {
    const p = this.body.translation(), d = dirOf(this.heading + angle)
    return !!this.room.world.castShape(p, { x: 0, y: 0, z: 0, w: 1 }, d, this.shape, 0, dist, true, undefined, undefined, undefined, this.body, this.notFloor)
  }

  observe(): NavObs {
    const p = this.body.translation(), snap = this.room.snapshot()
    const chest = {} as Record<Dir, Hit>, knee = {} as Record<Dir, Hit>
    for (const d of DIRS) { chest[d] = this.ray(CHEST, DIR_ANGLE[d]); knee[d] = this.ray(KNEE, DIR_ANGLE[d]) }
    const t = this.room.pos(this.target)
    const down = this.room.world.castRay(new RAPIER.Ray({ x: p.x, y: p.y, z: p.z }, { x: 0, y: -1, z: 0 }), 1, true, undefined, undefined, undefined, this.body)
    return {
      pos: { x: p.x, y: p.y, z: p.z }, heading: this.heading, blocked: this.lastBlocked, chest, knee,
      nearest: Math.min(...DIRS.flatMap(d => [chest[d].dist, knee[d].dist])),
      target: this.target, targetBearing: wrap(Math.atan2(t.x - p.x, -(t.z - p.z)) - this.heading), targetDist: Math.hypot(t.x - p.x, t.z - p.z),
      onRamp: !!down && this.owner(down.collider) === 'ramp', snap,
    }
  }

  private all(o: NavObs): { r: Relation; concept?: string }[] {
    const out: { r: Relation; concept?: string }[] = []
    const a = o.chest.ahead
    out.push({ r: rel('ahead', a.dist < STEP + RADIUS + 0.05 ? 'blocked' : 'clear') }, { r: rel('ahead_object', a.dist < 2.4 ? a.obj : 'none') }, { r: rel('ahead_distance', distBucket(a.dist)) })
    out.push({ r: rel('left', sideBucket(Math.min(o.chest.left.dist, o.chest.left45.dist))) }, { r: rel('right', sideBucket(Math.min(o.chest.right.dist, o.chest.right45.dist))) })
    out.push({ r: rel('heading', headingName(o.heading)) }, { r: rel('target', o.target) }, { r: rel('target_direction', bearingName(o.targetBearing)) },
      { r: rel('target_distance', o.targetDist < 0.7 ? 'here' : o.targetDist < 2 ? 'near' : 'far') })
    if (o.onRamp) out.push({ r: rel('on_ramp', 'avatar') })
    const k = o.knee.ahead
    if (k.dist < STEP + RADIUS + 0.05 && a.dist >= STEP + RADIUS + 0.05) out.push({ r: rel('knee_ahead', 'blocked'), concept: 'height' })
    if (k.dist < 1.2 && k.obj !== 'wall' && k.obj !== 'none' && specOf(k.obj as ObjId).half[1] * 2 < CHEST) out.push({ r: rel('low_obstacle', k.obj), concept: 'height' })
    for (const id of OBJ_IDS) { const c = coveredBy(o.snap, id); if (c) out.push({ r: rel('hidden', id, c), concept: 'object_permanence' }) }
    if (k.obj === 'ramp' && k.dist < 2.4) out.push({ r: rel('slope_ahead'), concept: 'slope' })
    return out
  }
  serialize(o: NavObs, concepts: string[]) { return this.all(o).filter(x => !x.concept || concepts.includes(x.concept)).map(x => x.r) }
  latent(o: NavObs, concepts: string[]): Tagged[] { return this.all(o).filter(x => x.concept && !concepts.includes(x.concept)).map(x => ({ r: x.r, concept: x.concept! })) }

  async act(a: Action) {
    this.lastBlocked = false
    switch (a.kind) {
      case 'step_forward': case 'step_back': {
        const angle = a.kind === 'step_back' ? Math.PI : 0
        if (this.pathBlocked(angle)) { this.lastBlocked = true; break }
        const p = this.body.translation(), d = dirOf(this.heading + angle)
        this.setPose(p.x + d.x * STEP, p.z + d.z * STEP)
        break
      }
      case 'turn_left': this.heading = wrap(this.heading - TURN); break
      case 'turn_right': this.heading = wrap(this.heading + TURN); break
      case 'set_target': this.target = a.obj as ObjId; break
      case 'describe': break
    }
    await this.settle()
  }

  questionsFor(a: Action): Question<NavObs>[] {
    const q = (id: string, text: string, truth: (pre: NavObs, post: NavObs) => boolean) => ({ id, text, truth })
    if (a.kind === 'step_forward' || a.kind === 'step_back') return [
      q('blocked', 'Will the step be blocked?', (_, s) => s.blocked),
      q('bump', 'Will I touch something?', (_, s) => s.blocked || s.nearest < RADIUS + 0.3),
      q('reach', 'Will I arrive at the target?', (_, s) => s.targetDist < 0.7),
    ]
    if (a.kind === 'turn_left' || a.kind === 'turn_right') return [q('faces_target', 'Will I face the target after turning?', (_, s) => Math.abs(s.targetBearing) < TURN / 2)]
    return []
  }

  randomAction(): Action {
    const r = Math.random()
    return { kind: r < 0.45 ? 'step_forward' : r < 0.55 ? 'step_back' : r < 0.75 ? 'turn_left' : r < 0.95 ? 'turn_right' : 'describe' }
  }
}

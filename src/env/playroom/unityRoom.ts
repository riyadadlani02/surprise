// Room backed by a Unity WebGL build (see unity/README.md). Commands go in as JSON through SendMessage;
// state comes back through window.__surprise, which the jslib sets on every Unity FixedUpdate.
// Unity is left-handed: PlayroomWorld.cs mirrors commands on the way in (z → -z, quaternion (x,y,z,w) → (-x,-y,z,w))
// and this file applies the same mirror to what comes out. The mapping is its own inverse.
import { OBJ_IDS, specOf, type ObjId, type ObjSnap, type Room, type Rot, type Snapshot } from './physics'

export interface Published { still: boolean; snapshot: Snapshot }
export interface UnityInstance { SendMessage(obj: string, method: string, arg?: string | number): void }
declare global {
  interface Window {
    __surprise?: Published
    __surpriseOnPublish?: (p: Published) => void
    createUnityInstance?: (canvas: HTMLCanvasElement, config: Record<string, unknown>) => Promise<UnityInstance>
  }
}

const mirror = (o: ObjSnap): ObjSnap => ({
  ...o,
  pos: [o.pos[0], o.pos[1], -o.pos[2]],
  rot: [-o.rot[0], -o.rot[1], o.rot[2], o.rot[3]],
  vel: [o.vel[0], o.vel[1], -o.vel[2]],
  up: [o.up[0], o.up[1], -o.up[2]],
})

export class UnityRoom implements Room {
  held = new Set<ObjId>()
  private heavy = new Set<ObjId>()
  constructor(private unity: UnityInstance) {}

  private send(cmd: Record<string, unknown>) { this.unity.SendMessage('Bridge', 'Command', JSON.stringify(cmd)) }
  private raw(): Snapshot {
    const p = window.__surprise
    if (!p) throw new Error('Unity has not published a snapshot yet')
    return p.snapshot
  }
  private obj(id: ObjId) { return mirror(this.raw().objs[id]) }

  snapshot(): Snapshot {
    const src = this.raw(), objs = {} as Record<ObjId, ObjSnap>
    for (const id of OBJ_IDS) objs[id] = mirror(src.objs[id])
    return { objs, gravity: src.gravity }
  }
  isStill() { return window.__surprise?.still ?? false }
  /** No-op: the page waits for stillness asynchronously through PlayroomEnv's settle callback. */
  settle() { return 0 }

  pos(id: ObjId) { const [x, y, z] = this.obj(id).pos; return { x, y, z } }
  rot(id: ObjId): Rot { const [x, y, z, w] = this.obj(id).rot; return { x, y, z, w } }
  topOf(id: ObjId) { return this.obj(id).pos[1] + specOf(id).half[1] }

  place(id: ObjId, x: number, y: number, z: number, rot: Rot = { x: 0, y: 0, z: 0, w: 1 }) {
    this.send({ cmd: 'place', id, x, y, z, qx: rot.x, qy: rot.y, qz: rot.z, qw: rot.w })
  }
  hold(id: ObjId) { if (id === 'ramp') return; this.send({ cmd: 'hold', id }); this.held.add(id) }
  release(id: ObjId) { if (id === 'ramp' || !this.held.has(id)) return; this.send({ cmd: 'release', id }); this.held.delete(id) }
  push(id: ObjId, dir: [number, number, number], strength = 1) { this.send({ cmd: 'push', id, dx: dir[0], dz: dir[2], strength }) }
  setGravity(g: number) { this.send({ cmd: 'setGravity', g }) }
  setHeavy(id: ObjId, heavy: boolean) { this.send({ cmd: 'setHeavy', id, heavy }); if (heavy) this.heavy.add(id); else this.heavy.delete(id) }
  isHeavy(id: ObjId) { return this.heavy.has(id) }
  reset() { this.send({ cmd: 'reset' }); this.held.clear() }
}

/** Load the WebGL build from `<buildUrl>/surprise.*`. Rejects with a readable error when the build is absent. */
export async function loadUnity(container: HTMLElement, buildUrl = './unity/Build'): Promise<UnityInstance> {
  const base = `${buildUrl}/surprise`
  const head = await fetch(`${base}.loader.js`, { method: 'HEAD' }).catch(() => null)
  if (!head?.ok || head.headers.get('content-type')?.includes('html'))
    throw new Error(`Unity build not found at ${base}.loader.js. Build it as described in unity/README.md.`)
  await new Promise<void>((res, rej) => {
    const s = document.createElement('script'); s.src = `${base}.loader.js`
    s.onload = () => res(); s.onerror = () => rej(new Error('Unity loader failed to load'))
    document.head.appendChild(s)
  })
  if (!window.createUnityInstance) throw new Error('Unity loader did not define createUnityInstance')
  const canvas = document.createElement('canvas'); canvas.id = 'unity-canvas'; container.appendChild(canvas)
  const ready = new Promise<void>(res => { window.__surpriseOnPublish = () => { window.__surpriseOnPublish = undefined; res() } })
  const instance = await window.createUnityInstance(canvas, {
    dataUrl: `${base}.data`, frameworkUrl: `${base}.framework.js`, codeUrl: `${base}.wasm`,
    companyName: 'surprise', productName: 'surprise', productVersion: '0.1',
  })
  await Promise.race([ready, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Unity loaded but never published a snapshot; check the browser console for a C# exception')), 20000))])
  return instance
}

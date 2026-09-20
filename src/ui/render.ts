// Three.js view of the Rapier room, plus pointer dragging so the viewer can interfere.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OBJ_IDS, Playroom, specOf, type ObjId } from '../env/playroom/physics'

export class View {
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  meshes = {} as Record<ObjId, THREE.Object3D>
  dragging: ObjId | null = null
  onDragEnd?: (id: ObjId) => void
  private ray = new THREE.Raycaster()
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private flashes = new Map<ObjId, number>()

  constructor(container: HTMLElement, public room: Playroom) {
    this.scene.background = new THREE.Color(0xfefefe)
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    this.camera.position.set(4.5, 3.8, 5.5)
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.shadowMap.enabled = true
    container.appendChild(this.renderer.domElement)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 0.3, 0)
    this.controls.maxPolarAngle = Math.PI / 2.05

    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(5, 8, 3); sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = sun.shadow.camera.bottom = -6; sun.shadow.camera.right = sun.shadow.camera.top = 6
    this.scene.add(sun, new THREE.HemisphereLight(0xffffff, 0xdedede, 0.9))
    const floor = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.9 }))
    floor.position.y = -0.1; floor.receiveShadow = true
    this.scene.add(floor, new THREE.GridHelper(8, 16, 0x1e1e1e, 0xb8b8b8))
    for (const id of OBJ_IDS) { this.meshes[id] = this.build(id); this.scene.add(this.meshes[id]) }

    new ResizeObserver(() => this.resize(container)).observe(container)
    this.resize(container)
    const el = this.renderer.domElement
    el.addEventListener('pointerdown', e => this.down(e))
    el.addEventListener('pointermove', e => this.move(e))
    el.addEventListener('pointerup', () => this.up())
    el.addEventListener('pointerleave', () => this.up())
  }

  private build(id: ObjId) {
    const { kind, half: [hx, hy, hz], color } = specOf(id)
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 })
    const box = (x: number, y: number, z: number, px = 0, py = 0, pz = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2 * x, 2 * y, 2 * z), mat); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; return m
    }
    const g = new THREE.Group(); g.name = id
    if (kind === 'ball') { const m = new THREE.Mesh(new THREE.SphereGeometry(hx, 32, 24), mat); m.castShadow = true; g.add(m) }
    else if (kind === 'cup' || kind === 'box') {
      const t = 0.03
      g.add(box(hx, t, hz, 0, -hy + t, 0), box(t, hy, hz, -hx + t, 0, 0), box(t, hy, hz, hx - t, 0, 0), box(hx, hy, t, 0, 0, -hz + t), box(hx, hy, t, 0, 0, hz - t))
    } else g.add(box(hx, hy, hz))
    g.traverse(o => { if (o instanceof THREE.Mesh) o.userData.id = id })
    return g
  }

  private resize(c: HTMLElement) {
    const w = c.clientWidth || 1, h = c.clientHeight || 1
    this.renderer.setSize(w, h, false); this.renderer.setPixelRatio(Math.min(2, devicePixelRatio))
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix()
  }

  flash(id: ObjId) { this.flashes.set(id, performance.now()) }

  frame() {
    for (const id of OBJ_IDS) {
      const b = this.room.bodies[id], p = b.translation(), q = b.rotation(), m = this.meshes[id]
      m.position.set(p.x, p.y, p.z); m.quaternion.set(q.x, q.y, q.z, q.w)
      const t = this.flashes.get(id)
      const k = t ? Math.max(0, 1 - (performance.now() - t) / 900) : 0
      m.traverse(o => { if (o instanceof THREE.Mesh) (o.material as THREE.MeshStandardMaterial).emissive.setRGB(k, k * 0.6, 0) })
    }
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  private pointer(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera)
  }
  private down(e: PointerEvent) {
    this.pointer(e)
    const hit = this.ray.intersectObjects(Object.values(this.meshes), true)[0]
    const id = hit?.object.userData.id as ObjId | undefined
    if (!id || id === 'ramp') return
    this.dragging = id; this.controls.enabled = false
    this.plane.constant = -this.room.bodies[id].translation().y
    this.room.hold(id)
  }
  private move(e: PointerEvent) {
    if (!this.dragging) return
    this.pointer(e)
    const p = new THREE.Vector3()
    if (this.ray.ray.intersectPlane(this.plane, p)) this.room.place(this.dragging, THREE.MathUtils.clamp(p.x, -3.6, 3.6), -this.plane.constant, THREE.MathUtils.clamp(p.z, -3.6, 3.6), this.room.bodies[this.dragging].rotation())
  }
  private up() {
    if (!this.dragging) return
    const id = this.dragging; this.dragging = null; this.controls.enabled = true
    this.room.release(id); this.onDragEnd?.(id)
  }
}

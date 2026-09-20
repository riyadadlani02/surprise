// Live camera mode: a frame every few seconds goes to Claude, which returns the same relation vocabulary the simulated room uses.
// The truth for "blocked" and "bump" is the user's own report after each step; that is how the model learns on real streets.
import type Anthropic from '@anthropic-ai/sdk'
import { anthropicClient } from '../model/proxy'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { rel, type Action, type Environment, type Question, type Relation } from '../types'

const KINDS = ['clear', 'obstacle', 'person', 'vehicle', 'stairs_down', 'stairs_up', 'curb', 'door', 'wall', 'unknown'] as const
const DISTANCES = ['touching', 'one_step', 'two_steps', 'far'] as const
const SIDE = {
  type: 'object',
  properties: { kind: { type: 'string', enum: KINDS }, distance: { type: 'string', enum: DISTANCES }, name: { type: 'string', description: 'Short plain name of the nearest thing, or empty.' } },
  required: ['kind', 'distance', 'name'], additionalProperties: false,
} as const
const SCHEMA = {
  type: 'object',
  properties: {
    ahead: SIDE, left: SIDE, right: SIDE,
    hazards: { type: 'array', items: { type: 'string' }, description: 'Anything a blind pedestrian must know now: steps, traffic, holes, moving people.' },
    text_visible: { type: 'string', description: 'Signs or labels readable in the frame, or empty.' },
    confidence: { type: 'number', description: 'How sure you are about the path description, 0 to 1.' },
  },
  required: ['ahead', 'left', 'right', 'hazards', 'text_visible', 'confidence'], additionalProperties: false,
} as const
export type Side = { kind: typeof KINDS[number]; distance: typeof DISTANCES[number]; name: string }
export interface Frame { ahead: Side; left: Side; right: Side; hazards: string[]; text_visible: string; confidence: number }

const SYSTEM = `You describe the walking path in a photo taken at chest height by a blind pedestrian's phone.
Report what is directly ahead, to the left and to the right within a few steps, bucketing distance as touching (under half a metre), one_step, two_steps or far.
Be conservative: an uncertain gap is an obstacle, not clear. Name hazards plainly. Set confidence low when the frame is dark, blurred or ambiguous.`

export const DEFAULT_MODEL = 'claude-haiku-4-5'
let client: Anthropic | undefined, clientKey = ''
export async function describeFrame(apiKey: string, base64WithoutPrefix: string, model = DEFAULT_MODEL): Promise<Frame> {
  if (!client || clientKey !== apiKey) { client = anthropicClient(apiKey); clientKey = apiKey }
  const res = await client.messages.parse({
    model, max_tokens: 1024, system: SYSTEM,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64WithoutPrefix } },
      { type: 'text', text: 'Describe the walking path for a blind pedestrian.' },
    ] }],
    output_config: { format: jsonSchemaOutputFormat(SCHEMA) },
  })
  if (res.stop_reason === 'refusal' || !res.parsed_output) throw new Error(`no frame description (${res.stop_reason})`)
  return res.parsed_output as Frame
}

/** Rear camera → JPEG base64 frames. */
export class Camera {
  private stream?: MediaStream
  private canvas = document.createElement('canvas')
  constructor(private video: HTMLVideoElement) {}
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    this.video.srcObject = this.stream
    await this.video.play()
  }
  grab(): string | undefined {
    const w = this.video.videoWidth, h = this.video.videoHeight
    if (!w || !h) return
    const s = Math.min(1, 640 / w)
    this.canvas.width = Math.round(w * s); this.canvas.height = Math.round(h * s)
    this.canvas.getContext('2d')!.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)
    return this.canvas.toDataURL('image/jpeg', 0.7).split(',')[1]
  }
  stop() { this.stream?.getTracks().forEach(t => t.stop()); this.stream = undefined; this.video.srcObject = null }
}

export type Report = 'clear' | 'bumped' | 'blocked'
export interface CamObs { frame?: Frame; report?: Report }
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'thing'
const near = (s: Side) => s.kind !== 'clear' && (s.distance === 'touching' || s.distance === 'one_step')

export class CameraEnv implements Environment<CamObs> {
  name = 'camera'
  concepts: { name: string; description: string }[] = []
  frame?: Frame
  report?: Report
  /** The page sets `report` from the user's answer to "clear or bumped?" before calling agent.step; no answer means no step is recorded. */

  observe(): CamObs { return { frame: this.frame, report: this.report } }
  serialize(o: CamObs): Relation[] {
    const f = o.frame
    if (!f) return [rel('ahead', 'unknown')]
    const side = (s: Side) => s.kind === 'clear' ? 'clear' : near(s) ? 'near' : 'far'
    return [
      rel('ahead', near(f.ahead) ? 'blocked' : 'clear'), rel('ahead_object', f.ahead.kind === 'clear' ? 'none' : f.ahead.kind), rel('ahead_distance', f.ahead.distance),
      rel('left', side(f.left)), rel('right', side(f.right)),
      ...f.hazards.map(h => rel('hazard', slug(h))),
      ...(f.confidence < 0.5 ? [rel('low_confidence')] : []),
    ]
  }
  latent() { return [] }
  async act() { /* the user already took the step; `report` holds what they said about it */ }
  questionsFor(a: Action): Question<CamObs>[] {
    if (a.kind !== 'step_forward' && a.kind !== 'step_back') return []
    return [
      { id: 'blocked', text: 'Will the step be blocked?', truth: (_, s) => s.report === 'blocked' },
      { id: 'bump', text: 'Will I touch something?', truth: (_, s) => s.report !== undefined && s.report !== 'clear' },
    ]
  }
  randomAction(): Action { return { kind: 'step_forward' } }
}

// ---- routes: a frame plus a goal → numbered moves a blind pedestrian can do one at a time ----
export interface Move { kind: 'turn_left' | 'turn_right' | 'forward' | 'stairs_up' | 'stairs_down' | 'stop_and_check' | 'ask_for_help'; steps: number; instruction: string; caution: string }
export interface Route { goal: string; goal_seen: boolean; summary: string; moves: Move[]; confidence: number }
export const ROUTE_MODEL = 'claude-opus-5'
const ROUTE_SCHEMA = {
  type: 'object',
  properties: {
    goal_seen: { type: 'boolean', description: 'Whether the goal is visible in the photo.' },
    summary: { type: 'string', description: 'One sentence: where the goal is relative to the walker, or that it is not visible and which way is most likely.' },
    moves: { type: 'array', maxItems: 8, items: { type: 'object', properties: {
      kind: { type: 'string', enum: ['turn_left', 'turn_right', 'forward', 'stairs_up', 'stairs_down', 'stop_and_check', 'ask_for_help'] },
      steps: { type: 'integer', description: 'Walking steps for forward moves (1 to 4); stair count for stairs; 0 otherwise.' },
      instruction: { type: 'string', description: 'One plain sentence the walker can act on without sight, for example "Turn a quarter turn to your right." or "Walk two steps forward."' },
      caution: { type: 'string', description: 'What the cane should find or avoid during this move, or an empty string.' },
    }, required: ['kind', 'steps', 'instruction', 'caution'], additionalProperties: false } },
    confidence: { type: 'number', description: '0 to 1.' },
  },
  required: ['goal_seen', 'summary', 'moves', 'confidence'],
  additionalProperties: false,
} as const
const ROUTE_SYSTEM = `You plan a short walking route for a blind pedestrian from one photo taken at their chest height, facing forward.
Moves are things a person can do without sight, one at a time: a quarter or half turn, one to four steps forward, a stair up or down, or stop and check with the cane. Keep every forward move short and stop before anything at knee or foot height: low tables, cables, speaker cabinets, bags, steps. Route around people and furniture on the clear floor. If the goal is not visible, say so and give at most three moves toward the most likely direction, ending with stop and check. Never claim more than the photo shows; put doubt into the caution text and the confidence number.`

export async function planRoute(apiKey: string, base64WithoutPrefix: string, goal: string, model = ROUTE_MODEL): Promise<Route> {
  if (!client || clientKey !== apiKey) { client = anthropicClient(apiKey); clientKey = apiKey }
  const res = await client.messages.parse({
    model, max_tokens: 2048, system: ROUTE_SYSTEM,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64WithoutPrefix } },
      { type: 'text', text: `Plan the route to: ${goal}.` },
    ] }],
    output_config: { format: jsonSchemaOutputFormat(ROUTE_SCHEMA) },
  })
  if (res.stop_reason === 'refusal' || !res.parsed_output) throw new Error(`no route (${res.stop_reason})`)
  return { goal, ...(res.parsed_output as Omit<Route, 'goal'>) }
}

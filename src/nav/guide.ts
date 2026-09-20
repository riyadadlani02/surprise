// Predictions and relations → short spoken sentences. Never says "safe": guidance is "likely clear" or "stop".
import type { Action, Prediction, Relation } from '../types'

export const NAMES: Record<string, string> = {
  red: 'the red block', blue: 'the blue block', green: 'the green block', ball: 'the ball', cup: 'the cup',
  box: 'the box', lid: 'the lid', ramp: 'the ramp', wall: 'the wall', none: 'nothing',
  obstacle: 'an obstacle', person: 'a person', vehicle: 'a vehicle', stairs_down: 'steps going down', stairs_up: 'steps going up', curb: 'a curb', door: 'a door', unknown: 'something',
}
const DIST: Record<string, string> = { touching: 'touching you', one_step: 'one step ahead', two_steps: 'two steps ahead', far: 'far ahead' }
const SIDE: Record<string, string> = { near: 'something near', far: 'something a few steps away', clear: 'clear' }
export const UNSURE_THRESHOLD = 0.3
export const UNSURE = 'I am not sure what is ahead; check with your cane.'
export const SAFETY = 'Prototype. Not a substitute for a white cane, a guide dog, or orientation and mobility training. Always keep your usual aid.'

export const pct = (p: number) => `${Math.round(p * 10) * 10} percent`
const name = (id?: string) => NAMES[id ?? 'none'] ?? id ?? 'something'
const get = (rels: Relation[], pred: string) => rels.find(r => r.pred === pred)?.args[0]

/** What to say before a step or turn, given the agent's predictions. */
export function guidance(a: Action, preds: Record<string, Prediction>, rels: Relation[]): string {
  if (a.kind === 'step_forward' || a.kind === 'step_back') {
    // Perception first: something within a step is a stop, whatever the model has or has not learned yet.
    const ahead = get(rels, 'ahead'), near = get(rels, 'ahead_distance')
    if (a.kind === 'step_forward' && ahead === 'blocked' && (near === 'touching' || near === 'one_step')) return `Stop. ${cap(name(get(rels, 'ahead_object')))} is ${DIST[near]}.`
    const b = preds.blocked ?? { prob: 0.5, confidence: 0 }
    if (b.confidence < UNSURE_THRESHOLD) return UNSURE
    const dir = a.kind === 'step_back' ? 'Step back' : 'Step forward'
    if (b.prob > 0.5) {
      const obj = get(rels, 'ahead_object'), d = get(rels, 'ahead_distance')
      return a.kind === 'step_forward' && obj && obj !== 'none' ? `Stop. ${cap(name(obj))} is ${DIST[d ?? 'far']}.` : `Stop. Something is likely in the way, ${pct(b.prob)}.`
    }
    const reach = preds.reach && preds.reach.confidence >= UNSURE_THRESHOLD && preds.reach.prob > 0.5 ? ` You will likely arrive at ${name(get(rels, 'target'))}.` : ''
    return `${dir} is likely clear, ${pct(1 - b.prob)}.${reach}`
  }
  if (a.kind === 'turn_left' || a.kind === 'turn_right') {
    const side = a.kind === 'turn_left' ? 'left' : 'right', f = preds.faces_target
    return f && f.confidence >= UNSURE_THRESHOLD && f.prob > 0.5 ? `Turn ${side} to face ${name(get(rels, 'target'))}.` : `Turning ${side}.`
  }
  return ''
}

/** What happened after the action. */
export function outcome(a: Action, blocked: boolean, heading: string) {
  if (a.kind === 'step_forward' || a.kind === 'step_back') return blocked ? 'Blocked. You did not move.' : 'Stepped.'
  return `Now facing ${heading}.`
}

export function around(rels: Relation[]) {
  const obj = get(rels, 'ahead_object'), d = get(rels, 'ahead_distance'), left = get(rels, 'left'), right = get(rels, 'right'), heading = get(rels, 'heading')
  if (get(rels, 'ahead') === 'unknown' || !obj || !left || !right || rels.some(r => r.pred === 'low_confidence')) return UNSURE
  const ahead = obj !== 'none' ? `${cap(name(obj))} is ${DIST[d ?? 'far']}.` : 'Nothing close ahead.'
  return `${ahead} Left: ${SIDE[left]}. Right: ${SIDE[right]}.${heading ? ` You face ${heading}.` : ''}`
}

export function whereIs(rels: Relation[], id = get(rels, 'target')) {
  const dir = get(rels, 'target_direction'), d = get(rels, 'target_distance')
  const where = dir === 'behind' ? 'behind you' : dir === 'ahead' ? 'ahead of you' : `to your ${dir}`
  return `${cap(name(id))} is ${where}, ${d === 'here' ? 'within reach' : d === 'near' ? 'a few steps away' : 'far'}.`
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A camera or photo frame in words, using the described names and hazards rather than the bucketed relations. */
export interface FrameLike { ahead: SideLike; left: SideLike; right: SideLike; hazards: string[] }
export interface SideLike { kind: string; distance: string; name: string }
const NEAR: Record<string, string> = { touching: 'touching you', one_step: 'one step away', two_steps: 'two steps away', far: 'far' }
export function frameText(f: FrameLike) {
  const side = (s: SideLike, label: string) => s.kind === 'clear' ? `${label}: clear.` : `${label}, ${NEAR[s.distance] ?? s.distance}: ${s.name || name(s.kind)}.`
  return [side(f.ahead, 'Ahead'), side(f.left, 'Left'), side(f.right, 'Right'), f.hazards.length ? `Hazards: ${f.hazards.join('; ')}.` : ''].filter(Boolean).join(' ')
}
/** The pre-step line in camera or photo mode: the described obstacle by name when it is within a step. */
export function stopLine(f: FrameLike) {
  return f.ahead.kind !== 'clear' && (f.ahead.distance === 'touching' || f.ahead.distance === 'one_step') ? `Stop. ${cap(f.ahead.name || name(f.ahead.kind))} is ${NEAR[f.ahead.distance]}.` : undefined
}

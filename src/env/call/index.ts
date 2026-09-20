// Second environment: a synthetic phone call. Same loop, different serializer and action set.
// The caller's dynamics are the hidden "world"; the agent learns them only through surprise.
import { rel, type Action, type Environment, type Question, type Tagged } from '../../types'

export type Intent = 'appointment' | 'prescription' | 'results' | 'complaint'
export type Mood = 'calm' | 'frustrated' | 'angry'
export interface CallState {
  intent: Intent; mood: Mood; urgent: boolean
  turn: number; detailsGiven: boolean; askedDetails: number; apologised: number
  resolved: boolean; transferred: boolean
}
const MOODS: Mood[] = ['calm', 'frustrated', 'angry']
const worse = (m: Mood): Mood => MOODS[Math.min(2, MOODS.indexOf(m) + 1)]
const better = (m: Mood): Mood => MOODS[Math.max(0, MOODS.indexOf(m) - 1)]
export const REPLIES = ['ask_details', 'offer_slot', 'send_to_pharmacy', 'give_results', 'apologise', 'transfer'] as const

export class CallEnv implements Environment<CallState> {
  name = 'call'
  concepts = [
    { name: 'urgency', description: 'urgent(caller) when the request is clinically urgent; urgent results must be transferred.' },
    { name: 'history', description: 'asked_details(repeated) when details were already requested this call.' },
  ]
  state!: CallState
  constructor(private rng: () => number = Math.random) { this.newCaller() }

  newCaller() {
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(this.rng() * xs.length)]
    this.state = { intent: pick(['appointment', 'prescription', 'results', 'complaint'] as const), mood: pick(['calm', 'calm', 'frustrated']), urgent: this.rng() < 0.3,
      turn: 0, detailsGiven: false, askedDetails: 0, apologised: 0, resolved: false, transferred: false }
  }

  observe(): CallState { return { ...this.state } }
  serialize(s: CallState, concepts: string[]) { return this.all(s).filter(x => !x.concept || concepts.includes(x.concept)).map(x => x.r) }
  latent(s: CallState, concepts: string[]): Tagged[] { return this.all(s).filter(x => x.concept && !concepts.includes(x.concept)).map(x => ({ r: x.r, concept: x.concept! })) }
  private all(s: CallState): { r: ReturnType<typeof rel>; concept?: string }[] {
    return [
      { r: rel('intent', s.intent) }, { r: rel('mood', s.mood) },
      { r: rel('details', s.detailsGiven ? 'given' : 'missing') },
      { r: rel('turn', s.turn === 0 ? 'first' : s.turn < 3 ? 'early' : 'late') },
      ...(s.urgent ? [{ r: rel('urgent', 'caller'), concept: 'urgency' }] : []),
      ...(s.askedDetails > 0 ? [{ r: rel('asked_details', 'repeated'), concept: 'history' }] : []),
    ]
  }

  async act(a: Action) {
    const s = this.state
    if (s.resolved) this.newCaller()
    const t = this.state
    t.turn++
    switch (a.kind) {
      case 'ask_details': t.askedDetails++; t.detailsGiven = true; if (t.askedDetails > 1) t.mood = worse(t.mood); break
      case 'offer_slot': if (t.intent === 'appointment' && t.detailsGiven) t.resolved = true; else t.mood = worse(t.mood); break
      case 'send_to_pharmacy': if (t.intent === 'prescription' && t.detailsGiven) t.resolved = true; else t.mood = worse(t.mood); break
      case 'give_results': if (t.intent === 'results' && t.detailsGiven && !t.urgent) t.resolved = true; else t.mood = worse(t.mood); break
      case 'apologise': t.apologised++; if (t.intent === 'complaint' && t.apologised >= 1 && t.detailsGiven) t.resolved = true; else if (t.apologised === 1) t.mood = better(t.mood); break
      case 'transfer': t.resolved = true; t.transferred = true; break
    }
  }

  questionsFor(a: Action, _pre: CallState): Question<CallState>[] {
    return [
      { id: 'resolved', text: `Will "${a.kind.replace('_', ' ')}" resolve the call?`, truth: (_, s) => s.resolved },
      { id: 'mood_worsens', text: 'Will the caller get more frustrated?', truth: (p, s) => MOODS.indexOf(s.mood) > MOODS.indexOf(p.mood) },
    ]
  }
  randomAction(): Action { return { kind: REPLIES[Math.floor(this.rng() * REPLIES.length)] } }
}

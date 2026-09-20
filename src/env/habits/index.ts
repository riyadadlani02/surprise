// One person's routine. The agent proposes slots and learns when they say yes.
import { rel, type Action, type Environment, type Question } from '../../types'
import { hidden, lcg, pickWith, visible, type Fact } from '../shared'

export interface Person { day: 'weekday' | 'weekend'; weather: 'rain' | 'sun'; energy: 'low' | 'high'; lastSlot: 'morning' | 'evening' | 'lunch' | 'none'; declined: number; accepted: boolean; annoyed: boolean }
export const PROPOSALS = ['propose_morning', 'propose_evening', 'propose_lunch', 'send_reminder', 'skip_today'] as const

export class HabitsEnv implements Environment<Person> {
  name = 'habits'
  concepts = [
    { name: 'weather', description: 'weather(rain|sun): nobody wants a morning slot in the rain.' },
    { name: 'energy', description: 'energy(low|high) for the day.' },
    { name: 'history', description: 'declined(recently) after two refusals in a row.' },
  ]
  state!: Person
  private pick: ReturnType<typeof pickWith>
  constructor(private rng: () => number = lcg(5)) { this.pick = pickWith(rng); this.state = this.newDay('none', 0) }
  private newDay(lastSlot: Person['lastSlot'], declined: number): Person {
    return { day: this.rng() < 5 / 7 ? 'weekday' : 'weekend', weather: this.rng() < 0.35 ? 'rain' : 'sun', energy: this.rng() < 0.5 ? 'low' : 'high', lastSlot, declined, accepted: false, annoyed: false }
  }
  observe(): Person { return { ...this.state } }
  private facts(p: Person): Fact[] {
    return [
      { r: rel('day', p.day) }, { r: rel('last_slot', p.lastSlot) },
      { r: rel('weather', p.weather), concept: 'weather' }, { r: rel('energy', p.energy), concept: 'energy' },
      ...(p.declined >= 2 ? [{ r: rel('declined', 'recently'), concept: 'history' }] : []),
    ]
  }
  serialize(p: Person, c: string[]) { return visible(this.facts(p), c) }
  latent(p: Person, c: string[]) { return hidden(this.facts(p), c) }

  async act(a: Action) {
    const p = this.state
    let accepted = false, annoyed = false
    const tired = p.declined >= 2
    switch (a.kind) {
      case 'propose_morning': accepted = !tired && p.day === 'weekday' && p.weather === 'sun' && p.energy === 'high'; break
      case 'propose_evening': accepted = !tired && (p.day === 'weekend' || p.weather === 'rain'); break
      case 'propose_lunch': accepted = !tired && p.day === 'weekday' && p.energy === 'low'; break
      case 'send_reminder': annoyed = p.weather === 'rain' || p.declined > 0; break
      case 'skip_today': break
    }
    const proposed = a.kind.startsWith('propose')
    const declined = proposed && !accepted ? p.declined + 1 : proposed ? 0 : tired ? 0 : p.declined
    const slot = accepted ? (a.kind.replace('propose_', '') as Person['lastSlot']) : p.lastSlot
    this.state = { ...this.newDay(slot, declined), accepted, annoyed }
  }
  questionsFor(a: Action, _pre: Person): Question<Person>[] {
    return [
      { id: 'accepts', text: `Will they say yes to "${a.kind.replace(/_/g, ' ')}"?`, truth: (_, p) => p.accepted },
      { id: 'annoyed', text: 'Will they be annoyed?', truth: (_, p) => p.annoyed },
    ]
  }
  randomAction(): Action { return { kind: this.pick(PROPOSALS) } }
}

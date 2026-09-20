// A team's ticket queue. "Will this be closed by Friday?" depends on things the agent cannot see at first.
import { rel, type Action, type Environment, type Question } from '../../types'
import { hidden, lcg, pickWith, visible, type Fact } from '../shared'

export interface Ticket { priority: 'low' | 'medium' | 'high'; size: 'S' | 'M' | 'L'; load: 'free' | 'busy' | 'overloaded'; blocked: boolean; daysLeft: number; assigned: boolean; closed: boolean }
export const MOVES = ['assign_free_engineer', 'assign_busy_engineer', 'escalate', 'unblock', 'split', 'wait'] as const
const EFFORT = { S: 1, M: 2, L: 4 }, SLOW = { free: 1, busy: 1.5, overloaded: 3 }

export class TicketsEnv implements Environment<Ticket> {
  name = 'tickets'
  concepts = [
    { name: 'dependencies', description: 'blocked(ticket) when it waits on something else.' },
    { name: 'capacity', description: 'load(free|busy|overloaded) of the assignee.' },
  ]
  state!: Ticket
  private pick: ReturnType<typeof pickWith>
  constructor(private rng: () => number = lcg(23)) { this.pick = pickWith(rng); this.newTicket() }
  newTicket() {
    this.state = { priority: this.pick(['low', 'medium', 'high'] as const), size: this.pick(['S', 'M', 'L'] as const), load: this.pick(['free', 'busy', 'overloaded'] as const),
      blocked: this.rng() < 0.35, daysLeft: 3 + Math.floor(this.rng() * 3), assigned: this.rng() < 0.5, closed: false }
  }
  observe(): Ticket { return { ...this.state } }
  private facts(t: Ticket): Fact[] {
    return [
      { r: rel('priority', t.priority) }, { r: rel('size', t.size) }, { r: rel('assigned', t.assigned ? 'yes' : 'no') },
      { r: rel('days_left', t.daysLeft <= 1 ? 'one' : t.daysLeft <= 3 ? 'few' : 'week') },
      ...(t.blocked ? [{ r: rel('blocked', 'ticket'), concept: 'dependencies' }] : []),
      { r: rel('load', t.load), concept: 'capacity' },
    ]
  }
  serialize(t: Ticket, c: string[]) { return visible(this.facts(t), c) }
  latent(t: Ticket, c: string[]) { return hidden(this.facts(t), c) }

  /** Would it close in time given the current plan? This is the hidden world; the agent only sees the answer after acting. */
  static closes(t: Ticket) {
    const days = EFFORT[t.size] * SLOW[t.load] * (t.priority === 'high' ? 0.75 : 1)
    return t.assigned && !t.blocked && days <= t.daysLeft
  }
  async act(a: Action) {
    if (this.state.closed || this.state.daysLeft <= 0) this.newTicket()
    const t = this.state
    switch (a.kind) {
      case 'assign_free_engineer': t.assigned = true; t.load = 'free'; break
      case 'assign_busy_engineer': t.assigned = true; t.load = 'busy'; break
      case 'escalate': t.priority = 'high'; if (t.load === 'overloaded') t.load = 'busy'; break
      case 'unblock': t.blocked = false; break
      case 'split': t.size = t.size === 'L' ? 'M' : 'S'; break
      case 'wait': break
    }
    t.daysLeft--                           // every move costs a day
    t.closed = TicketsEnv.closes(t)
  }
  questionsFor(a: Action, _pre: Ticket): Question<Ticket>[] {
    return [
      { id: 'closed_by_friday', text: `After "${a.kind.replace(/_/g, ' ')}", will the ticket be closed by Friday?`, truth: (_, t) => t.closed },
      { id: 'still_at_risk', text: 'Will the ticket still be unassigned or blocked?', truth: (_, t) => !t.assigned || t.blocked },
    ]
  }
  randomAction(): Action { return { kind: this.pick(MOVES) } }
}

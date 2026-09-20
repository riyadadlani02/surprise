// Rock-paper-scissors against an opponent with a hidden habit. The rules are known; the opponent is not.
import { rel, type Action, type Environment, type Question } from '../../types'
import { hidden, lcg, pickWith, visible, type Fact } from '../shared'

type Move = 'rock' | 'paper' | 'scissors'
const MOVES: Move[] = ['rock', 'paper', 'scissors']
const BEATS: Record<Move, Move> = { rock: 'scissors', paper: 'rock', scissors: 'paper' }   // key beats value
const BEATEN_BY: Record<Move, Move> = { scissors: 'rock', rock: 'paper', paper: 'scissors' }
export interface Match { round: number; myLast: Move | 'none'; oppLast: Move | 'none'; result: 'win' | 'lose' | 'draw' | 'none'; habit: 'counter' | 'copy' }

export class RpsEnv implements Environment<Match> {
  name = 'rps'
  concepts = [
    { name: 'history', description: 'my_last(x) and opp_last(x): what each side played last round.' },
    { name: 'opponent_model', description: 'habit(counter|copy): the opponent counters or copies your last move.' },
  ]
  state: Match = { round: 0, myLast: 'none', oppLast: 'none', result: 'none', habit: 'counter' }
  private pick: ReturnType<typeof pickWith>
  constructor(private rng: () => number = lcg(42)) { this.pick = pickWith(rng) }
  observe(): Match { return { ...this.state } }
  private facts(m: Match): Fact[] {
    return [
      { r: rel('round', m.round < 10 ? 'opening' : 'later') }, { r: rel('last_result', m.result) },
      { r: rel('my_last', m.myLast), concept: 'history' }, { r: rel('opp_last', m.oppLast), concept: 'history' },
      { r: rel('habit', m.habit), concept: 'opponent_model' },
    ]
  }
  serialize(m: Match, c: string[]) { return visible(this.facts(m), c) }
  latent(m: Match, c: string[]) { return hidden(this.facts(m), c) }

  async act(a: Action) {
    const m = this.state, mine = a.kind.replace('play_', '') as Move
    const opp: Move = m.myLast === 'none' ? this.pick(MOVES) : m.habit === 'counter' ? BEATEN_BY[m.myLast] : m.myLast
    const result = mine === opp ? 'draw' : BEATS[mine] === opp ? 'win' : 'lose'
    const round = m.round + 1
    this.state = { round, myLast: mine, oppLast: opp, result, habit: round % 60 === 0 ? (m.habit === 'counter' ? 'copy' : 'counter') : m.habit }
  }
  questionsFor(a: Action, _pre: Match): Question<Match>[] {
    const mine = a.kind.replace('play_', '')
    return [
      { id: 'wins', text: `Will ${mine} win this round?`, truth: (_, m) => m.result === 'win' },
      { id: 'loses', text: `Will ${mine} lose this round?`, truth: (_, m) => m.result === 'lose' },
    ]
  }
  randomAction(): Action { return { kind: 'play_' + this.pick(MOVES) } }
}

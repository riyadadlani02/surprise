// A web shop with no documentation. The agent learns which button does what by clicking and being surprised.
import { rel, type Action, type Environment, type Question } from '../../types'
import { hidden, lcg, pickWith, visible, type Fact } from '../shared'

type Page = 'product' | 'cart' | 'login' | 'address' | 'payment' | 'done'
export interface Shop { page: Page; items: number; loggedIn: boolean; address: 'blank' | 'valid' | 'invalid'; payment: 'blank' | 'valid' | 'invalid'; couponUsed: boolean; error: boolean; orders: number }
const FLOW: Page[] = ['product', 'cart', 'login', 'address', 'payment', 'done']
export const CLICKS = ['add_to_cart', 'remove_item', 'go_to_checkout', 'log_in', 'fill_address', 'fill_payment', 'apply_coupon', 'pay', 'back'] as const

export class CheckoutEnv implements Environment<Shop> {
  name = 'checkout'
  concepts = [
    { name: 'session', description: 'guest(user) or signed_in(user): checkout needs an account.' },
    { name: 'validation', description: 'address(valid|invalid|blank) and payment(valid|invalid|blank): payment needs both valid.' },
  ]
  state!: Shop
  private pick: ReturnType<typeof pickWith>
  constructor(private rng: () => number = lcg(11)) { this.pick = pickWith(rng); this.newSession() }
  newSession() { this.state = { page: 'product', items: 0, loggedIn: this.rng() < 0.4, address: 'blank', payment: 'blank', couponUsed: false, error: false, orders: 0 } }

  observe(): Shop { return { ...this.state } }
  private facts(s: Shop): Fact[] {
    return [
      { r: rel('page', s.page) }, { r: rel('cart', s.items === 0 ? 'empty' : s.items === 1 ? 'one_item' : 'several_items') },
      { r: rel('coupon', s.couponUsed ? 'applied' : 'none') }, ...(s.error ? [{ r: rel('error', 'shown') }] : []),
      { r: rel(s.loggedIn ? 'signed_in' : 'guest', 'user'), concept: 'session' },
      { r: rel('address', s.address), concept: 'validation' }, { r: rel('payment', s.payment), concept: 'validation' },
    ]
  }
  serialize(s: Shop, c: string[]) { return visible(this.facts(s), c) }
  latent(s: Shop, c: string[]) { return hidden(this.facts(s), c) }

  async act(a: Action) {
    if (this.state.page === 'done') this.newSession()
    const s = this.state, valid = a.params?.valid !== 'no'
    s.error = false
    switch (a.kind) {
      case 'add_to_cart': s.items++; s.page = 'cart'; break
      case 'remove_item': if (s.items > 0) s.items--; else s.error = true; break
      case 'go_to_checkout': if (s.items === 0) s.error = true; else s.page = s.loggedIn ? 'address' : 'login'; break
      case 'log_in': if (s.page === 'login') { s.loggedIn = true; s.page = 'address' } else if (!s.loggedIn) s.loggedIn = true; else s.error = true; break
      case 'fill_address': if (s.page === 'address') { s.address = valid ? 'valid' : 'invalid'; if (valid) s.page = 'payment'; else s.error = true } else s.error = true; break
      case 'fill_payment': if (s.page === 'payment') { s.payment = valid ? 'valid' : 'invalid'; if (!valid) s.error = true } else s.error = true; break
      case 'apply_coupon': if (s.page === 'cart' && !s.couponUsed) s.couponUsed = true; else s.error = true; break
      case 'pay': if (s.page === 'payment' && s.payment === 'valid' && s.address === 'valid') { s.page = 'done'; s.orders++ } else s.error = true; break
      case 'back': { const i = FLOW.indexOf(s.page); if (i > 0 && s.page !== 'done') s.page = FLOW[i - 1] === 'login' && s.loggedIn ? 'cart' : FLOW[i - 1]; else s.error = true; break }
    }
  }

  questionsFor(a: Action, _pre: Shop): Question<Shop>[] {
    const label = a.kind.replace(/_/g, ' ')
    return [
      { id: 'page_changes', text: `Will "${label}" take us to a different page?`, truth: (p, s) => p.page !== s.page },
      { id: 'error_shows', text: `Will "${label}" show an error?`, truth: (_, s) => s.error },
      { id: 'order_completes', text: `Will "${label}" complete the order?`, truth: (p, s) => s.orders > p.orders },
    ]
  }
  randomAction(): Action {
    const kind = this.pick(CLICKS)
    return kind === 'fill_address' || kind === 'fill_payment' ? { kind, params: { valid: this.rng() < 0.65 ? 'yes' : 'no' } } : { kind }
  }
}

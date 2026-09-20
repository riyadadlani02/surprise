// Small helpers every text environment uses.
import type { Relation, Tagged } from '../types'

export type Fact = { r: Relation; concept?: string }
export const visible = (facts: Fact[], concepts: string[]): Relation[] =>
  facts.filter(f => !f.concept || concepts.includes(f.concept)).map(f => f.r)
export const hidden = (facts: Fact[], concepts: string[]): Tagged[] =>
  facts.filter(f => f.concept && !concepts.includes(f.concept)).map(f => ({ r: f.r, concept: f.concept! }))

/** Deterministic rng so runs are reproducible. */
export const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
export const pickWith = (rng: () => number) => <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]

// Runs every environment against every predictor and writes measured curves to public/results.
// Usage: JEV_API_KEY=... npm run scenarios    (the key is read from .env if present; nothing about it is written out)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { CURRICULUM } from '../src/curriculum'
import { CallEnv } from '../src/env/call/index'
import { CheckoutEnv } from '../src/env/checkout/index'
import { HabitsEnv } from '../src/env/habits/index'
import { PlayroomEnv } from '../src/env/playroom/index'
import { Playroom, initRapier } from '../src/env/playroom/physics'
import { RpsEnv } from '../src/env/rps/index'
import { lcg } from '../src/env/shared'
import { TicketsEnv } from '../src/env/tickets/index'
import { Agent, type TickResult } from '../src/loop'
import { JEV_USD_PER_INPUT_TOKEN, JevPredictor } from '../src/model/jev'
import { RulePredictor } from '../src/model/rules'
import { createWorldModel } from '../src/model/worldmodel'
import { actionText, type Environment, type Predictor } from '../src/types'

const OUT = 'public/results'
const key = process.env.JEV_API_KEY || (existsSync('.env') ? readFileSync('.env', 'utf8').match(/^JEV_API_KEY=(.+)$/m)?.[1]?.trim() : undefined)

interface Scenario { id: string; title: string; kind: string; make: () => Environment<unknown>; steps: (env: Environment<unknown>, agent: Agent<unknown>) => Promise<void> }
const random = (n: number) => async (env: Environment<unknown>, agent: Agent<unknown>) => { for (let i = 0; i < n; i++) await agent.step(env.randomAction()) }

const SCENARIOS: Scenario[] = [
  { id: 'playroom-curriculum', title: '3D playroom · developmental curriculum', kind: 'physics', make: () => new PlayroomEnv(new Playroom()) as Environment<unknown>,
    steps: async (env, agent) => { const room = (env as PlayroomEnv).room; for (let r = 0; r < 4; r++) for (const t of CURRICULUM) { t.setup(room); await agent.step(t.action, t.stage) } } },
  { id: 'playroom-random', title: '3D playroom · free play', kind: 'physics', make: () => new PlayroomEnv(new Playroom()) as Environment<unknown>, steps: random(120) },
  { id: 'call', title: 'Phone call · a caller with a goal and a mood', kind: 'people', make: () => new CallEnv(lcg(7)) as Environment<unknown>, steps: random(300) },
  { id: 'checkout', title: 'Web shop · undocumented checkout flow', kind: 'software', make: () => new CheckoutEnv(lcg(11)) as Environment<unknown>, steps: random(300) },
  { id: 'tickets', title: 'Team · will the ticket close by Friday?', kind: 'organisation', make: () => new TicketsEnv(lcg(23)) as Environment<unknown>, steps: random(300) },
  { id: 'habits', title: 'One person · which slot will they take?', kind: 'people', make: () => new HabitsEnv(lcg(5)) as Environment<unknown>, steps: random(300) },
  { id: 'rps', title: 'Game · an opponent with a habit', kind: 'game', make: () => new RpsEnv(lcg(42)) as Environment<unknown>, steps: random(300) },
]
const PREDICTORS: { id: string; make: () => Predictor }[] = [
  { id: 'rules', make: () => new RulePredictor() },
  ...(key ? [
    { id: 'jev-zero-shot', make: () => new JevPredictor(key, { withRules: false }) },
    { id: 'jev', make: () => new JevPredictor(key) },
  ] : []),
]

async function runOne(s: Scenario, p: { id: string; make: () => Predictor }) {
  const env = s.make(), predictor = p.make()
  const agent = new Agent(env, createWorldModel(), { predictor, escalate: async () => undefined })
  const t0 = Date.now()
  await s.steps(env, agent)
  const m = agent.metrics, thirds = m.escalationCurve(3)
  const surprises = agent.log.filter((t: TickResult) => t.surprised.length).slice(0, 40).map((t: TickResult) => ({
    tick: t.tick, action: actionText(t.action), question: t.questions.find(q => q.id === t.surprised[0])!.text,
    prob: t.predictions[t.surprised[0]].prob, truth: t.truths[t.surprised[0]], explanation: t.diffs.at(-1)?.explanation ?? '' }))
  const jev = predictor instanceof JevPredictor ? { ...predictor.stats, msPerCall: predictor.stats.ms / Math.max(1, predictor.stats.calls), costUsd: predictor.stats.inputTokens * JEV_USD_PER_INPUT_TOKEN } : undefined
  const warnings = agent.log.reduce((n: number, t: TickResult) => n + t.warnings.length, 0)
  const result = {
    scenario: s.id, title: s.title, kind: s.kind, predictor: p.id, ticks: agent.tick, predictions: m.records.length,
    accuracy: m.accuracy(), brier: m.brier(), thirds, calibration: m.calibration(5), accuracyByStage: m.accuracyByStage(),
    concepts: agent.wm.concepts, rules: agent.wm.rules.length, revisions: agent.wm.history.length, accommodations: m.accommodations.length,
    accommodationValue: m.accommodationValue(), escalationRate: m.records.filter(r => r.escalated).length / Math.max(1, m.records.length),
    jev, warnings, durationMs: Date.now() - t0, surprises: surprises.slice(0, 12),
    rulesSample: agent.wm.rules.slice(0, 40).map(r => ({ action: r.action, requires: r.requires, question: r.question, yes: r.yes, no: r.no, source: r.source })),
    history: agent.wm.history.slice(0, 60).map(d => ({ version: d.version, trigger: d.trigger, explanation: d.explanation, conceptsAdded: d.conceptsAdded })),
  }
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}/${s.id}--${p.id}.json`, JSON.stringify(result, null, 1))
  console.log(`${s.id.padEnd(22)} ${p.id.padEnd(14)} acc ${(result.accuracy * 100).toFixed(0).padStart(3)}%  brier ${result.brier.toFixed(3)}  thirds ${thirds.map(t => t.brier.toFixed(2)).join('→')}  esc ${thirds.map(t => (t.rate * 100).toFixed(0)).join('→')}%  ${jev ? `${jev.msPerCall.toFixed(0)}ms/call $${jev.costUsd.toFixed(4)} ${jev.errors} err` : ''} ${warnings ? `⚠ ${warnings} fallbacks` : ''}`)
  return result
}

it('all scenarios', async () => {
  await initRapier()
  const only = process.env.ONLY?.split(',')
  const jobs = SCENARIOS.filter(s => !only || only.includes(s.id)).flatMap(s => PREDICTORS.map(p => () => runOne(s, p)))
  // one stream per scenario keeps physics deterministic per env; predictors run concurrently
  const results = (await Promise.all(jobs.map(j => j()))).flat()
  const index = { generatedAt: new Date().toISOString(), jevModel: 'jev-latest', runs: results.map(r => ({ scenario: r.scenario, title: r.title, kind: r.kind, predictor: r.predictor, predictions: r.predictions, accuracy: r.accuracy, brier: r.brier, thirds: r.thirds, concepts: r.concepts, rules: r.rules, revisions: r.revisions, escalationRate: r.escalationRate, jev: r.jev, warnings: r.warnings })) }
  writeFileSync(`${OUT}/index.json`, JSON.stringify(index, null, 1))
  console.log(`wrote ${results.length} runs to ${OUT}`)
})

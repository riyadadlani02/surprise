// Playroom curriculum with real Jev predicting and Claude Fable 5.1 accommodating. Writes public/results/playroom-curriculum--jev--fable.json.
// Usage: npx vitest run --config scenarios/vitest.config.ts scenarios/fable.run.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { CURRICULUM } from '../src/curriculum'
import { PlayroomEnv } from '../src/env/playroom/index'
import { Playroom, initRapier } from '../src/env/playroom/physics'
import { Agent } from '../src/loop'
import { FableAccommodator } from '../src/model/fable'
import { JEV_USD_PER_INPUT_TOKEN, JevPredictor } from '../src/model/jev'
import { createWorldModel } from '../src/model/worldmodel'
import { actionText } from '../src/types'

const env = readFileSync('.env', 'utf8')
const jevKey = process.env.JEV_API_KEY || env.match(/^JEV_API_KEY=(.+)$/m)?.[1]?.trim()
const antKey = process.env.ANTHROPIC_API_KEY || env.match(/^ANTHROPIC_API_KEY=(.+)$/m)?.[1]?.trim()
const model = process.env.FABLE_MODEL || 'claude-fable-5-1'

it('curriculum with jev + fable', async () => {
  if (!jevKey || !antKey) throw new Error('keys missing')
  await initRapier()
  const playroom = new PlayroomEnv(new Playroom())
  const predictor = new JevPredictor(jevKey)
  const accommodator = new FableAccommodator(antKey, playroom.concepts, model)
  const agent = new Agent(playroom, createWorldModel(), { predictor, accommodator, escalate: async () => undefined })
  const t0 = Date.now()
  for (let r = 0; r < 3; r++) for (const t of CURRICULUM) { t.setup(playroom.room); const res = await agent.step(t.action, t.stage); if (res.surprised.length || res.warnings.length) console.log(`#${res.tick} ${t.stage} ${actionText(t.action)} ${res.surprised.length ? 'SURPRISED' : ''} ${res.warnings.join('; ')}`) }
  const m = agent.metrics
  const fableDiffs = agent.wm.history.filter(d => d.trigger.startsWith('surprise'))
  const result = {
    scenario: 'playroom-curriculum', title: '3D playroom · developmental curriculum', kind: 'physics', predictor: 'jev', accommodator: model,
    ticks: agent.tick, predictions: m.records.length, accuracy: m.accuracy(), brier: m.brier(), thirds: m.escalationCurve(3), calibration: m.calibration(5), accuracyByStage: m.accuracyByStage(),
    concepts: agent.wm.concepts, rules: agent.wm.rules.length, revisions: agent.wm.history.length, accommodations: m.accommodations.length, accommodationValue: m.accommodationValue(),
    warnings: agent.log.reduce((n, t) => n + t.warnings.length, 0), warningSamples: agent.log.flatMap(t => t.warnings).slice(0, 5),
    jev: { ...predictor.stats, msPerCall: predictor.stats.ms / Math.max(1, predictor.stats.calls), costUsd: predictor.stats.inputTokens * JEV_USD_PER_INPUT_TOKEN },
    durationMs: Date.now() - t0,
    explanations: fableDiffs.map(d => ({ version: d.version, trigger: d.trigger, explanation: d.explanation, added: d.added, removed: d.removed, conceptsAdded: d.conceptsAdded })),
    rulesSample: agent.wm.rules.map(r => ({ action: r.action, requires: r.requires, question: r.question, yes: r.yes, no: r.no, source: r.source, note: r.note })),
  }
  writeFileSync('public/results/playroom-curriculum--jev--fable.json', JSON.stringify(result, null, 1))
  console.log(`acc ${(result.accuracy * 100).toFixed(0)}% brier ${result.brier.toFixed(3)} surprises ${result.accommodations} concepts ${result.concepts.join(',')} fallbacks ${result.warnings} in ${(result.durationMs / 1000).toFixed(0)}s`)
  for (const e of result.explanations.slice(0, 6)) console.log(`v${e.version} [${e.trigger}]\n  ${e.explanation}\n  + ${e.added.join('\n  + ')}${e.conceptsAdded.length ? '\n  concepts: ' + e.conceptsAdded.join(',') : ''}`)
}, 40 * 60 * 1000)

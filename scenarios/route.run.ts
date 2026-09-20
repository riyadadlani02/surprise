// Plan a route through the bundled auditorium photo with the real model and save it as the sample route.
// Usage: GOAL="the stage" npx vitest run --config scenarios/vitest.config.ts scenarios/route.run.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { planRoute } from '../src/nav/camera'

const env = readFileSync('.env', 'utf8')
const key = process.env.ANTHROPIC_API_KEY || env.match(/^ANTHROPIC_API_KEY=(.+)$/m)?.[1]?.trim()
const goal = process.env.GOAL || 'the stage at the front of the hall'

it('plans a route through the auditorium photo', async () => {
  if (!key) throw new Error('ANTHROPIC_API_KEY missing')
  const b64 = readFileSync('public/photos/auditorium.jpg').toString('base64')
  const t0 = Date.now()
  const route = await planRoute(key, b64, goal)
  const out = { source: `claude-opus-5 route planner, ${new Date().toISOString().slice(0, 10)}`, ...route }
  writeFileSync('public/photos/auditorium.route.json', JSON.stringify(out, null, 2) + '\n')
  console.log(JSON.stringify(out, null, 2), `\n${Date.now() - t0} ms`)
}, 5 * 60 * 1000)

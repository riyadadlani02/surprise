// Describe the bundled auditorium photo with the real vision model and save the result next to it.
// Usage: npx vitest run --config scenarios/vitest.config.ts scenarios/photo.run.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { describeFrame } from '../src/nav/camera'

const env = readFileSync('.env', 'utf8')
const key = process.env.ANTHROPIC_API_KEY || env.match(/^ANTHROPIC_API_KEY=(.+)$/m)?.[1]?.trim()
const model = process.env.PHOTO_MODEL || 'claude-opus-5'

it('describes the auditorium photo', async () => {
  if (!key) throw new Error('ANTHROPIC_API_KEY missing')
  const b64 = readFileSync('public/photos/auditorium.jpg').toString('base64')
  const t0 = Date.now()
  const frame = await describeFrame(key, b64, model)
  const out = { source: `${model} vision output, ${new Date().toISOString().slice(0, 10)}; the page looks live when a key is set`, ...frame }
  writeFileSync('public/photos/auditorium.json', JSON.stringify(out, null, 2) + '\n')
  console.log(JSON.stringify(out, null, 2), `\n${Date.now() - t0} ms`)
})

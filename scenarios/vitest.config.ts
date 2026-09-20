import { defineConfig } from 'vite'
export default defineConfig({ test: { include: ['scenarios/**/*.run.ts'], testTimeout: 60 * 60 * 1000, hookTimeout: 60 * 1000 } })

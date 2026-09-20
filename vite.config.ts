import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'

// The Jev API disallows browser origins, so the dev server proxies it and adds the key from .env.
// Nothing about the key reaches the bundle; on static hosting (GitHub Pages) there is no proxy and the demo falls back to rules.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: './',
    server: {
      proxy: {
        ...(env.JEV_API_KEY ? { '/api/jev': { target: 'https://api.typesafe.ai', changeOrigin: true, rewrite: () => '/v1/systemone', headers: { Authorization: `Bearer ${env.JEV_API_KEY}` } } } : {}),
        // Same idea for Anthropic: the page sends a placeholder key, the dev server swaps in the real one. Dev only; static hosting has no proxy.
        ...(env.ANTHROPIC_API_KEY ? { '/api/anthropic': { target: 'https://api.anthropic.com', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api\/anthropic/, ''), headers: { 'x-api-key': env.ANTHROPIC_API_KEY } } } : {}),
      },
    },
    build: { rollupOptions: { input: { index: resolve(__dirname, 'index.html'), demo: resolve(__dirname, 'demo.html'), navigate: resolve(__dirname, 'navigate.html'), unity: resolve(__dirname, 'unity.html'), scenarios: resolve(__dirname, 'scenarios.html') } } },
    test: { include: ['tests/**/*.test.ts'], testTimeout: 30000 },
  }
})

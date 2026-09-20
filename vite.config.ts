import { resolve } from 'node:path'
import { defineConfig } from 'vite'
export default defineConfig({
  base: './',
  build: { rollupOptions: { input: { index: resolve(__dirname, 'index.html'), demo: resolve(__dirname, 'demo.html'), navigate: resolve(__dirname, 'navigate.html'), unity: resolve(__dirname, 'unity.html') } } },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30000 },
})

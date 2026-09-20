// In development the Vite server can proxy Anthropic with the key from .env, so no key is typed into the page.
import Anthropic from '@anthropic-ai/sdk'

export const PROXY_KEY = 'via-proxy'
export async function anthropicProxyAvailable(): Promise<boolean> {
  if (!import.meta.env.DEV) return false
  try { return (await fetch(new URL('./api/anthropic/v1/models', location.href), { headers: { 'anthropic-version': '2023-06-01' } })).ok } catch { return false }
}
/** A browser client for a real key, or for the dev proxy when the key is the placeholder. */
export const anthropicClient = (apiKey: string) => new Anthropic({
  apiKey, dangerouslyAllowBrowser: true,
  ...(apiKey === PROXY_KEY ? { baseURL: new URL('./api/anthropic', location.href).href } : {}),
})

import https from 'https';
type Entry = { agent: https.Agent; ts: number };
const cache = new Map<string, Entry>();
const TTL_MS = 10 * 60 * 1000;

export function getCachedAgent(key: string) {
  const e = cache.get(key);
  if (e && Date.now() - e.ts < TTL_MS) return e.agent;
  return null;
}
export function putAgent(key: string, agent: https.Agent) {
  cache.set(key, { agent, ts: Date.now() });
}
export function clearAgent(key: string) { cache.delete(key); }

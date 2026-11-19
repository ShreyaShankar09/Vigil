import type { CustodyEvent, HashedCustodyEvent } from '@/types'

export const GENESIS_HASH = '0'.repeat(64)

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (typeof value !== 'object' || value === null) return value
  const object = value as Record<string, unknown>
  return Object.fromEntries(Object.keys(object).sort().map((key) => [key, stableValue(object[key])]))
}

export function canonicalJson(payload: Record<string, unknown>): string {
  return JSON.stringify(stableValue(payload))
}

export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function custodyHash(previousHash: string, payload: Record<string, unknown>): Promise<string> {
  const prefix = new TextEncoder().encode(previousHash)
  const body = new TextEncoder().encode(canonicalJson(payload))
  const bytes = new Uint8Array(prefix.length + body.length)
  bytes.set(prefix)
  bytes.set(body, prefix.length)
  return sha256Hex(bytes)
}

export async function appendCustodyEvent(
  chain: HashedCustodyEvent[],
  event: HashedCustodyEvent['payload'],
): Promise<HashedCustodyEvent[]> {
  const previousHash = chain.at(-1)?.hash ?? GENESIS_HASH
  return [...chain, {
    payload: event,
    prev_hash: previousHash,
    hash: await custodyHash(previousHash, event),
  }]
}

export function custodyEventsForDisplay(chain: HashedCustodyEvent[], chainOk: boolean): CustodyEvent[] {
  return chain.map((event, index) => ({
    id: `${event.payload.timestamp}-${index}`,
    label: event.payload.label,
    timestamp: event.payload.timestamp,
    actor: event.payload.actor,
    location: event.payload.location,
    gpsVerified: event.payload.gpsVerified,
    hashVerified: chainOk,
  }))
}

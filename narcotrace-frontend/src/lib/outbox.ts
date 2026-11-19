import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { EvidenceRecord, HashedCustodyEvent, KitInfo, SyncStatus } from '@/types'
import { registerOutboxBackgroundSync } from '@/lib/background-sync'

export interface OutboxItem {
  id: string
  record: EvidenceRecord
  imageBlob: Blob
  custodyChain: HashedCustodyEvent[]
  syncState: SyncStatus
  attempts: number
  lastError: string | null
  createdAt: string
  updatedAt: string
  syncedAt: string | null
  nextAttemptAt: number
}

interface EvidenceDatabase extends DBSchema {
  outbox: {
    key: string
    value: OutboxItem
    indexes: { 'by-sync-state': SyncStatus }
  }
  kits: { key: string; value: KitInfo }
}

let database: Promise<IDBPDatabase<EvidenceDatabase>> | null = null

function db(): Promise<IDBPDatabase<EvidenceDatabase>> {
  if (!database) {
    database = openDB<EvidenceDatabase>('vigil-evidence', 1, {
      upgrade(upgradeDb) {
        const outbox = upgradeDb.createObjectStore('outbox', { keyPath: 'id' })
        outbox.createIndex('by-sync-state', 'syncState')
        upgradeDb.createObjectStore('kits', { keyPath: 'id' })
      },
    })
  }
  return database
}

export async function getOutbox(): Promise<OutboxItem[]> {
  return (await db()).getAll('outbox')
}

export async function getOutboxItem(id: string): Promise<OutboxItem | undefined> {
  return (await db()).get('outbox', id)
}

export async function putOutbox(item: OutboxItem): Promise<void> {
  await (await db()).put('outbox', item)
  window.dispatchEvent(new Event('vigil:outbox-updated'))
  void registerOutboxBackgroundSync().catch((error: unknown) => {
    console.warn('Unable to register background evidence sync.', error)
  })
}

export async function removeOutbox(id: string): Promise<void> {
  await (await db()).delete('outbox', id)
  window.dispatchEvent(new Event('vigil:outbox-updated'))
}

export async function saveKits(kits: KitInfo[]): Promise<void> {
  const database = await db()
  const tx = database.transaction('kits', 'readwrite')
  await Promise.all([...kits.map((kit) => tx.store.put(kit)), tx.done])
}

export async function getCachedKits(): Promise<KitInfo[]> {
  return (await db()).getAll('kits')
}

export function retryDelayMs(attempts: number): number {
  return Math.min(5 * 60_000, 1_000 * (2 ** Math.max(0, attempts - 1)))
}

export function syncStatusAfterError(status: number): 'retry' | 'failed' {
  return status === 0 || status === 401 || status === 408 || status === 429 || status >= 500 ? 'retry' : 'failed'
}

export function beginOutboxSync(item: OutboxItem, at = new Date().toISOString()): OutboxItem {
  if (item.syncState !== 'pending') throw new Error(`Cannot start sync from ${item.syncState}`)
  return {
    ...item,
    syncState: 'uploading',
    record: { ...item.record, syncStatus: 'uploading' },
    attempts: item.attempts + 1,
    updatedAt: at,
  }
}

export function completeOutboxSync(item: OutboxItem, at = new Date().toISOString()): OutboxItem {
  if (item.syncState !== 'uploading') throw new Error(`Cannot complete sync from ${item.syncState}`)
  return {
    ...item,
    syncState: 'synced',
    record: { ...item.record, syncStatus: 'synced' },
    lastError: null,
    syncedAt: at,
    updatedAt: at,
    nextAttemptAt: 0,
  }
}

export function failOutboxSync(item: OutboxItem, status: number, errorCode: string, now = Date.now()): OutboxItem {
  if (item.syncState !== 'uploading') throw new Error(`Cannot fail sync from ${item.syncState}`)
  const disposition = syncStatusAfterError(status)
  return {
    ...item,
    syncState: disposition === 'failed' ? 'failed' : 'pending',
    record: {
      ...item.record,
      syncStatus: disposition === 'failed' ? 'failed' : 'pending',
      analysisStatus: disposition === 'failed' && item.record.analysisStatus === 'awaiting_analysis'
        ? 'failed'
        : item.record.analysisStatus,
    },
    lastError: errorCode,
    updatedAt: new Date(now).toISOString(),
    nextAttemptAt: disposition === 'failed' ? 0 : now + retryDelayMs(item.attempts),
  }
}

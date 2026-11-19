import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { webcrypto } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { EvidenceRecord, HashedCustodyEvent } from '@/types'
import { appendCustodyEvent, custodyHash, GENESIS_HASH, sha256Hex } from '@/lib/custody'
import { captureGps } from '@/lib/gps'
import {
  beginOutboxSync,
  completeOutboxSync,
  failOutboxSync,
  retryDelayMs,
  type OutboxItem,
} from '@/lib/outbox'

interface CustodyVector {
  name: string
  payload: HashedCustodyEvent['payload']
  prev_hash: string
  hash: string
}

function fixture(): OutboxItem {
  const record: EvidenceRecord = {
    id: 'NT-2026-TEST0001',
    caseId: 'CASE-1',
    officerId: 'OFF-1',
    officerName: 'Test Officer',
    testKitId: 'KIT-COC-04',
    sampleType: 'powder',
    verdict: null,
    substance: null,
    confidence: null,
    reactionColor: null,
    imageQuality: null,
    modelVersion: null,
    timestamp: new Date(0).toISOString(),
    location: '',
    lat: null,
    lng: null,
    gpsVerified: false,
    gpsAccuracyM: null,
    analysisStatus: 'awaiting_analysis',
    secondsSinceReagent: null,
    deviceId: 'test',
    sha256: '0'.repeat(64),
    syncStatus: 'pending',
    custody: [],
  }
  return {
    id: record.id,
    record,
    imageBlob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
    custodyChain: [],
    syncState: 'pending',
    attempts: 0,
    lastError: null,
    createdAt: record.timestamp,
    updatedAt: record.timestamp,
    syncedAt: null,
    nextAttemptAt: 0,
  }
}

describe('evidence integrity and outbox', () => {
  it('hashes the original bytes with SHA-256', async () => {
    vi.stubGlobal('crypto', webcrypto)
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('matches the backend custody vectors and exact copied file', async () => {
    vi.stubGlobal('crypto', webcrypto)
    const frontendPath = resolve(process.cwd(), 'tests', 'vectors', 'custody.json')
    const backendPath = resolve(process.cwd(), '..', 'narcotrace-backend', 'tests', 'vectors', 'custody.json')
    const frontendBytes = readFileSync(frontendPath)
    expect(frontendBytes.equals(readFileSync(backendPath))).toBe(true)
    const vectors = JSON.parse(frontendBytes.toString('utf8')) as { vectors: CustodyVector[] }
    for (const vector of vectors.vectors) {
      expect(await custodyHash(vector.prev_hash, vector.payload)).toBe(vector.hash)
    }
    const first = vectors.vectors[0]
    expect(await appendCustodyEvent([], first.payload)).toEqual([{
      payload: first.payload,
      prev_hash: GENESIS_HASH,
      hash: first.hash,
    }])
  })

  it('applies retry backoff and legal sync-state transitions', () => {
    const pending = fixture()
    const uploading = beginOutboxSync(pending, new Date(1000).toISOString())
    expect(uploading.syncState).toBe('uploading')
    expect(uploading.attempts).toBe(1)
    expect(completeOutboxSync(uploading, new Date(2000).toISOString()).syncState).toBe('synced')

    const retry = failOutboxSync(uploading, 0, 'NETWORK_UNAVAILABLE', 1000)
    expect(retry.syncState).toBe('pending')
    expect(retry.nextAttemptAt).toBe(2000)
    expect(retryDelayMs(30)).toBe(5 * 60_000)

    expect(failOutboxSync(uploading, 422, 'IMAGE_HASH_MISMATCH', 1000).syncState).toBe('failed')
    expect(() => completeOutboxSync(pending)).toThrow('Cannot complete sync from pending')
  })

  it('stores no coordinates after geolocation permission is denied', async () => {
    const geolocation = {
      getCurrentPosition: vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })
      }),
    }
    await expect(captureGps(geolocation)).resolves.toEqual({
      lat: null,
      lng: null,
      accuracyM: null,
      gpsVerified: false,
    })
  })
})

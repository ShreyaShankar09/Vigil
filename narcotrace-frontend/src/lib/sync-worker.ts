import { ApiError, analyzeImage, apiHealthz, apiSyncEvidence, getToken } from '@/lib/api'
import { appendCustodyEvent } from '@/lib/custody'
import { applyAnalysisResult } from '@/lib/evidence-data'
import {
  beginOutboxSync,
  completeOutboxSync,
  failOutboxSync,
  getOutbox,
  putOutbox,
  type OutboxItem,
} from '@/lib/outbox'

let activeRun: Promise<void> | null = null

async function syncOne(item: OutboxItem): Promise<void> {
  let current = beginOutboxSync(item)
  await putOutbox(current)

  if (current.record.analysisStatus === 'awaiting_analysis') {
    try {
      const result = await analyzeImage(
        current.imageBlob,
        current.record.testKitId,
        current.record.secondsSinceReagent,
      )
      const record = applyAnalysisResult(current.record, result)
      const custodyChain = await appendCustodyEvent(current.custodyChain, {
        label: 'Automated Analysis Completed',
        timestamp: new Date().toISOString(),
        actor: record.modelVersion ?? 'Analysis service',
        location: record.location,
        gpsVerified: record.gpsVerified,
      })
      current = { ...current, record, custodyChain }
      await putOutbox(current)
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0
      await putOutbox(failOutboxSync(
        current,
        status,
        error instanceof ApiError ? error.code ?? error.message : 'NETWORK_UNAVAILABLE',
      ))
      return
    }
  }

  try {
    const status = await apiSyncEvidence(current.record, current.imageBlob, current.custodyChain)
    await putOutbox(completeOutboxSync(current))
    if (status === 'already_synced') return
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 0
    await putOutbox(failOutboxSync(
      current,
      status,
      error instanceof ApiError ? error.code ?? error.message : 'NETWORK_UNAVAILABLE',
    ))
  }
}

export function processEvidenceOutbox(force = false): Promise<void> {
  if (activeRun) return activeRun
  activeRun = (async () => {
    if (!navigator.onLine || !getToken() || !(await apiHealthz())) return
    const items = (await getOutbox()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    for (const item of items) {
      if (item.syncState === 'synced' || item.syncState === 'uploading') continue
      if (item.syncState === 'failed' && !force) continue
      if (!force && item.nextAttemptAt > Date.now()) continue
      if (!navigator.onLine) break
      await syncOne(item)
    }
  })().finally(() => { activeRun = null })
  return activeRun
}

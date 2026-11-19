import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { EvidenceRecord, Form6Record } from '@/types'
import {
  getOutbox,
  getOutboxItem,
  putOutbox,
  removeOutbox,
  type OutboxItem,
} from '@/lib/outbox'
import { processEvidenceOutbox } from '@/lib/sync-worker'

const FORM6_KEY = 'narcotrace.form6.v1'

interface AppDataContextValue {
  evidence: EvidenceRecord[]
  outbox: OutboxItem[]
  refreshOutbox: () => Promise<void>
  getEvidence: (id: string) => EvidenceRecord | undefined
  form6s: Form6Record[]
  saveForm6: (form: Form6Record) => void
  getForm6: (evidenceId: string) => Form6Record | undefined
  syncOne: (id: string) => Promise<void>
  syncAll: () => Promise<void>
  retryOne: (id: string) => Promise<void>
  discardOne: (id: string) => Promise<void>
  isSyncing: boolean
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

function loadForm6s(): Form6Record[] {
  try {
    return JSON.parse(localStorage.getItem(FORM6_KEY) || '[]') as Form6Record[]
  } catch {
    return []
  }
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [outbox, setOutbox] = useState<OutboxItem[]>([])
  const [form6s, setForm6s] = useState<Form6Record[]>(loadForm6s)

  const refreshOutbox = useCallback(async () => {
    setOutbox((await getOutbox()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  }, [])

  useEffect(() => {
    void refreshOutbox()
    const updated = () => { void refreshOutbox() }
    const onOnline = () => { void processEvidenceOutbox() }
    const timer = window.setInterval(() => { void processEvidenceOutbox() }, 15_000)
    window.addEventListener('vigil:outbox-updated', updated)
    window.addEventListener('vigil:token-set', onOnline)
    window.addEventListener('online', onOnline)
    try { localStorage.removeItem('vigil.evidence.v1') } catch { /* storage unavailable */ }
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('vigil:outbox-updated', updated)
      window.removeEventListener('vigil:token-set', onOnline)
      window.removeEventListener('online', onOnline)
    }
  }, [refreshOutbox])

  useEffect(() => {
    try { localStorage.setItem(FORM6_KEY, JSON.stringify(form6s)) } catch { /* storage unavailable */ }
  }, [form6s])

  const saveForm6 = useCallback((form: Form6Record) => {
    setForm6s((prev) => (prev.some((item) => item.id === form.id)
      ? prev.map((item) => item.id === form.id ? form : item)
      : [...prev, form]))
  }, [])

  const getForm6 = useCallback((evidenceId: string) =>
    form6s.filter((form) => form.evidenceId === evidenceId)
      .sort((left, right) => right.revision - left.revision)[0], [form6s])

  const syncOne = useCallback(async (id: string) => {
    const item = await getOutboxItem(id)
    if (!item) return
    await putOutbox({
      ...item,
      syncState: 'pending',
      record: {
        ...item.record,
        syncStatus: 'pending',
        analysisStatus: item.record.analysisStatus === 'failed' && item.record.verdict === null
          ? 'awaiting_analysis'
          : item.record.analysisStatus,
      },
      lastError: null,
      nextAttemptAt: 0,
    })
    await processEvidenceOutbox(true)
  }, [])

  const syncAll = useCallback(async () => {
    const rows = await getOutbox()
    await Promise.all(rows.filter((item) => item.syncState === 'failed').map((item) =>
      putOutbox({
        ...item,
        syncState: 'pending',
        record: {
          ...item.record,
          syncStatus: 'pending',
          analysisStatus: item.record.analysisStatus === 'failed' && item.record.verdict === null
            ? 'awaiting_analysis'
            : item.record.analysisStatus,
        },
        lastError: null,
        nextAttemptAt: 0,
      }),
    ))
    await processEvidenceOutbox(true)
  }, [])

  const retryOne = useCallback(async (id: string) => {
    const item = await getOutboxItem(id)
    if (!item) return
    await putOutbox({
      ...item,
      syncState: 'pending',
      record: {
        ...item.record,
        syncStatus: 'pending',
        analysisStatus: item.record.analysisStatus === 'failed' && item.record.verdict === null
          ? 'awaiting_analysis'
          : item.record.analysisStatus,
      },
      lastError: null,
      nextAttemptAt: 0,
    })
    await processEvidenceOutbox(true)
  }, [])

  const discardOne = useCallback(async (id: string) => {
    await removeOutbox(id)
  }, [])

  const evidence = useMemo(() => outbox.map((item) => item.record), [outbox])
  const getEvidence = useCallback((id: string) => evidence.find((record) => record.id === id), [evidence])
  const isSyncing = outbox.some((item) => item.syncState === 'uploading')

  const value = useMemo(() => ({
    evidence, outbox, refreshOutbox, getEvidence, form6s, saveForm6, getForm6,
    syncOne, syncAll, retryOne, discardOne, isSyncing,
  }), [
    evidence, outbox, refreshOutbox, getEvidence, form6s, saveForm6, getForm6,
    syncOne, syncAll, retryOne, discardOne, isSyncing,
  ])

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const context = useContext(AppDataContext)
  if (!context) throw new Error('useAppData must be used within AppDataProvider')
  return context
}

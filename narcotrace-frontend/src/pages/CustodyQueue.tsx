import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, LockKeyhole } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { useAppData } from '@/lib/store'
import { useI18n } from '@/lib/i18n'
import { apiListEvidence, ApiError } from '@/lib/api'
import { evidenceFromApi } from '@/lib/evidence-data'
import { useOnlineStatus } from '@/lib/use-online'
import type { EvidenceRecord } from '@/types'
import { localizeBackendCode } from '@/lib/localize-code'

export default function CustodyQueue() {
  const { outbox } = useAppData()
  const { t } = useI18n()
  const online = useOnlineStatus()
  const [serverRecords, setServerRecords] = useState<EvidenceRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!online) return () => { active = false }
    void apiListEvidence({ limit: 100 })
      .then((response) => {
        if (active) {
          setServerRecords(response.items.map(evidenceFromApi))
          setError(null)
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof ApiError ? cause.code ?? 'EVIDENCE_LIST_FAILED' : 'EVIDENCE_LIST_FAILED')
      })
    return () => { active = false }
  }, [online])

  const records = useMemo(() => {
    const localRecords = outbox.map((item) => item.record)
    const localIds = new Set(localRecords.map((record) => record.id))
    return [...localRecords, ...serverRecords.filter((record) => !localIds.has(record.id))]
  }, [outbox, serverRecords])

  return (
    <AppShell title={t('nav.custody')}>
      <section className="mx-auto max-w-3xl space-y-3">
        {error && <p role="alert" className="text-sm text-caution-400">{localizeBackendCode(error, t)}</p>}
        {!records.length && (
          <p className="rounded-lg border border-line-800 bg-ink-800 p-4 text-sm text-mist-400">{t('custody.empty')}</p>
        )}
        {records.map((record) => (
          <Link
            key={record.id}
            to={`/evidence/${encodeURIComponent(record.id)}/custody`}
            className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-line-800 bg-ink-800 p-4 text-mist-200 hover:bg-ink-700 focus:outline-none focus:ring-2 focus:ring-signal-500"
          >
            <span className="flex min-w-0 items-center gap-3">
              <LockKeyhole className="h-5 w-5 shrink-0 text-evidence-400" aria-hidden="true" />
              <span className="min-w-0">
                <bdi dir="ltr" className="block truncate font-mono font-medium">{record.id}</bdi>
                <span className="block truncate text-xs text-mist-500">
                  <bdi dir="ltr" className="font-mono">{record.caseId}</bdi> · {record.custody.length ? t('custody.events', { count: record.custody.length }) : t('custody.review')}
                </span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Link>
        ))}
      </section>
    </AppShell>
  )
}

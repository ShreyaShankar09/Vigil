import { useEffect, useMemo, useState } from 'react'
import { Search, FileX } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { EvidenceTable } from '@/components/evidence/EvidenceTable'
import { EmptyState } from '@/components/ui/Feedback'
import { cn } from '@/lib/utils'
import { useAppData } from '@/lib/store'
import { apiListEvidence, ApiError } from '@/lib/api'
import { evidenceFromApi } from '@/lib/evidence-data'
import { useOnlineStatus } from '@/lib/use-online'
import type { ResultVerdict, SyncStatus } from '@/types'
import { useI18n } from '@/lib/i18n'
import { localizeBackendCode } from '@/lib/localize-code'

type VerdictFilter = 'all' | ResultVerdict
type SyncFilter = 'all' | SyncStatus

export default function EvidenceHistory() {
  const { outbox } = useAppData()
  const { t } = useI18n()
  const online = useOnlineStatus()
  const [serverRecords, setServerRecords] = useState<ReturnType<typeof evidenceFromApi>[]>([])
  const [serverError, setServerError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>('all')
  const [syncFilter, setSyncFilter] = useState<SyncFilter>('all')

  useEffect(() => {
    let active = true
    if (!online) {
      return () => { active = false }
    }
    void apiListEvidence({ verdict: verdictFilter === 'all' ? undefined : verdictFilter })
      .then((response) => {
        if (active) {
          setServerRecords(response.items.map(evidenceFromApi))
          setServerError(null)
        }
      })
      .catch((error: unknown) => {
        if (active) setServerError(error instanceof ApiError ? error.code ?? 'EVIDENCE_LIST_FAILED' : 'EVIDENCE_LIST_FAILED')
      })
    return () => { active = false }
  }, [online, verdictFilter])

  const records = useMemo(() => {
    const local = outbox.map((item) => item.record)
    const localIds = new Set(local.map((record) => record.id))
    return [...local, ...serverRecords.filter((record) => !localIds.has(record.id))]
  }, [outbox, serverRecords])

  const filtered = useMemo(() => records.filter((record) => {
    const q = query.trim().toLowerCase()
    const matchesQuery = !q || record.id.toLowerCase().includes(q) || record.caseId.toLowerCase().includes(q)
    const matchesVerdict = verdictFilter === 'all' || record.verdict === verdictFilter
    const matchesSync = syncFilter === 'all' || record.syncStatus === syncFilter
    return matchesQuery && matchesVerdict && matchesSync
  }), [records, query, verdictFilter, syncFilter])
  const verdictOptions: { value: VerdictFilter; label: string }[] = [
    { value: 'all', label: t('evidence.filters.allResults') },
    { value: 'positive', label: t('result.positive') },
    { value: 'negative', label: t('result.negative') },
    { value: 'inconclusive', label: t('result.inconclusive') },
  ]
  const syncOptions: { value: SyncFilter; label: string }[] = [
    { value: 'all', label: t('evidence.filters.allSync') },
    { value: 'synced', label: t('result.synced') },
    { value: 'pending', label: t('result.pending') },
    { value: 'failed', label: t('result.failed') },
  ]

  return (
    <AppShell title={t('evidence.history')} subtitle={t('evidence.historyCount', { count: records.length })}>
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-700" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('evidence.search')}
            className="w-full rounded-md border border-line-700 bg-ink-800 py-2.5 ps-9 pe-3 text-sm text-mist-100 outline-none focus:border-signal-500"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterGroup
            value={verdictFilter}
            onChange={setVerdictFilter}
            options={verdictOptions}
          />
          <FilterGroup
            value={syncFilter}
            onChange={setSyncFilter}
            options={syncOptions}
          />
        </div>
        {serverError && online && <p role="alert" className="text-sm text-caution-400">{localizeBackendCode(serverError, t)}</p>}
        {filtered.length === 0 ? (
          <EmptyState icon={FileX} title={t('evidence.noMatchingEvidence')} body={online ? t('evidence.tryAnotherFilter') : t('evidence.offlineNoLocal')} />
        ) : (
          <EvidenceTable records={filtered} />
        )}
      </div>
    </AppShell>
  )
}

function FilterGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md border px-3 py-1.5 text-xs font-medium',
            value === option.value ? 'border-signal-500/50 bg-signal-500/10 text-signal-400' : 'border-line-700 text-mist-500 hover:text-mist-300',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

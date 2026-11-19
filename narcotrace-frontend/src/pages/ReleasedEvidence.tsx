import { useEffect, useState } from 'react'
import { FileStack } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { EvidenceTable } from '@/components/evidence/EvidenceTable'
import { EmptyState } from '@/components/ui/Feedback'
import { apiListEvidence } from '@/lib/api'
import { evidenceFromApi } from '@/lib/evidence-data'
import { useOnlineStatus } from '@/lib/use-online'
import { useI18n } from '@/lib/i18n'
import type { EvidenceRecord } from '@/types'

export default function ReleasedEvidence() {
  const { t } = useI18n()
  const online = useOnlineStatus()
  const [records, setRecords] = useState<EvidenceRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!online) return () => { active = false }
    void apiListEvidence({ limit: 100 })
      .then((response) => {
        if (active) {
          setRecords(response.items.map(evidenceFromApi))
          setError(null)
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'EVIDENCE_LIST_FAILED')
      })
    return () => { active = false }
  }, [online])

  const visibleRecords = online ? records : []

  return (
    <AppShell title={t('nav.released')}>
      {error && online && <p role="alert" className="mb-3 text-sm text-caution-400">{error}</p>}
      {visibleRecords.length === 0 ? (
        <EmptyState
          icon={FileStack}
          title={t('released.empty.title')}
          body={online ? t('released.empty.body') : t('released.offline')}
        />
      ) : (
        <EvidenceTable records={visibleRecords} />
      )}
    </AppShell>
  )
}

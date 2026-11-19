import { Link } from 'react-router-dom'
import { MapPin, ChevronRight } from 'lucide-react'
import type { EvidenceRecord } from '@/types'
import { VerdictBadge, SyncBadge } from '@/components/ui/StatusBadge'
import { formatTime } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

export function EvidenceCard({ record }: { record: EvidenceRecord }) {
  const { t } = useI18n()
  return (
    <Link
      to={`/evidence/${record.id}`}
      className="flex items-center justify-between gap-3 rounded-lg border border-line-800 bg-ink-700/50 p-4 hover:border-line-600 hover:bg-ink-700"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-mono text-sm font-medium text-mist-100">{record.id}</p>
          {record.verdict ? <VerdictBadge verdict={record.verdict} /> : <span className="text-[10px] text-caution-400">{t('evidence.notYetAnalysed')}</span>}
        </div>
        <p className="mt-1 truncate text-sm text-mist-300">{record.substance ?? t('evidence.notYetAnalysed')}</p>
        <div className="mt-1.5 flex items-center gap-3 text-xs text-mist-700">
          <span className="tabular">{formatTime(record.timestamp)}</span>
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {record.location || t('evidence.locationUnavailable')}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <SyncBadge status={record.syncStatus} />
        <ChevronRight className="h-4 w-4 text-mist-700" />
      </div>
    </Link>
  )
}

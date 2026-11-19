import { RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SyncBadge } from '@/components/ui/StatusBadge'
import { useI18n } from '@/lib/i18n'
import type { OutboxItem } from '@/lib/outbox'
import { formatNumber } from '@/lib/utils'
import { localizeBackendCode } from '@/lib/localize-code'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${formatNumber(bytes, 0)} B`
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 1)} KB`
  return `${formatNumber(bytes / (1024 * 1024), 2)} MB`
}

export function SyncQueue({
  records,
  onRetry,
  onDiscard,
}: {
  records: OutboxItem[]
  onRetry: (id: string) => void
  onDiscard: (id: string) => void
}) {
  const { t } = useI18n()
  if (records.length === 0) return <p className="text-sm text-mist-500">{t('sync.empty')}</p>
  return (
    <div className="divide-y divide-line-800 rounded-lg border border-line-800">
      {records.map((item) => (
        <div key={item.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-sm text-mist-100">{item.id}</p>
            <p className="truncate text-xs text-mist-500">{item.record.caseId} · {item.record.sampleType}</p>
            {item.record.analysisStatus === 'awaiting_analysis' && (
              <p className="mt-1 text-xs text-caution-400">{t('evidence.notYetAnalysed')} · {t('sync.waitingAnalysis')}</p>
            )}
            <p className="mt-1 text-xs text-mist-600">{t('sync.imageSize', { size: formatBytes(item.imageBlob.size) })}</p>
            <p className="text-xs text-mist-600">{t('sync.attempts', { count: formatNumber(item.attempts, 0) })}</p>
            {item.lastError && <p className="break-all text-xs text-caution-400">{t('sync.lastError', { error: localizeBackendCode(item.lastError, t) })}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SyncBadge status={item.syncState} />
            {item.syncState !== 'synced' && (
              <Button size="sm" variant="outline" aria-label={`${t('sync.retry')} ${item.id}`} onClick={() => onRetry(item.id)}>
                <RefreshCw className="h-3.5 w-3.5" /> {t('sync.retry')}
              </Button>
            )}
            <Button size="sm" variant="ghost" aria-label={`${t('sync.discard')} ${item.id}`} onClick={() => onDiscard(item.id)}>
              <Trash2 className="h-3.5 w-3.5" /> {t('sync.discard')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

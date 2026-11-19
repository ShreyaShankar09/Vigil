import { CloudOff, RefreshCw } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { StatCard } from '@/components/ui/StatCard'
import { SyncQueue } from '@/components/evidence/SyncQueue'
import { useAppData } from '@/lib/store'
import { useOnlineStatus } from '@/lib/use-online'
import { useToast } from '@/components/ui/Feedback'
import { useI18n } from '@/lib/i18n'
import { formatNumber } from '@/lib/utils'

export default function OfflineSync() {
  const { outbox, syncAll, isSyncing, retryOne, discardOne } = useAppData()
  const online = useOnlineStatus()
  const { push } = useToast()
  const { t } = useI18n()

  const pending = outbox.filter((item) => item.syncState === 'pending' || item.syncState === 'uploading')
  const failed = outbox.filter((item) => item.syncState === 'failed')
  const synced = outbox.filter((item) => item.syncState === 'synced')
  const totalBytes = outbox.reduce((sum, item) => sum + item.imageBlob.size, 0)

  const handleSync = async () => {
    await syncAll()
    push(t('sync.retryQueued'), 'info')
  }

  const handleDiscard = (id: string) => {
    if (window.confirm(t('sync.confirmDiscard'))) void discardOne(id)
  }

  return (
    <AppShell title={t('sync.title')}>
      <div className="flex flex-col gap-4">
        {!online && (
          <div className="flex items-center gap-3 rounded-lg border border-caution-500/40 bg-caution-950 p-4">
            <CloudOff className="h-5 w-5 shrink-0 text-caution-400" />
            <div>
              <p className="text-sm font-semibold text-mist-100">{t('status.offline')}</p>
              <p className="text-xs text-mist-300">{t('capture.offlineNotice')}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={t('sync.pendingUploads')} value={pending.length} tone="caution" />
          <StatCard label={t('sync.synced')} value={synced.length} tone="verified" />
          <StatCard label={t('sync.failed')} value={failed.length} tone="evidence" />
          <StatCard label={t('sync.queuedPhotoData')} value={`${formatNumber(totalBytes / (1024 * 1024), 2)} MB`} sub={t('sync.indexedDb')} />
        </div>

        <Button size="lg" className="w-full" onClick={() => { void handleSync() }} disabled={isSyncing || pending.length === 0 && failed.length === 0}>
          <RefreshCw className={isSyncing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          {isSyncing ? t('sync.retrying') : t('sync.syncNow')}
        </Button>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-mist-100">{t('sync.queue')}</h2>
          <SyncQueue records={outbox} onRetry={(id) => { void retryOne(id) }} onDiscard={handleDiscard} />
        </section>
      </div>
    </AppShell>
  )
}

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { AlertCard } from '@/components/ui/AlertCard'
import { EmptyState } from '@/components/ui/Feedback'
import { BellOff } from 'lucide-react'
import { apiListEvidence, apiVerifyEvidence, ApiError } from '@/lib/api'
import { useAppData } from '@/lib/store'
import { useOnlineStatus } from '@/lib/use-online'
import type { AlertItem } from '@/types'
import { useI18n } from '@/lib/i18n'
import { localizeBackendCode } from '@/lib/localize-code'

export default function Alerts() {
  const { outbox } = useAppData()
  const online = useOnlineStatus()
  const { t } = useI18n()
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const derived: AlertItem[] = []
      const now = Date.now()
      for (const item of outbox) {
        if (item.syncState === 'failed' && now - Date.parse(item.updatedAt) >= 24 * 60 * 60 * 1000) {
          derived.push({
            id: `sync-${item.id}`,
            severity: 'high',
            title: 'SYNC_FAILURE_OVER_24H',
            bodyKey: 'alerts.syncFailureDetails',
            bodyParams: { id: item.id, error: localizeBackendCode(item.lastError ?? 'SYNC_FAILED', t) },
            timestamp: item.updatedAt,
          })
        }
      }

      if (online) {
        try {
          const page = await apiListEvidence({ limit: 100 })
          const records = page.items
          const inconclusiveByOfficer = new Map<string, number>()
          records.filter((record) => record.verdict === 'inconclusive').forEach((record) => {
            inconclusiveByOfficer.set(record.officer_id, (inconclusiveByOfficer.get(record.officer_id) ?? 0) + 1)
          })
          for (const [officerId, count] of inconclusiveByOfficer) {
            if (count >= 3) {
              derived.push({
                id: `inconclusive-${officerId}`,
                severity: 'medium',
                title: 'REPEATED_INCONCLUSIVE_RESULTS',
                bodyKey: 'alerts.inconclusiveDetails',
                bodyParams: { officerId, count },
                timestamp: new Date().toISOString(),
              })
            }
          }

          for (const record of records.slice(0, 20)) {
            const verification = await apiVerifyEvidence(record.id)
            if (!verification.chain_ok || !verification.image_ok) {
              derived.push({
                id: `verify-${record.id}`,
                severity: 'high',
                title: 'EVIDENCE_INTEGRITY_FAILURE',
                bodyKey: 'alerts.integrityDetails',
                bodyParams: {
                  id: record.id,
                  chain: verification.chain_ok ? t('evidence.chainOk') : t('evidence.chainFailed'),
                  image: verification.image_ok ? t('evidence.imageOk') : t('evidence.imageFailed'),
                },
                timestamp: record.captured_at,
              })
            }
          }
          if (active) {
            setAlerts(derived)
            setLoadError(null)
          }
        } catch (error) {
          if (active) {
            setAlerts(derived)
            setLoadError(error instanceof ApiError ? error.code ?? 'ALERTS_LOAD_FAILED' : 'ALERTS_LOAD_FAILED')
          }
        }
      } else if (active) {
        setAlerts(derived)
        setLoadError(null)
      }
    })()
    return () => { active = false }
  }, [online, outbox])

  return (
    <AppShell title={t('alerts.title')} subtitle={t('alerts.count', { count: alerts.length })}>
      {loadError && <p role="alert" className="mb-3 text-sm text-caution-400">{localizeBackendCode(loadError, t)}</p>}
      {alerts.length === 0 ? (
        <EmptyState icon={BellOff} title={t('alerts.emptyTitle')} body={t('alerts.emptyBody')} />
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)}
        </div>
      )}
    </AppShell>
  )
}

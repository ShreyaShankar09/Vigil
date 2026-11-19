import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileX } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { ChainOfCustodyTimeline } from '@/components/evidence/ChainOfCustodyTimeline'
import { EmptyState } from '@/components/ui/Feedback'
import { useAppData } from '@/lib/store'
import { apiGetEvidence, apiGetEvidenceCustody, ApiError, type ApiCustodyEvent } from '@/lib/api'
import { custodyEventsForDisplay } from '@/lib/custody'
import { evidenceFromApi } from '@/lib/evidence-data'
import { useOnlineStatus } from '@/lib/use-online'
import type { CustodyEvent, HashedCustodyEvent } from '@/types'
import { useI18n } from '@/lib/i18n'

export default function ChainOfCustody() {
  const { id } = useParams()
  const { outbox } = useAppData()
  const { t } = useI18n()
  const online = useOnlineStatus()
  const localItem = outbox.find((item) => item.id === id)
  const [remoteEvidence, setRemoteEvidence] = useState<ReturnType<typeof evidenceFromApi> | null>(null)
  const [events, setEvents] = useState<CustodyEvent[]>([])
  const [chainOk, setChainOk] = useState<boolean | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const record = localItem?.record ?? remoteEvidence

  useEffect(() => {
    let active = true
    if (!id || !online || (localItem !== undefined && localItem.syncState !== 'synced')) {
      if (localItem) {
        setEvents(custodyEventsForDisplay(localItem.custodyChain, true))
        setChainOk(null)
      }
      return () => { active = false }
    }
    void Promise.all([apiGetEvidence(id), apiGetEvidenceCustody(id)])
      .then(([evidence, custody]) => {
        if (!active) return
        setRemoteEvidence(evidenceFromApi(evidence))
        setEvents(custodyEventsForDisplay(custody.events.map((event: ApiCustodyEvent): HashedCustodyEvent => ({
          payload: {
            label: event.payload.label,
            timestamp: event.payload.timestamp,
            actor: event.payload.actor,
            location: event.payload.location,
            gpsVerified: event.payload.gpsVerified,
          },
          prev_hash: event.prev_hash,
          hash: event.hash,
        })), custody.chain_ok))
        setChainOk(custody.chain_ok)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof ApiError ? error.code ?? 'CUSTODY_READ_FAILED' : 'CUSTODY_READ_FAILED')
      })
    return () => { active = false }
  }, [id, online, localItem])

  if (!record) {
    return (
      <AppShell title={t('custody.title')}>
        {loadError && <p role="alert" className="mb-3 text-sm text-caution-400">{t(`errors.${loadError}`)}</p>}
        <EmptyState icon={FileX} title={t('evidence.noMatchingRecord')} body={t('evidence.unavailableRecord')} />
      </AppShell>
    )
  }

  return (
    <AppShell title={t('custody.title')} subtitle={<>{t('evidence.evidenceId')} <bdi dir="ltr" className="font-mono">{record.id}</bdi> · {t('evidence.caseId')} <bdi dir="ltr" className="font-mono">{record.caseId}</bdi></>}>
      {loadError && <p role="alert" className="mb-3 text-sm text-caution-400">{t(`errors.${loadError}`)}</p>}
      {chainOk !== null && (
        <p className={`mb-3 text-sm ${chainOk ? 'text-verified-400' : 'text-caution-400'}`}>
          {chainOk ? t('evidence.chainOk') : t('evidence.chainFailed')}
        </p>
      )}
      <div className="mx-auto max-w-2xl rounded-lg border border-line-800 bg-ink-700/40 p-5">
        {events.length ? <ChainOfCustodyTimeline events={events} /> : <p className="text-sm text-mist-500">{t('custody.noEvents')}</p>}
      </div>
    </AppShell>
  )
}

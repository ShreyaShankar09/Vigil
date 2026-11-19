import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Plus, MapPin, Wifi } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { StatCard } from '@/components/ui/StatCard'
import { EvidenceCard } from '@/components/evidence/EvidenceCard'
import { useAppData } from '@/lib/store'
import { useOnlineStatus } from '@/lib/use-online'
import { useAuth } from '@/lib/auth'
import { apiListEvidence, ApiError } from '@/lib/api'
import { evidenceFromApi } from '@/lib/evidence-data'
import type { EvidenceRecord } from '@/types'
import { useI18n } from '@/lib/i18n'
import { localizeBackendCode } from '@/lib/localize-code'
import { formatDateTime, formatNumber } from '@/lib/utils'

export default function Dashboard() {
  const { outbox } = useAppData()
  const { state } = useAuth()
  const { t } = useI18n()
  const online = useOnlineStatus()
  const [serverRecords, setServerRecords] = useState<EvidenceRecord[]>([])
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!online) return () => { active = false }
    void apiListEvidence({ limit: 50 })
      .then((response) => {
        if (active) {
          setServerRecords(response.items.map(evidenceFromApi))
          setServerError(null)
        }
      })
      .catch((error: unknown) => {
        if (active) setServerError(localizeBackendCode(error instanceof ApiError ? error.code : 'EVIDENCE_LIST_FAILED', t))
      })
    return () => { active = false }
  }, [online, t])

  const evidence = useMemo(() => {
    const local = outbox.map((item) => item.record)
    const localIds = new Set(local.map((record) => record.id))
    return [...local, ...serverRecords.filter((record) => !localIds.has(record.id))]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }, [outbox, serverRecords])

  if (state.status !== 'authed') return null
  const summaryRecords = evidence.slice(0, 50)
  const positive = summaryRecords.filter((record) => record.verdict === 'positive').length
  const negative = summaryRecords.filter((record) => record.verdict === 'negative').length
  const inconclusive = summaryRecords.filter((record) => record.verdict === 'inconclusive').length
  const lastSynced = outbox
    .filter((item) => item.syncedAt)
    .sort((a, b) => (b.syncedAt ?? '').localeCompare(a.syncedAt ?? ''))[0]?.syncedAt
  const latestGps = summaryRecords.find((record) => record.gpsVerified)
  const latestCoordinates = latestGps?.lat != null && latestGps.lng != null
    ? <bdi dir="ltr" className="font-mono">{formatNumber(latestGps.lat, 4)}, {formatNumber(latestGps.lng, 4)}</bdi>
    : null

  return (
    <AppShell
      title={t('dashboard.greeting', { name: state.user.name.split(' ')[0] })}
      subtitle={<><bdi dir="ltr" className="font-mono">{state.user.officerId}</bdi> · <bdi dir="ltr" className="font-mono">{state.user.zone}</bdi></>}
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 text-xs text-mist-500 sm:grid-cols-3">
          <InfoPill icon={Wifi} label={t('dashboard.api')} value={online ? t('status.online') : t('status.offline')} tone={online ? 'verified' : 'caution'} />
          <InfoPill icon={MapPin} label={t('dashboard.lastGps')} value={latestCoordinates ?? t('dashboard.unavailable')} />
          <InfoPill icon={MapPin} label={t('dashboard.lastSuccessfulSync')} value={lastSynced ? formatDateTime(lastSynced) : t('dashboard.notSynced')} />
        </div>

        <Link
          to="/test/new"
          className="flex items-center justify-center gap-2 rounded-xl bg-evidence-500 py-4 text-base font-semibold text-white shadow-lg shadow-evidence-500/10 hover:bg-evidence-400 active:scale-[0.99]"
        >
          <Plus className="h-5 w-5" />
          {t('dashboard.startTest')}
        </Link>

        <section>
          <p className="mb-2 text-sm font-semibold text-mist-100">{t('dashboard.recentEvidence')}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={t('dashboard.availableRecords')} value={evidence.length} />
            <StatCard label={t('dashboard.positive')} value={positive} tone="evidence" />
            <StatCard label={t('dashboard.negative')} value={negative} tone="verified" />
            <StatCard label={t('dashboard.inconclusive')} value={inconclusive} tone="caution" />
          </div>
          {serverError && <p role="alert" className="mt-2 text-xs text-caution-400">{serverError}</p>}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-mist-100">{t('dashboard.recentEvidence')}</p>
            <Link to="/evidence" className="text-xs font-medium text-signal-400 hover:text-signal-300">{t('dashboard.viewAll')}</Link>
          </div>
          <div className="flex flex-col gap-2">
            {summaryRecords.slice(0, 4).map((record) => <EvidenceCard key={record.id} record={record} />)}
            {summaryRecords.length === 0 && <p className="text-sm text-mist-500">{t('dashboard.empty')}</p>}
          </div>
        </section>
      </div>
    </AppShell>
  )
}

function InfoPill({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof MapPin
  label: string
  value: ReactNode
  tone?: 'default' | 'verified' | 'caution'
}) {
  const toneClass = tone === 'verified' ? 'text-verified-400' : tone === 'caution' ? 'text-caution-400' : 'text-mist-300'
  return (
    <div className="flex items-center gap-2 rounded-md border border-line-800 bg-ink-700/40 px-3 py-2">
      <Icon className="h-3.5 w-3.5 text-mist-700" />
      <div className="min-w-0">
        <p className="leading-none text-mist-700">{label}</p>
        <p className={`truncate text-[13px] font-medium leading-tight ${toneClass}`}>{value}</p>
      </div>
    </div>
  )
}

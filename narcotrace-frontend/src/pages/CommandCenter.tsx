import { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts'
import { AppShell } from '@/components/layout/AppShell'
import { StatCard } from '@/components/ui/StatCard'
import { ChartCard } from '@/components/evidence/ChartCard'
import { MapPanel } from '@/components/evidence/MapPanel'
import { useAppData } from '@/lib/store'
import { apiDashboardSummary, apiListEvidence, ApiError } from '@/lib/api'
import { evidenceFromApi } from '@/lib/evidence-data'
import { useOnlineStatus } from '@/lib/use-online'
import type { EvidenceRecord } from '@/types'
import { useI18n } from '@/lib/i18n'
import { localizeBackendCode } from '@/lib/localize-code'
import { formatDateShort, formatNumber } from '@/lib/utils'

const COLORS = { positive: '#c4392b', negative: '#2e9b6b', inconclusive: '#c98a2e' }

export default function CommandCenter() {
  const { outbox } = useAppData()
  const { t, lang } = useI18n()
  const online = useOnlineStatus()
  const [summary, setSummary] = useState<{ by_verdict: Record<string, number>; hotspots: { lat: number; lng: number; n: number }[] } | null>(null)
  const [records, setRecords] = useState<EvidenceRecord[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!online) return () => { active = false }
    void Promise.all([apiDashboardSummary(), apiListEvidence({ limit: 100 })])
      .then(([dashboard, page]) => {
        if (active) {
          setSummary(dashboard)
          setRecords(page.items.map(evidenceFromApi))
          setLoadError(null)
        }
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof ApiError ? error.code ?? 'DASHBOARD_LOAD_FAILED' : 'DASHBOARD_LOAD_FAILED')
      })
    return () => { active = false }
  }, [online])

  const byDay = useMemo(() => {
    const counts = new Map<string, number>()
    records.forEach((record) => {
      const day = formatDateShort(record.timestamp)
      counts.set(day, (counts.get(day) ?? 0) + 1)
    })
    return Array.from(counts.entries()).map(([day, count]) => ({ day, count })).reverse()
  }, [records, lang])
  const byRegion = useMemo(() => {
    const counts = new Map<string, number>()
    records.forEach((record) => {
      if (!record.location) return
      const region = record.location.split(',')[0]
      counts.set(region, (counts.get(region) ?? 0) + 1)
    })
    return Array.from(counts.entries()).map(([region, count]) => ({ region, count }))
  }, [records])
  const confidenceBuckets = useMemo(() => [
    { bucket: t('command.confidenceBucket', { min: formatNumber(50, 0), max: formatNumber(70, 0) }), count: records.filter((record) => record.confidence !== null && record.confidence >= 50 && record.confidence < 70).length },
    { bucket: t('command.confidenceBucket', { min: formatNumber(70, 0), max: formatNumber(85, 0) }), count: records.filter((record) => record.confidence !== null && record.confidence >= 70 && record.confidence < 85).length },
    { bucket: t('command.confidenceBucket', { min: formatNumber(85, 0), max: formatNumber(95, 0) }), count: records.filter((record) => record.confidence !== null && record.confidence >= 85 && record.confidence < 95).length },
    { bucket: t('command.confidenceBucket', { min: formatNumber(95, 0), max: formatNumber(100, 0) }), count: records.filter((record) => record.confidence !== null && record.confidence >= 95).length },
  ], [records, t])

  const counts = summary?.by_verdict ?? {}
  const positive = counts.positive ?? 0
  const negative = counts.negative ?? 0
  const inconclusive = counts.inconclusive ?? 0
  const total = positive + negative + inconclusive
  const pendingSync = outbox.filter((item) => item.syncState === 'pending' || item.syncState === 'failed').length
  const pieData = [
    { name: t('result.positive'), value: positive, color: COLORS.positive },
    { name: t('result.negative'), value: negative, color: COLORS.negative },
    { name: t('result.inconclusive'), value: inconclusive, color: COLORS.inconclusive },
  ]

  return (
    <AppShell title={t('command.title')} subtitle={t('command.subtitle')}>
      <div className="flex flex-col gap-4">
        {loadError && <p role="alert" className="text-sm text-caution-400">{localizeBackendCode(loadError, t)}</p>}
        {!online && <p className="text-sm text-caution-400">{t('command.offline')}</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={t('command.totalTests')} value={summary ? total : '—'} />
          <StatCard label={t('result.positive')} value={summary ? positive : '—'} tone="evidence" />
          <StatCard label={t('result.negative')} value={summary ? negative : '—'} tone="verified" />
          <StatCard label={t('result.inconclusive')} value={summary ? inconclusive : '—'} tone="caution" />
          <StatCard label={t('command.pendingDevice')} value={pendingSync} />
        </div>

        <ChartCard title={t('command.locations')} sub={t('command.mapSubtitle')}>
          <MapPanel records={records} />
        </ChartCard>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title={t('command.resultDistribution')}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                  {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} stroke="none" />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#121a24', border: '1px solid #263440', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={t('command.recordsOverTime')}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c2732" vertical={false} />
                <XAxis dataKey="day" stroke="#5c6b78" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#5c6b78" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#121a24', border: '1px solid #263440', borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="count" stroke="#4f7fa6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={t('command.observedLocations')}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byRegion}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c2732" vertical={false} />
                <XAxis dataKey="region" stroke="#5c6b78" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#5c6b78" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#121a24', border: '1px solid #263440', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="#4f7fa6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={t('command.confidence')}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={confidenceBuckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c2732" vertical={false} />
                <XAxis dataKey="bucket" stroke="#5c6b78" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#5c6b78" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#121a24', border: '1px solid #263440', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="#c98a2e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </AppShell>
  )
}

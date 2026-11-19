import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { SecurityRow } from '@/components/evidence/SecurityCard'
import { useAuth } from '@/lib/auth'
import { useAppData } from '@/lib/store'
import { getAccessTokenExpiry } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import packageJson from '../../package.json'
import { formatDateTimeShort } from '@/lib/utils'

export default function Security() {
  const [now, setNow] = useState(() => Date.now())
  const { state } = useAuth()
  const { outbox } = useAppData()
  const { t } = useI18n()
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  if (state.status !== 'authed') return null

  const secure = window.location.protocol === 'https:'
  const tokenExpiry = getAccessTokenExpiry()
  const lastSynced = outbox
    .filter((item) => item.syncedAt)
    .sort((left, right) => (right.syncedAt ?? '').localeCompare(left.syncedAt ?? ''))[0]?.syncedAt

  return (
    <AppShell title={t('security.title')} subtitle={<><span>{t('auth.profile.zone')}: </span><bdi dir="ltr" className="font-mono">{state.user.zone}</bdi></>}>
      <div className="mx-auto max-w-xl rounded-lg border border-line-800 bg-ink-700/40 p-4">
        <SecurityRow
          label={t('security.https')}
          value={window.location.protocol}
          verified={secure}
        />
        <SecurityRow
          label={t('security.tokenExpiry')}
          value={tokenExpiry === null ? t('security.unavailable') : formatDateTimeShort(new Date(tokenExpiry).toISOString())}
          verified={tokenExpiry === null ? null : tokenExpiry > now}
        />
        <SecurityRow
          label={t('security.lastSync')}
          value={lastSynced ? formatDateTimeShort(lastSynced) : t('security.notSynced')}
          verified={lastSynced !== undefined}
        />
        <SecurityRow label={t('security.appVersion')} value={packageJson.version} verified={null} />
      </div>
    </AppShell>
  )
}

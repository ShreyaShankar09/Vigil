import { Fingerprint, Lock, LogOut, ShieldCheck, Timer, User } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Feedback'
import { useAuth } from '@/lib/auth'
import { roleTranslationKeys, useI18n } from '@/lib/i18n'
import { LanguageSelector } from '@/components/ui/LanguageSelector'

export default function Profile() {
  const { state, signOut } = useAuth()
  const { t } = useI18n()
  const { push } = useToast()

  const handleLogout = async () => {
    try {
      if (!await signOut()) push(t('auth.logoutFailed'), 'error')
    } catch {
      push(t('auth.logoutFailed'), 'error')
    }
  }

  const handleLock = () => {
    push(t('auth.profile.locked'), 'info')
  }

  if (state.status !== 'authed') return null

  return (
    <AppShell title={t('nav.profile')}>
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <div className="flex items-center gap-4 rounded-lg border border-line-800 bg-ink-700/40 p-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-600 text-mist-300">
            <User className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-mist-100">{state.user.name}</p>
            <p className="text-xs text-mist-500">{state.user.officerId} · {t(roleTranslationKeys[state.user.role])}</p>
          </div>
        </div>

        <div className="rounded-lg border border-line-800 bg-ink-700/40 p-4">
          <p className="mb-2.5 text-sm font-semibold text-mist-100">{t('auth.profile.assignment')}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-mist-700">{t('auth.profile.zone')}</dt>
              <dd className="mt-0.5 font-medium text-mist-100">{state.user.zone || t('security.unavailable')}</dd>
            </div>
            <div>
              <dt className="text-xs text-mist-700">{t('admin.role')}</dt>
              <dd className="mt-0.5 font-mono font-medium text-mist-100">{t(roleTranslationKeys[state.user.role])}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-line-800 bg-ink-700/40 p-4">
          <p className="mb-2.5 text-sm font-semibold text-mist-100">{t('auth.profile.security')}</p>
          <div className="flex items-center justify-between border-b border-line-800 py-2.5">
            <span className="flex items-center gap-2 text-sm text-mist-300"><Fingerprint className="h-4 w-4 text-mist-700" />{t('auth.profile.biometric')}</span>
            <ShieldCheck className="h-4 w-4 text-verified-400" />
          </div>
          <div className="flex items-center justify-between border-b border-line-800 py-2.5">
            <span className="flex items-center gap-2 text-sm text-mist-300"><Lock className="h-4 w-4 text-mist-700" />{t('auth.profile.deviceEncryption')}</span>
            <ShieldCheck className="h-4 w-4 text-verified-400" />
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="flex items-center gap-2 text-sm text-mist-300"><Timer className="h-4 w-4 text-mist-700" />{t('auth.profile.sessionTimeout')}</span>
            <span className="text-sm text-mist-500">{t('auth.profile.minutes', { count: 5 })}</span>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-line-800 bg-ink-700/40 p-4">
          <span className="text-sm font-semibold text-mist-100">{t('profile.language')}</span>
          <LanguageSelector />
        </div>

        <Button variant="secondary" size="lg" onClick={handleLock}>
          <Lock className="h-4 w-4" />
          {t('auth.profile.lockApplication')}
        </Button>
        <Button variant="danger" size="lg" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          {t('auth.logout')}
        </Button>
      </div>
    </AppShell>
  )
}

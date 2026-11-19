import { Link } from 'react-router-dom'
import { Bell, LogOut, Wifi, WifiOff } from 'lucide-react'
import { useAppData } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useOnlineStatus } from '@/lib/use-online'
import { useI18n } from '@/lib/i18n'
import { LanguageSelector } from '@/components/ui/LanguageSelector'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Feedback'
import type { ReactNode } from 'react'

export function TopBar({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  const { evidence } = useAppData()
  const { state, signOut } = useAuth()
  const { push } = useToast()
  const online = useOnlineStatus()
  const { t } = useI18n()
  const pendingCount = evidence.filter((e) => e.syncStatus === 'pending' || e.syncStatus === 'failed').length

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line-800 bg-ink-900/90 px-4 py-3.5 backdrop-blur md:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold text-mist-100 md:text-lg">{title}</h1>
        {subtitle && <p className="truncate text-xs text-mist-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2.5">
        <LanguageSelector />
        <span
          className={cn(
            'hidden items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium sm:flex',
            online ? 'border-verified-500/30 text-verified-400' : 'border-caution-500/30 text-caution-400'
          )}
        >
          {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {online ? t('status.online') : t('status.offline')}
        </span>
        {state.status === 'authed' && state.user.role === 'zonal_admin' && (
          <Link to="/alerts" aria-label={t('nav.alerts')} className="relative flex h-9 w-9 items-center justify-center rounded-md border border-line-700 text-mist-300 hover:bg-ink-600">
            <Bell className="h-4.5 w-4.5" aria-hidden="true" />
            {pendingCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-evidence-500 px-1 text-[10px] font-semibold text-white">
                {pendingCount}
              </span>
            )}
          </Link>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t('auth.logout')}
          title={t('auth.logout')}
          onClick={() => {
            void signOut().then((success) => {
              if (!success) push(t('auth.logoutFailed'), 'error')
            }).catch(() => push(t('auth.logoutFailed'), 'error'))
          }}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </header>
  )
}

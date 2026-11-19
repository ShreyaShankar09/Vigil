import { useI18n } from '@/lib/i18n'
import { NavLink } from 'react-router-dom'
import { navigationForRole, type NavigationItem } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'

export function MobileBottomNav() {
  const { t } = useI18n()
  const { state } = useAuth()
  if (state.status !== 'authed') return null
  const items = navigationForRole(state.user.role)

  return (
    <nav aria-label={t('nav.primary')} className="fixed inset-x-0 bottom-0 z-40 border-t border-line-800 bg-ink-800/95 backdrop-blur md:hidden">
      <div className="mx-auto flex h-16 max-w-md items-stretch justify-between px-1">
        {items.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </div>
    </nav>
  )
}

function NavItem({ to, tk, icon: Icon }: NavigationItem) {
  const { t } = useI18n()
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-medium',
          isActive ? 'text-evidence-400' : 'text-mist-500'
        )
      }
    >
      <Icon className="h-5 w-5" />
      <span className="max-w-full truncate">{t(tk)}</span>
    </NavLink>
  )
}

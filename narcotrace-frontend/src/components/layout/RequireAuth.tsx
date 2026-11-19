import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import type { AuthRole } from '@/lib/api'
import { homeForRole } from '@/lib/nav'

function AuthLoading() {
  const { t } = useI18n()
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-900 text-mist-300" aria-live="polite">
      {t('auth.loading')}
    </main>
  )
}

export function RequireAuth() {
  const { state, sessionExpired } = useAuth()
  const location = useLocation()
  if (state.status === 'loading') return <AuthLoading />
  if (state.status === 'anon') {
    return <Navigate
      to={sessionExpired ? '/login?reason=expired' : '/login'}
      replace
      state={{ from: location.pathname }}
    />
  }
  if (state.user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  if (!state.user.mustChangePassword && location.pathname === '/change-password') {
    return <Navigate to={homeForRole(state.user.role)} replace />
  }
  return <Outlet />
}

export function RequireRole({ roles }: { roles: readonly AuthRole[] }) {
  const { state, sessionExpired } = useAuth()
  const location = useLocation()
  if (state.status === 'loading') return <AuthLoading />
  if (state.status === 'anon') {
    return <Navigate
      to={sessionExpired ? '/login?reason=expired' : '/login'}
      replace
      state={{ from: location.pathname }}
    />
  }
  if (state.user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  if (!roles.includes(state.user.role)) return <Navigate to="/403" replace />
  return <Outlet />
}

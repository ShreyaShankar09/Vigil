import { Link } from 'react-router-dom'
import { ShieldX } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { homeForRole } from '@/lib/nav'

export default function Forbidden() {
  const { state } = useAuth()
  const { t } = useI18n()
  const destination = state.status === 'authed' ? homeForRole(state.user.role) : '/login'
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-900 px-4 text-center">
      <section className="max-w-md rounded-xl border border-line-800 bg-ink-800 p-8">
        <ShieldX className="mx-auto h-10 w-10 text-caution-400" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold text-mist-100">{t('auth.forbidden.title')}</h1>
        <p className="mt-2 text-sm text-mist-400">{t('auth.forbidden.body')}</p>
        <Link
          to={destination}
          className="mt-6 inline-flex min-h-11 items-center rounded-md bg-evidence-500 px-4 text-sm font-medium text-white hover:bg-evidence-400 focus:outline-none focus:ring-2 focus:ring-signal-400"
        >
          {t('auth.forbidden.home')}
        </Link>
      </section>
    </main>
  )
}

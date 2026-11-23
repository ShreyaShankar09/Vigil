import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ScanFace, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { LanguageSelector } from '@/components/ui/LanguageSelector'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { homeForRole } from '@/lib/nav'

type LoginError = 'wrongCredentials' | 'lockedOut' | 'serverUnavailable' | 'expired' | 'disabled' | 'generic'

function messageKey(error: LoginError) {
  return `login.error.${error}` as const
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { state: authState, initialServerUnavailable, signIn } = useAuth()
  const { t } = useI18n()
  const [officerId, setOfficerId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<LoginError | null>(() =>
    location.search.includes('reason=expired') ? 'expired' : null,
  )
  const [retrySeconds, setRetrySeconds] = useState(0)
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (retrySeconds <= 0) return
    const timer = window.setTimeout(() => setRetrySeconds((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [retrySeconds])

  const visibleError = error ?? (initialServerUnavailable ? 'serverUnavailable' : null)
  useEffect(() => {
    if (visibleError) errorRef.current?.focus()
  }, [visibleError])

  if (authState.status === 'authed') {
    const destination = authState.user.mustChangePassword
      ? '/change-password'
      : homeForRole(authState.user.role)
    return <Navigate to={destination} replace />
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting || retrySeconds > 0) return
    setError(null)
    setRetrySeconds(0)
    const submittedPassword = password
    setPassword('')
    setSubmitting(true)
    try {
      const user = await signIn(officerId.trim(), submittedPassword)
      navigate(user.mustChangePassword ? '/change-password' : homeForRole(user.role), { replace: true })
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.status === 401) setError('wrongCredentials')
        else if (caught.status === 403 && caught.code === 'ACCOUNT_DISABLED') setError('disabled')
        else if (caught.status === 429) {
          setError('lockedOut')
          setRetrySeconds(Math.max(1, caught.retryAfter ?? 60))
        } else if (caught.status === 0) setError('serverUnavailable')
        else setError('generic')
      } else {
        setError('generic')
      }
    } finally {
      setPassword('')
      setSubmitting(false)
    }
  }

  const errorText = visibleError ? t(messageKey(visibleError)) : ''

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-900 px-4 py-16">
      <div className="fixed end-4 top-4 z-20"><LanguageSelector /></div>
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-line-700 bg-ink-800 shadow-2xl shadow-black/30 md:grid-cols-[0.9fr_1.1fr]">
        <section className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden bg-gradient-to-br from-ink-700 via-ink-800 to-ink-900 p-10 md:flex">
          <div className="pointer-events-none absolute -end-24 -top-20 h-80 w-80 rounded-full border border-signal-400/20" aria-hidden="true" />
          <div className="pointer-events-none absolute -end-12 -top-8 h-56 w-56 rounded-full border border-signal-400/20" aria-hidden="true" />
          <div className="relative flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-evidence-500 text-white shadow-lg shadow-evidence-500/20">
              <ScanFace className="h-8 w-8" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-[0.18em] text-mist-100">VIGIL</h1>
              <p className="text-base text-mist-300">{t('login.subtitle')}</p>
            </div>
          </div>
          <div className="relative space-y-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-line-600 bg-ink-700/80 text-signal-400">
              <ShieldCheck className="h-9 w-9" aria-hidden="true" />
            </div>
            <p className="max-w-sm text-2xl font-semibold leading-relaxed text-mist-100">{t('login.secureLogin')}</p>
          </div>
          <p className="relative text-sm text-mist-500">{t('nav.projectTag')}</p>
        </section>

        <section className="flex items-center px-5 py-10 sm:px-10 md:py-14">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 md:hidden">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-evidence-500 text-white">
                <ScanFace className="h-7 w-7" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-[0.16em] text-mist-100">VIGIL</h1>
                <p className="text-sm text-mist-500">{t('login.subtitle')}</p>
              </div>
            </div>
            <div className="mb-7">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-signal-400">{t('login.secureLogin')}</p>
              <h2 className="text-3xl font-bold tracking-tight text-mist-100">{t('login.title')}</h2>
            </div>
            <form
              onSubmit={submit}
              aria-busy={submitting || authState.status === 'loading'}
              className="space-y-5"
            >
          <div>
            <label htmlFor="officer-id" className="mb-2 block text-base font-semibold text-mist-200">{t('login.officerId')}</label>
            <input
              id="officer-id"
              name="username"
              autoComplete="username"
              required
              value={officerId}
              onChange={(event) => setOfficerId(event.target.value)}
              className="h-14 w-full rounded-xl border border-line-700 bg-ink-900 px-4 text-lg text-mist-100 outline-none transition focus:border-signal-500 focus:ring-2 focus:ring-signal-500/30"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-2 block text-base font-semibold text-mist-200">{t('login.password')}</label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-14 w-full rounded-xl border border-line-700 bg-ink-900 px-4 pe-14 text-lg text-mist-100 outline-none transition focus:border-signal-500 focus:ring-2 focus:ring-signal-500/30"
              />
              <button
                type="button"
                aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 end-0 flex w-14 items-center justify-center text-mist-400 hover:text-mist-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-signal-500"
              >
                {showPassword
                  ? <EyeOff className="h-5 w-5" aria-hidden="true" />
                  : <Eye className="h-5 w-5" aria-hidden="true" />}
              </button>
            </div>
          </div>

          <div
            ref={errorRef}
            tabIndex={-1}
            className="min-h-[4.5rem] rounded-md pt-2 text-base text-caution-300 outline-none"
          >
            <p aria-live="assertive" aria-atomic="true">{errorText}</p>
            {visibleError === 'lockedOut' && (
              <p aria-live="off">{t('login.retryCountdown', { seconds: retrySeconds })}</p>
            )}
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={submitting || authState.status === 'loading' || retrySeconds > 0 || !officerId.trim() || !password}
          >
            {submitting
              ? t('login.signingIn')
              : authState.status === 'loading'
                ? t('auth.loading')
                : t('login.signIn')}
          </Button>
              <p className="border-t border-line-800 pt-5 text-center text-base text-mist-300">
            {t('signup.loginPrompt')}{' '}
                <Link to="/signup" className="font-semibold text-signal-400 underline-offset-4 hover:text-signal-300 hover:underline">
                  {t('signup.link')}
                </Link>
              </p>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}

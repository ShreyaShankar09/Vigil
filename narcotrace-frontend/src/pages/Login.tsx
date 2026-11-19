import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ScanFace } from 'lucide-react'
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
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <svg className="h-full w-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
          {Array.from({ length: 14 }).map((_, index) => (
            <circle key={index} cx={`${(index * 37) % 100}%`} cy={`${(index * 53) % 100}%`} r="70" fill="none" stroke="white" strokeWidth="1" />
          ))}
        </svg>
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-evidence-500/5 to-transparent" />
      </div>

      <div className="fixed end-4 top-4 z-20"><LanguageSelector /></div>
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-line-700 bg-ink-700 text-evidence-400">
            <ScanFace className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-mist-100">VIGIL</h1>
          <p className="mt-1 text-sm text-mist-500">{t('login.subtitle')}</p>
        </div>

        <form
          onSubmit={submit}
          aria-busy={submitting || authState.status === 'loading'}
          className="space-y-4 rounded-xl border border-line-800 bg-ink-800 p-5"
        >
          <h2 className="text-base font-semibold text-mist-100">{t('login.title')}</h2>
          <div>
            <label htmlFor="officer-id" className="mb-1.5 block text-sm font-medium text-mist-300">{t('login.officerId')}</label>
            <input
              id="officer-id"
              name="username"
              autoComplete="username"
              required
              value={officerId}
              onChange={(event) => setOfficerId(event.target.value)}
              className="h-12 w-full rounded-md border border-line-700 bg-ink-900 px-3 text-base text-mist-100 outline-none focus:border-signal-500 focus:ring-2 focus:ring-signal-500/30"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-mist-300">{t('login.password')}</label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 w-full rounded-md border border-line-700 bg-ink-900 px-3 pe-12 text-base text-mist-100 outline-none focus:border-signal-500 focus:ring-2 focus:ring-signal-500/30"
              />
              <button
                type="button"
                aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 end-0 flex w-12 items-center justify-center text-mist-400 hover:text-mist-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-signal-500"
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
            className="min-h-[4.5rem] rounded-md pt-2 text-sm text-caution-300 outline-none"
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
        </form>
      </div>
    </main>
  )
}

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, LockKeyhole, ScanFace } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { LanguageSelector } from '@/components/ui/LanguageSelector'
import { ApiError, apiRegisterOfficer } from '@/lib/api'
import { useI18n, roleTranslationKeys } from '@/lib/i18n'

type SignupError = 'duplicate' | 'validation' | 'serverUnavailable' | 'generic'

const officerRoles = ['field_officer', 'lab', 'zonal_admin', 'prosecutor'] as const

export default function Signup() {
  const { t, lang } = useI18n()
  const [officerId, setOfficerId] = useState('')
  const [name, setName] = useState('')
  const [zone, setZone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<SignupError | 'passwordMismatch' | null>(null)
  const [created, setCreated] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    setError(null)
    if (password !== confirmPassword) {
      setError('passwordMismatch')
      return
    }
    if (password.length < 10 || password.toLocaleLowerCase() === officerId.trim().toLocaleLowerCase()) {
      setError('validation')
      return
    }

    setSubmitting(true)
    try {
      await apiRegisterOfficer({
        officer_id: officerId.trim(),
        name: name.trim(),
        zone: zone.trim(),
        language: lang === 'en-XA' ? 'en' : lang,
        password,
      })
      setCreated(true)
      setOfficerId('')
      setName('')
      setZone('')
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) setError('duplicate')
      else if (caught instanceof ApiError && caught.status === 422) setError('validation')
      else if (caught instanceof ApiError && caught.status === 0) setError('serverUnavailable')
      else setError('generic')
    } finally {
      setPassword('')
      setConfirmPassword('')
      setSubmitting(false)
    }
  }

  const errorText = error === 'passwordMismatch'
    ? t('auth.changePassword.mismatch')
    : error
      ? t(error === 'duplicate'
        ? 'admin.error.duplicate'
        : error === 'validation'
          ? 'admin.error.validation'
          : error === 'serverUnavailable'
            ? 'login.error.serverUnavailable'
            : 'errors.generic')
      : ''

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-900 px-4 py-16">
      <div className="fixed end-4 top-4 z-20"><LanguageSelector /></div>
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-line-700 bg-ink-800 shadow-2xl shadow-black/30 md:grid-cols-[0.85fr_1.15fr]">
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-ink-700 via-ink-800 to-ink-900 p-10 md:flex">
          <div className="pointer-events-none absolute -end-24 -top-20 h-80 w-80 rounded-full border border-signal-400/20" aria-hidden="true" />
          <div className="relative flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-evidence-500 text-white">
              <ScanFace className="h-8 w-8" aria-hidden="true" />
            </div>
            <h1 className="text-3xl font-bold tracking-[0.18em] text-mist-100">VIGIL</h1>
          </div>

          <div className="relative space-y-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-line-600 bg-ink-700/80 text-signal-400">
              <LockKeyhole className="h-8 w-8" aria-hidden="true" />
            </div>
            <p className="text-2xl font-semibold leading-relaxed text-mist-100">{t('signup.title')}</p>
            <p className="text-base leading-relaxed text-mist-300">{t('signup.roleNote')}</p>
            <ul className="space-y-3 pt-2">
              {officerRoles.map((role) => (
                <li key={role} className="flex items-center gap-3 text-base text-mist-300">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full ${role === 'field_officer' ? 'bg-evidence-500 text-white' : 'bg-ink-600 text-mist-500'}`}>
                    {role === 'field_officer' ? <Check className="h-4 w-4" aria-hidden="true" /> : <span aria-hidden="true">·</span>}
                  </span>
                  {t(roleTranslationKeys[role])}
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-sm text-mist-500">{t('nav.projectTag')}</p>
        </aside>

        <section className="px-5 py-10 sm:px-10 md:py-12">
          <div className="mx-auto w-full max-w-lg">
            <Link to="/login" className="mb-7 inline-flex items-center gap-2 text-base font-semibold text-signal-400 hover:text-signal-300">
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              {t('signup.backToSignIn')}
            </Link>
            <div className="mb-7 md:hidden">
              <h1 className="text-2xl font-bold tracking-[0.16em] text-mist-100">VIGIL</h1>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-mist-100">{t('signup.title')}</h2>
            <p className="mt-2 text-base leading-relaxed text-mist-400">{t('signup.subtitle')}</p>

            <form onSubmit={submit} aria-busy={submitting} className="mt-7 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField id="signup-officer-id" label={t('login.officerId')} value={officerId} onChange={setOfficerId} maxLength={20} autoComplete="username" required />
                <TextField id="signup-name" label={t('admin.name')} value={name} onChange={setName} maxLength={100} autoComplete="name" required />
              </div>
              <TextField id="signup-zone" label={t('admin.zone')} value={zone} onChange={setZone} maxLength={80} required />
              <div className="rounded-xl border border-signal-500/30 bg-signal-500/10 p-4">
                <p className="text-base font-semibold text-mist-100">{t('role.field_officer')}</p>
                <p className="mt-1 text-sm leading-relaxed text-mist-300">{t('signup.roleNote')}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField id="signup-password" label={t('login.password')} value={password} onChange={setPassword} type="password" autoComplete="new-password" minLength={10} required />
                <TextField id="signup-confirm-password" label={t('signup.confirmPassword')} value={confirmPassword} onChange={setConfirmPassword} type="password" autoComplete="new-password" minLength={10} required />
              </div>

              <div aria-live="polite" className="min-h-12 pt-1 text-base text-caution-300">
                {created ? t('admin.success.created') : errorText}
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={submitting || created}>
                {submitting ? t('signup.creatingAccount') : t('signup.createAccount')}
              </Button>
              <p className="border-t border-line-800 pt-5 text-center text-base text-mist-300">
                {t('signup.alreadyHaveAccount')}{' '}
                <Link to="/login" className="font-semibold text-signal-400 underline-offset-4 hover:text-signal-300 hover:underline">
                  {t('signup.signInLink')}
                </Link>
              </p>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}

function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  minLength,
  maxLength,
  required = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'password'
  autoComplete?: string
  minLength?: number
  maxLength?: number
  required?: boolean
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-base font-semibold text-mist-200">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={maxLength}
        required={required}
        className="h-14 w-full rounded-xl border border-line-700 bg-ink-900 px-4 text-lg text-mist-100 outline-none transition focus:border-signal-500 focus:ring-2 focus:ring-signal-500/30"
      />
    </div>
  )
}

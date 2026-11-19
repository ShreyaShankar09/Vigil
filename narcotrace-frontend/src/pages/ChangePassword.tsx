import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import { homeForRole } from '@/lib/nav'
import { useI18n, type TKey } from '@/lib/i18n'
import { useToast } from '@/components/ui/Feedback'

type PasswordError = 'mismatch' | 'weak' | 'currentWrong' | 'failed'
const errorKeys: Record<PasswordError, TKey> = {
  mismatch: 'auth.changePassword.mismatch',
  weak: 'auth.changePassword.weak',
  currentWrong: 'auth.changePassword.currentWrong',
  failed: 'auth.changePassword.failed',
}

export default function ChangePassword() {
  const { state, changePassword, signOut } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { push } = useToast()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<PasswordError | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (state.status !== 'authed') return
    setError(null)
    if (newPassword !== confirmation) {
      setError('mismatch')
      return
    }
    if (newPassword.length < 10 || newPassword.toLocaleLowerCase() === state.user.officerId.toLocaleLowerCase()) {
      setError('weak')
      return
    }
    setSubmitting(true)
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      navigate(homeForRole(state.user.role), { replace: true })
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) setError('currentWrong')
      else if (caught instanceof ApiError && caught.status === 422) setError('weak')
      else setError('failed')
    } finally {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-900 px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-line-800 bg-ink-800 p-5">
        <h1 className="text-xl font-semibold text-mist-100">{t('auth.changePassword.title')}</h1>
        <PasswordField
          id="current-password"
          label={t('auth.changePassword.current')}
          value={currentPassword}
          autoComplete="current-password"
          onChange={setCurrentPassword}
        />
        <PasswordField
          id="new-password"
          label={t('auth.changePassword.new')}
          value={newPassword}
          autoComplete="new-password"
          onChange={setNewPassword}
        />
        <PasswordField
          id="confirm-password"
          label={t('auth.changePassword.confirm')}
          value={confirmation}
          autoComplete="new-password"
          onChange={setConfirmation}
        />
        <div ref={errorRef} tabIndex={-1} aria-live="assertive" className="min-h-12 text-sm text-caution-300 outline-none">
          {error ? t(errorKeys[error]) : ''}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {t('auth.changePassword.submit')}
        </Button>
        <button
          type="button"
          onClick={() => {
            void signOut().then((success) => {
              if (!success) push(t('auth.logoutFailed'), 'error')
            }).catch(() => push(t('auth.logoutFailed'), 'error'))
          }}
          className="w-full rounded-md px-3 py-2 text-sm text-mist-400 hover:text-mist-100 focus:outline-none focus:ring-2 focus:ring-signal-500"
        >
          {t('auth.logout')}
        </button>
      </form>
    </main>
  )
}

function PasswordField({
  id,
  label,
  value,
  autoComplete,
  onChange,
}: {
  id: string
  label: string
  value: string
  autoComplete: 'current-password' | 'new-password'
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-mist-300">{label}</label>
      <input
        id={id}
        type="password"
        autoComplete={autoComplete}
        required
        minLength={10}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-md border border-line-700 bg-ink-900 px-3 text-base text-mist-100 outline-none focus:border-signal-500 focus:ring-2 focus:ring-signal-500/30"
      />
    </div>
  )
}

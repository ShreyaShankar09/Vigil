import { useEffect, useState, type FormEvent } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { ApiError, apiCreateOfficer, apiListOfficers, apiUpdateOfficer, type AuthUser, type ManagedOfficer } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { roleTranslationKeys, useI18n, type TKey } from '@/lib/i18n'

const roles: AuthUser['role'][] = ['field_officer', 'lab', 'zonal_admin', 'prosecutor']
type AdminError = 'validation' | 'duplicate' | 'generic'

export default function Officers() {
  const { state } = useAuth()
  const { t } = useI18n()
  const [officers, setOfficers] = useState<ManagedOfficer[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AdminError | null>(null)
  const [createError, setCreateError] = useState<AdminError | null>(null)
  const [officerId, setOfficerId] = useState('')
  const [name, setName] = useState('')
  const [zone, setZone] = useState(state.status === 'authed' ? state.user.zone : '')
  const [role, setRole] = useState<AuthUser['role']>('field_officer')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [resetOfficerId, setResetOfficerId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')

  useEffect(() => {
    let active = true
    apiListOfficers().then((result) => {
      if (active) setOfficers(result)
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof ApiError && caught.status === 422 ? 'validation' : 'generic')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateError(null)
    if (temporaryPassword.length < 10 || temporaryPassword.toLocaleLowerCase() === officerId.toLocaleLowerCase()) {
      setCreateError('validation')
      return
    }
    setBusy(true)
    try {
      const created = await apiCreateOfficer({
        officer_id: officerId.trim(),
        name: name.trim(),
        role,
        zone: zone.trim() || undefined,
        password: temporaryPassword,
      })
      setOfficers((current) => [...current.filter((officer) => officer.officer_id !== created.officer_id), created])
      setOfficerId('')
      setName('')
      setTemporaryPassword('')
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) setCreateError('duplicate')
      else if (caught instanceof ApiError && caught.status === 422) setCreateError('validation')
      else setCreateError('generic')
    } finally {
      setTemporaryPassword('')
      setBusy(false)
    }
  }

  const update = async (id: string, changes: { disabled?: boolean; temporary_password?: string }) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await apiUpdateOfficer(id, changes)
      setOfficers((current) => current.map((officer) => officer.officer_id === id ? updated : officer))
      setResetOfficerId(null)
      setResetPassword('')
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 422 ? 'validation' : 'generic')
    } finally {
      setResetPassword('')
      setBusy(false)
    }
  }

  const reset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!resetOfficerId || resetPassword.length < 10 || resetPassword.toLocaleLowerCase() === resetOfficerId.toLocaleLowerCase()) {
      setError('validation')
      return
    }
    void update(resetOfficerId, { temporary_password: resetPassword })
  }

  return (
    <AppShell title={t('admin.title')} subtitle={t('admin.subtitle')}>
      <div className="mx-auto max-w-4xl space-y-6">
        <form onSubmit={create} className="grid gap-3 rounded-xl border border-line-800 bg-ink-800 p-4 sm:grid-cols-2">
          <TextField id="new-officer-id" label={t('admin.officerId')} value={officerId} onChange={setOfficerId} maxLength={20} required />
          <TextField id="new-officer-name" label={t('admin.name')} value={name} onChange={setName} maxLength={100} required />
          <TextField id="new-officer-zone" label={t('admin.zone')} value={zone} onChange={setZone} maxLength={80} />
          <div>
            <label htmlFor="new-officer-role" className="mb-1.5 block text-sm font-medium text-mist-300">{t('admin.role')}</label>
            <select
              id="new-officer-role"
              value={role}
              onChange={(event) => {
                const selectedRole = roles.find((candidate) => candidate === event.target.value)
                if (selectedRole) setRole(selectedRole)
              }}
              className="h-11 w-full rounded-md border border-line-700 bg-ink-900 px-3 text-sm text-mist-100"
            >
              {roles.map((value) => <option key={value} value={value}>{t(roleTranslationKeys[value])}</option>)}
            </select>
          </div>
          <TextField
            id="new-officer-password"
            label={t('admin.password')}
            value={temporaryPassword}
            onChange={setTemporaryPassword}
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
          <div className="sm:col-span-2">
            <div aria-live="polite" className="min-h-8 py-1 text-sm text-caution-300">
              {createError ? t(`admin.error.${createError}` as TKey) : ''}
            </div>
            <Button type="submit" disabled={busy}>{t('admin.create')}</Button>
          </div>
        </form>

        <section aria-label={t('admin.title')} className="overflow-hidden rounded-xl border border-line-800">
          <div aria-live="polite" className="min-h-8 px-4 py-2 text-sm text-caution-300">
            {error ? t(`admin.error.${error}` as TKey) : loading ? t('admin.loading') : ''}
          </div>
          {!loading && !officers.length ? (
            <p className="px-4 pb-4 text-sm text-mist-400">{t('admin.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-start text-sm">
                <thead className="bg-ink-700 text-mist-400">
                  <tr>
                    <th scope="col" className="px-4 py-3">{t('admin.officerId')}</th>
                    <th scope="col" className="px-4 py-3">{t('admin.name')}</th>
                    <th scope="col" className="px-4 py-3">{t('admin.role')}</th>
                    <th scope="col" className="px-4 py-3">{t('admin.zone')}</th>
                    <th scope="col" className="px-4 py-3">{t('admin.status.label')}</th>
                    <th scope="col" className="px-4 py-3">{t('admin.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {officers.map((officer) => (
                    <tr key={officer.officer_id} className="border-t border-line-800 text-mist-200">
                      <td className="px-4 py-3 font-mono">{officer.officer_id}</td>
                      <td className="px-4 py-3">{officer.name}</td>
                      <td className="px-4 py-3">{t(roleTranslationKeys[officer.role])}</td>
                      <td className="px-4 py-3">{officer.zone}</td>
                      <td className="px-4 py-3">{t(officer.is_disabled ? 'admin.status.disabled' : 'admin.status.active')}</td>
                      <td className="space-y-2 px-4 py-3">
                        <Button
                          size="sm"
                          variant={officer.is_disabled ? 'secondary' : 'danger'}
                          disabled={busy}
                          onClick={() => void update(officer.officer_id, { disabled: !officer.is_disabled })}
                        >
                          {t(officer.is_disabled ? 'admin.enable' : 'admin.disable')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => { setResetOfficerId(officer.officer_id); setResetPassword('') }}
                        >
                          {t('admin.resetPassword')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {resetOfficerId && (
          <form onSubmit={reset} className="space-y-3 rounded-xl border border-line-800 bg-ink-800 p-4">
            <h2 className="font-semibold text-mist-100">{t('admin.resetPassword')}: {resetOfficerId}</h2>
            <TextField
              id="reset-officer-password"
              label={t('admin.password')}
              value={resetPassword}
              onChange={setResetPassword}
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>{t('admin.resetPassword')}</Button>
              <Button type="button" variant="outline" onClick={() => { setResetOfficerId(null); setResetPassword('') }}>{t('admin.cancel')}</Button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  )
}

function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  required = false,
  minLength,
  maxLength,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'password'
  autoComplete?: string
  required?: boolean
  minLength?: number
  maxLength?: number
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-mist-300">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        className="h-11 w-full rounded-md border border-line-700 bg-ink-900 px-3 text-sm text-mist-100 outline-none focus:border-signal-500 focus:ring-2 focus:ring-signal-500/30"
      />
    </div>
  )
}

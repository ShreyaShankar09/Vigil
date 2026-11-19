import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Login from '@/pages/Login'
import { AuthProvider } from '@/lib/auth'
import { dictionaries, LANGUAGES, LanguageProvider } from '@/lib/i18n'
import { ToastProvider } from '@/components/ui/Feedback'

const officer = {
  officer_id: 'OFF-271',
  name: 'Test Officer',
  role: 'field_officer',
  zone: 'Zone A',
  must_change_password: false,
  language: 'en',
}

function jsonResponse(status: number, body?: unknown, headers: HeadersInit = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function renderLogin(path = '/login') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AuthProvider>
          <LanguageProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={<h1>Dashboard</h1>} />
              <Route path="/evidence" element={<h1>Evidence</h1>} />
              <Route path="/command" element={<h1>Command centre</h1>} />
              <Route path="/released" element={<h1>Released evidence</h1>} />
              <Route path="/change-password" element={<h1>Change password</h1>} />
            </Routes>
          </LanguageProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

function stubUnauthenticatedFetch() {
  const fetchMock = vi.fn(async () => jsonResponse(401, { detail: 'Unauthorized' }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function submitCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(dictionaries.en['login.officerId']), 'OFF-271')
  await user.type(screen.getByLabelText(dictionaries.en['login.password']), 'correct-password')
  await waitFor(() => expect(screen.getByRole('button', { name: dictionaries.en['login.signIn'] })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: dictionaries.en['login.signIn'] }))
}

describe('sign-in localization and UX states', () => {
  beforeEach(() => {
    stubUnauthenticatedFetch()
  })

  it.each(LANGUAGES)('renders sign-in controls in $code', async ({ code }) => {
    localStorage.setItem('narcotrace.lang', code)
    renderLogin()

    expect(await screen.findByRole('heading', { name: dictionaries[code]['login.title'] })).toBeInTheDocument()
    expect(screen.getByLabelText(dictionaries[code]['login.officerId'])).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText(dictionaries[code]['login.password'])).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByRole('button', { name: dictionaries[code]['login.signIn'] })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: dictionaries[code]['login.language'] })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe(code)
    expect(document.documentElement.dir).toBe(code === 'ur' ? 'rtl' : 'ltr')
  })

  it.each(LANGUAGES)('localizes rejected credentials in $code', async ({ code }) => {
    localStorage.setItem('narcotrace.lang', code)
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      return String(input).endsWith('/auth/login')
        ? jsonResponse(401, { detail: 'Bad credentials' })
        : jsonResponse(401, { detail: 'Unauthorized' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText(dictionaries[code]['login.officerId']), 'OFF-271')
    await user.type(screen.getByLabelText(dictionaries[code]['login.password']), 'incorrect-password')
    await waitFor(() => expect(screen.getByRole('button', { name: dictionaries[code]['login.signIn'] })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: dictionaries[code]['login.signIn'] }))
    expect(await screen.findByText(dictionaries[code]['login.error.wrongCredentials'])).toBeInTheDocument()
  })

  it('updates and remembers the language before signing in', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.selectOptions(screen.getByRole('combobox', { name: dictionaries.en['login.language'] }), 'ur')
    expect(document.documentElement.lang).toBe('ur')
    expect(document.documentElement.dir).toBe('rtl')
    expect(localStorage.getItem('narcotrace.lang')).toBe('ur')
    expect(screen.getByRole('button', { name: dictionaries.ur['login.signIn'] })).toBeInTheDocument()
  })

  it('shows localized wrong-credential errors', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      return String(input).endsWith('/auth/login')
        ? jsonResponse(401, { detail: 'Bad credentials' })
        : jsonResponse(401, { detail: 'Unauthorized' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderLogin()
    const errorRegion = document.querySelector('[tabindex="-1"]')
    expect(errorRegion).not.toBeNull()
    const reservedHeight = errorRegion?.getBoundingClientRect().height
    await submitCredentials(user)
    const errorMessage = await screen.findByText(dictionaries.en['login.error.wrongCredentials'])
    expect(errorMessage.parentElement).toBe(errorRegion)
    expect(screen.getByLabelText(dictionaries.en['login.password'])).toHaveValue('')
    expect(errorRegion).toHaveFocus()
    expect(errorRegion?.getBoundingClientRect().height).toBe(reservedHeight)
  })

  it('submits from the password field with Enter', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      return String(input).endsWith('/auth/login')
        ? jsonResponse(401, { detail: 'Bad credentials' })
        : jsonResponse(401, { detail: 'Unauthorized' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText(dictionaries.en['login.officerId']), 'OFF-271')
    const password = screen.getByLabelText(dictionaries.en['login.password'])
    await user.type(password, 'incorrect-password')
    await waitFor(() => expect(screen.getByRole('button', { name: dictionaries.en['login.signIn'] })).toBeEnabled())
    await user.keyboard('{Enter}')
    expect(await screen.findByText(dictionaries.en['login.error.wrongCredentials'])).toBeInTheDocument()
  })

  it('shows the lockout countdown from Retry-After', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      return String(input).endsWith('/auth/login')
        ? jsonResponse(429, { detail: 'Too many attempts' }, { 'Retry-After': '4' })
        : jsonResponse(401, { detail: 'Unauthorized' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderLogin()
    await submitCredentials(user)
    expect(await screen.findByText(dictionaries.en['login.error.lockedOut'])).toBeInTheDocument()
    expect(await screen.findByText(/Try again in [1-4] seconds\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: dictionaries.en['login.signIn'] })).toBeDisabled()
  })

  it('shows a disabled-account message for the machine error code', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      return String(input).endsWith('/auth/login')
        ? jsonResponse(403, { detail: { code: 'ACCOUNT_DISABLED' } })
        : jsonResponse(401, { detail: 'Unauthorized' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderLogin()
    await submitCredentials(user)
    expect(await screen.findByText(dictionaries.en['login.error.disabled'])).toBeInTheDocument()
  })

  it('shows a localised server-unavailable state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    renderLogin()
    expect(await screen.findByText(dictionaries.en['login.error.serverUnavailable'])).toBeInTheDocument()
  })

  it('honours the session-expired query parameter', async () => {
    renderLogin('/login?reason=expired')
    expect(await screen.findByText(dictionaries.en['login.error.expired'])).toBeInTheDocument()
  })

  it('redirects to the signed-in role home and never persists the access token', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      return String(input).endsWith('/auth/login')
        ? jsonResponse(200, { token: 'access-token', ...officer })
        : jsonResponse(401, { detail: 'Unauthorized' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderLogin()
    await submitCredentials(user)
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(localStorage.getItem('narcotrace.token')).toBeNull()
    expect(sessionStorage.getItem('narcotrace.token')).toBeNull()
  })

  it('forces the first-login password change before opening the role home', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      return String(input).endsWith('/auth/login')
        ? jsonResponse(200, {
            token: 'access-token',
            ...officer,
            must_change_password: true,
          })
        : jsonResponse(401, { detail: 'Unauthorized' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderLogin()
    await submitCredentials(user)
    expect(await screen.findByRole('heading', { name: 'Change password' })).toBeInTheDocument()
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/Feedback'
import { AuthProvider } from '@/lib/auth'
import { dictionaries, LanguageProvider } from '@/lib/i18n'
import Signup from '@/pages/Signup'

vi.mock('@/lib/font-assets', () => ({
  loadLocaleFont: vi.fn().mockResolvedValue(undefined),
}))

function jsonResponse(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderSignup() {
  return render(
    <MemoryRouter initialEntries={['/signup']}>
      <ToastProvider>
        <AuthProvider>
          <LanguageProvider>
            <Routes>
              <Route path="/signup" element={<Signup />} />
            </Routes>
          </LanguageProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('field officer registration', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/me')
        ? jsonResponse(401, { detail: 'Unauthorized' })
        : jsonResponse(201, {
            officer_id: 'FIELD-21',
            name: 'Field Officer',
            role: 'field_officer',
            zone: 'Mysuru',
            language: 'en',
            must_change_password: false,
          }),
    ))
  })

  it('creates a field account without creating a session', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.mocked(fetch)
    renderSignup()

    await screen.findByRole('heading', { name: dictionaries.en['signup.title'] })
    expect(screen.getByRole('link', { name: dictionaries.en['signup.signInLink'] })).toHaveAttribute('href', '/login')
    await user.type(screen.getByLabelText(dictionaries.en['login.officerId']), 'FIELD-21')
    await user.type(screen.getByLabelText(dictionaries.en['admin.name']), 'Field Officer')
    await user.type(screen.getByLabelText(dictionaries.en['admin.zone']), 'Mysuru')
    await user.type(screen.getByLabelText(dictionaries.en['login.password']), 'Strong-Password-21')
    await user.type(screen.getByLabelText(dictionaries.en['signup.confirmPassword']), 'Strong-Password-21')
    await user.click(screen.getByRole('button', { name: dictionaries.en['signup.createAccount'] }))

    expect(await screen.findByText(dictionaries.en['admin.success.created'])).toBeInTheDocument()
    const registration = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/auth/register'))
    expect(registration).toBeDefined()
    expect(JSON.parse(String(registration?.[1]?.body))).toMatchObject({
      officer_id: 'FIELD-21',
      role: 'field_officer',
      language: 'en',
    })
  })

  it('rejects mismatched passwords without sending registration data', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.mocked(fetch)
    renderSignup()

    await screen.findByRole('heading', { name: dictionaries.en['signup.title'] })
    await user.type(screen.getByLabelText(dictionaries.en['login.officerId']), 'FIELD-22')
    await user.type(screen.getByLabelText(dictionaries.en['admin.name']), 'Field Officer')
    await user.type(screen.getByLabelText(dictionaries.en['admin.zone']), 'Mysuru')
    await user.type(screen.getByLabelText(dictionaries.en['login.password']), 'Strong-Password-22')
    await user.type(screen.getByLabelText(dictionaries.en['signup.confirmPassword']), 'different-password')
    await user.click(screen.getByRole('button', { name: dictionaries.en['signup.createAccount'] }))

    expect(await screen.findByText(dictionaries.en['auth.changePassword.mismatch'])).toBeInTheDocument()
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/auth/register'))).toBe(false))
  })
})

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { RequireAuth, RequireRole } from '@/components/layout/RequireAuth'
import { useAuth, type AuthState } from '@/lib/auth'
import type { AuthRole } from '@/lib/api'
import { ROLE_ACCESS } from '@/lib/route-access'

vi.mock('@/lib/auth', () => ({ useAuth: vi.fn() }))

const mockUseAuth = vi.mocked(useAuth)
const roles: AuthRole[] = ['field_officer', 'lab', 'zonal_admin', 'prosecutor']
const userByRole: Record<AuthRole, { officerId: string; name: string; role: AuthRole; zone: string; mustChangePassword: boolean; language: 'en' }> = {
  field_officer: { officerId: 'FIELD-1', name: 'Field Officer', role: 'field_officer', zone: 'Zone A', mustChangePassword: false, language: 'en' },
  lab: { officerId: 'LAB-1', name: 'Lab Officer', role: 'lab', zone: 'Zone A', mustChangePassword: false, language: 'en' },
  zonal_admin: { officerId: 'ADMIN-1', name: 'Zonal Admin', role: 'zonal_admin', zone: 'Zone A', mustChangePassword: false, language: 'en' },
  prosecutor: { officerId: 'PROS-1', name: 'Prosecutor', role: 'prosecutor', zone: 'Zone A', mustChangePassword: false, language: 'en' },
}

function setAuth(role: AuthRole, mustChangePassword = false) {
  const user = { ...userByRole[role], mustChangePassword }
  const state: AuthState = { status: 'authed', user }
  mockUseAuth.mockReturnValue({
    state,
    initialServerUnavailable: false,
    sessionExpired: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    changePassword: vi.fn(),
  })
}

describe('RequireRole matrix', () => {
  const routes = Object.entries(ROLE_ACCESS) as [keyof typeof ROLE_ACCESS, readonly AuthRole[]][]

  it.each(routes.flatMap(([key, allowed]) => roles.map((role) => [key, role, allowed] as const)))(
    '%s route: %s is %s',
    (routeKey, role, allowed) => {
      setAuth(role)
      render(
        <MemoryRouter initialEntries={['/protected']}>
          <Routes>
            <Route element={<RequireRole roles={allowed} />}>
              <Route path="/protected" element={<p>Protected {routeKey}</p>} />
            </Route>
            <Route path="/403" element={<p>Forbidden route</p>} />
          </Routes>
        </MemoryRouter>,
      )
      if (allowed.includes(role)) {
        expect(screen.getByText(`Protected ${routeKey}`)).toBeInTheDocument()
      } else {
        expect(screen.getByText('Forbidden route')).toBeInTheDocument()
      }
    },
  )

  it('forces a first-login password change before protected routes', () => {
    setAuth('field_officer', true)
    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/protected" element={<p>Protected page</p>} />
            <Route path="/change-password" element={<p>Change password page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Change password page')).toBeInTheDocument()
  })
})

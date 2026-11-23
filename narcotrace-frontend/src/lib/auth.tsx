import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  apiChangePassword,
  apiLogin,
  apiLogout,
  apiMe,
  ApiError,
  AuthError,
  clearToken,
  clearLegacyAuthStorage,
  subscribeAuthExpired,
  type AuthUser,
} from '@/lib/api'

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'anon'; user: null }
  | { status: 'authed'; user: AuthUser }

interface AuthContextValue {
  state: AuthState
  initialServerUnavailable: boolean
  sessionExpired: boolean
  signIn: (officerId: string, password: string) => Promise<AuthUser>
  signOut: () => Promise<boolean>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null })
  const [initialServerUnavailable, setInitialServerUnavailable] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const expireSession = useCallback(() => {
    clearToken()
    setSessionExpired(true)
    setState({ status: 'anon', user: null })
    void navigate('/login?reason=expired', { replace: true })
  }, [navigate])

  useEffect(() => {
    subscribeAuthExpired(() => {
      if (state.status === 'authed') expireSession()
    })
    return () => subscribeAuthExpired(null)
  }, [expireSession, state.status])

  useEffect(() => {
    if (state.status !== 'loading') return
    let active = true
    clearLegacyAuthStorage()
    apiMe().then((user) => {
      if (active) {
        setInitialServerUnavailable(false)
        setSessionExpired(false)
        setState({ status: 'authed', user })
      }
    }).catch((error: unknown) => {
      if (!active) return
      clearToken()
      setSessionExpired(error instanceof AuthError)
      setState({ status: 'anon', user: null })
      if (error instanceof ApiError && error.status === 0) {
        setInitialServerUnavailable(true)
      }
      const currentPath = location.pathname
      if (currentPath !== '/login' && currentPath !== '/signup' && currentPath !== '/' && currentPath !== '/offline') {
        const reason = error instanceof AuthError ? '?reason=expired' : ''
        void navigate(`/login${reason}`, { replace: true })
      }
    })
    return () => { active = false }
  }, [location.pathname, navigate, state.status])

  const signIn = useCallback(async (officerId: string, password: string) => {
    const user = await apiLogin(officerId, password)
    setSessionExpired(false)
    setState({ status: 'authed', user })
    setInitialServerUnavailable(false)
    return user
  }, [])

  const signOut = useCallback(async () => {
    let succeeded = true
    try {
      if (state.status === 'authed') await apiLogout()
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      succeeded = false
    } finally {
      clearToken()
      setSessionExpired(false)
      setState({ status: 'anon', user: null })
      void navigate('/login', { replace: true })
    }
    return succeeded
  }, [navigate, state.status])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (state.status !== 'authed') throw new Error('Authentication required')
    const officerId = state.user.officerId
    await apiChangePassword(currentPassword, newPassword)
    const user = await apiLogin(officerId, newPassword)
    setState({ status: 'authed', user })
  }, [state])

  const value = useMemo(
    () => ({ state, initialServerUnavailable, sessionExpired, signIn, signOut, changePassword }),
    [state, initialServerUnavailable, sessionExpired, signIn, signOut, changePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

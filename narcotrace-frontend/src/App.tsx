import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppDataProvider } from '@/lib/store'
import { AuthProvider } from '@/lib/auth'
import { LanguageProvider, useI18n } from '@/lib/i18n'
import { ROLE_ACCESS } from '@/lib/route-access'
import { ToastProvider } from '@/components/ui/Feedback'
import { RequireAuth, RequireRole } from '@/components/layout/RequireAuth'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import { NetworkToastBridge } from '@/components/pwa/NetworkToastBridge'
import { UpdatePrompt } from '@/components/pwa/UpdatePrompt'

const Login = lazy(() => import('@/pages/Login'))
const Signup = lazy(() => import('@/pages/Signup'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const NewTest = lazy(() => import('@/pages/NewTest'))
const EvidenceDetails = lazy(() => import('@/pages/EvidenceDetails'))
const ChainOfCustody = lazy(() => import('@/pages/ChainOfCustody'))
const EvidenceHistory = lazy(() => import('@/pages/EvidenceHistory'))
const OfflineSync = lazy(() => import('@/pages/OfflineSync'))
const CommandCenter = lazy(() => import('@/pages/CommandCenter'))
const Alerts = lazy(() => import('@/pages/Alerts'))
const Security = lazy(() => import('@/pages/Security'))
const Profile = lazy(() => import('@/pages/Profile'))
const ChangePassword = lazy(() => import('@/pages/ChangePassword'))
const Officers = lazy(() => import('@/pages/Officers'))
const Forbidden = lazy(() => import('@/pages/Forbidden'))
const CustodyQueue = lazy(() => import('@/pages/CustodyQueue'))
const ReleasedEvidence = lazy(() => import('@/pages/ReleasedEvidence'))
const Offline = lazy(() => import('@/pages/Offline'))

function RouteLoading() {
  const { t } = useI18n()
  return <main className="flex min-h-screen items-center justify-center bg-ink-900 text-mist-300">{t('auth.loading')}</main>
}

export default function App() {
  return (
    <AppDataProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <LanguageProvider>
              <NetworkToastBridge />
              <UpdatePrompt />
              <ErrorBoundary>
                <Suspense fallback={<RouteLoading />}>
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/offline" element={<Offline />} />
                    <Route path="/" element={<Navigate to="/login" replace />} />

                    <Route element={<RequireAuth />}>
                      <Route path="/change-password" element={<ChangePassword />} />
                      <Route path="/403" element={<Forbidden />} />

                      <Route element={<RequireRole roles={ROLE_ACCESS.dashboard} />}>
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route element={<RequireRole roles={ROLE_ACCESS.newTest} />}>
                          <Route path="/test/new" element={<NewTest />} />
                        </Route>
                        <Route element={<RequireRole roles={ROLE_ACCESS.sync} />}>
                          <Route path="/sync" element={<OfflineSync />} />
                        </Route>
                      </Route>

                      <Route element={<RequireRole roles={ROLE_ACCESS.evidence} />}>
                        <Route path="/evidence" element={<EvidenceHistory />} />
                        <Route element={<RequireRole roles={ROLE_ACCESS.evidenceDetail} />}>
                          <Route path="/evidence/:id" element={<EvidenceDetails />} />
                        </Route>
                        <Route element={<RequireRole roles={ROLE_ACCESS.custodyDetail} />}>
                          <Route path="/evidence/:id/custody" element={<ChainOfCustody />} />
                        </Route>
                      </Route>

                      <Route element={<RequireRole roles={ROLE_ACCESS.custodyQueue} />}>
                        <Route path="/custody" element={<CustodyQueue />} />
                      </Route>

                      <Route element={<RequireRole roles={ROLE_ACCESS.admin} />}>
                        <Route path="/command" element={<CommandCenter />} />
                        <Route path="/admin/officers" element={<Officers />} />
                        <Route path="/alerts" element={<Alerts />} />
                        <Route path="/security" element={<Security />} />
                      </Route>

                      <Route element={<RequireRole roles={ROLE_ACCESS.profile} />}>
                        <Route path="/profile" element={<Profile />} />
                      </Route>

                      <Route element={<RequireRole roles={ROLE_ACCESS.released} />}>
                        <Route path="/released" element={<ReleasedEvidence />} />
                      </Route>
                    </Route>
                    <Route path="*" element={<Navigate to="/login" replace />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </LanguageProvider>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </AppDataProvider>
  )
}

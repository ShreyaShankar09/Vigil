import { Component, type ReactNode } from 'react'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/Button'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  failed: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  render() {
    return this.state.failed ? <LocalizedErrorFallback /> : this.props.children
  }
}

function LocalizedErrorFallback() {
  const { t } = useI18n()
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-900 px-4">
      <section className="max-w-md rounded-xl border border-caution-500/40 bg-ink-800 p-6 text-center" role="alert">
        <h1 className="text-lg font-semibold text-mist-100">{t('errors.appCrashed')}</h1>
        <p className="mt-2 text-sm text-mist-300">{t('errors.appCrashedBody')}</p>
        <Button className="mt-5" onClick={() => window.location.assign('/')}>{t('errors.reloadApp')}</Button>
      </section>
    </main>
  )
}

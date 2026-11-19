import { Link } from 'react-router-dom'
import { CloudOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'
import { useOnlineStatus } from '@/lib/use-online'

export default function Offline() {
  const { t } = useI18n()
  const online = useOnlineStatus()
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-900 px-4">
      <section className="max-w-md rounded-xl border border-line-700 bg-ink-800 p-6 text-center">
        <CloudOff className="mx-auto h-10 w-10 text-caution-400" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold text-mist-100">{t('offline.title')}</h1>
        <p className="mt-2 text-sm text-mist-300">{t(online ? 'offline.connectedBody' : 'offline.body')}</p>
        <div className="mt-5 flex justify-center gap-3">
          <Button variant="outline" onClick={() => window.location.reload()}>{t('offline.retry')}</Button>
          <Link to="/login"><Button>{t('offline.signIn')}</Button></Link>
        </div>
      </section>
    </main>
  )
}

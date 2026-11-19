import { useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/components/ui/Feedback'
import { processEvidenceOutbox } from '@/lib/sync-worker'

export function NetworkToastBridge() {
  const { t } = useI18n()
  const { push } = useToast()
  const lastNetworkToast = useRef(0)

  useEffect(() => {
    const showNetworkError = () => {
      if (Date.now() - lastNetworkToast.current < 2500) return
      lastNetworkToast.current = Date.now()
      push(t('errors.networkUnavailable'), 'error')
    }
    const onServiceWorkerMessage = (event: MessageEvent<unknown>) => {
      if (
        typeof event.data === 'object'
        && event.data !== null
        && 'type' in event.data
        && event.data.type === 'VIGIL_OUTBOX_SYNC'
      ) {
        void processEvidenceOutbox()
      }
    }
    window.addEventListener('vigil:network-error', showNetworkError)
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage)
    return () => {
      window.removeEventListener('vigil:network-error', showNetworkError)
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage)
    }
  }, [push, t])

  return null
}

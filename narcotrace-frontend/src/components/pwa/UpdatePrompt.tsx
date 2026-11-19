import { useRegisterSW } from 'virtual:pwa-register/react'
import { useI18n } from '@/lib/i18n'

export function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    immediate: true,
  })
  const { t } = useI18n()

  if (!needRefresh) return null
  return (
    <aside className="fixed bottom-4 end-4 z-[60] flex max-w-sm items-center gap-3 rounded-lg border border-line-600 bg-ink-700 p-3 shadow-xl" role="status">
      <p className="flex-1 text-sm text-mist-100">{t('pwa.updateAvailable')}</p>
      <button
        type="button"
        className="rounded bg-evidence-500 px-3 py-2 text-sm font-semibold text-white"
        onClick={() => { void updateServiceWorker(true) }}
      >
        {t('pwa.updateNow')}
      </button>
      <button
        type="button"
        className="rounded px-2 py-2 text-sm text-mist-300"
        onClick={() => setNeedRefresh(false)}
      >
        {t('pwa.later')}
      </button>
    </aside>
  )
}

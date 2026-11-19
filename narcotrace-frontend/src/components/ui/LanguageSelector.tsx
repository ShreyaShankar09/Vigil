import { Languages } from 'lucide-react'
import { LANGUAGES, useI18n, type LangCode } from '@/lib/i18n'

export function LanguageSelector() {
  const { lang, setLang, t } = useI18n()
  return (
    <label data-notranslate className="relative flex items-center">
      <span className="sr-only">{t('login.language')}</span>
      <Languages className="pointer-events-none absolute start-2.5 h-4 w-4 text-mist-500" aria-hidden="true" />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as LangCode)}
        aria-label={t('login.language')}
        className="h-9 max-w-[11rem] cursor-pointer rounded-md border border-line-700 bg-ink-900 ps-8 pe-2 text-xs font-medium text-mist-300 hover:bg-ink-600 focus:outline-none focus:ring-2 focus:ring-evidence-400"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native}
          </option>
        ))}
      </select>
    </label>
  )
}

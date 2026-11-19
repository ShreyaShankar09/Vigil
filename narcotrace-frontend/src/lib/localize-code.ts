import i18next from 'i18next'
import type { TKey } from '@/lib/i18n'

type Translate = (key: TKey, params?: Record<string, string | number>) => string

export function localizeBackendCode(
  code: string | undefined,
  translate: Translate,
  params: Record<string, string | number> = {},
): string {
  if (code && /^[A-Z0-9_]+$/.test(code)) {
    for (const key of [`errors.${code}`, `analysis.reason.${code}`]) {
      if (i18next.exists(key)) return translate(key, params)
    }
    console.warn(`Unknown backend message code: ${code}`)
  } else {
    console.warn('Backend returned a message without a recognized machine code.')
  }
  return translate('errors.generic')
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import ICU from 'i18next-icu'
import { initReactI18next } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { apiUpdateProfileLanguage } from '@/lib/api'
import { loadLocaleFont } from '@/lib/font-assets'
import { useToast } from '@/components/ui/Feedback'
import en from '@/locales/en.json'
import enXA from '@/locales/en-XA.json'
import hi from '@/locales/hi.json'
import kn from '@/locales/kn.json'
import ta from '@/locales/ta.json'
import te from '@/locales/te.json'
import ml from '@/locales/ml.json'
import mr from '@/locales/mr.json'
import bn from '@/locales/bn.json'
import gu from '@/locales/gu.json'
import pa from '@/locales/pa.json'
import or from '@/locales/or.json'
import as from '@/locales/as.json'
import ur from '@/locales/ur.json'

export type LangCode = 'en' | 'hi' | 'kn' | 'ta' | 'te' | 'ml' | 'mr' | 'bn' | 'gu' | 'pa' | 'or' | 'as' | 'ur' | 'en-XA'

export const LANGUAGES: { code: LangCode; english: string; native: string; rtl?: boolean }[] = [
  { code: 'en', english: 'English', native: 'English' },
  { code: 'hi', english: 'Hindi', native: 'हिन्दी' },
  { code: 'kn', english: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ta', english: 'Tamil', native: 'தமிழ்' },
  { code: 'te', english: 'Telugu', native: 'తెలుగు' },
  { code: 'ml', english: 'Malayalam', native: 'മലയാളം' },
  { code: 'mr', english: 'Marathi', native: 'मराठी' },
  { code: 'bn', english: 'Bengali', native: 'বাংলা' },
  { code: 'gu', english: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'pa', english: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'or', english: 'Odia', native: 'ଓଡ଼ିଆ' },
  { code: 'as', english: 'Assamese', native: 'অসমীয়া' },
  { code: 'ur', english: 'Urdu', native: 'اردو', rtl: true },
]

const localeCodes = new Set<LangCode>([...LANGUAGES.map(({ code }) => code), 'en-XA'])
const LANG_KEY = 'narcotrace.lang'
const resources = {
  en: { translation: en },
  hi: { translation: hi },
  kn: { translation: kn },
  ta: { translation: ta },
  te: { translation: te },
  ml: { translation: ml },
  mr: { translation: mr },
  bn: { translation: bn },
  gu: { translation: gu },
  pa: { translation: pa },
  or: { translation: or },
  as: { translation: as },
  ur: { translation: ur },
  'en-XA': { translation: enXA },
}

function storedLanguage(): LangCode {
  try {
    const stored = localStorage.getItem(LANG_KEY)
    if (stored && localeCodes.has(stored as LangCode)) return stored as LangCode
  } catch {
    console.warn('Unable to read the saved language preference.')
  }
  return 'en'
}

function hasStoredLanguagePreference(): boolean {
  try {
    const stored = localStorage.getItem(LANG_KEY)
    return stored !== null && localeCodes.has(stored as LangCode)
  } catch {
    return false
  }
}

const initialLanguage = storedLanguage()
void i18next
  .use(ICU)
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLanguage,
    fallbackLng: 'en',
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
    returnNull: false,
  })

const LEGACY_PREFIXES: Record<string, string> = {
  login: 'auth.login',
  f6: 'form6',
  capture: 'test.capture',
  released: 'evidence.released',
  role: 'auth.role',
  status: 'common.status',
}

function flattenLocale(value: unknown, prefix = '', result: Record<string, string> = {}) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return result
  for (const [key, child] of Object.entries(value)) {
    if (key === '_todo') continue
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof child === 'string') result[fullKey] = child
    else flattenLocale(child, fullKey, result)
  }
  return result
}

export const dictionaries = Object.fromEntries(
  Object.entries(resources).map(([code, resource]) => {
    const flattened = flattenLocale(resource.translation)
    for (const [legacyPrefix, currentPrefix] of Object.entries(LEGACY_PREFIXES)) {
      for (const [key, value] of Object.entries(flattened)) {
        if (key.startsWith(`${currentPrefix}.`)) {
          flattened[`${legacyPrefix}${key.slice(currentPrefix.length)}`] = value
        }
      }
    }
    for (const [key, value] of Object.entries(flattened)) {
      if (key.startsWith('analysis.reason.')) {
        flattened[key.replace('analysis.reason.', 'analysis.notice.')] = value
      }
      if (key === 'auth.profile.zone') {
        flattened['profile.zone'] = value
      }
    }
    return [code, flattened]
  }),
) as Record<LangCode, Record<string, string>>

function resolveKey(key: string): string {
  if (i18next.exists(key)) return key
  if (key.startsWith('analysis.notice.')) return key.replace('analysis.notice.', 'analysis.reason.')
  const separator = key.indexOf('.')
  if (separator > 0) {
    const prefix = key.slice(0, separator)
    const mappedPrefix = LEGACY_PREFIXES[prefix]
    if (mappedPrefix) return `${mappedPrefix}${key.slice(separator)}`
    if (prefix === 'profile' && key.startsWith('profile.zone')) {
      return key.replace('profile.zone', 'auth.profile.zone')
    }
  }
  return key
}

export type TKey = string
export const roleTranslationKeys: Record<string, TKey> = {
  field_officer: 'auth.role.field_officer',
  lab: 'auth.role.lab',
  zonal_admin: 'auth.role.zonal_admin',
  prosecutor: 'auth.role.prosecutor',
}

type I18nContextValue = {
  lang: LangCode
  setLang: (language: LangCode) => void
  t: (key: TKey, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const { push } = useToast()
  const [lang, setLangState] = useState<LangCode>(storedLanguage)

  const applyLanguage = useCallback((language: LangCode) => {
    setLangState(language)
    try {
      localStorage.setItem(LANG_KEY, language)
    } catch {
      console.warn('Unable to save the language preference.')
    }
    void i18next.changeLanguage(language)
  }, [])

  const setLang = useCallback((language: LangCode) => {
    if (!localeCodes.has(language)) return
    applyLanguage(language)
  }, [applyLanguage])

  const t = useCallback((key: TKey, params?: Record<string, string | number>) => {
    const resolved = resolveKey(key)
    if (!i18next.exists(resolved, { lng: lang })) {
      console.warn(`Missing translation key: ${key}`)
      return i18next.t('errors.generic', { lng: lang })
    }
    return i18next.t(resolved, { ...params, lng: lang })
  }, [lang])

  useEffect(() => {
    const root = document.documentElement
    root.lang = lang
    root.dir = lang === 'ur' ? 'rtl' : 'ltr'
    void i18next.changeLanguage(lang)
    void loadLocaleFont(lang).catch((error: unknown) => {
      console.error(`Unable to load the ${lang} font.`, error)
    })
  }, [lang])

  useEffect(() => {
    if (state.status !== 'authed') return
    if (state.user.language && !hasStoredLanguagePreference()) {
      applyLanguage(state.user.language)
      return
    }
    if (state.user.language !== lang && lang !== 'en-XA') {
      void apiUpdateProfileLanguage(lang).then(() => {
        push(t('profile.languageSaved'), 'success')
      }).catch((error: unknown) => {
        console.error('Unable to save the language preference to the profile.', error)
        push(t('profile.languageSaveFailed'), 'error')
      })
    }
  }, [applyLanguage, lang, push, state, t])

  const contextValue = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return (
    <I18nextProvider i18n={i18next}>
      <I18nContext.Provider value={contextValue}>
        {children}
      </I18nContext.Provider>
    </I18nextProvider>
  )
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within LanguageProvider')
  return context
}

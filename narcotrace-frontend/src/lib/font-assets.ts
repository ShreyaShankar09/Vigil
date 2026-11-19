import notoLatin from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2?url'
import devanagari from '@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff2?url'
import kannada from '@fontsource/noto-sans-kannada/files/noto-sans-kannada-kannada-400-normal.woff2?url'
import tamil from '@fontsource/noto-sans-tamil/files/noto-sans-tamil-tamil-400-normal.woff2?url'
import telugu from '@fontsource/noto-sans-telugu/files/noto-sans-telugu-telugu-400-normal.woff2?url'
import malayalam from '@fontsource/noto-sans-malayalam/files/noto-sans-malayalam-malayalam-400-normal.woff2?url'
import bengali from '@fontsource/noto-sans-bengali/files/noto-sans-bengali-bengali-400-normal.woff2?url'
import gujarati from '@fontsource/noto-sans-gujarati/files/noto-sans-gujarati-gujarati-400-normal.woff2?url'
import gurmukhi from '@fontsource/noto-sans-gurmukhi/files/noto-sans-gurmukhi-gurmukhi-400-normal.woff2?url'
import oriya from '@fontsource/noto-sans-oriya/files/noto-sans-oriya-oriya-400-normal.woff2?url'
import nastaliq from '@fontsource/noto-nastaliq-urdu/files/noto-nastaliq-urdu-arabic-400-normal.woff2?url'

export interface LocaleFont {
  family: string
  scriptUrl?: string
}

export const LOCALE_FONTS: Record<string, LocaleFont> = {
  en: { family: 'Noto Sans' },
  hi: { family: 'Noto Sans Devanagari', scriptUrl: devanagari },
  kn: { family: 'Noto Sans Kannada', scriptUrl: kannada },
  ta: { family: 'Noto Sans Tamil', scriptUrl: tamil },
  te: { family: 'Noto Sans Telugu', scriptUrl: telugu },
  ml: { family: 'Noto Sans Malayalam', scriptUrl: malayalam },
  mr: { family: 'Noto Sans Devanagari', scriptUrl: devanagari },
  bn: { family: 'Noto Sans Bengali', scriptUrl: bengali },
  gu: { family: 'Noto Sans Gujarati', scriptUrl: gujarati },
  pa: { family: 'Noto Sans Gurmukhi', scriptUrl: gurmukhi },
  or: { family: 'Noto Sans Oriya', scriptUrl: oriya },
  as: { family: 'Noto Sans Bengali', scriptUrl: bengali },
  ur: { family: 'Noto Nastaliq Urdu', scriptUrl: nastaliq },
  'en-XA': { family: 'Noto Sans' },
}

const loadedFaces = new Set<string>()
async function loadFace(family: string, url: string) {
  const key = `${family}:${url}`
  if (loadedFaces.has(key)) return
  const face = new FontFace(family, `url("${url}")`, { weight: '400' })
  await face.load()
  document.fonts.add(face)
  loadedFaces.add(key)
}

export async function loadLocaleFont(locale: string): Promise<void> {
  const font = LOCALE_FONTS[locale] ?? LOCALE_FONTS.en
  await Promise.all([
    loadFace('Noto Sans', notoLatin),
    font.scriptUrl ? loadFace(font.family, font.scriptUrl) : Promise.resolve(),
  ])
  document.documentElement.style.setProperty(
    '--font-sans',
    `"${font.family}", "Noto Sans", system-ui, sans-serif`,
  )
}

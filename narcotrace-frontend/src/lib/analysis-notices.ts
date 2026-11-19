import type { AnalysisNotice } from '@/types'
import type { TKey } from '@/lib/i18n'

const noticeKeys: Record<string, TKey> = {
  CARD_NOT_FOUND: 'analysis.notice.CARD_NOT_FOUND',
  EXPOSURE_DARK: 'analysis.notice.EXPOSURE_DARK',
  EXPOSURE_CLIPPED: 'analysis.notice.EXPOSURE_CLIPPED',
  TEST_REGION_UNREADABLE: 'analysis.notice.TEST_REGION_UNREADABLE',
  PARTIAL_REACTION: 'analysis.notice.PARTIAL_REACTION',
  LOW_CONFIDENCE: 'analysis.notice.LOW_CONFIDENCE',
  COLOR_AMBIGUOUS: 'analysis.notice.COLOR_AMBIGUOUS',
  COLOR_NOT_EXPECTED: 'analysis.notice.COLOR_NOT_EXPECTED',
  EXPOSURE_DIM: 'analysis.notice.EXPOSURE_DIM',
  EXPOSURE_BRIGHT: 'analysis.notice.EXPOSURE_BRIGHT',
  CALIBRATION_RESIDUAL_HIGH: 'analysis.notice.CALIBRATION_RESIDUAL_HIGH',
  READ_WINDOW_EXCEEDED: 'analysis.notice.READ_WINDOW_EXCEEDED',
}

export function translateAnalysisNotice(
  notice: AnalysisNotice,
  translate: (key: TKey, params?: Record<string, string | number>) => string,
): string {
  const key = noticeKeys[notice.code] ?? 'analysis.notice.GENERIC'
  if (!noticeKeys[notice.code]) console.warn(`Unknown analysis notice code: ${notice.code}`)
  const params: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(notice)) {
    if (typeof value !== 'string' && typeof value !== 'number') continue
    params[name] = name === 'min' && typeof value === 'number' ? `${Math.round(value * 100)}%` : value
  }
  if (!params.code) params.code = notice.code
  return translate(key, params)
}

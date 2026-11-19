import { AlertTriangle, CheckCircle2, Loader2, XCircle, RefreshCw } from 'lucide-react'
import type { AnalyzeResponse } from '@/types'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { translateAnalysisNotice } from '@/lib/analysis-notices'
import { useI18n } from '@/lib/i18n'
import { localizeBackendCode } from '@/lib/localize-code'
import { formatNumber } from '@/lib/utils'

type Level = 'good' | 'warn' | 'bad'
const levelStyle: Record<Level, { text: string; Icon: typeof CheckCircle2 }> = {
  good: { text: 'text-verified-400', Icon: CheckCircle2 },
  warn: { text: 'text-caution-400', Icon: AlertTriangle },
  bad: { text: 'text-evidence-400', Icon: XCircle },
}

const exposureText: Record<string, [string, Level]> = {
  ok: ['analysis.exposure.good', 'good'],
  dim: ['analysis.exposure.dim', 'warn'],
  bright: ['analysis.exposure.bright', 'warn'],
  dark: ['analysis.exposure.dark', 'bad'],
  clipped: ['analysis.exposure.clipped', 'bad'],
  unknown: ['analysis.exposure.unknown', 'warn'],
}

export function CalibrationPanel({ analysis, loading, error, onRetry }: {
  analysis: AnalyzeResponse | null
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const { t } = useI18n()
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-line-800 bg-ink-800 py-12">
        <Loader2 className="h-7 w-7 animate-spin text-signal-400" />
        <p className="text-sm font-medium text-mist-100">{t('test.capture.analysisLoading')}</p>
      </div>
    )
  }
  if (error || !analysis) {
    return (
      <div className="space-y-3 rounded-xl border border-evidence-500/40 bg-evidence-950 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-evidence-400"><XCircle className="h-4 w-4" /> {t('test.capture.analysisFailed')}</p>
        <p className="text-sm text-mist-300">{error ? localizeBackendCode(error, t) : t('test.capture.analysisNoResult')}</p>
        <Button variant="outline" onClick={onRetry}><RefreshCw className="h-4 w-4" /> {t('test.capture.analysisRetry')}</Button>
      </div>
    )
  }

  const c = analysis.calibration
  const [expKey, expLevel] = exposureText[c.exposure] ?? exposureText.unknown
  const de = c.delta_e_after
  const rows: { label: string; value: string; level: Level }[] = [
    { label: t('test.capture.referenceCardLabel'), value: c.card_found ? t('analysis.cardDetected') : t('analysis.cardNotDetected'), level: c.card_found ? 'good' : 'bad' },
    { label: t('test.capture.exposure'), value: t(expKey), level: expLevel },
    {
      label: t('test.capture.lightCast'),
      value: c.cast === 'unknown' ? '—' : `${c.cast[0].toUpperCase()}${c.cast.slice(1)}${c.cct_k ? ` (≈ ${Math.round(c.cct_k / 100) * 100} K)` : ''}`,
      level: 'good',
    },
    {
      label: t('test.capture.calibrationError'),
      value: de == null ? t('analysis.notCalibrated') : t('test.capture.deltaEAfter', { after: formatNumber(de, 1), before: c.delta_e_before == null ? '—' : formatNumber(c.delta_e_before, 1) }),
      level: de == null ? 'bad' : de < 8 ? 'good' : de < 12 ? 'warn' : 'bad',
    },
  ]
  const [bx, by, bw, bh] = c.bbox ?? [0, 0, 0, 0]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="relative aspect-square overflow-hidden rounded-lg border border-line-700 bg-ink-950">
            <img src={analysis.images.raw} alt={t('test.capture.rawImage')} className="h-full w-full object-cover" />
            {c.bbox && (
              <div
                className="absolute rounded-sm border-2 border-signal-400"
                style={{ left: `${(bx / 224) * 100}%`, top: `${(by / 224) * 100}%`, width: `${(bw / 224) * 100}%`, height: `${(bh / 224) * 100}%` }}
                title={t('test.capture.detectedCard')}
              />
            )}
          </div>
          <p className="mt-1.5 text-center text-xs font-medium text-mist-500">{t('test.capture.rawCardOutlined')}</p>
        </div>
        <div>
          <div className="aspect-square overflow-hidden rounded-lg border border-line-700 bg-ink-950">
            <img src={analysis.images.calibrated} alt={t('test.capture.calibratedImage')} className="h-full w-full object-cover" />
          </div>
          <p className="mt-1.5 text-center text-xs font-medium text-mist-500">{c.card_found ? t('test.capture.calibratedImage') : t('test.capture.notCalibratedImage')}</p>
        </div>
      </div>

      <div className="rounded-lg border border-line-800 bg-ink-700/50 p-4">
        <p className="text-sm font-semibold text-mist-100">{t('test.capture.calibrationTitle')}</p>
        <div className="mt-2 divide-y divide-line-800">
          {rows.map((r) => {
            const st = levelStyle[r.level]
            return (
              <div key={r.label} className="flex items-center justify-between py-2 text-sm">
                <span className="text-mist-500">{r.label}</span>
                <span className={cn('flex items-center gap-1.5 font-medium', st.text)}>
                  <st.Icon className="h-3.5 w-3.5" />
                  {r.value}
                </span>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-mist-700">{t('test.capture.calibrationExplanation')}</p>
      </div>

      <div className="rounded-lg border border-line-800 bg-ink-700/50 p-4 text-sm">
        <p className="font-semibold text-mist-100">{t('test.capture.colourRead')} <span className="text-signal-400">{analysis.reaction_color}</span> <span className="font-normal text-mist-500">({t('test.capture.confidenceReagent', { confidence: formatNumber(analysis.confidence, 1), reagent: analysis.kit.reagent })})</span></p>
        {analysis.reasons.length > 0 && (
          <ul className="mt-2 list-inside list-disc text-xs text-caution-400">{analysis.reasons.map((notice, index) => <li key={`${notice.code}-${index}`}>{translateAnalysisNotice(notice, t)}</li>)}</ul>
        )}
        {analysis.warnings.length > 0 && (
          <ul className="mt-2 list-inside list-disc text-xs text-mist-500">{analysis.warnings.map((notice, index) => <li key={`${notice.code}-${index}`}>{translateAnalysisNotice(notice, t)}</li>)}</ul>
        )}
      </div>

      <p className="rounded-md border border-caution-500/30 bg-ink-900/40 p-3 text-xs text-caution-400">{analysis.model.status} ({analysis.model.name} {analysis.model.version}).</p>
    </div>
  )
}

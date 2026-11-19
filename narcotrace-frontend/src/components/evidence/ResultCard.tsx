import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react'
import type { EvidenceRecord } from '@/types'
import { ConfidenceMeter } from '@/components/ui/ConfidenceMeter'
import { cn, formatNumber } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { translateAnalysisNotice } from '@/lib/analysis-notices'

const verdictStyle = {
  positive: { classes: 'border-evidence-500/40 bg-evidence-950', text: 'text-evidence-400', Icon: AlertTriangle },
  negative: { classes: 'border-verified-500/40 bg-verified-950', text: 'text-verified-400', Icon: CheckCircle2 },
  inconclusive: { classes: 'border-caution-500/40 bg-caution-950', text: 'text-caution-400', Icon: HelpCircle },
}

export function ResultCard({ record }: { record: EvidenceRecord }) {
  const { t } = useI18n()
  if (record.verdict === null || record.confidence === null) {
    return <p className="rounded-md border border-caution-500/30 p-3 text-sm text-caution-400">{t('evidence.notYetAnalysed')}</p>
  }
  const style = verdictStyle[record.verdict]

  return (
    <div className={cn('rounded-xl border p-5', style.classes)}>
      <div className="flex items-center gap-2">
        <style.Icon className={cn('h-6 w-6', style.text)} />
        <p className={cn('text-2xl font-bold tracking-tight', style.text)}>{t(`result.${record.verdict}Caps`)}</p>
      </div>

      <p className="mt-1 text-sm text-mist-300">{record.substance ?? ''}</p>

      <div className="mt-4">
        <ConfidenceMeter value={record.confidence} verdict={record.verdict} />
      </div>

      {record.verdict === 'inconclusive' && record.inconclusiveReasons && (
        <div className="mt-4 rounded-md border border-caution-500/30 bg-ink-900/40 p-3">
          <p className="text-xs font-medium text-caution-400">{t('test.capture.reasons')}</p>
          <ul className="mt-1 list-inside list-disc text-xs text-mist-300">
            {record.inconclusiveReasons.map((r) => (
              <li key={`${r.code}-${JSON.stringify(r)}`}>{translateAnalysisNotice(r, t)}</li>
            ))}
          </ul>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-y-2 border-t border-line-800/70 pt-4 text-xs">
        <Row label={t('result.testKit')} value={record.testKitId} mono />
        <Row label={t('result.reactionDetected')} value={record.reactionColor ?? ''} />
        <Row label={t('result.imageQuality')} value={record.imageQuality ?? ''} />
        {record.analysis && (
          <Row
            label={t('result.calibrationError')}
            value={record.analysis.deltaEAfter != null ? t('test.capture.deltaEAfter', { after: formatNumber(record.analysis.deltaEAfter, 1), before: record.analysis.deltaEBefore == null ? '—' : formatNumber(record.analysis.deltaEBefore, 1) }) : t('result.notCalibrated')}
          />
        )}
        {record.analysis && <Row label={t('result.reagent')} value={record.analysis.reagent} />}
        <Row label={t('result.analysisModel')} value={record.modelVersion ?? ''} mono />
      </dl>

      {record.analysis && (
        <div className="mt-4 space-y-1.5 rounded-md border border-caution-500/30 bg-ink-900/40 p-3 text-xs text-caution-400">
          <p>{record.analysis.modelStatus}.</p>
          {record.analysis.warnings.map((warning, index) => (
            <p key={`${warning.code}-${index}`}>{translateAnalysisNotice(warning, t)}</p>
          ))}
          {!record.analysis.chartVerified && <p>{t('test.capture.colourReadInvalid')}</p>}
          {record.analysis.readWindowS && <p>{t('test.capture.readWindow', { reagent: record.analysis.reagent, seconds: record.analysis.readWindowS })}</p>}
        </div>
      )}

      <p className="mt-4 rounded-md bg-ink-900/50 p-3 text-xs text-mist-500">
        {t('test.capture.screeningDisclaimer')}
      </p>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-mist-700">{label}</dt>
      <dd className={cn('mt-0.5 font-medium text-mist-100', mono && 'font-mono')}>{value}</dd>
    </div>
  )
}

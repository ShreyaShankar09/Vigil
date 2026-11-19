import { cn, formatNumber } from '@/lib/utils'
import type { ResultVerdict } from '@/types'
import { useI18n } from '@/lib/i18n'

export function ConfidenceMeter({ value, verdict }: { value: number; verdict: ResultVerdict }) {
  const { t } = useI18n()
  const barColor =
    verdict === 'positive' ? 'bg-evidence-500' : verdict === 'negative' ? 'bg-verified-500' : 'bg-caution-500'
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-mist-500">{t('result.aiConfidence')}</span>
        <span className="text-sm font-semibold tabular text-mist-100">{formatNumber(value, 1)}%</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-ink-600">
        <div
          className={cn('h-full rounded-full transition-all duration-700 ease-out', barColor)}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}

import { AlertTriangle, Info, ShieldCheck } from 'lucide-react'
import type { AlertItem } from '@/types'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

const sevConfig = {
  high: { classes: 'border-evidence-500/40 bg-evidence-950', Icon: AlertTriangle, iconColor: 'text-evidence-400' },
  medium: { classes: 'border-caution-500/40 bg-caution-950', Icon: Info, iconColor: 'text-caution-400' },
  low: { classes: 'border-verified-500/40 bg-verified-950', Icon: ShieldCheck, iconColor: 'text-verified-400' },
}

export function AlertCard({ alert }: { alert: AlertItem }) {
  const { classes, Icon, iconColor } = sevConfig[alert.severity]
  const { t } = useI18n()
  return (
    <div className={cn('rounded-lg border p-4', classes)}>
      <div className="flex gap-3">
        <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', iconColor)} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-mist-100">{t(`alerts.${alert.title}`)}</p>
          <p className="mt-0.5 text-sm text-mist-300">{t(alert.bodyKey, alert.bodyParams)}</p>
          <p className="mt-1.5 text-xs text-mist-700 tabular">{formatDateTime(alert.timestamp)}</p>
        </div>
      </div>
    </div>
  )
}

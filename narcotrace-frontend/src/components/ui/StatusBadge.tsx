import { cn } from '@/lib/utils'
import type { ResultVerdict, SyncStatus } from '@/types'
import { CheckCircle2, XCircle, HelpCircle, Loader2, CloudOff, Clock } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

const verdictConfig: Record<ResultVerdict, { classes: string; Icon: typeof CheckCircle2 }> = {
  positive: { classes: 'bg-evidence-950 text-evidence-400 border-evidence-500/40', Icon: CheckCircle2 },
  negative: { classes: 'bg-verified-950 text-verified-400 border-verified-500/40', Icon: XCircle },
  inconclusive: { classes: 'bg-caution-950 text-caution-400 border-caution-500/40', Icon: HelpCircle },
}

const syncConfig: Record<SyncStatus, { classes: string; Icon: typeof CheckCircle2 }> = {
  synced: { classes: 'bg-verified-950 text-verified-400 border-verified-500/40', Icon: CheckCircle2 },
  pending: { classes: 'bg-ink-600 text-mist-500 border-line-600', Icon: Clock },
  uploading: { classes: 'bg-signal-500/10 text-signal-400 border-signal-500/40', Icon: Loader2 },
  failed: { classes: 'bg-evidence-950 text-evidence-400 border-evidence-500/40', Icon: CloudOff },
}

export function VerdictBadge({ verdict, className }: { verdict: ResultVerdict; className?: string }) {
  const { classes, Icon } = verdictConfig[verdict]
  const { t } = useI18n()
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium', classes, className)}>
      <Icon className="h-3.5 w-3.5" />
      {t(`result.${verdict}`)}
    </span>
  )
}

export function SyncBadge({ status, className }: { status: SyncStatus; className?: string }) {
  const { classes, Icon } = syncConfig[status]
  const { t } = useI18n()
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium', classes, className)}>
      <Icon className={cn('h-3.5 w-3.5', status === 'uploading' && 'animate-spin')} />
      {t(`result.${status}`)}
    </span>
  )
}

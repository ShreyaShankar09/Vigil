import { CheckCircle2, XCircle } from 'lucide-react'
import type { CustodyEvent } from '@/types'
import { formatTime, formatDate } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

export function ChainOfCustodyTimeline({ events }: { events: CustodyEvent[] }) {
  const { t } = useI18n()
  const knownLabels: Record<string, string> = {
    'Evidence Captured': 'test.capture.evidenceCaptured',
    'Automated Analysis Completed': 'test.capture.analysisCompleted',
  }
  return (
    <ol className="relative ml-3 border-l border-line-700">
      {events.map((event, i) => (
        <li key={event.id} className="relative mb-6 pl-6 last:mb-0">
          <span className="absolute -left-[8.5px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-verified-500 bg-ink-900">
            <span className="h-1.5 w-1.5 rounded-full bg-verified-500" />
          </span>
          <p className="font-mono text-xs tabular text-mist-700">
            {formatDate(event.timestamp)} · {formatTime(event.timestamp)}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-mist-100">{knownLabels[event.label] ? t(knownLabels[event.label]) : event.label}</p>
          <p className="text-xs text-mist-500">
            {event.actor === 'Analysis service' ? t('test.capture.analysisService') : event.actor} · {event.location}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
            <span className={event.gpsVerified ? 'flex items-center gap-1 text-verified-400' : 'flex items-center gap-1 text-mist-700'}>
              {event.gpsVerified ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              GPS {event.gpsVerified ? t('custody.gpsVerified') : t('custody.gpsUnavailable')}
            </span>
            <span className={event.hashVerified ? 'flex items-center gap-1 text-verified-400' : 'flex items-center gap-1 text-mist-700'}>
              {event.hashVerified ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              {t('custody.hashStatus', { status: event.hashVerified ? t('custody.hashVerified') : t('custody.hashPending') })}
            </span>
          </div>
          {i < events.length - 1 && <div className="absolute -left-[1px] top-5 h-full" />}
        </li>
      ))}
    </ol>
  )
}

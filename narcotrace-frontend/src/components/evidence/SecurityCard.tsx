import { CheckCircle2, XCircle } from 'lucide-react'

export function SecurityRow({ label, value, verified }: { label: string; value: string; verified: boolean | null }) {
  return (
    <div className="flex items-center justify-between border-b border-line-800 py-3 last:border-0">
      <span className="text-sm text-mist-300">{label}</span>
      <span className={`flex items-center gap-1.5 text-sm font-medium ${verified === false ? 'text-caution-400' : 'text-verified-400'}`}>
        {verified === false ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        {value}
      </span>
    </div>
  )
}

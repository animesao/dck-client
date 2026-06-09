import { statusColor, statusLabel } from '@/utils'

export function ContainerStatusBadge({ status }: { status: string }) {
  const color = statusColor(status) as 'emerald' | 'red' | 'yellow' | 'gray'

  const colorClasses: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    gray: 'bg-white/5 text-[#8b949e] border-white/10',
  }

  const dotClasses: Record<string, string> = {
    emerald: 'bg-emerald-400 shadow-emerald-400/30',
    red: 'bg-red-400 shadow-red-400/30',
    yellow: 'bg-yellow-400 shadow-yellow-400/30',
    gray: 'bg-[#8b949e]',
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClasses[color]}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full shadow-lg ${dotClasses[color]}`} />
      {statusLabel(status)}
    </span>
  )
}

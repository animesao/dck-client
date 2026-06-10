import { ProgressBar } from '@/components/ui/ProgressBar'
import { Cpu, MemoryStick } from 'lucide-react'

interface ResourceBarProps {
  cpu: number
  memory: number
  memoryUsed?: number
  memoryLimit?: number
  cpuLimit?: number
  running?: boolean
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function ResourceBar({ cpu, memory, memoryUsed, memoryLimit, cpuLimit, running }: ResourceBarProps) {
  const cpuPct = Math.min(100, Math.max(0, cpu))
  const memPct = Math.min(100, Math.max(0, memory))
  const memUsedFormatted = memoryUsed !== undefined ? formatBytes(memoryUsed) : '—'
  const memLimitFormatted = memoryLimit !== undefined && memoryLimit > 0 ? formatBytes(memoryLimit) : 'Unlimited'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="flex items-center gap-1.5 text-[#636d7d] font-medium">
              <Cpu size={13} className={running ? 'text-indigo-400' : 'text-[#636d7d]'} />
              CPU
            </span>
            <span className="font-mono font-semibold text-sm">
              {running ? (
                <span className="text-[#e6edf3]">{cpuPct.toFixed(1)}%</span>
              ) : (
                <span className="text-[#636d7d]">—</span>
              )}
            </span>
          </div>
          {running ? (
            <ProgressBar value={cpuPct} size="sm" />
          ) : (
            <div className="h-2 rounded-full bg-white/[0.04]" />
          )}
          {cpuLimit !== undefined && cpuLimit > 0 && (
            <div className="mt-1 flex justify-end text-[10px] text-[#636d7d] font-mono">
              {cpuLimit} core{cpuLimit !== 1 ? 's' : ''} allocated
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="flex items-center gap-1.5 text-[#636d7d] font-medium">
              <MemoryStick size={13} className={running ? 'text-indigo-400' : 'text-[#636d7d]'} />
              Memory
            </span>
            <span className="font-mono font-semibold text-sm">
              {running ? (
                <span className="text-[#e6edf3]">{memPct.toFixed(1)}%</span>
              ) : (
                <span className="text-[#636d7d]">—</span>
              )}
            </span>
          </div>
          {running ? (
            <ProgressBar value={memPct} size="sm" />
          ) : (
            <div className="h-2 rounded-full bg-white/[0.04]" />
          )}
          <div className="mt-1 flex justify-end text-[10px] text-[#636d7d] font-mono">
            {running ? `${memUsedFormatted} / ` : '— / '}{memLimitFormatted}
          </div>
        </div>
      </div>
    </div>
  )
}
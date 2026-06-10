import { ProgressBar } from '@/components/ui/ProgressBar'
import { Cpu, MemoryStick } from 'lucide-react'

interface ResourceBarProps {
  cpu: number
  memory: number
  memoryUsed?: number
  memoryLimit?: number
  cpuLimit?: number
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function ResourceBar({ cpu, memory, memoryUsed, memoryLimit, cpuLimit }: ResourceBarProps) {
  const cpuPct = Math.min(100, Math.max(0, cpu))
  const memPct = Math.min(100, Math.max(0, memory))
  const memUsedFormatted = memoryUsed !== undefined ? formatBytes(memoryUsed) : '—'
  const memLimitFormatted = memoryLimit !== undefined && memoryLimit > 0 ? formatBytes(memoryLimit) : '—'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="flex items-center gap-1.5 text-[#636d7d] font-medium">
              <Cpu size={13} className="text-indigo-400" />
              CPU
            </span>
            <span className="text-[#e6edf3] font-mono font-semibold text-sm">{cpuPct.toFixed(1)}%</span>
          </div>
          <ProgressBar value={cpuPct} size="sm" />
          {cpuLimit !== undefined && cpuLimit > 0 && (
            <div className="mt-1 flex justify-end text-[10px] text-[#636d7d] font-mono">
              {cpuLimit} core{cpuLimit !== 1 ? 's' : ''} allocated
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="flex items-center gap-1.5 text-[#636d7d] font-medium">
              <MemoryStick size={13} className="text-indigo-400" />
              Memory
            </span>
            <span className="text-[#e6edf3] font-mono font-semibold text-sm">{memPct.toFixed(1)}%</span>
          </div>
          <ProgressBar value={memPct} size="sm" />
          <div className="mt-1 flex justify-end text-[10px] text-[#636d7d] font-mono">
            {memUsedFormatted} / {memLimitFormatted}
          </div>
        </div>
      </div>
    </div>
  )
}
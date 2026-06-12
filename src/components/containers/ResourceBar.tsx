import { ProgressBar } from '@/components/ui/ProgressBar'
import { Cpu, MemoryStick, HardDrive } from 'lucide-react'

interface ResourceBarProps {
  cpu: number
  memory: number
  memoryUsed?: number
  memoryLimit?: number
  cpuLimit?: number
  diskUsed?: number
  diskTotal?: number
  diskPercent?: number
  diskLimit?: number
  running?: boolean
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function ResourceBar({ cpu, memory, memoryUsed, memoryLimit, cpuLimit, diskUsed, diskTotal, diskPercent, diskLimit, running }: ResourceBarProps) {
  const cpuPct = Math.min(100, Math.max(0, cpu))
  const memPct = Math.min(100, Math.max(0, memory))
  const memUsedFormatted = memoryUsed !== undefined ? formatBytes(memoryUsed) : '—'
  const memLimitFormatted = memoryLimit !== undefined && memoryLimit > 0 ? formatBytes(memoryLimit) : 'Unlimited'

  const hasDiskLimit = diskLimit !== undefined && diskLimit > 0
  const diskPct = hasDiskLimit ? Math.min(100, Math.max(0, diskPercent || 0)) : 0
  const diskUsedFormatted = diskUsed !== undefined ? formatBytes(diskUsed) : '—'
  const diskLimitFormatted = hasDiskLimit ? formatBytes(diskLimit) : (diskTotal !== undefined && diskTotal > 0 ? formatBytes(diskTotal) : 'Unlimited')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="flex items-center gap-1.5 text-[#636d7d] font-medium">
              <HardDrive size={13} className={running ? 'text-indigo-400' : 'text-[#636d7d]'} />
              Disk
            </span>
            <span className="font-mono font-semibold text-sm">
              {running && hasDiskLimit ? (
                <span className="text-[#e6edf3]">{diskPct.toFixed(1)}%</span>
              ) : (
                <span className="text-[#636d7d]">—</span>
              )}
            </span>
          </div>
          {running && hasDiskLimit ? (
            <ProgressBar value={diskPct} size="sm" />
          ) : (
            <div className="h-2 rounded-full bg-white/[0.04]" />
          )}
          <div className="mt-1 flex justify-end text-[10px] text-[#636d7d] font-mono">
            {running ? `${diskUsedFormatted} / ` : '— / '}{diskLimitFormatted}
          </div>
        </div>
      </div>
    </div>
  )
}
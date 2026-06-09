import { ProgressBar } from '@/components/ui/ProgressBar'
import { formatBytes } from '@/utils'

interface ResourceBarProps {
  cpu: number
  memory: number
  memoryUsed?: number
  memoryLimit?: number
}

export function ResourceBar({ cpu, memory, memoryUsed, memoryLimit }: ResourceBarProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-[#636d7d] font-medium">CPU</span>
          <span className="text-[#e6edf3] font-mono font-medium">{cpu.toFixed(1)}%</span>
        </div>
        <ProgressBar value={Math.min(100, cpu)} size="sm" />
      </div>
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-[#636d7d] font-medium">Memory</span>
          <span className="text-[#e6edf3] font-mono font-medium">{memory.toFixed(1)}%</span>
        </div>
        <ProgressBar value={Math.min(100, memory)} size="sm" />
        {memoryUsed !== undefined && memoryLimit !== undefined && (
          <div className="mt-1 flex justify-end text-[10px] text-[#636d7d] font-mono">
            {formatBytes(memoryUsed)} / {formatBytes(memoryLimit)}
          </div>
        )}
      </div>
    </div>
  )
}

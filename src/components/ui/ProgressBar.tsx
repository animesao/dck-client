interface ProgressBarProps {
  value: number
  max?: number
  color?: 'emerald' | 'yellow' | 'red' | 'indigo'
  showLabel?: boolean
  size?: 'sm' | 'md'
}

const colors = {
  emerald: 'bg-emerald-400',
  yellow: 'bg-yellow-400',
  red: 'bg-red-400',
  indigo: 'bg-indigo-400',
}

export function ProgressBar({ value, max = 100, color = 'indigo', showLabel = false, size = 'md' }: ProgressBarProps) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const actualColor = pct > 90 ? 'red' : pct > 70 ? 'yellow' : color

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 rounded-full bg-white/5 overflow-hidden ${size === 'sm' ? 'h-1.5' : 'h-2'}`}>
        <div
          className={`${colors[actualColor]} h-full rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-[#8b949e] font-mono min-w-[3rem] text-right">{pct}%</span>
      )}
    </div>
  )
}

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular'
  width?: string | number
  height?: string | number
}

export function Skeleton({ className = '', variant = 'text', width, height }: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-white/[0.06] rounded'
  const variantClasses = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  }

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={{ width, height }}
    />
  )
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-white/[0.04]">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton variant="circular" width={24} height={24} />
          {Array.from({ length: cols }, (_, j) => (
            <Skeleton key={j} className="flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-3">
          <div className="flex items-center gap-4">
            <Skeleton variant="circular" width={40} height={40} />
            <div className="space-y-2">
              <Skeleton width={60} />
              <Skeleton width={40} height={12} />
            </div>
          </div>
          <Skeleton variant="rectangular" height={8} className="w-full" />
        </div>
      ))}
    </div>
  )
}

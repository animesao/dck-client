import { useEffect, useState } from 'react'
import { getDashboardStats } from '@/api/dashboard'
import { useSSE } from '@/hooks/useSSE'
import { useAuth } from '@/hooks/useAuth'
import { Card } from '@/components/ui/Card'
import { PageLoading } from '@/components/ui/Spinner'
import type { DashboardStats } from '@/types'
import {
  Activity,
  HardDrive,
  Globe,
  Box,
} from 'lucide-react'

export function DashboardPage() {
  const { isAuthenticated } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useSSE<any>('/events', (data) => {
    if (data?.containers !== undefined) {
      setStats(data)
    }
  }, isAuthenticated)

  if (loading) return <PageLoading />

  const runningCount = stats?.containers?.running || 0
  const stoppedCount = stats?.containers?.stopped || 0

  return (
    <div className="space-y-6 page-enter">
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Dashboard</h1>
        <p className="text-[#636d7d] text-sm mt-1">System overview and container status</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
        <Card className="card-gradient">
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center border border-emerald-500/10 shrink-0">
                <Activity size={18} className="text-emerald-400 sm:w-[22px] sm:h-[22px]" />
              </div>
              <div>
                <p className="stat-value text-emerald-400 text-xl sm:text-2xl">{runningCount}</p>
                <p className="text-[10px] sm:text-xs text-[#636d7d] font-medium">Running</p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="card-gradient">
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/10 flex items-center justify-center border border-red-500/10 shrink-0">
                <Box size={18} className="text-red-400 sm:w-[22px] sm:h-[22px]" />
              </div>
              <div>
                <p className="stat-value text-red-400 text-xl sm:text-2xl">{stoppedCount}</p>
                <p className="text-[10px] sm:text-xs text-[#636d7d] font-medium">Stopped</p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="card-gradient">
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 flex items-center justify-center border border-indigo-500/10 shrink-0">
                <HardDrive size={18} className="text-indigo-400 sm:w-[22px] sm:h-[22px]" />
              </div>
              <div>
                <p className="stat-value text-indigo-400 text-xl sm:text-2xl">{stats?.images || 0}</p>
                <p className="text-[10px] sm:text-xs text-[#636d7d] font-medium">Images</p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="card-gradient">
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center border border-blue-500/10 shrink-0">
                <Globe size={18} className="text-blue-400 sm:w-[22px] sm:h-[22px]" />
              </div>
              <div>
                <p className="stat-value text-blue-400 text-xl sm:text-2xl">{stats?.containers?.total || 0}</p>
                <p className="text-[10px] sm:text-xs text-[#636d7d] font-medium">Total</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

    </div>
  )
}

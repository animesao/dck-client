import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { getDashboardStats } from '@/api/dashboard'
import { listContainers } from '@/api/containers'
import { Card, CardContent } from '@/components/ui/Card'
import { PageLoading } from '@/components/ui/Spinner'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ContainerStatusBadge } from '@/components/containers/ContainerStatusBadge'
import { formatBytes } from '@/utils'
import type { DashboardStats, Container as ContainerType } from '@/types'
import { Activity, ContainerIcon, HardDrive, Cpu, Server, Users, Shield } from 'lucide-react'

export function AdminDashboardPage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [allContainers, setAllContainers] = useState<ContainerType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAdmin) { navigate('/dashboard'); return }
    Promise.all([getDashboardStats(), listContainers(true)])
      .then(([s, c]) => { setStats(s); setAllContainers(c) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageLoading />

  return (
    <div className="space-y-6 page-enter">
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Admin Dashboard</h1>
        <p className="text-[#636d7d] text-sm mt-1">System-wide overview and management</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="card-gradient">
          <div className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 flex items-center justify-center border border-indigo-500/10">
                <Users size={22} className="text-indigo-400" />
              </div>
              <div>
                <p className="stat-value text-indigo-400">-</p>
                <p className="text-xs text-[#636d7d] font-medium">Users</p>
              </div>
            </div>
          </div>
        </Card>
        <Card className="card-gradient">
          <div className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center border border-emerald-500/10">
                <Activity size={22} className="text-emerald-400" />
              </div>
              <div>
                <p className="stat-value text-emerald-400">{allContainers.filter(c => c.status === 'running').length}</p>
                <p className="text-xs text-[#636d7d] font-medium">Running</p>
              </div>
            </div>
          </div>
        </Card>
        <Card className="card-gradient">
          <div className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/10 flex items-center justify-center border border-red-500/10">
                <ContainerIcon size={22} className="text-red-400" />
              </div>
              <div>
                <p className="stat-value text-red-400">{allContainers.filter(c => c.status !== 'running').length}</p>
                <p className="text-xs text-[#636d7d] font-medium">Stopped</p>
              </div>
            </div>
          </div>
        </Card>
        <Card className="card-gradient">
          <div className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center border border-blue-500/10">
                <HardDrive size={22} className="text-blue-400" />
              </div>
              <div>
                <p className="stat-value text-blue-400">{allContainers.length}</p>
                <p className="text-xs text-[#636d7d] font-medium">Total</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Cpu size={16} className="text-indigo-400" />
              <h3 className="text-sm font-semibold text-[#e6edf3]">CPU Usage</h3>
            </div>
            <ProgressBar value={stats?.cpu_percent || 0} showLabel />
          </div>
        </Card>
        <Card>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Server size={16} className="text-indigo-400" />
              <h3 className="text-sm font-semibold text-[#e6edf3]">Memory Usage</h3>
            </div>
            <ProgressBar value={stats?.memory_used || 0} max={stats?.memory_total || 1} showLabel />
            <div className="mt-2 text-xs text-[#636d7d]">{formatBytes(stats?.memory_used || 0)} / {formatBytes(stats?.memory_total || 0)}</div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="px-5 py-4 border-b border-white/[0.05]">
          <h3 className="text-sm font-semibold text-[#e6edf3]">All Containers</h3>
        </div>
        {allContainers.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#636d7d]">No containers</div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {allContainers.slice(0, 10).map(c => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                <ContainerStatusBadge status={c.status} />
                <span className="text-sm text-[#e6edf3] font-medium flex-1">{c.name || c.id.slice(0, 12)}</span>
                <span className="text-xs text-[#636d7d] hidden sm:inline">{c.image}</span>
                <span className="text-xs font-mono text-[#636d7d]">{c.ip || '-'}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

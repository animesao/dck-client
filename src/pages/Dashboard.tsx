import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDashboardStats } from '@/api/dashboard'
import { useSSE } from '@/hooks/useSSE'
import { useAuth } from '@/hooks/useAuth'
import { Card } from '@/components/ui/Card'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { ContainerStatusBadge } from '@/components/containers/ContainerStatusBadge'
import type { DashboardStats } from '@/types'
import { formatBytes } from '@/utils'
import {
  HardDrive, Container, ExternalLink,
  Globe, Shield, Infinity, Cpu, Database,
} from 'lucide-react'

export function DashboardPage() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
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

  if (loading) return (
    <div className="space-y-6 page-enter">
      <SkeletonTitle />
      <CardSkeleton count={4} />
    </div>
  )

  return (
    <div className="space-y-6 page-enter">
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Dashboard</h1>
      </div>


      {/* My Limits */}
      {stats?.user_limits && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Shield size={16} className="text-indigo-400" />
            <h3 className="text-sm font-semibold text-[#e6edf3]">My Limits</h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'Containers',
                used: stats.user_limits.container_count,
                limit: stats.user_limits.container_limit,
                icon: Container,
                color: 'indigo',
                gradient: 'from-indigo-500/20 to-indigo-600/10',
                border: 'border-indigo-500/10',
              },
              {
                label: 'Memory',
                used: stats.user_limits.memory_used_mb,
                limit: stats.user_limits.memory_limit,
                suffix: 'MB',
                icon: HardDrive,
                color: 'emerald',
                gradient: 'from-emerald-500/20 to-emerald-600/10',
                border: 'border-emerald-500/10',
              },
              {
                label: 'CPU',
                used: stats.user_limits.cpu_used,
                limit: stats.user_limits.cpu_limit,
                icon: Cpu,
                color: 'amber',
                gradient: 'from-amber-500/20 to-amber-600/10',
                border: 'border-amber-500/10',
              },
              {
                label: 'Disk',
                used: stats.user_limits.disk_used,
                limit: stats.user_limits.disk_limit,
                icon: Database,
                color: 'purple',
                gradient: 'from-purple-500/20 to-purple-600/10',
                border: 'border-purple-500/10',
                suffix: 'B',
              },
              {
                label: 'Ports',
                used: stats.user_limits.port_count,
                limit: stats.user_limits.port_limit,
                icon: Globe,
                color: 'blue',
                gradient: 'from-blue-500/20 to-blue-600/10',
                border: 'border-blue-500/10',
              },
            ].map(item => {
              const Icon = item.icon
              const isUnlimited = item.limit === -1
              const overLimit = item.limit > 0 && item.used > item.limit
              const pct = item.limit > 0 ? Math.min((item.used / item.limit) * 100, 100) : 0
              const usedDisplay = item.label === 'Disk' ? formatBytes(item.used) : (item.used + (item.suffix || ''))
              return (
                <Card key={item.label} className="card-gradient">
                  <div className="p-5">
                    <div className="flex items-center gap-4 mb-3">
                      <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center border ${item.border}`}>
                        <Icon size={18} className={`text-${item.color}-400`} />
                      </div>
                      <div>
                        <p className={`text-xl font-bold ${overLimit ? 'text-red-400' : `text-${item.color}-400`}`}>
                          {item.label === 'CPU' ? item.used.toFixed(1) : usedDisplay}
                        </p>
                        <p className="text-xs text-[#636d7d] font-medium">{item.label}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-[#636d7d]">Limit</span>
                      <span className="text-[#8b949e] font-mono">
                        {isUnlimited ? <Infinity size={12} className="inline" /> : (item.label === 'Disk' ? formatBytes(item.limit) : item.limit + (item.suffix || ''))}
                      </span>
                    </div>
                    {item.limit > 0 && (
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : `bg-${item.color}-500`
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                    {overLimit && (
                      <p className="text-[10px] text-red-400 mt-1">Over limit!</p>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Running Containers */}
      <Card>
        <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Container size={16} className="text-indigo-400" />
            <h3 className="text-sm font-semibold text-[#e6edf3]">Running Containers</h3>
          </div>
          <button onClick={() => navigate('/containers')} className="btn-ghost btn-sm">
            View All <ExternalLink size={13} />
          </button>
        </div>
        {stats?.containers_list?.filter(c => c.status === 'running').length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.03] flex items-center justify-center mx-auto mb-3">
              <Container size={24} className="text-[#636d7d]" />
            </div>
            <p className="text-sm text-[#636d7d]">No running containers</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {stats?.containers_list
              ?.filter(c => c.status === 'running')
              ?.slice(0, 5)
              .map(c => (
                <div
                  key={c.id}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] cursor-pointer transition-colors group"
                  onClick={() => navigate(`/containers/${c.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <ContainerStatusBadge status={c.status} />
                    <div>
                      <p className="text-sm font-medium text-[#e6edf3] group-hover:text-indigo-300 transition-colors">
                        {c.name || c.id.slice(0, 12)}
                      </p>
                      <p className="text-xs text-[#636d7d]">{c.image}</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-[#636d7d]">{window.location.hostname}</span>
                </div>
              ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function SkeletonTitle() {
  return (
    <div>
      <div className="h-8 w-48 bg-white/[0.06] rounded animate-pulse mb-1" />
      <div className="h-4 w-32 bg-white/[0.06] rounded animate-pulse" />
    </div>
  )
}
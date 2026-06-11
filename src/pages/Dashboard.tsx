import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDashboardStats } from '@/api/dashboard'
import { useSSE } from '@/hooks/useSSE'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { PageLoading } from '@/components/ui/Spinner'
import { ContainerStatusBadge } from '@/components/containers/ContainerStatusBadge'
import { formatBytes } from '@/utils'
import type { DashboardStats } from '@/types'
import {
  Activity,
  HardDrive,
  Container,
  ExternalLink,
  Globe,
  Box,
  Shield,
  Infinity,
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

  if (loading) return <PageLoading />

  return (
    <div className="space-y-6 page-enter">
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Dashboard</h1>
      </div>

      {/* My Limits */}
      {stats?.user_limits && (
        <Card>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield size={16} className="text-indigo-400" />
              <h3 className="text-sm font-semibold text-[#e6edf3]">My Limits</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  label: 'Containers',
                  used: stats.user_limits.container_count,
                  limit: stats.user_limits.container_limit,
                  usedStr: String(stats.user_limits.container_count),
                  limitStr: stats.user_limits.container_limit === -1 ? <Infinity size={14} className="inline" /> : String(stats.user_limits.container_limit),
                },
                {
                  label: 'Memory',
                  used: stats.user_limits.memory_used_mb,
                  limit: stats.user_limits.memory_limit,
                  usedStr: `${stats.user_limits.memory_used_mb}MB`,
                  limitStr: stats.user_limits.memory_limit === -1 ? <Infinity size={14} /> : `${stats.user_limits.memory_limit}MB`,
                },
                {
                  label: 'CPU',
                  used: stats.user_limits.cpu_used,
                  limit: stats.user_limits.cpu_limit,
                  usedStr: stats.user_limits.cpu_used.toFixed(1),
                  limitStr: stats.user_limits.cpu_limit === -1 ? <Infinity size={14} /> : String(stats.user_limits.cpu_limit),
                },
                {
                  label: 'Ports per Container',
                  used: 0,
                  limit: stats.user_limits.port_limit,
                  usedStr: '—',
                  limitStr: stats.user_limits.port_limit === -1 ? <Infinity size={14} className="inline" /> : String(stats.user_limits.port_limit),
                },
              ].map(item => {
                const overLimit = item.limit > 0 && item.used > item.limit
                const pct = item.limit > 0 ? Math.min((item.used / item.limit) * 100, 100) : 0
                return (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#636d7d]">{item.label}</span>
                      <span className={`font-medium ${overLimit ? 'text-red-400' : 'text-[#e6edf3]'}`}>
                        {item.usedStr} / {item.limitStr}
                      </span>
                    </div>
                    {item.limit > 0 && (
                      <ProgressBar
                        value={pct}
                        max={100}
                        size="sm"
                      />
                    )}
                    {overLimit && (
                      <p className="text-[10px] text-red-400">Over limit!</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </Card>
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

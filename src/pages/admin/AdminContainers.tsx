import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listContainers, removeContainer, startContainer, stopContainer, restartContainer } from '@/api/containers'
import { useUIStore } from '@/store/uiStore'
import { useAuth } from '@/hooks/useAuth'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageLoading } from '@/components/ui/Spinner'
import { ContainerStatusBadge } from '@/components/containers/ContainerStatusBadge'
import type { Container } from '@/types'
import { Container as ContainerIcon, Play, Square, RotateCcw, Trash2, Search, ExternalLink, Users } from 'lucide-react'

export function AdminContainersPage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const addToast = useUIStore(s => s.addToast)
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      const data = await listContainers(true)
      setContainers(data)
    } catch {
      addToast('Failed to load containers', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (isAdmin) fetchData() }, [])

  const handleAction = async (id: string, action: 'start' | 'stop' | 'restart' | 'delete') => {
    setActionLoading(id)
    try {
      if (action === 'start') { await startContainer(id); addToast('Container started', 'success') }
      else if (action === 'stop') { await stopContainer(id); addToast('Container stopped', 'success') }
      else if (action === 'restart') { await restartContainer(id); addToast('Container restarted', 'success') }
      else if (action === 'delete') { await removeContainer(id, true); addToast('Container removed', 'success') }
      fetchData()
    } catch (err: any) {
      addToast(err.message || 'Action failed', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const filtered = containers.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.id?.toLowerCase().includes(search.toLowerCase()) ||
    c.image?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <PageLoading />

  return (
    <div className="space-y-6 page-enter">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Containers</h1>
          <p className="text-[#636d7d] text-sm mt-1">{containers.length} total · {containers.filter(c => c.status === 'running').length} running</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636d7d]" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search containers..."
              className="pl-8 w-64"
            />
          </div>
        </div>
      </div>

      <Card>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#636d7d]">No containers found</div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            <div className="flex items-center gap-3 px-5 py-2 text-xs text-[#636d7d] font-medium">
              <span className="w-20" />
              <span className="flex-1">Name</span>
              <span className="w-32 hidden md:inline">Image</span>
              <span className="w-24 text-center hidden md:inline">Status</span>
              <span className="w-24 text-center hidden lg:inline">User</span>
              <span className="w-24 text-center hidden lg:inline">Ports</span>
              <span className="w-32 text-right">Actions</span>
            </div>
            {filtered.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 flex items-center justify-center border border-indigo-500/10 shrink-0">
                  <ContainerIcon size={14} className="text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#e6edf3] font-medium truncate">{c.name || c.id.slice(0, 12)}</p>
                  <p className="text-[10px] text-[#636d7d] font-mono truncate">{c.id.slice(0, 19)}</p>
                </div>
                <span className="text-xs text-[#636d7d] w-32 hidden md:inline truncate">{c.image}</span>
                <div className="w-24 text-center hidden md:block">
                  <ContainerStatusBadge status={c.status} />
                </div>
                <span className="text-xs text-[#636d7d] w-24 text-center hidden lg:inline">{c.user_id?.slice(0, 8) || '-'}</span>
                <span className="text-xs text-[#636d7d] w-24 text-center hidden lg:inline">
                  {c.ports?.length ? c.ports.map(p => `${p.host}:${p.container}`).join(', ') : '-'}
                </span>
                <div className="flex items-center gap-1 w-32 justify-end shrink-0">
                  <button
                    onClick={() => navigate(`/containers/${c.id}`)}
                    className="p-1.5 rounded hover:bg-white/[0.06] text-[#8b949e] hover:text-indigo-400"
                    title="View"
                  >
                    <ExternalLink size={13} />
                  </button>
                  {c.status === 'running' ? (
                    <button
                      onClick={() => handleAction(c.id, 'stop')}
                      disabled={actionLoading === c.id}
                      className="p-1.5 rounded hover:bg-amber-500/20 text-[#8b949e] hover:text-amber-400"
                      title="Stop"
                    >
                      <Square size={13} />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAction(c.id, 'start')}
                      disabled={actionLoading === c.id}
                      className="p-1.5 rounded hover:bg-emerald-500/20 text-[#8b949e] hover:text-emerald-400"
                      title="Start"
                    >
                      <Play size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => handleAction(c.id, 'restart')}
                    disabled={actionLoading === c.id}
                    className="p-1.5 rounded hover:bg-blue-500/20 text-[#8b949e] hover:text-blue-400"
                    title="Restart"
                  >
                    <RotateCcw size={13} />
                  </button>
                  <button
                    onClick={() => handleAction(c.id, 'delete')}
                    disabled={actionLoading === c.id}
                    className="p-1.5 rounded hover:bg-red-500/20 text-[#8b949e] hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

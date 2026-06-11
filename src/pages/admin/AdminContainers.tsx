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
import { CreateContainerModal } from '@/components/containers/CreateContainerModal'
import type { Container } from '@/types'
import { Play, Square, RotateCcw, Trash2, Search, ExternalLink, Plus } from 'lucide-react'

export function AdminContainersPage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const addToast = useUIStore(s => s.addToast)
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

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
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> Create
          </Button>
        </div>
      </div>

      <Card>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#636d7d]">No containers found</div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="w-full hidden md:table">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#636d7d] font-medium">
                    <span className="hidden lg:inline">Status</span>
                    <span className="lg:hidden">S</span>
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#636d7d] font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#636d7d] font-medium hidden lg:table-cell">Image</th>
                  <th className="text-center px-4 py-3 text-[11px] uppercase tracking-wider text-[#636d7d] font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-4 py-3.5">
                      <ContainerStatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3.5 cursor-pointer" onClick={() => navigate(`/containers/${c.id}`)}>
                      <p className="text-sm font-medium text-[#e6edf3] truncate max-w-[200px]">{c.name || c.id.slice(0, 12)}</p>
                      <p className="text-[10px] text-[#636d7d] font-mono">{c.id.slice(0, 19)}</p>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-[#636d7d] hidden lg:table-cell">{c.image}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => navigate(`/containers/${c.id}`)} className="p-1.5 rounded hover:bg-white/[0.06] text-[#8b949e] hover:text-indigo-400" title="View">
                          <ExternalLink size={13} />
                        </button>
                        {c.status === 'running' ? (
                          <button onClick={() => handleAction(c.id, 'stop')} disabled={actionLoading === c.id} className="p-1.5 rounded hover:bg-amber-500/20 text-[#8b949e] hover:text-amber-400" title="Stop">
                            <Square size={13} />
                          </button>
                        ) : (
                          <button onClick={() => handleAction(c.id, 'start')} disabled={actionLoading === c.id} className="p-1.5 rounded hover:bg-emerald-500/20 text-[#8b949e] hover:text-emerald-400" title="Start">
                            <Play size={13} />
                          </button>
                        )}
                        <button onClick={() => handleAction(c.id, 'restart')} disabled={actionLoading === c.id} className="p-1.5 rounded hover:bg-blue-500/20 text-[#8b949e] hover:text-blue-400" title="Restart">
                          <RotateCcw size={13} />
                        </button>
                        <button onClick={() => handleAction(c.id, 'delete')} disabled={actionLoading === c.id} className="p-1.5 rounded hover:bg-red-500/20 text-[#8b949e] hover:text-red-400" title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="divide-y divide-white/[0.04] md:hidden">
              {filtered.map(c => (
                <div key={c.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2" onClick={() => navigate(`/containers/${c.id}`)}>
                      <ContainerStatusBadge status={c.status} />
                      <span className="text-sm font-medium text-[#e6edf3]">{c.name || c.id.slice(0, 12)}</span>
                    </div>
                    <button onClick={() => navigate(`/containers/${c.id}`)} className="p-1 rounded hover:bg-white/[0.06] text-[#8b949e]">
                      <ExternalLink size={13} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#636d7d]">
                    <span className="truncate max-w-[120px]">{c.image}</span>
                    {c.ports?.length ? <span>· {c.ports.map(p => `${p.host}:${p.container}`).join(', ')}</span> : null}
                  </div>
                  <div className="flex gap-1">
                    {c.status === 'running' ? (
                      <button onClick={() => handleAction(c.id, 'stop')} disabled={actionLoading === c.id} className="btn-ghost p-1 text-xs">Stop</button>
                    ) : (
                      <button onClick={() => handleAction(c.id, 'start')} disabled={actionLoading === c.id} className="btn-ghost p-1 text-xs">Start</button>
                    )}
                    <button onClick={() => handleAction(c.id, 'restart')} disabled={actionLoading === c.id} className="btn-ghost p-1 text-xs">Restart</button>
                    <button onClick={() => handleAction(c.id, 'delete')} disabled={actionLoading === c.id} className="btn-ghost p-1 text-xs text-red-400">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <CreateContainerModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => { setCreateOpen(false); fetchData() }}
      />
    </div>
  )
}

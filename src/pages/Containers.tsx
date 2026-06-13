import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listContainers, removeContainer, stopContainer, startContainer, restartContainer } from '@/api/containers'
import { useSSE } from '@/hooks/useSSE'
import { useUIStore } from '@/store/uiStore'
import { useAuth } from '@/hooks/useAuth'
import { getPublicSettings } from '@/api/settings'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Pagination } from '@/components/ui/Pagination'
import { ContainerStatusBadge } from '@/components/containers/ContainerStatusBadge'
import { CreateContainerModal } from '@/components/containers/CreateContainerModal'
import { formatRelativeTime, truncate } from '@/utils'
import type { Container } from '@/types'
import {
  Plus,
  Play,
  Square,
  RotateCcw,
  Trash2,
  Search,
  Eye,
  Container as ContainerIcon,
  RefreshCw,
} from 'lucide-react'

export function ContainersPage() {
  const navigate = useNavigate()
  const addToast = useUIStore(s => s.addToast)
  const { isAdmin } = useAuth()
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [canCreate, setCanCreate] = useState(true)
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: 'stop' | 'delete' } | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 20

  const fetchContainers = async () => {
    try {
      const data = await listContainers(showAll)
      setContainers(data)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      addToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchContainers() }, [showAll])

  useEffect(() => {
    if (!isAdmin) {
      getPublicSettings().then(s => setCanCreate(s.allow_user_containers)).catch(() => {})
    }
  }, [isAdmin])

  useSSE<any>('/events', (data) => {
    if (Array.isArray(data)) {
      setContainers(data)
    } else if (data?.type === 'containers' && Array.isArray(data.data)) {
      setContainers(data.data)
    }
  })

  const handleAction = async (id: string, action: 'start' | 'stop' | 'restart' | 'delete') => {
    if (action === 'stop' || action === 'delete') {
      setConfirmAction({ id, action })
      return
    }
    await execAction(id, action)
  }

  const execAction = async (id: string, action: 'start' | 'stop' | 'restart' | 'delete') => {
    setActionLoading(id)
    try {
      if (action === 'start') { await startContainer(id); addToast('Container started', 'success') }
      else if (action === 'stop') { await stopContainer(id); addToast('Container stopped', 'success') }
      else if (action === 'restart') { await restartContainer(id); addToast('Container restarted', 'success') }
      else if (action === 'delete') { await removeContainer(id, true); addToast('Container removed', 'success') }
      fetchContainers()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      addToast(message || `Failed to ${action}`, 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleConfirmAction = () => {
    if (!confirmAction) return
    execAction(confirmAction.id, confirmAction.action)
    setConfirmAction(null)
  }

  const filtered = containers.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.id?.toLowerCase().includes(search.toLowerCase()) ||
    c.image?.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => { setPage(1) }, [search])

  if (loading) return <TableSkeleton rows={6} cols={4} />

  return (
    <div className="space-y-5 page-enter">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Containers</h1>
          <p className="text-[#636d7d] text-sm mt-1">Manage your containers</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchContainers} className="btn-ghost p-2" title="Refresh">
            <RefreshCw size={16} />
          </button>
          <Button onClick={() => setCreateOpen(true)} disabled={!canCreate} title={!canCreate ? 'Container creation is disabled' : ''}>
            <Plus size={16} /> Create Container
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#636d7d]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search containers..."
            className="input pl-9"
          />
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer select-none px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors">
          <input
            type="checkbox"
            checked={showAll}
            onChange={e => setShowAll(e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-white/5 accent-indigo-500"
          />
          <span className="text-sm text-[#8b949e]">Show stopped</span>
        </label>
      </div>

      {/* Container list */}
      <Card>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
                <ContainerIcon size={28} className="text-[#636d7d]" />
              </div>
              <p className="text-sm text-[#636d7d]">No containers found</p>
              {canCreate ? (
                <Button variant="secondary" size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
                  Create your first container
                </Button>
              ) : (
                <p className="text-xs text-[#636d7d] mt-4">Container creation is disabled</p>
              )}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <table className="w-full hidden md:table">
                <thead>
                  <tr className="border-b border-white/[0.05]">
                    <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#636d7d] font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#636d7d] font-medium">Name / Image</th>
                    <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#636d7d] font-medium hidden md:table-cell">IP</th>
                    <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#636d7d] font-medium hidden md:table-cell">Created</th>
                    <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-[#636d7d] font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {paginated.map(c => (
                    <tr key={c.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-4 py-3.5">
                        <ContainerStatusBadge status={c.status} />
                      </td>
                      <td
                        className="px-4 py-3.5 cursor-pointer"
                        onClick={() => navigate(`/containers/${c.id}`)}
                      >
                        <p className="text-sm font-medium text-[#e6edf3] group-hover:text-indigo-300 transition-colors">
                          {c.name || truncate(c.id, 12)}
                        </p>
                        <p className="text-xs text-[#636d7d]">{c.image}</p>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-[#636d7d] font-mono hidden md:table-cell">
                        {window.location.hostname}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-[#636d7d] hidden md:table-cell">
                        {formatRelativeTime(c.created)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-0.5">
                          {c.status === 'running' ? (
                            <button onClick={() => handleAction(c.id, 'stop')} className="btn-ghost p-1.5" title="Stop" disabled={actionLoading === c.id}>
                              {actionLoading === c.id ? <Spinner className="h-3.5 w-3.5" /> : <Square size={14} />}
                            </button>
                          ) : (
                            <button onClick={() => handleAction(c.id, 'start')} className="btn-ghost p-1.5" title="Start" disabled={actionLoading === c.id}>
                              {actionLoading === c.id ? <Spinner className="h-3.5 w-3.5" /> : <Play size={14} />}
                            </button>
                          )}
                          <button onClick={() => handleAction(c.id, 'restart')} className="btn-ghost p-1.5" title="Restart">
                            <RotateCcw size={14} />
                          </button>
                          <button onClick={() => navigate(`/containers/${c.id}`)} className="btn-ghost p-1.5" title="Details">
                            <Eye size={14} />
                          </button>
                          <button onClick={() => handleAction(c.id, 'delete')} className="btn-ghost p-1.5 text-red-400 hover:text-red-300" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile cards */}
              <div className="divide-y divide-white/[0.04] md:hidden">
                {paginated.map(c => (
                  <div key={c.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2" onClick={() => navigate(`/containers/${c.id}`)}>
                        <ContainerStatusBadge status={c.status} />
                        <span className="text-sm font-medium text-[#e6edf3]">{c.name || truncate(c.id, 12)}</span>
                      </div>
                      <div className="flex gap-1">
                        {c.status === 'running' ? (
                          <button onClick={() => handleAction(c.id, 'stop')} disabled={actionLoading === c.id} className="btn-ghost p-1">
                            {actionLoading === c.id ? <Spinner className="h-3.5 w-3.5" /> : <Square size={14} />}
                          </button>
                        ) : (
                          <button onClick={() => handleAction(c.id, 'start')} disabled={actionLoading === c.id} className="btn-ghost p-1">
                            {actionLoading === c.id ? <Spinner className="h-3.5 w-3.5" /> : <Play size={14} />}
                          </button>
                        )}
                        <button onClick={() => handleAction(c.id, 'restart')} className="btn-ghost p-1">
                          <RotateCcw size={14} />
                        </button>
                        <button onClick={() => navigate(`/containers/${c.id}`)} className="btn-ghost p-1">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => handleAction(c.id, 'delete')} className="btn-ghost p-1 text-red-400">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#636d7d]">
                      <span>{c.image}</span>
                      <span>·</span>
                      <span className="font-mono">{window.location.hostname}</span>
                      <span>·</span>
                      <span>{formatRelativeTime(c.created)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Card>

      {filtered.length > 0 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      )}

      <ConfirmDialog
        open={!!confirmAction}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
        title={confirmAction?.action === 'delete' ? 'Delete Container' : 'Stop Container'}
        message={
          confirmAction?.action === 'delete'
            ? 'This will permanently remove the container and all its data. This action cannot be undone.'
            : 'This will stop the running container. Any unsaved data may be lost.'
        }
        confirmLabel={confirmAction?.action === 'delete' ? 'Delete' : 'Stop'}
      />

      <CreateContainerModal open={createOpen} onClose={() => setCreateOpen(false)} onSuccess={fetchContainers} />
    </div>
  )
}

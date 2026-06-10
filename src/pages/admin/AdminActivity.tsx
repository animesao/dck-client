import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useUIStore } from '@/store/uiStore'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { PageLoading } from '@/components/ui/Spinner'
import { formatDate } from '@/utils'
import { api } from '@/api/client'
import type { ActivityLog } from '@/types'
import { Search, RotateCw } from 'lucide-react'

function formatAction(action: string): string {
  const map: Record<string, string> = {
    container_created: 'Created container',
    container_started: 'Started container',
    container_stopped: 'Stopped container',
    container_restarted: 'Restarted container',
    container_removed: 'Removed container',
    collaborator_added: 'Added collaborator',
    collaborator_removed: 'Removed collaborator',
    file_uploaded: 'Uploaded file',
    file_deleted: 'Deleted file',
    file_renamed: 'Renamed file',
    backup_created: 'Created backup',
    backup_restored: 'Restored backup',
    backup_deleted: 'Deleted backup',
    login: 'Logged in',
    password_changed: 'Changed password',
  }
  return map[action] || action.replace(/_/g, ' ')
}

export function AdminActivityPage() {
  const { isAdmin } = useAuth()
  const addToast = useUIStore(s => s.addToast)
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const fetchLogs = async () => {
    try {
      const data = await api<ActivityLog[]>('GET', '/admin/activity?limit=200')
      setLogs(data)
    } catch {
      addToast('Failed to load activity logs', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (isAdmin) fetchLogs() }, [])

  const filtered = logs.filter(l =>
    l.username?.toLowerCase().includes(search.toLowerCase()) ||
    l.action?.toLowerCase().includes(search.toLowerCase()) ||
    l.details?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <PageLoading />

  return (
    <div className="space-y-6 page-enter">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Activity Logs</h1>
          <p className="text-[#636d7d] text-sm mt-1">System-wide action history ({logs.length} entries)</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636d7d]" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search logs..."
              className="pl-8 w-64"
            />
          </div>
          <button onClick={fetchLogs} className="p-2 rounded-lg hover:bg-white/[0.05] text-[#8b949e] hover:text-[#e6edf3]">
            <RotateCw size={16} />
          </button>
        </div>
      </div>

      <Card>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#636d7d]">No activity recorded</div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {filtered.map(l => (
              <div key={l.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                <div className="w-2 h-2 rounded-full bg-indigo-400 mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[#e6edf3]">{l.username}</span>
                    <span className="text-xs text-[#636d7d]">{formatAction(l.action)}</span>
                    {l.container_id && (
                      <span className="text-[10px] font-mono text-[#636d7d] bg-white/[0.03] px-1.5 py-0.5 rounded">
                        container: {l.container_id.slice(0, 12)}
                      </span>
                    )}
                  </div>
                  {l.details && (
                    <p className="text-xs text-[#636d7d] mt-0.5">{l.details}</p>
                  )}
                  <p className="text-[10px] text-[#484f58] mt-1">{formatDate(l.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

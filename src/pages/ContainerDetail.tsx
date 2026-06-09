import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getContainer, getContainerLogs, getContainerState,
  getContainerStats, execContainer, removeContainer,
  startContainer, stopContainer, restartContainer,
} from '@/api/containers'
import { listFiles, listBackups, createBackup, deleteBackup } from '@/api/files'
import { useUIStore } from '@/store/uiStore'
import { Card, CardContent } from '@/components/ui/Card'
import { Tabs } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageLoading } from '@/components/ui/Spinner'
import { ContainerStatusBadge } from '@/components/containers/ContainerStatusBadge'
import { ContainerConsole } from '@/components/containers/ContainerConsole'
import { ResourceBar } from '@/components/containers/ResourceBar'
import { formatDate } from '@/utils'
import type { Container, ContainerStats } from '@/types'
import type { FileEntry, BackupEntry } from '@/api/files'
import { Play, Square, RotateCcw, Trash2, ArrowLeft, Terminal, Info, FileText, Activity, Cpu, Wrench, Folder, Archive, ExternalLink, File } from 'lucide-react'

export function ContainerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const addToast = useUIStore(s => s.addToast)
  const [container, setContainer] = useState<Container | null>(null)
  const [stats, setStats] = useState<ContainerStats | null>(null)
  const [logs, setLogs] = useState('')
  const [state, setState] = useState('')
  const [execCmd, setExecCmd] = useState('')
  const [execOutput, setExecOutput] = useState('')
  const [activeTab, setActiveTab] = useState('info')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  const fetchData = async () => {
    if (!id) return
    try {
      const [c, s] = await Promise.all([
        getContainer(id),
        getContainerStats(id).catch(() => null),
      ])
      setContainer(c)
      setStats(s)
    } catch {
      addToast('Container not found', 'error')
      navigate('/containers')
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [id])

  const handleAction = async (action: 'start' | 'stop' | 'restart' | 'delete') => {
    if (!id) return
    setActionLoading(true)
    try {
      if (action === 'start') { await startContainer(id); addToast('Container started', 'success') }
      else if (action === 'stop') { await stopContainer(id); addToast('Container stopped', 'success') }
      else if (action === 'restart') { await restartContainer(id); addToast('Container restarted', 'success') }
      else if (action === 'delete') { await removeContainer(id, true); addToast('Container removed', 'success'); navigate('/containers'); return }
      fetchData()
    } catch (err: any) { addToast(err.message || 'Action failed', 'error') }
    finally { setActionLoading(false) }
  }

  const loadLogs = async () => {
    if (!id) return
    try { const res = await getContainerLogs(id); setLogs(res.logs || 'No logs') }
    catch (err: any) { setLogs(`Error: ${err.message}`) }
  }

  const loadState = async () => {
    if (!id) return
    try { const res = await getContainerState(id); setState(JSON.stringify(res.state || res, null, 2)) }
    catch (err: any) { setState(`Error: ${err.message}`) }
  }

  const handleExec = async () => {
    if (!id || !execCmd) return
    try { const res = await execContainer(id, execCmd); setExecOutput(res.output || `Exit code: ${res.exit_code}`) }
    catch (err: any) { setExecOutput(`Error: ${err.message}`) }
  }

  useEffect(() => { if (activeTab === 'logs') loadLogs(); if (activeTab === 'state') loadState() }, [activeTab])

  if (loading) return <PageLoading />
  if (!container) return null

  const tabs = [
    { id: 'info', label: 'Info', icon: <Info size={14} /> },
    { id: 'logs', label: 'Logs', icon: <FileText size={14} /> },
    { id: 'state', label: 'State', icon: <Activity size={14} /> },
    { id: 'exec', label: 'Exec', icon: <Terminal size={14} /> },
    { id: 'console', label: 'Console', icon: <Cpu size={14} /> },
    { id: 'files', label: 'Files', icon: <Folder size={14} /> },
    { id: 'backups', label: 'Backups', icon: <Archive size={14} /> },
  ]

  return (
    <div className="space-y-5 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/containers')} className="btn-ghost p-2 rounded-xl">
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-[#e6edf3] tracking-tight">{container.name || container.id.slice(0, 12)}</h1>
              <ContainerStatusBadge status={container.status} />
            </div>
            <p className="text-sm text-[#636d7d] mt-0.5">{container.image} · <span className="font-mono">{container.id.slice(0, 19)}</span></p>
          </div>
        </div>
        <div className="flex gap-2">
          {container.status === 'running' ? (
            <Button variant="secondary" size="sm" onClick={() => handleAction('stop')} loading={actionLoading}>
              <Square size={14} /> Stop
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={() => handleAction('start')} loading={actionLoading}>
              <Play size={14} /> Start
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => handleAction('restart')} loading={actionLoading}>
            <RotateCcw size={14} /> Restart
          </Button>
          <Button variant="danger" size="sm" onClick={() => handleAction('delete')} loading={actionLoading}>
            <Trash2 size={14} /> Delete
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <Card>
          <div className="p-4">
            <ResourceBar cpu={stats.cpu} memory={stats.memory} memoryUsed={stats.memory_used} memoryLimit={stats.memory_limit} />
          </div>
        </Card>
      )}

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Content */}
      <div className="mt-1">
        {activeTab === 'info' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <div className="p-5 space-y-4">
                <h3 className="text-xs uppercase tracking-wider text-[#636d7d] font-semibold">Details</h3>
                <div className="space-y-3">
                  <InfoRow label="ID" value={container.id} />
                  <InfoRow label="Name" value={container.name || '-'} />
                  <InfoRow label="Image" value={container.image} />
                  <InfoRow label="Status" value={container.status} />
                  <InfoRow label="Created" value={formatDate(container.created)} />
                </div>
              </div>
            </Card>
            <Card>
              <div className="p-5 space-y-4">
                <h3 className="text-xs uppercase tracking-wider text-[#636d7d] font-semibold">Network</h3>
                <div className="space-y-3">
                  <InfoRow label="IP Address" value={container.ip || '-'} />
                  <InfoRow label="PID" value={container.pid?.toString() || '-'} />
                  <InfoRow label="Memory Limit" value={container.memory || 'Default'} />
                  <InfoRow label="CPU Limit" value={container.cpus || 'Default'} />
                </div>
              </div>
            </Card>
            {container.ports?.length > 0 && (
              <Card>
                <div className="p-5 space-y-4">
                  <h3 className="text-xs uppercase tracking-wider text-[#636d7d] font-semibold">Ports</h3>
                  <div className="space-y-2">
                    {container.ports.map((p, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                        <span className="text-xs font-mono text-[#e6edf3]">{p.host}</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#636d7d]"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                        <span className="text-xs font-mono text-indigo-400">{p.container}/{p.protocol}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <Card>
            <pre className="p-5 text-xs font-mono text-[#e6edf3] overflow-x-auto max-h-[600px] leading-relaxed whitespace-pre-wrap">
              {logs || 'Loading...'}
            </pre>
          </Card>
        )}

        {activeTab === 'state' && (
          <Card>
            <pre className="p-5 text-xs font-mono text-[#e6edf3] overflow-x-auto max-h-[600px] leading-relaxed">
              {state || 'Loading...'}
            </pre>
          </Card>
        )}

        {activeTab === 'exec' && (
          <Card>
            <div className="p-5 space-y-4">
              <div className="flex gap-2">
                <Input
                  value={execCmd}
                  onChange={e => setExecCmd(e.target.value)}
                  placeholder="Enter command (e.g. ls -la)"
                  onKeyDown={e => e.key === 'Enter' && handleExec()}
                  className="flex-1"
                />
                <Button onClick={handleExec}>
                  <Terminal size={14} /> Run
                </Button>
              </div>
              {execOutput && (
                <pre className="p-4 rounded-xl bg-black/30 text-xs font-mono text-[#e6edf3] overflow-x-auto max-h-[400px] leading-relaxed border border-white/[0.06]">
                  {execOutput}
                </pre>
              )}
            </div>
          </Card>
        )}

        {activeTab === 'console' && id && (
          <ContainerConsole containerId={id} />
        )}

        {activeTab === 'files' && id && <ContainerFilesTab containerId={id} />}

        {activeTab === 'backups' && id && <ContainerBackupsTab containerId={id} />}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-xs text-[#636d7d]">{label}</span>
      <span className="text-xs text-[#e6edf3] font-mono">{value}</span>
    </div>
  )
}

function ContainerFilesTab({ containerId }: { containerId: string }) {
  const navigate = useNavigate()
  const [files, setFiles] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listFiles(containerId, '/').then(setFiles).catch(() => {}).finally(() => setLoading(false))
  }, [containerId])

  return (
    <Card>
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[#8b949e]">Root directory</p>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/containers/${containerId}/files`)}>
            <ExternalLink size={12} /> Open File Manager
          </Button>
        </div>
        {loading ? (
          <div className="text-xs text-[#636d7d] py-4">Loading...</div>
        ) : (
          <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
            {files.slice(0, 20).map((f) => (
              <div key={f.path} className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-white/[0.03]">
                {f.is_dir ? <Folder size={12} className="text-indigo-400" /> : <File size={12} className="text-[#8b949e]" />}
                <span className="text-xs text-[#e6edf3]">{f.name}</span>
              </div>
            ))}
            {files.length === 0 && <p className="text-xs text-[#636d7d]">Empty directory</p>}
          </div>
        )}
      </div>
    </Card>
  )
}

function ContainerBackupsTab({ containerId }: { containerId: string }) {
  const navigate = useNavigate()
  const addToast = useUIStore(s => s.addToast)
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const load = async () => {
    try {
      const b = await listBackups(containerId)
      setBackups(b)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [containerId])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const b = await createBackup(containerId)
      setBackups(prev => [b, ...prev])
      addToast('Backup created', 'success')
    } catch (err: any) {
      addToast(err.message || 'Failed', 'error')
    }
    setCreating(false)
  }

  const handleDelete = async (name: string) => {
    if (!confirm('Delete backup?')) return
    try {
      await deleteBackup(containerId, name)
      setBackups(prev => prev.filter(b => b.name !== name))
      addToast('Deleted', 'success')
    } catch (err: any) {
      addToast(err.message || 'Failed', 'error')
    }
  }

  return (
    <Card>
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[#8b949e]">{backups.length} backups</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleCreate} loading={creating}>
              <Archive size={12} /> Create
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate(`/containers/${containerId}/backups`)}>
              <ExternalLink size={12} /> Manage
            </Button>
          </div>
        </div>
        {loading ? (
          <div className="text-xs text-[#636d7d] py-4">Loading...</div>
        ) : backups.length === 0 ? (
          <p className="text-xs text-[#636d7d] py-4 text-center">No backups yet</p>
        ) : (
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {backups.map((b) => (
              <div key={b.name} className="flex items-center justify-between px-3 py-2 rounded bg-white/[0.02] border border-white/[0.06]">
                <div>
                  <p className="text-xs text-[#e6edf3]">{b.name}</p>
                  <p className="text-[10px] text-[#636d7d]">{b.created_at}</p>
                </div>
                <button onClick={() => handleDelete(b.name)} className="p-1 rounded hover:bg-red-500/20 text-[#8b949e] hover:text-red-400">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

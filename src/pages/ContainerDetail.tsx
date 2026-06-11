import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getContainer, getContainerLogs, getContainerState,
  getContainerStats, execContainer, removeContainer,
  startContainer, stopContainer, restartContainer,
  updateContainerConfig, addContainerPort, removeContainerPort,
} from '@/api/containers'
import {
  listBackups, createBackup, restoreBackup, deleteBackup, getBackupDownloadUrl, getContainerSFTP, regenerateSFTPPassword,
} from '@/api/files'
import type { ContainerSFTPInfo } from '@/api/files'
import { useUIStore } from '@/store/uiStore'
import { Card } from '@/components/ui/Card'
import { Tabs } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageLoading } from '@/components/ui/Spinner'
import { ContainerStatusBadge } from '@/components/containers/ContainerStatusBadge'
import { ContainerConsole } from '@/components/containers/ContainerConsole'
import { ResourceBar } from '@/components/containers/ResourceBar'
import { FileBrowser } from '@/components/containers/FileBrowser'
import { formatDate } from '@/utils'
import type { Container, ContainerStats } from '@/types'
import type { BackupEntry } from '@/api/files'
import { getContainerActivity } from '@/api/activity'
import { exportContainerAsTemplate } from '@/api/blueprints'
import type { ContainerPermission, ActivityLog } from '@/types'
import { Play, Square, RotateCcw, Trash2, ArrowLeft, Terminal, Info, FileText, Activity, Cpu, Folder, Archive, Users, List, Save, RotateCw, AlertTriangle, Plus, Download, RefreshCw, Key, FileDown, Settings, X } from 'lucide-react'
import { listCollaborators, addCollaborator, removeCollaborator, updateCollaborator } from '@/api/collaborators'

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
  const [startupCmd, setStartupCmd] = useState('')
  const [savingStartup, setSavingStartup] = useState(false)
  const [showAddPort, setShowAddPort] = useState(false)
  const [newPortContainer, setNewPortContainer] = useState('')
  const [newPortHost, setNewPortHost] = useState('')
  const [addingPort, setAddingPort] = useState(false)

  const fetchData = async () => {
    if (!id) return
    try {
      const [c, s] = await Promise.all([
        getContainer(id),
        getContainerStats(id).catch(() => null),
      ])
      if (!c) { throw new Error('Container not found') }
      setContainer(c)
      setStats(s)
      setStartupCmd(c.cmd || '')
    } catch {
      addToast('Container not found', 'error')
      navigate('/containers')
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [id])

  // Poll stats every 5s
  useEffect(() => {
    if (!id) return
    const interval = setInterval(async () => {
      try {
        const s = await getContainerStats(id)
        setStats(s)
      } catch {} // ignore — container might be stopping
    }, 5000)
    return () => clearInterval(interval)
  }, [id])

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

  const handleRemovePort = async (hostPort: number) => {
    if (!id || !confirm(`Remove port ${hostPort}?`)) return
    try {
      await removeContainerPort(id, hostPort)
      addToast('Port removed', 'success')
      fetchData()
    } catch (err: any) {
      addToast(err.message || 'Failed to remove port', 'error')
    }
  }

  const handleAddPort = async () => {
    if (!id || !newPortContainer) return
    setAddingPort(true)
    try {
      const cp = parseInt(newPortContainer)
      if (isNaN(cp) || cp <= 0) { addToast('Invalid container port', 'error'); return }
      const hp = newPortHost ? parseInt(newPortHost) : 0
      if (newPortHost && (isNaN(hp) || hp <= 0)) { addToast('Invalid host port', 'error'); return }
      await addContainerPort(id, cp, hp || undefined)
      addToast('Port added', 'success')
      setShowAddPort(false)
      setNewPortContainer('')
      setNewPortHost('')
      fetchData()
    } catch (err: any) {
      addToast(err.message || 'Failed to add port', 'error')
    } finally {
      setAddingPort(false)
    }
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

  const handleSaveStartup = async () => {
    if (!id) return
    setSavingStartup(true)
    try {
      await updateContainerConfig(id, { cmd: startupCmd })
      addToast('Startup command saved', 'success')
    } catch (err: any) {
      addToast(err.message || 'Failed to save startup command', 'error')
    }
    setSavingStartup(false)
  }

  const handleExportTemplate = async () => {
    if (!id) return
    try {
      const tpl = await exportContainerAsTemplate(id)
      const blob = new Blob([JSON.stringify(tpl, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${container?.name || id}.template.json`
      a.click()
      URL.revokeObjectURL(url)
      addToast('Template exported', 'success')
    } catch (err: any) {
      addToast(err.message || 'Failed to export template', 'error')
    }
  }

  useEffect(() => { if (activeTab === 'logs') loadLogs(); if (activeTab === 'state') loadState() }, [activeTab])

  if (loading) return <PageLoading />
  if (!container) return <div className="flex items-center justify-center py-20"><p className="text-[#636d7d]">Container not found</p></div>

  const tabs = [
    { id: 'info', label: 'Info', icon: <Info size={14} /> },
    { id: 'logs', label: 'Logs', icon: <FileText size={14} /> },
    { id: 'startup', label: 'Startup', icon: <Play size={14} /> },
    { id: 'state', label: 'State', icon: <Activity size={14} /> },
    { id: 'exec', label: 'Exec', icon: <Terminal size={14} /> },
    { id: 'console', label: 'Console', icon: <Cpu size={14} /> },
    { id: 'files', label: 'Files', icon: <Folder size={14} /> },
    { id: 'sftp', label: 'SFTP', icon: <Key size={14} /> },
    { id: 'backups', label: 'Backups', icon: <Archive size={14} /> },
    { id: 'collaborators', label: 'Collaborators', icon: <Users size={14} /> },
    { id: 'activity', label: 'Activity', icon: <List size={14} /> },
  ]

  return (
    <div className="space-y-5 page-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/containers')} className="btn-ghost p-2 rounded-xl shrink-0">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-[#e6edf3] tracking-tight truncate max-w-[180px] sm:max-w-none">{container.name || container.id.slice(0, 12)}</h1>
              <ContainerStatusBadge status={container.status} />
            </div>
            <p className="text-xs sm:text-sm text-[#636d7d] mt-0.5 truncate max-w-[220px] sm:max-w-none">{container.image} · <span className="font-mono">{container.id.slice(0, 19)}</span></p>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {container.status === 'running' ? (
            <Button variant="secondary" size="sm" onClick={() => handleAction('stop')} loading={actionLoading}>
              <Square size={14} /> Stop
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={() => handleAction('start')} loading={actionLoading}>
              <Play size={14} /> Start
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleExportTemplate}>
            <FileDown size={14} /> Export
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleAction('restart')} loading={actionLoading}>
            <RotateCcw size={14} />
          </Button>
          <Button variant="danger" size="sm" onClick={() => handleAction('delete')} loading={actionLoading}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <Card>
        <div className="p-4">
          <ResourceBar
            cpu={stats?.cpu ?? 0}
            memory={stats?.memory ?? 0}
            memoryUsed={stats?.memory_used}
            memoryLimit={stats?.memory_limit}
            cpuLimit={stats?.cpu_limit ?? (container.cpus ? parseFloat(container.cpus) : undefined)}
            running={container.status === 'running'}
          />
        </div>
      </Card>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Content */}
      <div className="mt-1">
        {activeTab === 'info' && (
          <div className="grid grid-cols-1 gap-4">
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
            <Card>
              <div className="p-5 space-y-4">
                <h3 className="text-xs uppercase tracking-wider text-[#636d7d] font-semibold">Allocations</h3>
                <div className="space-y-2">
                  {(!container.ports || container.ports.length === 0) ? (
                    <p className="text-xs text-[#636d7d] text-center py-2">No ports allocated</p>
                  ) : (
                    container.ports.map((p, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-[#e6edf3]">{p.host}</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#636d7d]"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                          <span className="text-xs font-mono text-indigo-400">{p.container}/{p.protocol}</span>
                        </div>
                        <button
                          onClick={() => handleRemovePort(parseInt(p.host))}
                          className="p-1 rounded hover:bg-red-500/20 text-[#8b949e] hover:text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="pt-1">
                  <Button variant="secondary" size="sm" onClick={() => setShowAddPort(true)}>
                    <Plus size={12} /> Add Port
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'startup' && container && (
          <Card>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-[#636d7d] font-semibold mb-3">Startup Command</p>
                <div className="flex gap-2">
                  <Input
                    value={startupCmd}
                    onChange={e => setStartupCmd(e.target.value)}
                    placeholder="Container startup command"
                    className="flex-1 font-mono text-xs"
                  />
                  <Button onClick={handleSaveStartup} loading={savingStartup}>
                    <Save size={14} /> Save
                  </Button>
                </div>
                <p className="text-[10px] text-[#636d7d] mt-2">
                  Changes will take effect on next container start
                </p>
              </div>

              {container.entrypoint && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#636d7d] font-semibold mb-2">Entrypoint</p>
                  <pre className="px-3 py-2 rounded-lg bg-white/[0.03] text-xs font-mono text-[#8b949e] border border-white/[0.06]">
                    {container.entrypoint}
                  </pre>
                </div>
              )}

              <div>
                <p className="text-xs uppercase tracking-wider text-[#636d7d] font-semibold mb-2">Image</p>
                <pre className="px-3 py-2 rounded-lg bg-white/[0.03] text-xs font-mono text-[#8b949e] border border-white/[0.06]">
                  {container.image}
                </pre>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-[#636d7d] font-semibold mb-2">Restart Policy</p>
                <pre className="px-3 py-2 rounded-lg bg-white/[0.03] text-xs font-mono text-[#8b949e] border border-white/[0.06]">
                  {container.restart || 'none'}
                </pre>
              </div>
            </div>
          </Card>
        )}

        {activeTab === 'logs' && (
          <Card>
            <pre className="p-5 text-xs font-mono text-[#e6edf3] overflow-x-auto overflow-y-auto max-h-[600px] leading-relaxed whitespace-pre-wrap">
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

        {activeTab === 'files' && id && (
          <FileBrowser containerId={id} />
        )}

        {activeTab === 'sftp' && id && <ContainerSFTPTab containerId={id} />}

        {activeTab === 'backups' && id && <ContainerBackupsTab containerId={id} />}

        {activeTab === 'collaborators' && id && <ContainerCollaboratorsTab containerId={id} />}

        {activeTab === 'activity' && id && <ContainerActivityTab containerId={id} />}
      </div>

      <Modal open={showAddPort} onClose={() => setShowAddPort(false)} title="Add Port Allocation">
        <div className="space-y-4">
          <Input
            label="Container Port"
            type="number"
            min={1}
            max={65535}
            value={newPortContainer}
            onChange={e => setNewPortContainer(e.target.value)}
            placeholder="25565"
          />
          <Input
            label="Host Port (leave empty for auto-assign)"
            type="number"
            min={1}
            max={65535}
            value={newPortHost}
            onChange={e => setNewPortHost(e.target.value)}
            placeholder="Auto"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddPort(false)}>Cancel</Button>
            <Button onClick={handleAddPort} loading={addingPort}>
              <Plus size={14} /> Add Port
            </Button>
          </div>
        </div>
      </Modal>
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

function ContainerBackupsTab({ containerId }: { containerId: string }) {
  const addToast = useUIStore(s => s.addToast)
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)

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

  const handleRestore = async () => {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      await restoreBackup(containerId, restoreTarget)
      addToast('Backup restored', 'success')
      setRestoreTarget(null)
    } catch (err: any) {
      addToast(err.message || 'Restore failed', 'error')
    }
    setRestoring(false)
  }

  const handleDelete = async (name: string) => {
    if (!confirm('Delete backup ' + name + '?')) return
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
          <Button variant="secondary" size="sm" onClick={handleCreate} loading={creating}>
            <Archive size={12} /> Create
          </Button>
        </div>
        {loading ? (
          <div className="text-xs text-[#636d7d] py-4">Loading...</div>
        ) : backups.length === 0 ? (
          <p className="text-xs text-[#636d7d] py-4 text-center">No backups yet</p>
        ) : (
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {backups.map((b) => (
              <div key={b.name} className="flex items-center justify-between px-3 py-2 rounded bg-white/[0.02] border border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <Archive size={14} className="text-indigo-400 shrink-0" />
                  <div>
                    <p className="text-xs text-[#e6edf3]">{b.name}</p>
                    <p className="text-[10px] text-[#636d7d]">{formatSize(b.size)} · {b.created_at}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <a
                    href={getBackupDownloadUrl(containerId, b.name)}
                    download
                    className="p-1.5 rounded hover:bg-white/10 text-[#8b949e] hover:text-[#e6edf3]"
                  >
                    <Download size={12} />
                  </a>
                  <button
                    onClick={() => setRestoreTarget(b.name)}
                    className="p-1.5 rounded hover:bg-white/10 text-[#8b949e] hover:text-amber-400"
                  >
                    <RotateCw size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(b.name)}
                    className="p-1.5 rounded hover:bg-red-500/20 text-[#8b949e] hover:text-red-400"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        title="Restore Backup"
      >
        <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-4">
          <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">
            This will overwrite all current files in the container with the backup contents.
            This action cannot be undone.
          </p>
        </div>
        <p className="text-sm text-[#e6edf3] mb-4">
          Restore backup: <span className="font-mono text-indigo-400">{restoreTarget}</span>
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRestoreTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleRestore} loading={restoring}>
            <RotateCw size={14} /> Restore
          </Button>
        </div>
      </Modal>
    </Card>
  )
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i]
}

// ─── Collaborators Tab ──────────────────────────────────────────

type GranularPerms = {
  console: boolean
  console_send: boolean
  files_read: boolean
  files_write: boolean
  files_delete: boolean
  backup_create: boolean
  backup_restore: boolean
  backup_delete: boolean
  container_start: boolean
  container_stop: boolean
  container_restart: boolean
  container_delete: boolean
  container_edit: boolean
  ports_manage: boolean
  collaborators: boolean
}

const PERM_GROUPS: { label: string; keys: (keyof GranularPerms)[] }[] = [
  {
    label: 'Console',
    keys: ['console', 'console_send'],
  },
  {
    label: 'Files',
    keys: ['files_read', 'files_write', 'files_delete'],
  },
  {
    label: 'Backups',
    keys: ['backup_create', 'backup_restore', 'backup_delete'],
  },
  {
    label: 'Container',
    keys: ['container_start', 'container_stop', 'container_restart', 'container_delete', 'container_edit'],
  },
  {
    label: 'Other',
    keys: ['ports_manage', 'collaborators'],
  },
]

const PERMISSION_LABELS: Record<keyof GranularPerms, string> = {
  console: 'View Console',
  console_send: 'Send Commands',
  files_read: 'Read Files',
  files_write: 'Write Files',
  files_delete: 'Delete Files',
  backup_create: 'Create Backups',
  backup_restore: 'Restore Backups',
  backup_delete: 'Delete Backups',
  container_start: 'Start',
  container_stop: 'Stop',
  container_restart: 'Restart',
  container_delete: 'Delete',
  container_edit: 'Edit Config',
  ports_manage: 'Manage Ports',
  collaborators: 'Manage Collaborators',
}

const PERM_COLORS: Record<string, string> = {
  console: 'from-emerald-500/20 to-emerald-600/10 text-emerald-300 border-emerald-500/20',
  console_send: 'from-emerald-500/20 to-emerald-600/10 text-emerald-300 border-emerald-500/20',
  files_read: 'from-sky-500/20 to-sky-600/10 text-sky-300 border-sky-500/20',
  files_write: 'from-sky-500/20 to-sky-600/10 text-sky-300 border-sky-500/20',
  files_delete: 'from-rose-500/20 to-rose-600/10 text-rose-300 border-rose-500/20',
  backup_create: 'from-amber-500/20 to-amber-600/10 text-amber-300 border-amber-500/20',
  backup_restore: 'from-amber-500/20 to-amber-600/10 text-amber-300 border-amber-500/20',
  backup_delete: 'from-rose-500/20 to-rose-600/10 text-rose-300 border-rose-500/20',
  container_start: 'from-green-500/20 to-green-600/10 text-green-300 border-green-500/20',
  container_stop: 'from-orange-500/20 to-orange-600/10 text-orange-300 border-orange-500/20',
  container_restart: 'from-yellow-500/20 to-yellow-600/10 text-yellow-300 border-yellow-500/20',
  container_delete: 'from-red-500/20 to-red-600/10 text-red-300 border-red-500/20',
  container_edit: 'from-violet-500/20 to-violet-600/10 text-violet-300 border-violet-500/20',
  ports_manage: 'from-cyan-500/20 to-cyan-600/10 text-cyan-300 border-cyan-500/20',
  collaborators: 'from-indigo-500/20 to-indigo-600/10 text-indigo-300 border-indigo-500/20',
}

const PRESET_PERMS: Record<string, Partial<GranularPerms>> = {
  view: { console: true },
  edit: { console: true, console_send: true, files_read: true, files_write: true, container_start: true, container_stop: true, container_restart: true, container_edit: true, backup_create: true },
  admin: { console: true, console_send: true, files_read: true, files_write: true, files_delete: true, backup_create: true, backup_restore: true, backup_delete: true, container_start: true, container_stop: true, container_restart: true, container_delete: true, container_edit: true, ports_manage: true, collaborators: true },
}

function parsePerms(p: ContainerPermission): GranularPerms {
  if (p.permissions) {
    try { return JSON.parse(p.permissions) } catch { /* fall through */ }
  }
  return { ...PRESET_PERMS[p.permission] } as GranularPerms
}

function PermToggle({ checked, onChange, id }: { checked: boolean; onChange: () => void; id: string }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 focus:outline-none ${
        checked
          ? 'border-indigo-500 bg-indigo-500/30'
          : 'border-white/[0.1] bg-white/[0.04]'
      }`}
    >
      <span className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform duration-200 ${
        checked ? 'translate-x-3.5' : 'translate-x-0.5'
      }`} />
    </button>
  )
}

function ContainerCollaboratorsTab({ containerId }: { containerId: string }) {
  const addToast = useUIStore(s => s.addToast)
  const [perms, setPerms] = useState<ContainerPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [addUsername, setAddUsername] = useState('')
  const [addPreset, setAddPreset] = useState<'view' | 'edit' | 'admin'>('view')
  const [adding, setAdding] = useState(false)
  const [addGranular, setAddGranular] = useState<GranularPerms>(parsePerms({ permission: 'view' } as ContainerPermission))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingPerms, setEditingPerms] = useState<GranularPerms | null>(null)
  const [showAdder, setShowAdder] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await listCollaborators(containerId)
      setPerms(data || [])
    } catch (err: any) {
      addToast(err.message || 'Failed to load collaborators', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [containerId])

  const startEditing = (p: ContainerPermission) => {
    setEditingId(p.user_id)
    setEditingPerms(parsePerms(p))
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditingPerms(null)
  }

  const toggleEditPerm = (key: keyof GranularPerms) => {
    setEditingPerms(prev => prev ? { ...prev, [key]: !prev[key] } : prev)
  }

  const resetGranularFromPreset = (preset: 'view' | 'edit' | 'admin') => {
    setAddGranular({ ...PRESET_PERMS[preset] } as GranularPerms)
  }

  const toggleGranular = (key: keyof GranularPerms) => {
    setAddGranular(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleAdd = async () => {
    if (!addUsername) return
    setAdding(true)
    try {
      const permissionsStr = JSON.stringify(addGranular)
      await addCollaborator(containerId, addUsername, addPreset, permissionsStr)
      setAddUsername('')
      setShowAdder(false)
      addToast('Collaborator added', 'success')
      load()
    } catch (err: any) {
      addToast(err.message || 'Failed to add collaborator', 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (userId: string) => {
    try {
      await removeCollaborator(containerId, userId)
      addToast('Collaborator removed', 'success')
      load()
    } catch (err: any) {
      addToast(err.message || 'Failed to remove collaborator', 'error')
    }
  }

  const handleSavePerms = async (userId: string) => {
    if (!editingPerms) return
    try {
      const permissionsStr = JSON.stringify(editingPerms)
      await updateCollaborator(containerId, userId, 'custom', permissionsStr)
      cancelEditing()
      addToast('Permissions updated', 'success')
      load()
    } catch (err: any) {
      addToast(err.message || 'Failed to update permissions', 'error')
    }
  }

  const enabledCount = (gp: GranularPerms) => (Object.keys(gp) as (keyof GranularPerms)[]).filter(k => gp[k]).length
  const allCount = Object.keys(PERMISSION_LABELS).length

  return (
    <Card>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wider text-[#636d7d] font-semibold">Collaborators</h3>
          {!showAdder && (
            <Button onClick={() => setShowAdder(true)} size="sm">
              <Plus size={14} /> Add
            </Button>
          )}
        </div>

        {showAdder && (
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-[#e6edf3]">New Collaborator</p>
              <button onClick={() => setShowAdder(false)} className="text-[#8b949e] hover:text-[#e6edf3]">
                <X size={14} />
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                value={addUsername}
                onChange={e => setAddUsername(e.target.value)}
                placeholder="Enter username..."
                className="flex-1"
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
              <Button onClick={handleAdd} loading={adding} size="sm">Invite</Button>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium mb-2">Preset</p>
              <div className="flex gap-1.5">
                {(['view', 'edit', 'admin'] as const).map(preset => (
                  <button
                    key={preset}
                    onClick={() => { setAddPreset(preset); resetGranularFromPreset(preset) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      addPreset === preset
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'bg-white/[0.04] text-[#8b949e] border border-white/[0.06] hover:border-white/[0.12] hover:text-[#e6edf3]'
                    }`}
                  >
                    {preset.charAt(0).toUpperCase() + preset.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <PermGrid perms={addGranular} onToggle={toggleGranular} />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
          </div>
        ) : perms.length === 0 ? (
          <div className="text-center py-8">
            <Users size={24} className="mx-auto text-[#636d7d] mb-2" />
            <p className="text-xs text-[#636d7d]">No collaborators yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {perms.map(p => {
              const gp = parsePerms(p)
              const isEditing = editingId === p.user_id
              return (
                <div
                  key={p.user_id}
                  className={`rounded-xl border transition-all ${
                    isEditing
                      ? 'border-indigo-500/30 bg-indigo-500/[0.03]'
                      : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                          {p.username[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#e6edf3] truncate">{p.username}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-medium text-indigo-300 capitalize bg-indigo-500/10 px-1.5 py-0.5 rounded">{p.permission}</span>
                            <span className="text-[10px] text-[#636d7d]">{enabledCount(gp)}/{allCount} permissions</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => startEditing(p)}
                          className="p-1.5 rounded-lg hover:bg-white/[0.08] text-[#8b949e] hover:text-[#e6edf3] transition-colors"
                          title="Edit permissions"
                        >
                          <Settings size={14} />
                        </button>
                        <button
                          onClick={() => handleRemove(p.user_id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-[#8b949e] hover:text-red-400 transition-colors"
                          title="Remove collaborator"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {!isEditing && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(Object.keys(PERMISSION_LABELS) as (keyof GranularPerms)[]).map(k =>
                          gp[k] ? (
                            <span key={k} className={`px-2 py-0.5 rounded-md text-[10px] font-medium border bg-gradient-to-br ${PERM_COLORS[k]}`}>
                              {PERMISSION_LABELS[k]}
                            </span>
                          ) : null
                        )}
                      </div>
                    )}
                  </div>
                  {isEditing && editingPerms && (
                    <div className="px-4 pb-4 border-t border-white/[0.06] pt-3">
                      <PermGrid perms={editingPerms} onToggle={toggleEditPerm} />
                      <div className="flex gap-2 mt-3 pt-3 border-t border-white/[0.06]">
                        <Button onClick={() => handleSavePerms(p.user_id)} size="sm">Save Changes</Button>
                        <Button onClick={cancelEditing} size="sm" variant="secondary">Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Card>
  )
}

function PermGrid({ perms, onToggle }: { perms: GranularPerms; onToggle: (key: keyof GranularPerms) => void }) {
  return (
    <div className="space-y-3">
      {PERM_GROUPS.map(group => (
        <div key={group.label}>
          <p className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium mb-1.5">{group.label}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
            {group.keys.map(k => (
              <label
                key={k}
                className="flex items-center gap-2 py-1 cursor-pointer group"
              >
                <PermToggle
                  checked={perms[k]}
                  onChange={() => onToggle(k)}
                  id={`perm-${k}`}
                />
                <span className={`text-xs transition-colors ${
                  perms[k] ? 'text-[#e6edf3]' : 'text-[#636d7d] group-hover:text-[#8b949e]'
                }`}>
                  {PERMISSION_LABELS[k]}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── SFTP Tab ───────────────────────────────────────────────────

function ContainerSFTPTab({ containerId }: { containerId: string }) {
  const addToast = useUIStore(s => s.addToast)
  const [sftpInfo, setSftpInfo] = useState<ContainerSFTPInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const info = await getContainerSFTP(containerId)
      setSftpInfo(info)
    } catch (err: any) {
      addToast(err.message || 'Failed to load SFTP info', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [containerId])

  const handleReset = async () => {
    setResetting(true)
    try {
      const { password } = await regenerateSFTPPassword(containerId)
      setSftpInfo(prev => prev ? { ...prev, password } : prev)
      addToast('SFTP password reset', 'success')
    } catch (err: any) {
      addToast(err.message || 'Failed to reset password', 'error')
    } finally {
      setResetting(false)
    }
  }

  return (
    <Card>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wider text-[#636d7d] font-semibold">SFTP Connection</h3>
          <button onClick={load} className="p-1.5 rounded hover:bg-white/[0.05] text-[#8b949e] hover:text-[#e6edf3]">
            <RotateCw size={14} />
          </button>
        </div>

        {loading ? (
          <p className="text-xs text-[#636d7d]">Loading...</p>
        ) : !sftpInfo ? (
          <p className="text-xs text-[#636d7d]">Failed to load SFTP info</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                <p className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium">Host</p>
                <p className="text-xs text-[#e6edf3] font-mono mt-0.5">{sftpInfo.host}</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                <p className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium">Port</p>
                <p className="text-xs text-[#e6edf3] font-mono mt-0.5">{sftpInfo.port || '2222'}</p>
              </div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
              <p className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium">Username</p>
              <p className="text-xs text-[#e6edf3] font-mono mt-0.5">{sftpInfo.username}</p>
            </div>
            <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium">Password</p>
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={10} className={resetting ? 'animate-spin' : ''} />
                  {resetting ? 'Resetting...' : 'Reset'}
                </button>
              </div>
              {sftpInfo.password ? (
                <p className="text-xs text-[#e6ed3f] font-mono mt-0.5 break-all">{sftpInfo.password}</p>
              ) : (
                <p className="text-xs text-[#636d7d] mt-0.5">Click Reset to generate a new password</p>
              )}
            </div>
            <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
              <p className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium">Remote Path</p>
              <p className="text-xs text-[#8b949e] font-mono mt-0.5">/{containerId.slice(0, 12)}/</p>
            </div>
            <div className="bg-white/[0.04] rounded-lg p-3">
              <p className="text-[10px] text-[#636d7d] mb-1 font-medium">Example connection string:</p>
              <code className="text-[11px] text-[#e6edf3] font-mono break-all">
                sftp://{sftpInfo.username}@{sftpInfo.host}:{sftpInfo.port || '2222'}/</code>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

// ─── Activity Tab ───────────────────────────────────────────────

function ContainerActivityTab({ containerId }: { containerId: string }) {
  const addToast = useUIStore(s => s.addToast)
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const data = await getContainerActivity(containerId, 100)
      setLogs(data || [])
    } catch (err: any) {
      addToast(err.message || 'Failed to load activity', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [containerId])

  return (
    <Card>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wider text-[#636d7d] font-semibold">Activity Log</h3>
          <button onClick={load} className="p-1.5 rounded hover:bg-white/[0.05] text-[#8b949e] hover:text-[#e6edf3]">
            <RotateCw size={14} />
          </button>
        </div>

        {loading ? (
          <p className="text-xs text-[#636d7d]">Loading...</p>
        ) : logs.length === 0 ? (
          <p className="text-xs text-[#636d7d]">No activity recorded</p>
        ) : (
          <div className="space-y-1">
            {logs.map(l => (
              <div key={l.id} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-white/[0.02] text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[#e6edf3]">
                    <span className="font-medium text-indigo-300">{l.username}</span>
                    {' '}{formatAction(l.action)}{l.details ? ` — ${l.details}` : ''}
                  </p>
                  <p className="text-[10px] text-[#636d7d] mt-0.5">{formatDate(l.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    container_created: 'created container',
    container_started: 'started container',
    container_stopped: 'stopped container',
    container_restarted: 'restarted container',
    container_removed: 'removed container',
    collaborator_added: 'added collaborator',
    collaborator_removed: 'removed collaborator',
    file_uploaded: 'uploaded file',
    file_deleted: 'deleted file',
    file_renamed: 'renamed file',
    file_written: 'saved file',
    file_created: 'created directory',
    backup_created: 'created backup',
    backup_restored: 'restored backup',
    backup_deleted: 'deleted backup',
    login: 'logged in',
    password_changed: 'changed password',
  }
  return map[action] || action.replace(/_/g, ' ')
}

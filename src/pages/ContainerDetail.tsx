import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getContainer, getContainerLogs, getContainerState,
  getContainerStats, execContainer, removeContainer,
  startContainer, stopContainer, restartContainer,
  updateContainerConfig,
} from '@/api/containers'
import {
  listFiles, readFile, writeFile, deleteFile, mkdir, getUploadUrl,
  listBackups, createBackup, restoreBackup, deleteBackup, getBackupDownloadUrl,
} from '@/api/files'
import { useUIStore } from '@/store/uiStore'
import { Card, CardContent } from '@/components/ui/Card'
import { Tabs } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageLoading } from '@/components/ui/Spinner'
import { ContainerStatusBadge } from '@/components/containers/ContainerStatusBadge'
import { ContainerConsole } from '@/components/containers/ContainerConsole'
import { ResourceBar } from '@/components/containers/ResourceBar'
import { formatDate } from '@/utils'
import type { Container, ContainerStats } from '@/types'
import type { FileEntry, BackupEntry } from '@/api/files'
import { Play, Square, RotateCcw, Trash2, ArrowLeft, Terminal, Info, FileText, Activity, Cpu, Wrench, Folder, Archive, File, Home, ChevronRight, Edit3, Save, X, Plus, Upload, Download, RotateCw, AlertTriangle } from 'lucide-react'

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

  const fetchData = async () => {
    if (!id) return
    try {
      const [c, s] = await Promise.all([
        getContainer(id),
        getContainerStats(id).catch(() => null),
      ])
      setContainer(c)
      setStats(s)
      setStartupCmd(c.cmd || '')
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

  useEffect(() => { if (activeTab === 'logs') loadLogs(); if (activeTab === 'state') loadState() }, [activeTab])

  if (loading) return <PageLoading />
  if (!container) return null

  const tabs = [
    { id: 'info', label: 'Info', icon: <Info size={14} /> },
    { id: 'logs', label: 'Logs', icon: <FileText size={14} /> },
    { id: 'startup', label: 'Startup', icon: <Play size={14} /> },
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
  const addToast = useUIStore(s => s.addToast)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [currentPath, setCurrentPath] = useState('/')
  const [loading, setLoading] = useState(true)
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [showNewFile, setShowNewFile] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [showNewDir, setShowNewDir] = useState(false)
  const [newDirName, setNewDirName] = useState('')

  const loadFiles = useCallback(async (path: string) => {
    if (!containerId) return
    setLoading(true)
    try {
      const entries = await listFiles(containerId, path)
      setFiles(entries)
      setCurrentPath(path)
    } catch (err: any) {
      addToast(err.message || 'Failed to load files', 'error')
    } finally {
      setLoading(false)
    }
  }, [containerId, addToast])

  useEffect(() => {
    listFiles(containerId, '/data').then(() => loadFiles('/data')).catch(() => loadFiles('/'))
  }, [])

  const handleEditFile = async (filePath: string) => {
    try {
      const content = await readFile(containerId, filePath)
      setEditingFile(filePath)
      setEditContent(content)
    } catch (err: any) {
      addToast(err.message || 'Failed to read file', 'error')
    }
  }

  const handleSaveFile = async () => {
    if (!editingFile) return
    try {
      await writeFile(containerId, editingFile, editContent)
      addToast('File saved', 'success')
      setEditingFile(null)
    } catch (err: any) {
      addToast(err.message || 'Failed to save file', 'error')
    }
  }

  const handleDeleteFile = async (filePath: string) => {
    if (!confirm('Delete ' + filePath + '?')) return
    try {
      await deleteFile(containerId, filePath)
      addToast('Deleted', 'success')
      loadFiles(currentPath)
    } catch (err: any) {
      addToast(err.message || 'Failed to delete', 'error')
    }
  }

  const handleCreateFile = async () => {
    if (!newFileName) return
    try {
      const fp = currentPath === '/' ? '/' + newFileName : currentPath + '/' + newFileName
      await writeFile(containerId, fp, '')
      addToast('File created', 'success')
      setShowNewFile(false)
      setNewFileName('')
      loadFiles(currentPath)
    } catch (err: any) {
      addToast(err.message || 'Failed to create file', 'error')
    }
  }

  const handleCreateDir = async () => {
    if (!newDirName) return
    try {
      const dp = currentPath === '/' ? '/' + newDirName : currentPath + '/' + newDirName
      await mkdir(containerId, dp)
      addToast('Directory created', 'success')
      setShowNewDir(false)
      setNewDirName('')
      loadFiles(currentPath)
    } catch (err: any) {
      addToast(err.message || 'Failed to create directory', 'error')
    }
  }

  const breadcrumbs = currentPath.split('/').filter(Boolean)
  const parentPath = breadcrumbs.length > 0
    ? '/' + breadcrumbs.slice(0, -1).join('/')
    : '/'

  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-[#8b949e]">File browser</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowNewFile(true)}>
              <Plus size={12} /> New File
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowNewDir(true)}>
              <Plus size={12} /> New Dir
            </Button>
            <Button variant="secondary" size="sm">
              <label className="cursor-pointer flex items-center gap-1">
                <Upload size={12} /> Upload
                <input type="file" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const formData = new FormData()
                  formData.append('file', file)
                  formData.append('path', currentPath)
                  try {
                    const token = localStorage.getItem('dck_token')
                    const url = getUploadUrl(containerId, currentPath)
                    await fetch(url, {
                      method: 'POST',
                      headers: token ? { Authorization: 'Bearer ' + token } : {},
                      body: formData,
                    })
                    addToast('Uploaded', 'success')
                    loadFiles(currentPath)
                  } catch (err: any) {
                    addToast(err.message || 'Upload failed', 'error')
                  }
                  e.target.value = ''
                }} />
              </label>
            </Button>
          </div>
        </div>

        <nav className="flex items-center gap-1 text-xs mb-3 text-[#636d7d]">
          <button onClick={() => loadFiles('/')} className="hover:text-[#e6edf3] transition-colors p-1">
            <Home size={14} />
          </button>
          {currentPath !== '/' && <ChevronRight size={12} />}
          {breadcrumbs.map((crumb, i) => {
            const p = '/' + breadcrumbs.slice(0, i + 1).join('/')
            return (
              <span key={i} className="flex items-center gap-1">
                <button onClick={() => loadFiles(p)} className="hover:text-indigo-400 transition-colors">
                  {crumb}
                </button>
                {i < breadcrumbs.length - 1 && <ChevronRight size={12} />}
              </span>
            )
          })}
        </nav>

        <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
          {currentPath !== '/' && (
            <div
              onClick={() => loadFiles(parentPath)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] cursor-pointer transition-colors"
            >
              <Folder size={14} className="text-[#636d7d]" />
              <span className="text-xs text-[#8b949e]">..</span>
            </div>
          )}
          {files.map((file) => (
            <div
              key={file.path}
              className="group flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors"
            >
              <div
                className="flex items-center gap-3 flex-1 cursor-pointer min-w-0"
                onClick={() => file.is_dir ? loadFiles(file.path) : handleEditFile(file.path)}
              >
                {file.is_dir ? (
                  <Folder size={14} className="text-indigo-400 shrink-0" />
                ) : (
                  <File size={14} className="text-[#8b949e] shrink-0" />
                )}
                <span className="text-xs text-[#e6edf3] truncate">{file.name}</span>
                <span className="text-[10px] text-[#636d7d] shrink-0 ml-auto">
                  {file.is_dir ? '' : formatSize(file.size)}
                </span>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                {!file.is_dir && (
                  <button onClick={() => handleEditFile(file.path)} className="p-1 rounded hover:bg-white/10 text-[#8b949e] hover:text-[#e6edf3]">
                    <Edit3 size={12} />
                  </button>
                )}
                <button onClick={() => handleDeleteFile(file.path)} className="p-1 rounded hover:bg-red-500/20 text-[#8b949e] hover:text-red-400">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
          {files.length === 0 && !loading && (
            <p className="text-xs text-[#636d7d] text-center py-4">Empty directory</p>
          )}
        </div>
      </div>

      <Modal open={!!editingFile} onClose={() => setEditingFile(null)} title={editingFile || 'Edit file'}>
        <textarea
          className="w-full h-[300px] bg-[#0d1117] text-[#e6edf3] text-xs font-mono p-4 rounded-lg border border-white/[0.08] resize-none focus:outline-none focus:border-indigo-500/50"
          value={editContent}
          onChange={e => setEditContent(e.target.value)}
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setEditingFile(null)}>
            <X size={14} /> Cancel
          </Button>
          <Button onClick={handleSaveFile}>
            <Save size={14} /> Save
          </Button>
        </div>
      </Modal>

      <Modal open={showNewFile} onClose={() => setShowNewFile(false)} title="New File">
        <Input
          value={newFileName}
          onChange={e => setNewFileName(e.target.value)}
          placeholder="filename.txt"
          onKeyDown={e => e.key === 'Enter' && handleCreateFile()}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setShowNewFile(false)}>Cancel</Button>
          <Button onClick={handleCreateFile}>Create</Button>
        </div>
      </Modal>

      <Modal open={showNewDir} onClose={() => setShowNewDir(false)} title="New Directory">
        <Input
          value={newDirName}
          onChange={e => setNewDirName(e.target.value)}
          placeholder="dirname"
          onKeyDown={e => e.key === 'Enter' && handleCreateDir()}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setShowNewDir(false)}>Cancel</Button>
          <Button onClick={handleCreateDir}>Create</Button>
        </div>
      </Modal>
    </Card>
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

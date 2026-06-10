import { useEffect, useState, useCallback, useRef } from 'react'
import { listFiles, readFile, writeFile, deleteFile, mkdir, renameFile, getUploadUrl, getContainerSFTP } from '@/api/files'
import { getAuthToken } from '@/api/client'
import type { ContainerSFTPInfo } from '@/api/files'
import { useUIStore } from '@/store/uiStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import type { FileEntry } from '@/api/files'
import {
  Folder, File, FileText, Image, FileCode, FileJson,
  Upload, Download, Plus, Trash2, Edit3, Save, X,
  ChevronRight, Home, Pencil, RefreshCw, FolderPlus,
  Search, Terminal, Server,
} from 'lucide-react'

interface UploadProgress {
  active: boolean
  percent: number
  filename: string
}

interface FileBrowserProps {
  containerId: string
  fullPage?: boolean
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatTime(t: string): string {
  if (!t) return ''
  const d = new Date(t)
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  const hours = d.getHours().toString().padStart(2, '0')
  const mins = d.getMinutes().toString().padStart(2, '0')
  return `${month}/${day} ${hours}:${mins}`
}

function fileIcon(name: string, isDir: boolean) {
  if (isDir) return <Folder size={16} className="text-indigo-400 shrink-0" />
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'js': case 'ts': case 'jsx': case 'tsx': case 'py': case 'go': case 'rs': case 'java': case 'c': case 'cpp': case 'rb': case 'php':
      return <FileCode size={16} className="text-emerald-400 shrink-0" />
    case 'json': case 'yaml': case 'yml': case 'xml': case 'toml':
      return <FileJson size={16} className="text-amber-400 shrink-0" />
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': case 'webp': case 'ico':
      return <Image size={16} className="text-sky-400 shrink-0" />
    case 'md': case 'txt': case 'log': case 'cfg': case 'conf': case 'ini':
      return <FileText size={16} className="text-[#8b949e] shrink-0" />
    case 'sh': case 'bash': case 'zsh': case 'fish':
      return <Terminal size={16} className="text-purple-400 shrink-0" />
    default:
      return <File size={16} className="text-[#8b949e] shrink-0" />
  }
}

export function FileBrowser({ containerId, fullPage }: FileBrowserProps) {
  const addToast = useUIStore(s => s.addToast)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [currentPath, setCurrentPath] = useState('/')
  const [loading, setLoading] = useState(true)
  const [operating, setOperating] = useState<string | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)

  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [showNewFile, setShowNewFile] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [showNewDir, setShowNewDir] = useState(false)
  const [newDirName, setNewDirName] = useState('')
  const [renamingFile, setRenamingFile] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [search, setSearch] = useState('')
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({ active: false, percent: 0, filename: '' })
  const [showSftpInfo, setShowSftpInfo] = useState(false)
  const [sftpInfo, setSftpInfo] = useState<ContainerSFTPInfo | null>(null)

  const loadFiles = useCallback(async (path: string) => {
    if (!containerId) return
    setLoading(true)
    setSearch('')
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

  useEffect(() => { loadFiles('/') }, [])

  const filtered = search
    ? files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
    : files

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !containerId) return
    setUploadProgress({ active: true, percent: 0, filename: file.name })

    const formData = new FormData()
    formData.append('file', file)
    formData.append('path', currentPath)

    const token = getAuthToken()
    const url = getUploadUrl(containerId, currentPath)
    const xhr = new XMLHttpRequest()

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        setUploadProgress(prev => ({ ...prev, percent: Math.round((evt.loaded / evt.total) * 100) }))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        addToast('Uploaded', 'success')
        loadFiles(currentPath)
      } else {
        try {
          const err = JSON.parse(xhr.responseText)
          addToast(err.error || 'Upload failed', 'error')
        } catch {
          addToast('Upload failed', 'error')
        }
      }
      setUploadProgress({ active: false, percent: 0, filename: '' })
    }

    xhr.onerror = () => {
      addToast('Upload failed', 'error')
      setUploadProgress({ active: false, percent: 0, filename: '' })
    }

    xhr.open('POST', url)
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token)
    xhr.send(formData)

    e.target.value = ''
  }

  const handleDelete = async (filePath: string) => {
    if (!confirm('Delete ' + filePath + '?')) return
    setOperating(filePath)
    try {
      await deleteFile(containerId, filePath)
      addToast('Deleted', 'success')
      loadFiles(currentPath)
    } catch (err: any) {
      addToast(err.message || 'Failed to delete', 'error')
    }
    setOperating(null)
  }

  const handleRename = async () => {
    if (!containerId || !renamingFile || !renameName) return
    const parent = renamingFile.substring(0, renamingFile.lastIndexOf('/'))
    const newPath = (parent || '') + '/' + renameName
    try {
      await renameFile(containerId, renamingFile, newPath)
      addToast('Renamed', 'success')
      setRenamingFile(null)
      setRenameName('')
      loadFiles(currentPath)
    } catch (err: any) {
      addToast(err.message || 'Failed to rename', 'error')
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

  const handleEdit = async (filePath: string) => {
    try {
      const content = await readFile(containerId, filePath)
      setEditingFile(filePath)
      setEditContent(content)
    } catch (err: any) {
      addToast(err.message || 'Failed to read file', 'error')
    }
  }

  const handleSave = async () => {
    if (!editingFile) return
    try {
      await writeFile(containerId, editingFile, editContent)
      addToast('File saved', 'success')
      setEditingFile(null)
    } catch (err: any) {
      addToast(err.message || 'Failed to save file', 'error')
    }
  }

  const breadcrumbs = currentPath.split('/').filter(Boolean)
  const parentPath = breadcrumbs.length > 0
    ? '/' + breadcrumbs.slice(0, -1).join('/')
    : '/'

  const enterDir = (p: string) => { setLoading(true); loadFiles(p) }

  if (loading && files.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-5 h-5 text-[#636d7d]" />
      </div>
    )
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        {fullPage && (
          <div>
            <h2 className="text-sm font-semibold text-[#e6edf3]">Files</h2>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial sm:min-w-[160px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#636d7d]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter..."
              className="w-full sm:w-36 pl-8 pr-2 py-1.5 rounded-lg bg-[#1c1f26] border border-white/[0.08] text-xs text-[#e6edf3] placeholder:text-[#636d7d] focus:outline-none focus:border-indigo-500/50"
            />
          </div>
          <button onClick={() => loadFiles(currentPath)} className="btn-ghost p-1.5 rounded-lg" title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="w-px h-5 bg-white/[0.06] mx-0.5" />
          <Button variant="secondary" size="sm" onClick={() => setShowNewFile(true)}>
            <Plus size={13} /> File
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowNewDir(true)}>
            <FolderPlus size={13} />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => uploadRef.current?.click()} disabled={uploadProgress.active}>
            {uploadProgress.active ? (
              <><Upload size={13} className="animate-pulse" /> {uploadProgress.percent}%</>
            ) : (
              <><Upload size={13} /> Upload</>
            )}
          </Button>
          <input ref={uploadRef} type="file" className="hidden" onChange={handleUpload} />
        </div>
      </div>

      {/* Upload progress bar */}
      {uploadProgress.active && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-[#8b949e] truncate max-w-[200px]">{uploadProgress.filename}</span>
            <span className="text-[10px] text-[#636d7d] font-mono">{uploadProgress.percent}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-200 ease-out"
              style={{ width: uploadProgress.percent + '%' }}
            />
          </div>
        </div>
      )}

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-xs mb-3 text-[#636d7d] overflow-x-auto scrollbar-none">
        <button onClick={() => enterDir('/')} className="hover:text-[#e6edf3] transition-colors p-1 shrink-0">
          <Home size={14} />
        </button>
        {currentPath !== '/' && <ChevronRight size={10} className="shrink-0" />}
        {breadcrumbs.map((crumb, i) => {
          const p = '/' + breadcrumbs.slice(0, i + 1).join('/')
          const isLast = i === breadcrumbs.length - 1
          return (
            <span key={i} className="flex items-center gap-1 min-w-0">
              <button
                onClick={() => enterDir(p)}
                className={`hover:text-indigo-400 transition-colors truncate max-w-[120px] ${isLast ? 'text-[#e6edf3]' : ''}`}
              >
                {crumb}
              </button>
              {!isLast && <ChevronRight size={10} className="shrink-0" />}
            </span>
          )
        })}
      </nav>

      {/* File list */}
      <Card>
        {/* Desktop table */}
        <div className="hidden md:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.05]">
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-[#636d7d] font-medium">Name</th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-[#636d7d] font-medium w-24">Size</th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-[#636d7d] font-medium w-28">Modified</th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-[#636d7d] font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {currentPath !== '/' && (
                <tr className="hover:bg-white/[0.02] cursor-pointer transition-colors" onClick={() => enterDir(parentPath)}>
                  <td className="px-4 py-2.5" colSpan={4}>
                    <div className="flex items-center gap-3">
                      <Folder size={15} className="text-[#636d7d] shrink-0" />
                      <span className="text-xs text-[#8b949e]">..</span>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((file) => (
                <tr key={file.path} className="group hover:bg-white/[0.02] transition-colors">
                  <td
                    className="px-4 py-2.5 cursor-pointer"
                    onClick={() => file.is_dir ? enterDir(file.path) : handleEdit(file.path)}
                  >
                    <div className="flex items-center gap-3">
                      {fileIcon(file.name, file.is_dir)}
                      <span className="text-xs text-[#e6edf3] truncate max-w-[320px]">{file.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-[11px] text-[#636d7d] font-mono">
                      {file.is_dir ? '—' : formatSize(file.size)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-[11px] text-[#636d7d] font-mono">{formatTime(file.mod_time)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); setRenamingFile(file.path); setRenameName(file.name) }}
                        className="btn-ghost p-1.5 rounded-lg"
                        title="Rename"
                      >
                        <Pencil size={12} />
                      </button>
                      {!file.is_dir && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEdit(file.path) }}
                          className="btn-ghost p-1.5 rounded-lg"
                          title="Edit"
                        >
                          <Edit3 size={12} />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(file.path) }}
                        className="btn-ghost p-1.5 rounded-lg text-red-400 hover:text-red-300"
                        title="Delete"
                        disabled={operating === file.path}
                      >
                        {operating === file.path ? <Spinner className="h-3 w-3" /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-10">
              <p className="text-xs text-[#636d7d]">{search ? 'No files match filter' : 'Empty directory'}</p>
            </div>
          )}
        </div>

        {/* Mobile list */}
        <div className="md:hidden divide-y divide-white/[0.03]">
          {currentPath !== '/' && (
            <div onClick={() => enterDir(parentPath)} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02]">
              <Folder size={16} className="text-[#636d7d] shrink-0" />
              <span className="text-xs text-[#8b949e]">..</span>
            </div>
          )}
          {filtered.map((file) => (
            <div key={file.path} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div
                  className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                  onClick={() => file.is_dir ? enterDir(file.path) : handleEdit(file.path)}
                >
                  {fileIcon(file.name, file.is_dir)}
                  <span className="text-xs text-[#e6edf3] truncate">{file.name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => { setRenamingFile(file.path); setRenameName(file.name) }} className="btn-ghost p-1.5 rounded-lg">
                    <Pencil size={12} />
                  </button>
                  {!file.is_dir && (
                    <button onClick={() => handleEdit(file.path)} className="btn-ghost p-1.5 rounded-lg">
                      <Edit3 size={12} />
                    </button>
                  )}
                  <button onClick={() => handleDelete(file.path)} className="btn-ghost p-1.5 rounded-lg text-red-400">
                    {operating === file.path ? <Spinner className="h-3 w-3" /> : <Trash2 size={12} />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1 ml-9">
                <span className="text-[10px] text-[#636d7d] font-mono">{file.is_dir ? '—' : formatSize(file.size)}</span>
                <span className="text-[10px] text-[#636d7d]">{formatTime(file.mod_time)}</span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-8">
              <p className="text-xs text-[#636d7d]">{search ? 'No files match filter' : 'Empty directory'}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Footer with count and SFTP info */}
      <div className="flex items-center justify-between mt-2">
        <p className="text-[10px] text-[#636d7d]">
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          {search && files.length !== filtered.length ? ` (${files.length} total)` : ''}
        </p>
        <button
          onClick={async () => {
            try {
              const info = await getContainerSFTP(containerId)
              setSftpInfo(info)
              setShowSftpInfo(true)
            } catch (err: any) {
              addToast(err.message || 'Failed to get SFTP info', 'error')
            }
          }}
          className="flex items-center gap-1.5 text-[10px] text-[#636d7d] hover:text-indigo-400 transition-colors"
        >
          <Terminal size={11} />
          SFTP
        </button>
      </div>

      {/* Edit Modal */}
      <Modal open={!!editingFile} onClose={() => setEditingFile(null)} title={editingFile || 'Edit file'} size="lg">
        <div className="flex items-center gap-2 mb-3">
          <code className="text-xs text-[#8b949e] truncate flex-1">{editingFile}</code>
          {editingFile && (
            <span className="text-[10px] text-[#636d7d] font-mono">
              {(() => {
                const ext = editingFile.split('.').pop()?.toLowerCase()
                const langMap: Record<string, string> = { js: 'JavaScript', ts: 'TypeScript', py: 'Python', go: 'Go', rs: 'Rust', json: 'JSON', yaml: 'YAML', md: 'Markdown', sh: 'Shell', html: 'HTML', css: 'CSS', jsx: 'JSX', tsx: 'TSX' }
                return langMap[ext || ''] || ext?.toUpperCase() || 'Text'
              })()}
            </span>
          )}
        </div>
        <textarea
          className="w-full h-[50vh] bg-[#0d1117] text-[#e6edf3] text-xs font-mono p-4 rounded-lg border border-white/[0.08] resize-none focus:outline-none focus:border-indigo-500/50"
          value={editContent}
          onChange={e => setEditContent(e.target.value)}
          spellCheck={false}
        />
        <div className="flex justify-between items-center mt-4">
          <p className="text-[10px] text-[#636d7d]">
            {editContent.split('\n').length} lines · {editContent.length} chars
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditingFile(null)}>
              <X size={14} /> Cancel
            </Button>
            <Button onClick={handleSave}>
              <Save size={14} /> Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* New File Modal */}
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

      {/* New Directory Modal */}
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

      {/* SFTP Info Modal */}
      <Modal open={showSftpInfo} onClose={() => setShowSftpInfo(false)} title="SFTP Connection">
        {sftpInfo && (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium">Host</label>
              <p className="text-xs text-[#e6edf3] font-mono mt-0.5">{sftpInfo.host}</p>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium">Port</label>
              <p className="text-xs text-[#e6edf3] font-mono mt-0.5">{sftpInfo.port || '2222'}</p>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium">Username</label>
              <p className="text-xs text-[#e6edf3] font-mono mt-0.5">{sftpInfo.username}</p>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium">Password</label>
              {sftpInfo.password ? (
                <p className="text-xs text-[#e6ed3f] font-mono mt-0.5 break-all">{sftpInfo.password}</p>
              ) : (
                <p className="text-xs text-[#636d7d] mt-0.5">Already generated — reset to get new one</p>
              )}
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium">Remote Path</label>
              <p className="text-xs text-[#8b949e] font-mono mt-0.5">
                /{containerId.slice(0, 12)}/
              </p>
            </div>
            <div className="bg-white/[0.04] rounded-lg p-3 mt-2">
              <p className="text-[10px] text-[#636d7d] mb-1 font-medium">Example connection string:</p>
              <code className="text-[11px] text-[#e6edf3] font-mono break-all">
                sftp://{sftpInfo.username}@{sftpInfo.host}:{sftpInfo.port || '2222'}/</code>
            </div>
          </div>
        )}
        <div className="flex justify-end mt-4">
          <Button onClick={() => setShowSftpInfo(false)}>Close</Button>
        </div>
      </Modal>

      {/* Rename Modal */}
      <Modal open={!!renamingFile} onClose={() => setRenamingFile(null)} title={renamingFile || 'Rename'}>
        <Input
          value={renameName}
          onChange={e => setRenameName(e.target.value)}
          placeholder="new name"
          onKeyDown={e => e.key === 'Enter' && handleRename()}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setRenamingFile(null)}>Cancel</Button>
          <Button onClick={handleRename}>Rename</Button>
        </div>
      </Modal>
    </>
  )
}
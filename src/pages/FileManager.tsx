import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { listFiles, readFile, writeFile, deleteFile, mkdir, getUploadUrl } from '@/api/files'
import { getContainer } from '@/api/containers'
import { useUIStore } from '@/store/uiStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageLoading } from '@/components/ui/Spinner'
import type { Container } from '@/types'
import type { FileEntry } from '@/api/files'
import { ArrowLeft, Folder, File, Upload, Download, Plus, Trash2, Edit3, Save, X, ChevronRight, Home } from 'lucide-react'

export function FileManagerPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const addToast = useUIStore(s => s.addToast)
  const [container, setContainer] = useState<Container | null>(null)
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
    if (!id) return
    try {
      const entries = await listFiles(id, path)
      setFiles(entries)
      setCurrentPath(path)
    } catch (err: any) {
      addToast(err.message || 'Failed to load files', 'error')
    } finally {
      setLoading(false)
    }
  }, [id, addToast])

  useEffect(() => {
    if (!id) return
    getContainer(id).then(setContainer)
    listFiles(id, '/data').then(entries => {
      setFiles(entries)
      setCurrentPath('/data')
    }).catch(() => loadFiles('/'))
    setLoading(false)
  }, [id])

  const navigateToDir = (dirPath: string) => {
    setLoading(true)
    loadFiles(dirPath)
  }

  const handleEditFile = async (filePath: string) => {
    if (!id) return
    try {
      const content = await readFile(id, filePath)
      setEditingFile(filePath)
      setEditContent(content)
    } catch (err: any) {
      addToast(err.message || 'Failed to read file', 'error')
    }
  }

  const handleSaveFile = async () => {
    if (!id || !editingFile) return
    try {
      await writeFile(id, editingFile, editContent)
      addToast('File saved', 'success')
      setEditingFile(null)
    } catch (err: any) {
      addToast(err.message || 'Failed to save file', 'error')
    }
  }

  const handleDeleteFile = async (filePath: string) => {
    if (!id || !confirm('Delete ' + filePath + '?')) return
    try {
      await deleteFile(id, filePath)
      addToast('Deleted', 'success')
      loadFiles(currentPath)
    } catch (err: any) {
      addToast(err.message || 'Failed to delete', 'error')
    }
  }

  const handleCreateFile = async () => {
    if (!id || !newFileName) return
    try {
      const fp = currentPath === '/' ? '/' + newFileName : currentPath + '/' + newFileName
      await writeFile(id, fp, '')
      addToast('File created', 'success')
      setShowNewFile(false)
      setNewFileName('')
      loadFiles(currentPath)
    } catch (err: any) {
      addToast(err.message || 'Failed to create file', 'error')
    }
  }

  const handleCreateDir = async () => {
    if (!id || !newDirName) return
    try {
      const dp = currentPath === '/' ? '/' + newDirName : currentPath + '/' + newDirName
      await mkdir(id, dp)
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

  if (loading && files.length === 0) return <PageLoading />

  return (
    <div className="space-y-5 page-enter">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/containers/' + id)} className="btn-ghost p-2 rounded-xl">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-[#e6edf3]">File Manager</h1>
            <p className="text-xs text-[#636d7d]">{container?.name || id?.slice(0, 12)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowNewFile(true)}>
            <Plus size={14} /> New File
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowNewDir(true)}>
            <Plus size={14} /> New Dir
          </Button>
          <Button variant="secondary" size="sm">
            <label className="cursor-pointer flex items-center gap-2">
              <Upload size={14} /> Upload
              <input type="file" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file || !id) return
                const formData = new FormData()
                formData.append('file', file)
                formData.append('path', currentPath)
                try {
                  const token = localStorage.getItem('dck_token')
                  const url = getUploadUrl(id, currentPath)
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

      <Card>
        <div className="p-4">
          <nav className="flex items-center gap-1 text-xs mb-4 text-[#636d7d]">
            <button onClick={() => navigateToDir('/')} className="hover:text-[#e6edf3] transition-colors p-1">
              <Home size={14} />
            </button>
            <ChevronRight size={12} />
            {breadcrumbs.map((crumb, i) => {
              const p = '/' + breadcrumbs.slice(0, i + 1).join('/')
              return (
                <span key={i} className="flex items-center gap-1">
                  <button onClick={() => navigateToDir(p)} className="hover:text-indigo-400 transition-colors">
                    {crumb}
                  </button>
                  {i < breadcrumbs.length - 1 && <ChevronRight size={12} />}
                </span>
              )
            })}
          </nav>

          <div className="space-y-0.5">
            {currentPath !== '/' && (
              <div
                onClick={() => navigateToDir(parentPath)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] cursor-pointer transition-colors"
              >
                <Folder size={16} className="text-[#636d7d]" />
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
                  onClick={() => file.is_dir ? navigateToDir(file.path) : handleEditFile(file.path)}
                >
                  {file.is_dir ? (
                    <Folder size={16} className="text-indigo-400 shrink-0" />
                  ) : (
                    <File size={16} className="text-[#8b949e] shrink-0" />
                  )}
                  <span className="text-xs text-[#e6edf3] truncate">{file.name}</span>
                  <span className="text-[10px] text-[#636d7d] shrink-0">
                    {file.is_dir ? '' : formatSize(file.size)}
                  </span>
                  <span className="text-[10px] text-[#636d7d] shrink-0 ml-auto">{file.mod_time}</span>
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
            {files.length === 0 && (
              <p className="text-xs text-[#636d7d] text-center py-8">Empty directory</p>
            )}
          </div>
        </div>
      </Card>

      {/* Edit modal */}
      <Modal open={!!editingFile} onClose={() => setEditingFile(null)} title={editingFile || 'Edit file'}>
        <textarea
          className="w-full h-[400px] bg-[#0d1117] text-[#e6edf3] text-xs font-mono p-4 rounded-lg border border-white/[0.08] resize-none focus:outline-none focus:border-indigo-500/50"
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

      {/* New file modal */}
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

      {/* New directory modal */}
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
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i]
}

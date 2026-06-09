import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listBackups, createBackup, restoreBackup, deleteBackup } from '@/api/files'
import { getContainer } from '@/api/containers'
import { useUIStore } from '@/store/uiStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner, PageLoading } from '@/components/ui/Spinner'
import type { Container } from '@/types'
import type { BackupEntry } from '@/api/files'
import { ArrowLeft, Archive, Download, RotateCcw, Trash2, Plus, AlertTriangle } from 'lucide-react'

export function BackupsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const addToast = useUIStore(s => s.addToast)
  const [container, setContainer] = useState<Container | null>(null)
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null)
  const [restoring, setRestoring] = useState(false)

  const loadData = async () => {
    if (!id) return
    try {
      const [c, b] = await Promise.all([
        getContainer(id),
        listBackups(id),
      ])
      setContainer(c)
      setBackups(b)
    } catch (err: any) {
      addToast(err.message || 'Failed to load data', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [id])

  const handleCreate = async () => {
    if (!id) return
    setCreating(true)
    try {
      const backup = await createBackup(id)
      setBackups(prev => [backup, ...prev])
      addToast('Backup created', 'success')
    } catch (err: any) {
      addToast(err.message || 'Backup failed', 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleRestore = async () => {
    if (!id || !restoreTarget) return
    setRestoring(true)
    try {
      await restoreBackup(id, restoreTarget.name)
      addToast('Backup restored', 'success')
      setRestoreTarget(null)
    } catch (err: any) {
      addToast(err.message || 'Restore failed', 'error')
    } finally {
      setRestoring(false)
    }
  }

  const handleDelete = async (name: string) => {
    if (!id || !confirm('Delete backup ' + name + '?')) return
    try {
      await deleteBackup(id, name)
      setBackups(prev => prev.filter(b => b.name !== name))
      addToast('Backup deleted', 'success')
    } catch (err: any) {
      addToast(err.message || 'Delete failed', 'error')
    }
  }

  if (loading) return <PageLoading />

  return (
    <div className="space-y-5 page-enter">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/containers/' + id)} className="btn-ghost p-2 rounded-xl">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-[#e6edf3]">Backups</h1>
            <p className="text-xs text-[#636d7d]">{container?.name || id?.slice(0, 12)}</p>
          </div>
        </div>
        <Button onClick={handleCreate} loading={creating}>
          <Archive size={14} /> Create Backup
        </Button>
      </div>

      <Card>
        <div className="p-5 space-y-4">
          {backups.length === 0 ? (
            <div className="text-center py-12">
              <Archive size={32} className="mx-auto text-[#636d7d] mb-3" />
              <p className="text-sm text-[#8b949e]">No backups yet</p>
              <p className="text-xs text-[#636d7d] mt-1">Create your first backup to protect your data</p>
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map((backup) => (
                <div
                  key={backup.name}
                  className="flex items-center justify-between px-4 py-3 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Archive size={16} className="text-indigo-400" />
                    <div>
                      <p className="text-xs text-[#e6edf3] font-medium">{backup.name}</p>
                      <p className="text-[10px] text-[#636d7d]">{formatSize(backup.size)} · {backup.created_at}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setRestoreTarget(backup)}
                    >
                      <RotateCcw size={12} /> Restore
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(backup.name)}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Restore confirmation modal */}
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
        <p className="text-sm text-[#e6edf3] mb-2">
          Restore backup: <span className="font-mono text-indigo-400">{restoreTarget?.name}</span>
        </p>
        <p className="text-xs text-[#636d7d] mb-4">
          Size: {formatSize(restoreTarget?.size || 0)} · Created: {restoreTarget?.created_at}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRestoreTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleRestore} loading={restoring}>
            <RotateCcw size={14} /> Restore
          </Button>
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

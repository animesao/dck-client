import { useEffect, useState } from 'react'
import { scanProjects, deleteProject, deployProject } from '@/api/projects'
import { useUIStore } from '@/store/uiStore'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageLoading } from '@/components/ui/Spinner'
import { ContainerStatusBadge } from '@/components/containers/ContainerStatusBadge'
import type { ProjectInfo } from '@/types'
import { FileCode2, Trash2, Play, FolderOpen, RefreshCw } from 'lucide-react'

export function ProjectsPage() {
  const addToast = useUIStore(s => s.addToast)
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [loading, setLoading] = useState(true)

  const fetchProjects = async () => {
    setLoading(true)
    try {
      const data = await scanProjects()
      setProjects(data)
    } catch {
      addToast('Failed to scan projects', 'error')
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchProjects() }, [])

  const handleDeploy = async (dir: string) => {
    try { await deployProject(dir); addToast('Project deployed!', 'success'); fetchProjects() }
    catch (err: unknown) { addToast(err instanceof Error ? err.message : String(err), 'error') }
  }

  const handleDelete = async (dir: string) => {
    try { await deleteProject(dir); addToast('Project deleted', 'success'); fetchProjects() }
    catch (err: unknown) { addToast(err instanceof Error ? err.message : String(err), 'error') }
  }

  if (loading) return <PageLoading />

  return (
    <div className="space-y-5 page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Projects</h1>
          <p className="text-[#636d7d] text-sm mt-1">Manage dck.json projects</p>
        </div>
        <Button variant="secondary" onClick={fetchProjects}>
          <RefreshCw size={16} /> Scan Directories
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card>
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
              <FileCode2 size={28} className="text-[#636d7d]" />
            </div>
            <p className="text-sm text-[#636d7d]">No projects found</p>
            <p className="text-xs text-[#636d7d] mt-1">Create a dck.json file in your project directory</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {projects.map(p => (
            <Card key={p.path} className="card-gradient">
              <div className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 flex items-center justify-center border border-indigo-500/10">
                      <FileCode2 size={20} className="text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#e6edf3]">{p.config?.name || p.dir}</p>
                      <p className="text-xs text-[#636d7d] font-mono">{p.path}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {p.container && <ContainerStatusBadge status={p.container.status} />}
                    <Button variant="secondary" size="sm" onClick={() => handleDeploy(p.dir)}>
                      <Play size={14} /> Deploy
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(p.dir)} className="text-red-400 hover:text-red-300">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getContainer } from '@/api/containers'
import { useUIStore } from '@/store/uiStore'
import { PageLoading } from '@/components/ui/Spinner'
import { FileBrowser } from '@/components/containers/FileBrowser'
import type { Container } from '@/types'
import { ArrowLeft } from 'lucide-react'

export function FileManagerPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [container, setContainer] = useState<Container | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    getContainer(id).then(c => {
      setContainer(c)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  if (loading) return <PageLoading />

  return (
    <div className="space-y-5 page-enter">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/containers/' + id)} className="btn-ghost p-2 rounded-xl">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-[#e6edf3]">File Manager</h1>
          <p className="text-xs text-[#636d7d]">{container?.name || id?.slice(0, 12)}</p>
        </div>
      </div>

      {id && <FileBrowser containerId={id} />}
    </div>
  )
}

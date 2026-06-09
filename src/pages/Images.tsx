import { useEffect, useState } from 'react'
import { listImages, pullImage, removeImage } from '@/api/images'
import { useUIStore } from '@/store/uiStore'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageLoading } from '@/components/ui/Spinner'
import { formatRelativeTime } from '@/utils'
import type { Image } from '@/types'
import { Trash2, Download, HardDrive, RefreshCw, Search } from 'lucide-react'

export function ImagesPage() {
  const addToast = useUIStore(s => s.addToast)
  const [images, setImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(true)
  const [pullName, setPullName] = useState('')
  const [pulling, setPulling] = useState(false)
  const [search, setSearch] = useState('')

  const fetchImages = async () => {
    try {
      const data = await listImages()
      setImages(data)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchImages() }, [])

  const handlePull = async () => {
    if (!pullName.trim()) return
    setPulling(true)
    try {
      await pullImage(pullName.trim())
      addToast(`Image "${pullName.trim()}" pulled successfully`, 'success')
      setPullName('')
      fetchImages()
    } catch (err: any) {
      addToast(err.message || 'Failed to pull image', 'error')
    } finally { setPulling(false) }
  }

  const handleRemove = async (name: string, tag: string) => {
    try {
      await removeImage(name, tag)
      addToast('Image removed', 'success')
      fetchImages()
    } catch (err: any) {
      addToast(err.message || 'Failed to remove image', 'error')
    }
  }

  const filtered = images.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.tag.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <PageLoading />

  return (
    <div className="space-y-5 page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Container Images</h1>
          <p className="text-[#636d7d] text-sm mt-1">Manage pulled container images</p>
        </div>
        <button onClick={fetchImages} className="btn-ghost p-2"><RefreshCw size={16} /></button>
      </div>

      {/* Pull */}
      <Card>
        <div className="p-4 flex flex-col sm:flex-row gap-3">
          <Input
            value={pullName}
            onChange={e => setPullName(e.target.value)}
            placeholder="Pull an image, e.g. nginx:latest"
            onKeyDown={e => e.key === 'Enter' && handlePull()}
            className="flex-1"
          />
          <Button onClick={handlePull} loading={pulling} className="shrink-0">
            <Download size={16} /> Pull
          </Button>
        </div>
      </Card>

      {/* Filter */}
      <div className="relative max-w-xs">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#636d7d]" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search images..." className="input pl-9" />
      </div>

      {/* List */}
      <Card>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
                <HardDrive size={28} className="text-[#636d7d]" />
              </div>
              <p className="text-sm text-[#636d7d]">No images found</p>
              <p className="text-xs text-[#636d7d] mt-1">Pull an image to get started</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#636d7d] font-medium">Image</th>
                  <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#636d7d] font-medium hidden md:table-cell">ID</th>
                  <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#636d7d] font-medium hidden md:table-cell">Size</th>
                  <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#636d7d] font-medium hidden md:table-cell">Created</th>
                  <th className="text-right px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map(img => (
                  <tr key={`${img.name}:${img.tag}`} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 flex items-center justify-center border border-indigo-500/10">
                          <HardDrive size={16} className="text-indigo-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#e6edf3]">
                            {img.name}:<span className="text-indigo-400">{img.tag}</span>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-mono text-[#636d7d] hidden md:table-cell">
                      {img.id.slice(0, 16)}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-[#636d7d] hidden md:table-cell">
                      {img.size}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-[#636d7d] hidden md:table-cell">
                      {formatRelativeTime(img.created)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleRemove(img.name, img.tag)} className="text-red-400 hover:text-red-300">
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}

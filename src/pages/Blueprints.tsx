import { useEffect, useState } from 'react'
import { listBlueprints, launchBlueprint } from '@/api/blueprints'
import { getCategories } from '@/api/settings'
import { useUIStore } from '@/store/uiStore'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { PageLoading } from '@/components/ui/Spinner'
import { CategoryIcon, CategoryIconBox, CategoryBadge } from '@/components/ui/CategoryIcon'
import type { Blueprint, CategoryPreset } from '@/types'
import { Search, Rocket, ArrowUpRight } from 'lucide-react'

export function BlueprintsPage() {
  const addToast = useUIStore(s => s.addToast)
  const [blueprints, setBlueprints] = useState<Blueprint[]>([])
  const [categories, setCategories] = useState<CategoryPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [selectedBp, setSelectedBp] = useState<Blueprint | null>(null)
  const [envValues, setEnvValues] = useState<Record<string, string>>({})
  const [deploying, setDeploying] = useState(false)

  useEffect(() => {
    Promise.all([
      listBlueprints(),
      getCategories(),
    ]).then(([bps, cats]) => {
      setBlueprints(bps)
      setCategories(cats)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const filtered = blueprints.filter(bp => {
    if (activeCategory !== 'all' && bp.category !== activeCategory) return false
    if (search && !bp.name.toLowerCase().includes(search.toLowerCase()) && !bp.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const openBp = (bp: Blueprint) => {
    setSelectedBp(bp)
    const defaults: Record<string, string> = {}
    bp.env.forEach(e => {
      if (e.default) defaults[e.key] = e.default
    })
    setEnvValues(defaults)
  }

  const handleLaunch = async () => {
    if (!selectedBp) return
    setDeploying(true)
    try {
      await launchBlueprint(selectedBp.name, envValues)
      addToast('Blueprint deployed successfully!', 'success')
      setSelectedBp(null)
    } catch (err: any) {
      addToast(err.message || 'Failed to deploy blueprint', 'error')
    } finally {
      setDeploying(false)
    }
  }

  if (loading) return <PageLoading />

  return (
    <div className="space-y-6 page-enter">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3]">Blueprints</h1>
          <p className="text-[#8b949e] text-sm mt-1">Pre-configured application templates — deploy in one click</p>
        </div>
      </div>

      {/* Category filter + Search */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0 flex-nowrap sm:flex-wrap">
          <button
            onClick={() => setActiveCategory('all')}
            className={`shrink-0 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              activeCategory === 'all'
                ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 shadow-sm'
                : 'bg-white/[0.03] text-[#8b949e] hover:text-[#e6edf3] border border-white/[0.06] hover:border-white/[0.12]'
            }`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat.name}
              onClick={() => setActiveCategory(cat.name)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeCategory === cat.name
                  ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 shadow-sm'
                  : 'bg-white/[0.03] text-[#8b949e] hover:text-[#e6edf3] border border-white/[0.06] hover:border-white/[0.12]'
              }`}
            >
              <CategoryIcon category={cat.name} size={15} />
              {cat.name.charAt(0).toUpperCase() + cat.name.slice(1)}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-auto">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#636d7d]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="input pl-9 w-full sm:w-56"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(bp => (
          <Card key={bp.name} hover onClick={() => openBp(bp)} className="group">
            <div className="p-5">
              <div className="flex items-start gap-4">
                <CategoryIconBox category={bp.category} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-[#e6edf3] group-hover:text-indigo-300 transition-colors">{bp.name}</h3>
                    <ArrowUpRight size={14} className="text-[#636d7d] group-hover:text-indigo-400 mt-0.5 shrink-0 transition-colors" />
                  </div>
                  <p className="text-xs text-[#8b949e] mt-1.5 line-clamp-2 leading-relaxed">{bp.description}</p>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-white/[0.04] text-[#8b949e] border border-white/[0.06]">
                      {bp.image}
                    </span>
                    <CategoryBadge category={bp.category} />
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
            <Search size={28} className="text-[#636d7d]" />
          </div>
          <p className="text-[#8b949e] text-sm">No blueprints match your search</p>
        </div>
      )}

      {/* Deploy Modal */}
      <Modal open={!!selectedBp} onClose={() => setSelectedBp(null)} title={selectedBp?.name} size="lg">
        {selectedBp && (
          <div className="space-y-5">
            <div className="flex items-start gap-4">
              <CategoryIconBox category={selectedBp.category} />
              <div>
                <p className="text-sm text-[#8b949e] leading-relaxed">{selectedBp.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-white/[0.04] text-[#8b949e] border border-white/[0.06]">
                    {selectedBp.image}
                  </span>
                  <CategoryBadge category={selectedBp.category} />
                </div>
              </div>
            </div>

            <div className="h-px bg-white/[0.06]" />

            <div className="space-y-4">
              <h4 className="text-sm font-medium text-[#e6edf3]">Configuration</h4>
              {selectedBp.env.map(env => (
                env.options && env.options.length > 0 ? (
                  <Select
                    key={env.key}
                    label={`${env.key}${env.required ? ' *' : ''}`}
                    value={envValues[env.key] || ''}
                    onChange={e => setEnvValues({ ...envValues, [env.key]: e.target.value })}
                    options={env.options.map(o => ({ value: o, label: o }))}
                    placeholder={`Select ${env.key}`}
                  />
                ) : (
                  <Input
                    key={env.key}
                    label={`${env.key}${env.required ? ' *' : ''}`}
                    value={envValues[env.key] || ''}
                    onChange={e => setEnvValues({ ...envValues, [env.key]: e.target.value })}
                    placeholder={env.placeholder || `Enter ${env.key}`}
                    required={env.required}
                  />
                )
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setSelectedBp(null)}>Cancel</Button>
              <Button onClick={handleLaunch} loading={deploying}>
                <Rocket size={16} /> Deploy Blueprint
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

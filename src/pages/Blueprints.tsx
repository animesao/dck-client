import { useEffect, useState, useRef } from 'react'
import { listTemplates, listCategories, createTemplate, deleteTemplate, addCategory, deleteCategory } from '@/api/blueprints'
import type { Template } from '@/api/blueprints'
import { createContainer } from '@/api/containers'
import { useUIStore } from '@/store/uiStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageLoading } from '@/components/ui/Spinner'
import { Search, Rocket, Upload, Plus, X, Tag, Trash2, FileJson } from 'lucide-react'

function parseEnv(envStr: string): Record<string, string> {
  try {
    const arr = JSON.parse(envStr)
    if (Array.isArray(arr)) {
      const obj: Record<string, string> = {}
      arr.forEach((e: { key: string; value: string }) => { obj[e.key] = e.value })
      return obj
    }
  } catch {}
  return {}
}

export function BlueprintsPage() {
  const addToast = useUIStore(s => s.addToast)
  const [templates, setTemplates] = useState<Template[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [importOpen, setImportOpen] = useState(false)
  const [importData, setImportData] = useState('')
  const [importName, setImportName] = useState('')
  const [importCategory, setImportCategory] = useState('')
  const [newCategoryOpen, setNewCategoryOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null)
  const [deleteTpl, setDeleteTpl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Deploy options
  const [deployTpl, setDeployTpl] = useState<Template | null>(null)
  const [deployName, setDeployName] = useState('')
  const [deployPorts, setDeployPorts] = useState<string[]>([])
  const [deployVolSrc, setDeployVolSrc] = useState<string[]>([])
  const [deployVolumes, setDeployVolumes] = useState<string[]>([])
  const [deployEnv, setDeployEnv] = useState<{key:string;value:string}[]>([])

  const makeUniqueVolumes = (name: string, vols: string[]) =>
    vols.map(v => {
      const parts = v.split(':')
      if (parts.length >= 2 && !parts[0].includes('/') && !parts[0].includes('.'))
        return `${name}-${parts[0]}:${parts.slice(1).join(':')}`
      return v
    })

  const load = () => {
    setLoading(true)
    Promise.all([listTemplates(), listCategories()])
      .then(([tpls, cats]) => { setTemplates(tpls); setCategories(cats) })
      .catch(() => addToast('Failed to load templates', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const filtered = templates.filter(t => {
    if (activeCategory !== 'all' && t.category !== activeCategory) return false
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string)
        setImportData(JSON.stringify(data, null, 2))
        setImportName(data.name || file.name.replace(/\.template\.json$/i, '').replace(/\.json$/i, ''))
        setImportCategory(data.category || 'uncategorized')
        setImportOpen(true)
      } catch {
        addToast('Invalid JSON file', 'error')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleImport = async () => {
    if (!importName || !importCategory) return
    setSubmitting(true)
    try {
      let parsed: any
      try { parsed = JSON.parse(importData) } catch { addToast('Invalid JSON', 'error'); setSubmitting(false); return }
      await createTemplate({
        name: importName,
        category: importCategory,
        description: parsed.description || '',
        image: parsed.image || '',
        tag: parsed.tag,
        command: parsed.command || '',
        env: parsed.env || '[]',
        ports: parsed.ports || '',
        memory: parsed.memory,
        cpus: parsed.cpus,
        restart: parsed.restart,
        network: parsed.network,
        volumes: parsed.volumes,
      })
      addToast('Template imported', 'success')
      setImportOpen(false)
      setImportData('')
      load()
    } catch (err: any) {
      addToast(err.message || 'Import failed', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    try { await deleteTemplate(id); load(); addToast('Template deleted', 'success') }
    catch (err: any) { addToast(err.message || 'Delete failed', 'error') }
    setDeleteTpl(null)
  }

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return
    setSubmitting(true)
    try {
      await addCategory(newCategoryName.trim())
      addToast('Category created', 'success')
      setNewCategoryOpen(false)
      setNewCategoryName('')
      load()
    } catch (err: any) {
      addToast(err.message || 'Failed to create category', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteCategory = async () => {
    if (!categoryToDelete) return
    try {
      await deleteCategory(categoryToDelete)
      addToast('Category deleted', 'success')
      if (activeCategory === categoryToDelete) setActiveCategory('all')
      load()
    } catch (err: any) {
      addToast(err.message || 'Failed to delete category', 'error')
    }
    setCategoryToDelete(null)
  }

  const openDeployModal = (tpl: Template) => {
    const envArr = (() => { try { return JSON.parse(tpl.env) } catch { return [] } })() as { key: string; value: string }[]
    const tplVols = tpl.volumes ? tpl.volumes.split(',').map(v => v.trim()).filter(Boolean) : []
    setDeployVolSrc(tplVols)
    const name = `${tpl.name}-${Date.now().toString(36).slice(-4)}`
    setDeployName(name)
    setDeployPorts(tpl.ports ? tpl.ports.split(',').map(p => p.trim()).filter(Boolean) : [''])
    setDeployVolumes(makeUniqueVolumes(name, tplVols))
    setDeployEnv(Array.isArray(envArr) ? envArr.filter(e => e.key) : [])
    setDeployTpl(tpl)
  }

  const handleDeploy = async () => {
    const tpl = deployTpl
    if (!tpl) return
    setSubmitting(true)
    try {
      const image = tpl.tag && tpl.tag !== 'latest' ? `${tpl.image}:${tpl.tag}` : tpl.image
      await createContainer({
        image,
        name: deployName,
        command: tpl.command || undefined,
        env: deployEnv.map(e => `${e.key}=${e.value}`),
        ports: deployPorts.filter(Boolean).length > 0 ? deployPorts.filter(Boolean) : undefined,
        volumes: deployVolumes.filter(Boolean).length > 0 ? deployVolumes.filter(Boolean) : undefined,
        memory: tpl.memory || undefined,
        cpus: tpl.cpus || undefined,
      })
      addToast('Container created from template!', 'success')
      setDeployTpl(null)
    } catch (err: any) {
      addToast(err.message || 'Failed to deploy', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <PageLoading />

  return (
    <div className="space-y-6 page-enter">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3]">Blueprints</h1>
          <p className="text-[#8b949e] text-sm mt-1">Container templates — deploy in one click</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Import
          </Button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
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
            <div key={cat} className="shrink-0 flex items-center">
              <button
                onClick={() => setActiveCategory(cat)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  activeCategory === cat
                    ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 shadow-sm'
                    : 'bg-white/[0.03] text-[#8b949e] hover:text-[#e6edf3] border border-white/[0.06] hover:border-white/[0.12]'
                }`}
              >
                <Tag size={14} />
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
              <button
                onClick={() => setCategoryToDelete(cat)}
                className="ml-0.5 p-1 rounded-lg text-[#636d7d] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Delete category"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            onClick={() => setNewCategoryOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-white/[0.03] text-[#8b949e] hover:text-[#e6edf3] border border-dashed border-white/[0.1] hover:border-white/[0.2] transition-all"
          >
            <Plus size={14} /> Category
          </button>
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
        {filtered.map(tpl => {
          const envObj = parseEnv(tpl.env)
          const envCount = Object.keys(envObj).length
          return (
            <Card key={tpl.id} className="group">
              <div className="p-5 flex flex-col h-full">
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-[#e6edf3] group-hover:text-indigo-300 transition-colors">{tpl.name}</h3>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTpl(tpl.id) }}
                      className="shrink-0 p-1 rounded-lg text-[#636d7d] hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="text-xs text-[#8b949e] mt-1.5 line-clamp-2 leading-relaxed">{tpl.description || 'No description'}</p>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-white/[0.04] text-[#8b949e] border border-white/[0.06]">
                      {tpl.image}{tpl.tag ? `:${tpl.tag}` : ''}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/15">
                      {tpl.category}
                    </span>
                    {envCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/[0.03] text-[#8b949e] border border-white/[0.06]">
                        {envCount} env
                      </span>
                    )}
                  </div>
                </div>
                <Button size="sm" className="mt-4 w-full" onClick={() => openDeployModal(tpl)}>
                  <Rocket size={14} /> Deploy
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
            <FileJson size={28} className="text-[#636d7d]" />
          </div>
          <p className="text-[#8b949e] text-sm">No templates yet. Export a container as a template or import one.</p>
        </div>
      )}

      {/* Import Modal */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import Template" size="lg">
        <div className="space-y-4">
          <Input label="Name" value={importName} onChange={e => setImportName(e.target.value)} required />
          <Input label="Category" value={importCategory} onChange={e => setImportCategory(e.target.value)} required />
          <div>
            <label className="block text-xs font-medium text-[#8b949e] mb-1.5">Template JSON</label>
            <textarea
              value={importData}
              onChange={e => setImportData(e.target.value)}
              className="input w-full h-48 font-mono text-xs resize-y"
              spellCheck={false}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={handleImport} loading={submitting}>
              <Upload size={14} /> Import
            </Button>
          </div>
        </div>
      </Modal>

      {/* Deploy Options Modal */}
      <Modal open={!!deployTpl} onClose={() => setDeployTpl(null)} title="Deploy Options" size="lg">
        <div className="space-y-4">
          <Input label="Container name" value={deployName} onChange={e => {
            const n = e.target.value
            setDeployName(n)
            setDeployVolumes(makeUniqueVolumes(n, deployVolSrc))
          }} required />

          <div>
            <label className="block text-xs font-medium text-[#8b949e] mb-1.5">Volumes</label>
            <div className="space-y-2">
              {deployVolumes.map((v, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={v}
                    onChange={e => { const n = [...deployVolumes]; n[i] = e.target.value; setDeployVolumes(n) }}
                    placeholder="volume:/container/path"
                    className="input flex-1 text-sm font-mono"
                  />
                  <button
                    onClick={() => setDeployVolumes(deployVolumes.filter((_, j) => j !== i))}
                    className="p-1.5 rounded-lg text-[#636d7d] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setDeployVolumes([...deployVolumes, ''])}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                + Add volume
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#8b949e] mb-1.5">Port mappings</label>
            <div className="space-y-2">
              {deployPorts.map((p, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={p}
                    onChange={e => { const n = [...deployPorts]; n[i] = e.target.value; setDeployPorts(n) }}
                    placeholder="host:container/protocol"
                    className="input flex-1 text-sm"
                  />
                  <button
                    onClick={() => setDeployPorts(deployPorts.filter((_, j) => j !== i))}
                    className="p-1.5 rounded-lg text-[#636d7d] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setDeployPorts([...deployPorts, ''])}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                + Add port
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#8b949e] mb-1.5">Environment variables</label>
            <div className="space-y-2">
              {deployEnv.map((e, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={e.key}
                    onChange={ev => { const n = [...deployEnv]; n[i] = { ...n[i], key: ev.target.value }; setDeployEnv(n) }}
                    placeholder="KEY"
                    className="input w-40 text-sm font-mono"
                  />
                  <span className="text-[#636d7d]">=</span>
                  <input
                    value={e.value}
                    onChange={ev => { const n = [...deployEnv]; n[i] = { ...n[i], value: ev.target.value }; setDeployEnv(n) }}
                    placeholder="value"
                    className="input flex-1 text-sm font-mono"
                  />
                  <button
                    onClick={() => setDeployEnv(deployEnv.filter((_, j) => j !== i))}
                    className="p-1.5 rounded-lg text-[#636d7d] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setDeployEnv([...deployEnv, { key: '', value: '' }])}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                + Add env
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setDeployTpl(null)}>Cancel</Button>
            <Button onClick={handleDeploy} loading={submitting}>
              <Rocket size={14} /> Deploy
            </Button>
          </div>
        </div>
      </Modal>

      {/* New Category Modal */}
      <Modal open={newCategoryOpen} onClose={() => setNewCategoryOpen(false)} title="New Category">
        <div className="space-y-4">
          <Input label="Category name" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} required />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setNewCategoryOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCategory} loading={submitting}>
              <Plus size={14} /> Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Category Confirm */}
      <Modal open={!!categoryToDelete} onClose={() => setCategoryToDelete(null)} title="Delete Category">
        <p className="text-sm text-[#8b949e]">Delete category <span className="text-[#e6edf3] font-mono">{categoryToDelete}</span>? Templates in it won't be removed.</p>
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="secondary" onClick={() => setCategoryToDelete(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDeleteCategory}>
            <Trash2 size={14} /> Delete
          </Button>
        </div>
      </Modal>

      {/* Delete Template Confirm */}
      <Modal open={!!deleteTpl} onClose={() => setDeleteTpl(null)} title="Delete Template">
        <p className="text-sm text-[#8b949e]">Delete this template permanently?</p>
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="secondary" onClick={() => setDeleteTpl(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deleteTpl && handleDeleteTemplate(deleteTpl)}>
            <Trash2 size={14} /> Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}

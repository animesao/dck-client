import { useState, useMemo, useEffect } from 'react'
import { createContainer } from '@/api/containers'
import { listImages, pullImage } from '@/api/images'
import { useUIStore } from '@/store/uiStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { imageConfigs, imageCategories } from '@/data/imageConfigs'
import type { CreateContainerRequest, Image, User } from '@/types'
import { Search, ChevronRight, Server, Globe, Database, Code, Gamepad2, Bot, Cpu, Download } from 'lucide-react'

interface CreateContainerModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  adminMode?: boolean
  users?: User[]
}

const catIcons: Record<string, any> = {
  Games: Gamepad2,
  Development: Code,
  'Operating Systems': MonitorIcon,
  'Web Servers': Globe,
  Databases: Database,
  Bots: Bot,
}

// Helper — no lazy import needed
function MonitorIcon(props: { className?: string; size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size || 16} height={props.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  )
}

interface EnvPair {
  key: string
  value: string
}

export function CreateContainerModal({ open, onClose, onSuccess, adminMode, users }: CreateContainerModalProps) {
  const addToast = useUIStore(s => s.addToast)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'user' | 'category' | 'image' | 'config'>('category')
  const [selectedCat, setSelectedCat] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [search, setSearch] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [form, setForm] = useState<CreateContainerRequest>({
    image: '',
    name: '',
    command: '',
    startup_script: '',
    ports: [],
    volumes: [],
    env: [],
    restart: 'no',
    memory: '',
    cpus: '',
    disk: '',
    network: 'bridge',
  })
  const [portStr, setPortStr] = useState('')
  const [envPairs, setEnvPairs] = useState<EnvPair[]>([])
  const [selectedTag, setSelectedTag] = useState('')

  const [availableImages, setAvailableImages] = useState<Image[]>([])
  const [pullingTag, setPullingTag] = useState('')
  const [isInstalled, setIsInstalled] = useState(false)

  const config = useMemo(() => imageConfigs.find(c => c.id === selectedId), [selectedId])

  useEffect(() => {
    if (!open) return
    setSelectedUserId('')
    setStep(adminMode ? 'user' : 'category')
    setIsInstalled(false)
    listImages().then(setAvailableImages).catch(() => {})
  }, [open])

  const availableTags = useMemo(() => {
    if (!config || availableImages.length === 0) return []
    return availableImages
      .filter(i => i.name === config.image)
      .map(i => i.tag)
  }, [config, availableImages])

  const handlePull = async (tag: string) => {
    if (!config) return
    setPullingTag(tag)
    try {
      await pullImage(`${config.image}:${tag}`)
      const imgs = await listImages()
      setAvailableImages(imgs)
      setSelectedTag(tag)
      setForm(f => ({ ...f, image: config.image + ':' + tag }))
      addToast(`Pulled ${config.image}:${tag}`, 'success')
    } catch (err: any) {
      addToast(err.message || 'Failed to pull image', 'error')
    } finally {
      setPullingTag('')
    }
  }

  const filtered = useMemo(() => {
    if (!search) return imageConfigs
    return imageConfigs.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.category.toLowerCase().includes(search.toLowerCase()) ||
      c.image.toLowerCase().includes(search.toLowerCase())
    )
  }, [search])

  const selectInstalledImage = (img: Image) => {
    const tag = img.tag || 'latest'
    const imageName = img.name.includes(':') ? img.name : img.name + ':' + tag
    setSelectedId('')
    setIsInstalled(true)
    setForm(f => ({
      ...f,
      image: imageName,
      command: '',
      memory: '',
      cpus: '',
    }))
    setPortStr('')
    setEnvPairs([])
    setSelectedTag(tag)
    setStep('config')
  }

  const selectImage = (id: string) => {
    const cfg = imageConfigs.find(c => c.id === id)
    if (!cfg) return
    const tags = availableImages.filter(i => i.name === cfg.image).map(i => i.tag)
    const firstTag = tags.includes('latest') ? 'latest' : tags[0] || ''
    setSelectedId(id)
    setSelectedTag(firstTag)
    setEnvPairs(cfg.env.map(e => ({ key: e.key, value: e.defaultValue })))
    setPortStr(cfg.ports.join(', '))
    setForm(f => ({
      ...f,
      image: firstTag ? cfg.image + ':' + firstTag : cfg.image,
      command: cfg.command,
      memory: cfg.memory || '',
      cpus: cfg.cpus || '',
    }))
    setStep('config')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const ports = portStr ? portStr.split(',').map(p => p.trim()).filter(Boolean) : []
      const envArr = envPairs.filter(p => p.key).map(p => `${p.key}=${p.value}`)
      // Build full image with tag
      const image = config ? (selectedTag ? `${config.image}:${selectedTag}` : config.image) : form.image
      const payload = { ...form, image, ports, volumes: [] as string[], env: envArr }
      if (adminMode && selectedUserId) {
        payload.user_id = selectedUserId
      }
      await createContainer(payload)
      addToast('Container created', 'success')
      onSuccess()
      onClose()
      resetForm()
    } catch (err: any) {
      addToast(err.message || 'Failed to create container', 'error')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setStep(adminMode ? 'user' : 'category')
    setSelectedCat('')
    setSelectedId('')
    setSelectedUserId('')
    setSearch('')
    setIsInstalled(false)
    setShowAdvanced(false)
    setForm({
      image: '', name: '', command: '', startup_script: '', ports: [], volumes: [],
      env: [], restart: 'no', memory: '', cpus: '', disk: '', network: 'bridge',
    })
    setPortStr('')
    setEnvPairs([])
    setSelectedTag('')
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Container" size="lg">
      {step === 'user' && adminMode && users && (
        <div>
          <p className="text-xs text-[#636d7d] mb-3">Select the user to create this container for:</p>
          <div className="space-y-1 max-h-[55vh] overflow-y-auto">
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => { setSelectedUserId(u.id); setStep('category') }}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between ${
                  selectedUserId === u.id
                    ? 'bg-indigo-500/10 border border-indigo-500/30'
                    : 'hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <div>
                  <p className="text-xs text-[#e6edf3] font-medium">{u.username}</p>
                  <p className="text-[10px] text-[#636d7d]">{u.role}</p>
                </div>
                {selectedUserId === u.id && (
                  <span className="text-[10px] text-indigo-400">Selected</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'category' && (
        <div>
          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636d7d]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search images..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#1c1f26] border border-white/[0.08] text-sm text-[#e6edf3] placeholder:text-[#636d7d] focus:outline-none focus:border-indigo-500/50"
              autoFocus
            />
          </div>

          {!search ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                {imageCategories.map(cat => {
                  const Icon = catIcons[cat] || Server
                  const count = imageConfigs.filter(c => c.category === cat).length
                  return (
                    <button
                      key={cat}
                      onClick={() => { setSelectedCat(cat); setStep('image') }}
                      className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-indigo-500/30 transition-all text-left"
                    >
                      <Icon className="text-indigo-400 shrink-0" size={16} />
                      <div className="min-w-0">
                        <p className="text-xs text-[#e6edf3] font-medium truncate">{cat}</p>
                        <p className="text-[10px] text-[#636d7d]">{count} images</p>
                      </div>
                      <ChevronRight size={12} className="text-[#636d7d] ml-auto shrink-0" />
                    </button>
                  )
                })}
              </div>

              <div className="border-t border-white/[0.06] pt-3">
                <p className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium mb-2">Installed Images</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-3">

                  {availableImages.slice(0, 12).map(img => {
                    const name = img.name.includes('/') ? img.name.split('/').pop()! : img.name
                    const label = img.tag ? `${name}:${img.tag}` : name
                    return (
                      <button
                        key={img.name + ':' + img.tag}
                        onClick={() => selectInstalledImage(img)}
                        className="text-left px-2.5 py-2 rounded-lg text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-white/[0.04] transition-colors truncate"
                      >
                        {label}
                      </button>
                    )
                  })}
                  {availableImages.length === 0 && (
                    <p className="text-xs text-[#636d7d] col-span-full py-1">No images pulled yet</p>
                  )}
                </div>
              </div>

              <div className="border-t border-white/[0.06] pt-3">
                <p className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium mb-2">Quick Select</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {imageConfigs.filter(c => ['minecraft-vanilla', 'node', 'python', 'nginx', 'mysql', 'postgres'].includes(c.id)).map(cfg => (
                    <button
                      key={cfg.id}
                      onClick={() => selectImage(cfg.id)}
                      className="text-left px-2.5 py-2 rounded-lg text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-white/[0.04] transition-colors truncate"
                    >
                      {cfg.name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-1 max-h-[50vh] overflow-y-auto">
              {filtered.map(cfg => (
                <button
                  key={cfg.id}
                  onClick={() => selectImage(cfg.id)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors"
                >
                  <p className="text-xs text-[#e6edf3] font-medium">{cfg.name}</p>
                  <p className="text-[10px] text-[#636d7d]">{cfg.image} — {cfg.description}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'image' && (
        <div>
          <button onClick={() => setStep(adminMode ? 'user' : 'category')} className="text-xs text-[#636d7d] hover:text-[#e6edf3] mb-3 flex items-center gap-1">
            ← {adminMode ? 'Select user' : 'All categories'}
          </button>
          <p className="text-sm font-medium text-[#e6edf3] mb-3">{selectedCat}</p>
          <div className="space-y-1 max-h-[55vh] overflow-y-auto">
            {imageConfigs.filter(c => c.category === selectedCat).map(cfg => (
              <button
                key={cfg.id}
                onClick={() => selectImage(cfg.id)}
                className="w-full text-left px-3 py-3 rounded-lg hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06] transition-all"
              >
                <p className="text-xs text-[#e6edf3] font-medium">{cfg.name}</p>
                <p className="text-[10px] text-[#636d7d] mt-0.5">{cfg.image}</p>
                <p className="text-[10px] text-[#636d7d]">{cfg.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'config' && (config || isInstalled) && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <button onClick={() => { setStep(isInstalled ? 'category' : 'image'); if (!isInstalled) setSelectedId(''); setIsInstalled(false) }} className="text-xs text-[#636d7d] hover:text-[#e6edf3] flex items-center gap-1">
            ← Change image
          </button>

          {config && (
          <div className="bg-white/[0.04] rounded-lg p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Cpu size={14} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#e6edf3]">{config.name}</p>
              <p className="text-[10px] text-[#636d7d] font-mono">{config.image}{selectedTag ? ':' + selectedTag : ''}</p>
            </div>
          </div>
          )}

          {isInstalled && (
          <div className="bg-white/[0.04] rounded-lg p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Cpu size={14} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#e6edf3]">Custom Image</p>
              <p className="text-[10px] text-[#636d7d] font-mono">{form.image}</p>
            </div>
          </div>
          )}

          {config && (
          <div>
            <label className="block text-xs font-medium text-[#e6edf3] mb-1.5">Version</label>
            {availableTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {availableTags.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setSelectedTag(v)
                      setForm(f => ({ ...f, image: config.image + ':' + v }))
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs border transition-all ${
                      selectedTag === v
                        ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                        : 'bg-white/[0.04] border-white/[0.08] text-[#8b949e] hover:border-white/[0.15]'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {['latest', ...(config.image.includes('minecraft') ? ['java8', 'java17', 'java21'] : [])].map(v => (
                  <button
                    key={v}
                    type="button"
                    disabled={pullingTag === v}
                    onClick={() => handlePull(v)}
                    className={`px-2.5 py-1 rounded-md text-xs border transition-all flex items-center gap-1 ${
                      pullingTag === v
                        ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300 animate-pulse'
                        : 'bg-white/[0.04] border-dashed border-white/[0.15] text-[#8b949e] hover:border-indigo-500/50 hover:text-indigo-300'
                    }`}
                  >
                    <Download size={10} />
                    {pullingTag === v ? `Pulling ${v}...` : `Pull ${v}`}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#e6edf3] mb-1">Startup Command</label>
            <input
              type="text"
              value={form.command || ''}
              onChange={e => setForm({ ...form, command: e.target.value })}
              placeholder={config?.command || 'Startup command...'}
              className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-white/[0.08] text-xs text-[#e6edf3] font-mono focus:outline-none focus:border-indigo-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#e6edf3] mb-1">Startup Script <span className="text-[#636d7d] font-normal">(optional, overrides command)</span></label>
            <textarea
              value={form.startup_script || ''}
              onChange={e => setForm({ ...form, startup_script: e.target.value })}
              placeholder={'#!/bin/sh\necho "Hello World"\n# Your startup commands here'}
              rows={4}
              className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-white/[0.08] text-xs text-[#e6edf3] font-mono focus:outline-none focus:border-indigo-500/50 resize-y"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Container Name"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="my-server"
            />
            <Input
              label="Ports (comma-separated)"
              value={portStr}
              onChange={e => setPortStr(e.target.value)}
              placeholder={config ? config.ports.join(', ') : '25565'}
            />
          </div>

          {config && config.env.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[#e6edf3] mb-2">Environment Variables</label>
              <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
                {config.env.map((envDef, idx) => {
                  const pair = envPairs[idx] || { key: envDef.key, value: envDef.defaultValue }
                  return (
                    <div key={envDef.key} className="bg-white/[0.02] rounded-lg p-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono text-indigo-400 font-medium">{envDef.key}</span>
                        {envDef.label && <span className="text-[10px] text-[#636d7d]">— {envDef.label}</span>}
                      </div>
                      {envDef.options ? (
                        <div className="flex flex-wrap gap-1">
                          {envDef.options.map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                const newPairs = [...envPairs]
                                newPairs[idx] = { ...pair, value: opt }
                                setEnvPairs(newPairs)
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                                pair.value === opt
                                  ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                                  : 'bg-white/[0.04] border-white/[0.08] text-[#8b949e]'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={pair.value}
                          onChange={e => {
                            const newPairs = [...envPairs]
                            newPairs[idx] = { ...pair, value: e.target.value }
                            setEnvPairs(newPairs)
                          }}
                          placeholder={envDef.description || envDef.defaultValue}
                          className="w-full mt-1 px-2 py-1 rounded bg-[#0d1117] border border-white/[0.08] text-xs text-[#e6edf3] font-mono focus:outline-none focus:border-indigo-500/50"
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#e6edf3] mb-1">Restart</label>
              <select
                value={form.restart}
                onChange={e => setForm({ ...form, restart: e.target.value })}
                className="w-full px-2 py-1.5 rounded-lg bg-[#1c1f26] border border-white/[0.08] text-xs text-[#e6edf3] focus:outline-none focus:border-indigo-500/50"
              >
                <option value="no">No</option>
                <option value="always">Always</option>
                <option value="on-failure">On Failure</option>
                <option value="unless-stopped">Unless Stopped</option>
              </select>
            </div>
            <Input
              label="Memory"
              value={form.memory || ''}
              onChange={e => setForm({ ...form, memory: e.target.value })}
              placeholder={config?.memory || '512m'}
            />
            <Input
              label="CPUs"
              value={form.cpus || ''}
              onChange={e => setForm({ ...form, cpus: e.target.value })}
              placeholder={config?.cpus || '1'}
            />
            <Input
              label="Disk (bytes)"
              value={form.disk || ''}
              onChange={e => setForm({ ...form, disk: e.target.value })}
              placeholder="e.g. 1073741824 (1GB)"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-[#636d7d] hover:text-[#e6edf3] flex items-center gap-1"
          >
            {showAdvanced ? '▼' : '▶'} Advanced
          </button>

          {showAdvanced && (
            <div className="space-y-3 border border-white/[0.08] rounded-lg p-3 bg-white/[0.02]">
              <Input
                label="Volumes"
                value={form.volumes?.join(', ') || ''}
                onChange={e => setForm({ ...form, volumes: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })}
                placeholder="/host:/container"
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={loading}>Create</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

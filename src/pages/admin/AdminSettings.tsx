import { useEffect, useState } from 'react'
import { getSettings, updateSettings } from '@/api/settings'
import { useUIStore } from '@/store/uiStore'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Switch } from '@/components/ui/Switch'
import { Button } from '@/components/ui/Button'
import { PageLoading } from '@/components/ui/Spinner'
import type { AppSettings } from '@/types'
import { Shield, Settings2, Eye, Info } from 'lucide-react'

const featureOptions = [
  { key: 'images', label: 'Images', desc: 'Hide Images page from all users' },
  { key: 'blueprints', label: 'Blueprints', desc: 'Hide Blueprints page from all users' },
  { key: 'projects', label: 'Projects', desc: 'Hide Projects page from all users' },
  { key: 'config', label: 'Config', desc: 'Hide Config page from all users' },
  { key: 'guide', label: 'Guide', desc: 'Hide Guide page from all users' },
]

function getDisabledSet(features: string): Set<string> {
  return new Set(features.split(',').map(s => s.trim()).filter(Boolean))
}

export function AdminSettingsPage() {
  const { isAdmin } = useAuth()
  const addToast = useUIStore(s => s.addToast)
  const loadSettingsStore = useUIStore(s => s.loadSettings)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    getSettings().then(setSettings).catch(() => addToast('Failed to load settings', 'error')).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try {
      await updateSettings(settings)
      addToast('Settings saved', 'success')
      loadSettingsStore()
    } catch (err: any) { addToast(err.message, 'error') }
    finally { setSaving(false) }
  }

  const toggleFeature = (key: string) => {
    if (!settings) return
    const current = getDisabledSet(settings.disabled_features)
    if (current.has(key)) current.delete(key)
    else current.add(key)
    setSettings({ ...settings, disabled_features: Array.from(current).join(',') })
  }

  if (loading) return <PageLoading />

  return (
    <div className="space-y-6 page-enter">
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Admin Settings</h1>
        <p className="text-[#636d7d] text-sm mt-1">System configuration</p>
      </div>

      <Card>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-2.5 pb-4 border-b border-white/[0.05]">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 flex items-center justify-center border border-indigo-500/10">
              <Shield size={18} className="text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#e6edf3]">System Settings</h3>
              <p className="text-xs text-[#636d7d]">Configure dck binary, data paths, and registration</p>
            </div>
          </div>

          <div className="space-y-4">
            <Input label="dck Binary Path" value={settings?.dck_bin || ''} onChange={e => setSettings(s => s ? { ...s, dck_bin: e.target.value } : s)} />
            <Input label="dck Data Directory" value={settings?.dck_data || ''} onChange={e => setSettings(s => s ? { ...s, dck_data: e.target.value } : s)} />
            <div className="flex gap-3">
              <div className="flex-1">
                <Input label="Port Range Start" type="number" min={1024} max={65535} value={String(settings?.port_range_start ?? '')} onChange={e => setSettings(s => s ? { ...s, port_range_start: parseInt(e.target.value) || 0 } : s)} />
              </div>
              <div className="flex-1">
                <Input label="Port Range End" type="number" min={1024} max={65535} value={String(settings?.port_range_end ?? '')} onChange={e => setSettings(s => s ? { ...s, port_range_end: parseInt(e.target.value) || 0 } : s)} />
              </div>
            </div>
            <p className="text-[11px] text-[#636d7d] -mt-1">Auto-assigned host ports for containers without a specified host port</p>
            <div className="pt-2">
              <Switch
                checked={settings?.registration || false}
                onChange={checked => setSettings(s => s ? { ...s, registration: checked } : s)}
                label="Allow new user registration"
              />
            </div>
          </div>

          <div className="pb-4 border-b border-white/[0.05]">
            <div className="flex items-center gap-2.5 pt-4">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500/20 to-teal-600/10 flex items-center justify-center border border-teal-500/10">
                <Settings2 size={18} className="text-teal-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#e6edf3]">Default Limits for New Users</h3>
                <p className="text-xs text-[#636d7d]">Resource limits applied to newly registered users (-1 = ∞, 0 = disabled)</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Max Containers" type="number" min={-1} value={String(settings?.default_container_limit ?? 0)} onChange={e => setSettings(s => s ? { ...s, default_container_limit: parseInt(e.target.value) || 0 } : s)} />
            <Input label="Max Memory (MB)" type="number" min={-1} value={String(settings?.default_memory_limit ?? 0)} onChange={e => setSettings(s => s ? { ...s, default_memory_limit: parseInt(e.target.value) || 0 } : s)} />
            <Input label="Max CPU Cores" type="number" min={-1} step={0.1} value={String(settings?.default_cpu_limit ?? 0)} onChange={e => setSettings(s => s ? { ...s, default_cpu_limit: parseFloat(e.target.value) || 0 } : s)} />
            <Input label="Max Ports per Container" type="number" min={-1} value={String(settings?.default_port_limit ?? 0)} onChange={e => setSettings(s => s ? { ...s, default_port_limit: parseInt(e.target.value) || 0 } : s)} />
          </div>

          <div className="pb-4 border-b border-white/[0.05]">
            <div className="flex items-center gap-2.5 pt-4">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center border border-amber-500/10">
                <Shield size={18} className="text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#e6edf3]">Permissions</h3>
                <p className="text-xs text-[#636d7d]">Control what regular users can do</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#e6edf3]">Allow users to create containers</p>
                <p className="text-[11px] text-[#636d7d]">When disabled, only admins can create new containers</p>
              </div>
              <Switch
                checked={settings?.allow_user_containers ?? true}
                onChange={checked => setSettings(s => s ? { ...s, allow_user_containers: checked } : s)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#e6edf3]">Allow users to map ports</p>
                <p className="text-[11px] text-[#636d7d]">When disabled, only admins can expose container ports</p>
              </div>
              <Switch
                checked={settings?.allow_user_ports ?? true}
                onChange={checked => setSettings(s => s ? { ...s, allow_user_ports: checked } : s)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#e6edf3]">Allow users to change email</p>
                <p className="text-[11px] text-[#636d7d]">When disabled, only admins can update user emails</p>
              </div>
              <Switch
                checked={settings?.allow_email_change ?? false}
                onChange={checked => setSettings(s => s ? { ...s, allow_email_change: checked } : s)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#e6edf3]">Allow users to manage images</p>
                <p className="text-[11px] text-[#636d7d]">When disabled, only admins can pull or remove images</p>
              </div>
              <Switch
                checked={settings?.allow_user_images ?? true}
                onChange={checked => setSettings(s => s ? { ...s, allow_user_images: checked } : s)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#e6edf3]">Allow users to manage templates</p>
                <p className="text-[11px] text-[#636d7d]">When disabled, only admins can create, import, or delete templates</p>
              </div>
              <Switch
                checked={settings?.allow_user_templates ?? true}
                onChange={checked => setSettings(s => s ? { ...s, allow_user_templates: checked } : s)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#e6edf3]">Allow users to deploy projects</p>
                <p className="text-[11px] text-[#636d7d]">When disabled, only admins can deploy projects</p>
              </div>
              <Switch
                checked={settings?.allow_user_projects ?? true}
                onChange={checked => setSettings(s => s ? { ...s, allow_user_projects: checked } : s)}
              />
            </div>
          </div>

          <div className="pb-4 border-b border-white/[0.05]">
            <div className="flex items-center gap-2.5 pt-4">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500/20 to-rose-600/10 flex items-center justify-center border border-rose-500/10">
                <Eye size={18} className="text-rose-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#e6edf3]">Disabled Features</h3>
                <p className="text-xs text-[#636d7d]">Hide pages from the UI (applies to all users)</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {featureOptions.map(f => {
              const disabled = settings ? getDisabledSet(settings.disabled_features).has(f.key) : false
              return (
                <div key={f.key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[#e6edf3]">{f.label}</p>
                    <p className="text-[11px] text-[#636d7d]">{f.desc}</p>
                  </div>
                  <Switch
                    checked={disabled}
                    onChange={() => toggleFeature(f.key)}
                  />
                </div>
              )
            })}
          </div>

          <div className="pt-2">
            <Button onClick={handleSave} loading={saving}>Save Settings</Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2.5 pb-4 border-b border-white/[0.05]">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center border border-blue-500/10">
              <Info size={18} className="text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#e6edf3]">About</h3>
            </div>
          </div>
          <p className="text-sm text-[#636d7d] leading-relaxed">
            dck Manager v2.0 — A modern web interface for the dck container runtime.
            Built with React, TypeScript, Tailwind CSS, and lucide-react icons.
          </p>
          <div className="flex gap-3 text-xs text-[#636d7d]">
            <span>React 18</span>
            <span>·</span>
            <span>TypeScript</span>
            <span>·</span>
            <span>Tailwind CSS</span>
            <span>·</span>
            <span>Zustand</span>
            <span>·</span>
            <span>xterm.js</span>
          </div>
        </div>
      </Card>
    </div>
  )
}

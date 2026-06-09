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
import { Shield, Settings2, Info } from 'lucide-react'

export function AdminSettingsPage() {
  const { isAdmin } = useAuth()
  const addToast = useUIStore(s => s.addToast)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    getSettings().then(setSettings).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try { await updateSettings(settings); addToast('Settings saved', 'success') }
    catch (err: any) { addToast(err.message, 'error') }
    finally { setSaving(false) }
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
            <div className="pt-2">
              <Switch
                checked={settings?.registration || false}
                onChange={checked => setSettings(s => s ? { ...s, registration: checked } : s)}
                label="Allow new user registration"
              />
            </div>
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

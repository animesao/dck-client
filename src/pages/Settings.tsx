import { useEffect, useState } from 'react'
import { getSettings, updateSettings, getVersion } from '@/api/settings'
import { useUIStore } from '@/store/uiStore'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Switch } from '@/components/ui/Switch'
import { Button } from '@/components/ui/Button'
import { PageLoading } from '@/components/ui/Spinner'
import type { AppSettings, VersionInfo } from '@/types'
import { Settings2, RefreshCw, Server, Terminal } from 'lucide-react'

export function SettingsPage() {
  const addToast = useUIStore(s => s.addToast)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [version, setVersion] = useState<VersionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([getSettings(), getVersion()])
      .then(([s, v]) => { setSettings(s); setVersion(v) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try { await updateSettings(settings); addToast('Settings saved', 'success') }
    catch (err: any) { addToast(err.message || 'Save failed', 'error') }
    finally { setSaving(false) }
  }

  if (loading) return <PageLoading />

  return (
    <div className="space-y-6 page-enter">
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Settings</h1>
        <p className="text-[#636d7d] text-sm mt-1">Configure dck manager</p>
      </div>

      <Card>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-2.5 pb-4 border-b border-white/[0.05]">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 flex items-center justify-center border border-indigo-500/10">
              <Settings2 size={18} className="text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#e6edf3]">General Settings</h3>
              <p className="text-xs text-[#636d7d]">Configure dck binary and data paths</p>
            </div>
          </div>

          <div className="space-y-4">
            <Input
              label="dck Binary Path"
              value={settings?.dck_bin || ''}
              onChange={e => setSettings(s => s ? { ...s, dck_bin: e.target.value } : s)}
              placeholder="/usr/local/bin/dck"
            />
            <Input
              label="dck Data Directory"
              value={settings?.dck_data || ''}
              onChange={e => setSettings(s => s ? { ...s, dck_data: e.target.value } : s)}
              placeholder="/root/.dck"
            />
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

      {version && (
        <Card>
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-2.5 pb-4 border-b border-white/[0.05]">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center border border-emerald-500/10">
                <RefreshCw size={18} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#e6edf3]">Version Information</h3>
                <p className="text-xs text-[#636d7d]">Software versions and updates</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <Terminal size={16} className="text-indigo-400" />
                <div>
                  <p className="text-[11px] text-[#636d7d] font-medium">Client Version</p>
                  <p className="text-sm font-mono text-[#e6edf3]">{version.version}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <Server size={16} className="text-emerald-400" />
                <div>
                  <p className="text-[11px] text-[#636d7d] font-medium">dck Runtime</p>
                  <p className="text-sm font-mono text-[#e6edf3]">{version.dck_version}</p>
                </div>
              </div>
            </div>

            {version.update_available && (
              <div className="p-4 rounded-xl bg-yellow-500/[0.06] border border-yellow-500/15 text-yellow-400 text-sm flex items-center gap-2.5">
                <RefreshCw size={16} />
                A new version ({version.latest}) is available!
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { getConfig, saveConfig, deployConfig, downConfig } from '@/api/settings'
import { useUIStore } from '@/store/uiStore'
import { Card, CardContent } from '@/components/ui/Card'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { PageLoading } from '@/components/ui/Spinner'
import { Save, Play, Square, FileCode2 } from 'lucide-react'

export function ConfigPage() {
  const addToast = useUIStore(s => s.addToast)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [modified, setModified] = useState(false)

  useEffect(() => {
    getConfig()
      .then(c => setContent(c.content || ''))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try { await saveConfig(content); addToast('Config saved!', 'success'); setModified(false) }
    catch (err: any) { addToast(err.message || 'Save failed', 'error') }
    finally { setSaving(false) }
  }

  const handleDeploy = async () => {
    setDeploying(true)
    try { await deployConfig(); addToast('Config deployed!', 'success') }
    catch (err: any) { addToast(err.message || 'Deploy failed', 'error') }
    finally { setDeploying(false) }
  }

  const handleDown = async () => {
    try { await downConfig(); addToast('Services stopped', 'success') }
    catch (err: any) { addToast(err.message || 'Down failed', 'error') }
  }

  if (loading) return <PageLoading />

  return (
    <div className="space-y-5 page-enter">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Config</h1>
          <p className="text-[#636d7d] text-sm mt-1">dck.toml configuration</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleDown}>
            <Square size={14} /> Down
          </Button>
          <Button variant="secondary" onClick={handleDeploy} loading={deploying}>
            <Play size={14} /> Deploy
          </Button>
          <Button onClick={handleSave} loading={saving}>
            <Save size={14} /> {modified ? 'Save*' : 'Save'}
          </Button>
        </div>
      </div>

      <Card>
        <Textarea
          value={content}
          onChange={e => { setContent(e.target.value); setModified(true) }}
          className="min-h-[500px] border-0 rounded-2xl font-mono text-sm leading-relaxed p-5 resize-y"
          placeholder="# dck.toml configuration"
        />
      </Card>
    </div>
  )
}

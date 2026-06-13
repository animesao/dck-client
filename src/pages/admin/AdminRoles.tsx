import { useEffect, useState } from 'react'
import { listRoles, createRole, deleteRole } from '@/api/admin'
import { useUIStore } from '@/store/uiStore'
import { useAuth } from '@/hooks/useAuth'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageLoading } from '@/components/ui/Spinner'
import type { Role } from '@/types'
import { Plus, Trash2, Shield, Palette } from 'lucide-react'

const ROLE_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16']

export function AdminRolesPage() {
  const { isAdmin } = useAuth()
  const addToast = useUIStore(s => s.addToast)
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  const fetchRoles = async () => {
    try { setRoles(await listRoles()) }
    catch { addToast('Failed to load roles', 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { if (isAdmin) fetchRoles() }, [])

  if (loading) return <PageLoading />

  return (
    <div className="space-y-5 page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Roles</h1>
          <p className="text-[#636d7d] text-sm mt-1">Manage user roles and permissions</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> Create Role
        </Button>
      </div>

      <Card>
        {roles.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#636d7d]">No roles</div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {roles.map(r => (
              <div key={r.name} className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: r.color + '20', borderColor: r.color + '30', borderWidth: 1 }}>
                  <Shield size={14} style={{ color: r.color }} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#e6edf3]">{r.name}</span>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} title={r.color} />
                  </div>
                  <p className="text-xs text-[#636d7d] mt-0.5">
                    {r.is_admin ? 'Admin access (full permissions)' : 'Limited access'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.is_admin ? 'text-indigo-400 bg-indigo-500/10' : 'text-blue-400 bg-blue-500/10'}`}>
                    {r.is_admin ? 'admin' : 'user'}
                  </span>
                  {r.name !== 'admin' && r.name !== 'user' && (
                    <button
                      onClick={async () => {
                        if (confirm(`Delete role "${r.name}"? Users with this role will be reassigned to "user".`)) {
                          try { await deleteRole(r.name); addToast('Role deleted', 'success'); fetchRoles() }
                          catch (err: unknown) { addToast(err instanceof Error ? err.message : String(err), 'error') }
                        }
                      }}
                      className="p-1.5 rounded hover:bg-white/10 text-red-400 hover:text-red-300"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <CreateRoleModal open={createOpen} onClose={() => setCreateOpen(false)} onSuccess={fetchRoles} />
    </div>
  )
}

function CreateRoleModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const addToast = useUIStore(s => s.addToast)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      await createRole(name.trim(), color, isAdmin)
      addToast('Role created', 'success')
      onSuccess()
      onClose()
      setName('')
      setColor('#6366f1')
      setIsAdmin(false)
    } catch (err: unknown) { addToast(err instanceof Error ? err.message : String(err), 'error') }
    finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Role">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Role Name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. moderator, vip" required />

        <div>
          <label className="block text-xs text-[#636d7d] mb-1.5 font-medium">Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border border-white/[0.1] p-0.5"
            />
            <div className="flex flex-wrap gap-1.5">
              {ROLE_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`w-7 h-7 rounded-lg border-2 transition-all ${color === c ? 'border-[#e6edf3] scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={e => setIsAdmin(e.target.checked)}
            className="w-4 h-4 rounded border-white/[0.1] bg-white/[0.06] text-indigo-500 focus:ring-indigo-500/30"
          />
          <span className="text-sm text-[#e6edf3]">Admin access (full permissions)</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>Create Role</Button>
        </div>
      </form>
    </Modal>
  )
}

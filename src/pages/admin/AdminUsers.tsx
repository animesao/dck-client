import { useEffect, useState } from 'react'
import { listUsers, createUser, updateUser, deleteUser } from '@/api/admin'
import { useUIStore } from '@/store/uiStore'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { PageLoading } from '@/components/ui/Spinner'
import type { User } from '@/types'
import { Plus, Trash2, Shield, Pencil } from 'lucide-react'

export function AdminUsersPage() {
  const { isAdmin, user: currentUser } = useAuth()
  const addToast = useUIStore(s => s.addToast)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingEmail, setEditingEmail] = useState<string | null>(null)
  const [editEmailValue, setEditEmailValue] = useState('')

  const fetchUsers = async () => {
    try {
      const data = await listUsers()
      setUsers(data)
    } catch { addToast('Failed to load users', 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { if (isAdmin) fetchUsers() }, [])

  if (loading) return <PageLoading />

  return (
    <div className="space-y-5 page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Users</h1>
          <p className="text-[#636d7d] text-sm mt-1">Manage user accounts</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> Create User
        </Button>
      </div>

      <Card>
        <div className="divide-y divide-white/[0.04]">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 flex items-center justify-center border border-indigo-500/10">
                <span className="text-sm font-bold text-indigo-300">{u.username.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-[#e6edf3] flex items-center gap-2">
                  {u.username}
                  {u.role === 'admin' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/15">
                      <Shield size={10} /> Admin
                    </span>
                  )}
                  {u.id === currentUser?.id && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/[0.04] text-[#636d7d] border border-white/[0.06]">
                      You
                    </span>
                  )}
                </p>
                <p className="text-xs text-[#636d7d] font-mono">ID: {u.id.slice(0, 16)}</p>
                <div className="flex items-center gap-1">
                  {editingEmail === u.id ? (
                    <input
                      autoFocus
                      className="text-xs bg-white/[0.06] border border-white/[0.1] rounded px-1.5 py-0.5 text-[#e6edf3] outline-none w-40"
                      value={editEmailValue}
                      onChange={e => setEditEmailValue(e.target.value)}
                      onBlur={async () => {
                        try { await updateUser(u.id, { email: editEmailValue }); addToast('Email updated', 'success'); fetchUsers() }
                        catch (err: any) { addToast(err.message, 'error') }
                        setEditingEmail(null)
                      }}
                      onKeyDown={async e => {
                        if (e.key === 'Enter') { e.currentTarget.blur() }
                        if (e.key === 'Escape') { setEditingEmail(null) }
                      }}
                    />
                  ) : (
                    <button
                      className="text-xs text-[#636d7d] hover:text-[#e6edf3] transition-colors cursor-pointer text-left truncate max-w-[200px] group flex items-center gap-1"
                      onClick={() => { setEditingEmail(u.id); setEditEmailValue(u.email || '') }}
                      title="Click to edit email"
                    >
                      <span>{u.email || '—'}</span>
                      <Pencil size={10} className="opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={u.role}
                  onChange={async (e) => {
                    try { await updateUser(u.id, { role: e.target.value }); addToast('User role updated', 'success'); fetchUsers() }
                    catch (err: any) { addToast(err.message, 'error') }
                  }}
                  options={[
                    { value: 'user', label: 'User' },
                    { value: 'admin', label: 'Admin' },
                  ]}
                  className="w-24"
                />
                {u.id !== currentUser?.id && (
                  <Button variant="ghost" size="sm" onClick={async () => {
                    if (confirm(`Delete user "${u.username}"?`)) {
                      try { await deleteUser(u.id); addToast('User deleted', 'success'); fetchUsers() }
                      catch (err: any) { addToast(err.message, 'error') }
                    }
                  }} className="text-red-400 hover:text-red-300">
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onSuccess={fetchUsers} />
    </div>
  )
}

function CreateUserModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const addToast = useUIStore(s => s.addToast)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('user')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try { await createUser(username, password, role, email); addToast('User created', 'success'); onSuccess(); onClose(); setUsername(''); setPassword(''); setEmail(''); setRole('user') }
    catch (err: any) { addToast(err.message, 'error') }
    finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create User">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Username" value={username} onChange={e => setUsername(e.target.value)} required />
        <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        <Select label="Role" value={role} onChange={e => setRole(e.target.value)} options={[{ value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }]} />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>Create User</Button>
        </div>
      </form>
    </Modal>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { listUsers, createUser, updateUser, deleteUser, updateUserLimits, listRoles } from '@/api/admin'
import { useUIStore } from '@/store/uiStore'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { PageLoading } from '@/components/ui/Spinner'
import type { User, Role } from '@/types'
import { Plus, Trash2, Shield, Search, ChevronLeft, ChevronRight, Settings2, Key, Mail, Clock } from 'lucide-react'

const PAGE_SIZE = 10

export function AdminUsersPage() {
  const { isAdmin, user: currentUser } = useAuth()
  const addToast = useUIStore(s => s.addToast)
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [editLimits, setEditLimits] = useState({ container_limit: 0, memory_limit: 0, cpu_limit: 0, disk_limit: 0, port_limit: 0 })
  const [savingLimits, setSavingLimits] = useState(false)
  const [passwordModal, setPasswordModal] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [emailModal, setEmailModal] = useState<User | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)

  const fetchUsers = async () => {
    try {
      const [data, r] = await Promise.all([listUsers(), listRoles()])
      setUsers(data)
      setRoles(r)
    } catch { addToast('Failed to load users', 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { if (isAdmin) fetchUsers() }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return users
    const q = search.toLowerCase()
    return users.filter(u => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }, [users, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [page, totalPages])

  const handleEditLimits = (u: User) => {
    setEditUser(u)
    setEditLimits({
      container_limit: u.container_limit ?? 0,
      memory_limit: u.memory_limit ?? 0,
      cpu_limit: u.cpu_limit ?? 0,
      disk_limit: u.disk_limit > 0 ? u.disk_limit / (1024 * 1024) : (u.disk_limit ?? 0),
      port_limit: u.port_limit ?? 0,
    })
  }

  const handleSaveLimits = async () => {
    if (!editUser) return
    setSavingLimits(true)
    try {
      await updateUserLimits(editUser.id, {
        container_limit: editLimits.container_limit,
        memory_limit: editLimits.memory_limit,
        cpu_limit: editLimits.cpu_limit,
        disk_limit: editLimits.disk_limit < 0 ? -1 : editLimits.disk_limit * (1024 * 1024),
        port_limit: editLimits.port_limit,
      })
      addToast('Limits updated', 'success')
      setEditUser(null)
      fetchUsers()
    } catch (err: unknown) { addToast(err instanceof Error ? err.message : String(err), 'error') }
    finally { setSavingLimits(false) }
  }

  const handleChangePassword = async () => {
    if (!passwordModal || !newPassword) return
    setSavingPassword(true)
    try {
      await updateUser(passwordModal.id, { password: newPassword })
      addToast('Password changed', 'success')
      setPasswordModal(null)
      setNewPassword('')
    } catch (err: unknown) { addToast(err instanceof Error ? err.message : String(err), 'error') }
    finally { setSavingPassword(false) }
  }

  const handleChangeEmail = async () => {
    if (!emailModal) return
    setSavingEmail(true)
    try {
      await updateUser(emailModal.id, { email: newEmail })
      addToast('Email updated', 'success')
      setEmailModal(null)
      setNewEmail('')
      fetchUsers()
    } catch (err: unknown) { addToast(err instanceof Error ? err.message : String(err), 'error') }
    finally { setSavingEmail(false) }
  }

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
        <div className="px-5 py-3 border-b border-white/[0.05]">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636d7d]" />
            <input
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-9 pr-3 py-2 text-xs text-[#e6edf3] outline-none placeholder:text-[#636d7d]"
              placeholder="Search by username or email..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
        </div>

        {paged.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#636d7d]">No users found</div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            <div className="hidden md:flex items-center gap-3 px-5 py-2 text-xs text-[#636d7d] font-medium">
              <span className="w-8" />
              <span className="flex-1">Username</span>
              <span className="w-36">Email</span>
              <span className="w-14 text-center">Role</span>
              <span className="w-20 text-center">Containers</span>
              <span className="w-20 text-center">Mem/CPU/Disk/Port</span>
              <span className="w-28 text-right">Last Login</span>
              <span className="w-24 text-right">Actions</span>
            </div>
            {paged.map(u => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 flex items-center justify-center border border-indigo-500/10 shrink-0">
                  <span className="text-sm font-bold text-indigo-300">{u.username.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
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
                </div>
                <div className="hidden md:block w-36 text-xs text-[#636d7d] truncate">{u.email || '—'}</div>
                <div className="w-14 text-center">
                  <div className="relative inline-block">
                    <select
                      className="text-xs bg-white/[0.06] border border-white/[0.1] rounded pl-1.5 pr-5 py-1 text-[#e6edf3] outline-none cursor-pointer appearance-none"
                      style={{ borderLeftColor: roles.find(r => r.name === u.role)?.color || '#636d7d', borderLeftWidth: 3 }}
                      value={u.role}
                      onChange={async (e) => {
                        try { await updateUser(u.id, { role: e.target.value }); addToast('Role updated', 'success'); fetchUsers() }
                        catch (err: unknown) { addToast(err instanceof Error ? err.message : String(err), 'error') }
                      }}
                    >
                      {roles.map(r => (
                        <option key={r.name} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="hidden md:block w-20 text-center text-xs text-[#636d7d]">—</div>
                <div className="hidden md:block w-20 text-center text-[10px] text-[#636d7d] font-mono">
                  {u.memory_limit === -1 ? '∞' : u.memory_limit} / {u.cpu_limit === -1 ? '∞' : u.cpu_limit} / {u.disk_limit === -1 ? '∞' : u.disk_limit > 0 ? `${(u.disk_limit / (1024*1024)).toFixed(0)}M` : u.disk_limit} / {u.port_limit === -1 ? '∞' : u.port_limit}
                </div>
                <div className="hidden md:flex items-center gap-1 w-28 justify-end text-xs text-[#636d7d]">
                  <Clock size={10} />
                  {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                </div>
                <div className="flex items-center gap-1 w-24 justify-end">
                  <button onClick={() => handleEditLimits(u)} className="p-1.5 rounded hover:bg-white/10 text-[#8b949e] hover:text-[#e6edf3]" title="Edit limits">
                    <Settings2 size={13} />
                  </button>
                  <button onClick={() => { setEmailModal(u); setNewEmail(u.email || '') }} className="p-1.5 rounded hover:bg-white/10 text-[#8b949e] hover:text-[#e6edf3]" title="Change email">
                    <Mail size={13} />
                  </button>
                  <button onClick={() => { setPasswordModal(u); setNewPassword('') }} className="p-1.5 rounded hover:bg-white/10 text-[#8b949e] hover:text-[#e6edf3]" title="Change password">
                    <Key size={13} />
                  </button>
                  {u.id !== currentUser?.id && (
                    <button onClick={async () => {
                      if (confirm(`Delete user "${u.username}"?`)) {
                        try { await deleteUser(u.id); addToast('User deleted', 'success'); fetchUsers() }
                        catch (err: unknown) { addToast(err instanceof Error ? err.message : String(err), 'error') }
                      }
                    }} className="p-1.5 rounded hover:bg-white/10 text-red-400 hover:text-red-300" title="Delete user">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.05]">
            <p className="text-xs text-[#636d7d]">
              {filtered.length} user{filtered.length !== 1 ? 's' : ''} · Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                className="p-1.5 rounded hover:bg-white/10 text-[#8b949e] hover:text-[#e6edf3] disabled:opacity-30 disabled:cursor-not-allowed"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  className={`w-7 h-7 rounded text-xs font-medium transition-colors ${p === page ? 'bg-indigo-500/20 text-indigo-300' : 'text-[#636d7d] hover:text-[#e6edf3] hover:bg-white/10'}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                className="p-1.5 rounded hover:bg-white/10 text-[#8b949e] hover:text-[#e6edf3] disabled:opacity-30 disabled:cursor-not-allowed"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Create User Modal */}
      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onSuccess={fetchUsers} />

      {/* Edit Limits Modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Limits: ${editUser?.username || ''}`}>
        <div className="space-y-4">
          <Input label="Max Containers (-1 = ∞, 0 = disabled)" type="number" min={-1} value={String(editLimits.container_limit)} onChange={e => setEditLimits(l => ({ ...l, container_limit: parseInt(e.target.value) || 0 }))} />
          <Input label="Max Memory MB (-1 = ∞, 0 = disabled)" type="number" min={-1} value={String(editLimits.memory_limit)} onChange={e => setEditLimits(l => ({ ...l, memory_limit: parseInt(e.target.value) || 0 }))} />
          <Input label="Max CPU Cores (-1 = ∞, 0 = disabled)" type="number" min={-1} step={0.1} value={String(editLimits.cpu_limit)} onChange={e => setEditLimits(l => ({ ...l, cpu_limit: parseFloat(e.target.value) || 0 }))} />
          <Input label="Max Disk per Container (MB, -1 = ∞, 0 = disabled)" type="number" min={-1} value={String(editLimits.disk_limit)} onChange={e => setEditLimits(l => ({ ...l, disk_limit: parseInt(e.target.value) || 0 }))} />
          <Input label="Max Ports per Container (-1 = ∞, 0 = disabled)" type="number" min={-1} value={String(editLimits.port_limit)} onChange={e => setEditLimits(l => ({ ...l, port_limit: parseInt(e.target.value) || 0 }))} />
          <p className="text-[10px] text-[#636d7d]">-1 = unlimited, 0 = disabled (user cannot use this resource)</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={handleSaveLimits} loading={savingLimits}>Save Limits</Button>
          </div>
        </div>
      </Modal>

      {/* Change Password Modal */}
      <Modal open={!!passwordModal} onClose={() => setPasswordModal(null)} title={`Change Password: ${passwordModal?.username || ''}`}>
        <div className="space-y-4">
          <Input label="New Password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter new password" required />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setPasswordModal(null)}>Cancel</Button>
            <Button onClick={handleChangePassword} loading={savingPassword}>Change Password</Button>
          </div>
        </div>
      </Modal>

      {/* Change Email Modal */}
      <Modal open={!!emailModal} onClose={() => setEmailModal(null)} title={`Change Email: ${emailModal?.username || ''}`}>
        <div className="space-y-4">
          <Input label="Email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@example.com" required />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEmailModal(null)}>Cancel</Button>
            <Button onClick={handleChangeEmail} loading={savingEmail}>Save Email</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function CreateUserModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const addToast = useUIStore(s => s.addToast)
  const [roles, setRoles] = useState<Role[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('user')
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (open) listRoles().then(setRoles).catch(() => {}) }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try { await createUser(username, password, role, email); addToast('User created', 'success'); onSuccess(); onClose(); setUsername(''); setPassword(''); setEmail(''); setRole('user') }
    catch (err: unknown) { addToast(err instanceof Error ? err.message : String(err), 'error') }
    finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create User">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Username" value={username} onChange={e => setUsername(e.target.value)} required />
        <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        <div>
          <label className="block text-xs text-[#636d7d] mb-1.5 font-medium">Role</label>
          <select
            className="w-full bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-[#e6edf3] outline-none cursor-pointer"
            style={{ borderLeftColor: roles.find(r => r.name === role)?.color || '#636d7d', borderLeftWidth: 3 }}
            value={role}
            onChange={e => setRole(e.target.value)}
          >
            {roles.map(r => (
              <option key={r.name} value={r.name}>{r.name}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>Create User</Button>
        </div>
      </form>
    </Modal>
  )
}

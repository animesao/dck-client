import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { changePassword, getTwoFactorStatus, setupTwoFactor, verifyTwoFactor, disableTwoFactor, getTwoFactorQrUrl, updateProfile } from '@/api/auth'
import { getUserActivity } from '@/api/activity'
import { getVersion, getSettings } from '@/api/settings'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { PageLoading } from '@/components/ui/Spinner'
import type { ActivityLog, VersionInfo } from '@/types'
import { User, Shield, Key, RefreshCw, Terminal, Server, LogOut } from 'lucide-react'

export function SettingsPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const addToast = useUIStore(s => s.addToast)
  const [loading, setLoading] = useState(true)

  // Password
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [pwdLoading, setPwdLoading] = useState(false)

  // 2FA
  const [twoFAEnabled, setTwoFAEnabled] = useState(false)
  const [twoFASecret, setTwoFASecret] = useState('')
  const [twoFAURL, setTwoFAURL] = useState('')
  const [twoFACode, setTwoFACode] = useState('')
  const [twoFALoading, setTwoFALoading] = useState(false)
  const [showSetup, setShowSetup] = useState(false)

  // Activity
  const [activity, setActivity] = useState<ActivityLog[]>([])

  // Version
  const [version, setVersion] = useState<VersionInfo | null>(null)

  // Email
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [emailValue, setEmailValue] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      getTwoFactorStatus().then(r => setTwoFAEnabled(r.enabled)).catch(() => {}),
      getUserActivity(20).then(setActivity).catch(() => {}),
      getVersion().then(setVersion).catch(() => {}),
      getSettings().then(s => { setEmailEnabled(s.allow_email_change); setEmailValue(s.allow_email_change ? (user?.email || '') : '') }).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const handleUpdateEmail = async () => {
    setEmailLoading(true)
    try {
      await updateProfile({ email: emailValue })
      addToast('Email updated', 'success')
    } catch (err: any) { addToast(err.message || 'Failed to update email', 'error') }
    finally { setEmailLoading(false) }
  }

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd) return
    setPwdLoading(true)
    try {
      await changePassword(oldPwd, newPwd)
      setOldPwd('')
      setNewPwd('')
      addToast('Password changed', 'success')
    } catch (err: any) {
      addToast(err.message || 'Failed to change password', 'error')
    } finally {
      setPwdLoading(false)
    }
  }

  const handleSetup2FA = async () => {
    setTwoFALoading(true)
    try {
      const res = await setupTwoFactor()
      setTwoFASecret(res.secret)
      setTwoFAURL(res.url)
      setShowSetup(true)
    } catch (err: any) {
      addToast(err.message || 'Failed to setup 2FA', 'error')
    } finally {
      setTwoFALoading(false)
    }
  }

  const handleVerify2FA = async () => {
    if (!twoFACode) return
    setTwoFALoading(true)
    try {
      await verifyTwoFactor(twoFACode)
      setTwoFAEnabled(true)
      setShowSetup(false)
      setTwoFACode('')
      addToast('2FA enabled', 'success')
    } catch (err: any) {
      addToast(err.message || 'Invalid code', 'error')
    } finally {
      setTwoFALoading(false)
    }
  }

  const handleDisable2FA = async () => {
    try {
      await disableTwoFactor()
      setTwoFAEnabled(false)
      setTwoFASecret('')
      addToast('2FA disabled', 'success')
    } catch (err: any) {
      addToast(err.message || 'Failed to disable 2FA', 'error')
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  if (loading) return <PageLoading />

  return (
    <div className="space-y-6 page-enter">
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Profile Settings</h1>
        <p className="text-[#636d7d] text-sm mt-1">Manage your account</p>
      </div>

      {/* User Info */}
      <Card>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-4 border-b border-white/[0.05]">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 flex items-center justify-center border border-indigo-500/10">
              <User size={18} className="text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#e6edf3]">Account</h3>
              <p className="text-xs text-[#636d7d]">{user?.username} · {user?.role}</p>
            </div>
          </div>

          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            <span className="text-xs text-[#636d7d]">Signed in as</span>
            <span className="text-xs text-[#e6edf3] font-medium">{user?.username}</span>
          </div>

          {emailEnabled && (
            <div className="flex items-center gap-2">
              <input
                className="flex-1 bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-2 text-xs text-[#e6edf3] outline-none placeholder:text-[#636d7d]"
                type="email"
                value={emailValue}
                onChange={e => setEmailValue(e.target.value)}
                placeholder="your@email.com"
              />
              <Button onClick={handleUpdateEmail} loading={emailLoading} size="sm">
                Save Email
              </Button>
            </div>
          )}

          <div>
            <Button variant="danger" size="sm" onClick={handleLogout}>
              <LogOut size={14} /> Sign Out
            </Button>
          </div>
        </div>
      </Card>

      {/* Change Password */}
      <Card>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-4 border-b border-white/[0.05]">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center border border-emerald-500/10">
              <Key size={18} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#e6edf3]">Change Password</h3>
              <p className="text-xs text-[#636d7d]">Update your login password</p>
            </div>
          </div>

          <div className="space-y-3">
            <Input
              label="Current Password"
              type="password"
              value={oldPwd}
              onChange={e => setOldPwd(e.target.value)}
              placeholder="Enter current password"
            />
            <Input
              label="New Password"
              type="password"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              placeholder="Enter new password"
            />
            <Button onClick={handleChangePassword} loading={pwdLoading} size="sm">
              <Key size={14} /> Update Password
            </Button>
          </div>
        </div>
      </Card>

      {/* Two-Factor Auth */}
      <Card>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-4 border-b border-white/[0.05]">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center border border-amber-500/10">
              <Shield size={18} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#e6edf3]">Two-Factor Authentication</h3>
              <p className="text-xs text-[#636d7d]">Add an extra layer of security</p>
            </div>
          </div>

          {twoFAEnabled ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <Shield size={14} className="text-emerald-400" />
                <span className="text-xs text-emerald-300">2FA is enabled</span>
              </div>
              <Button variant="danger" size="sm" onClick={handleDisable2FA}>
                Disable 2FA
              </Button>
            </div>
          ) : showSetup ? (
            <div className="space-y-3">
              <p className="text-xs text-[#636d7d]">Scan this QR code with your authenticator app (e.g. Google Authenticator, Authy):</p>
              <div className="flex justify-center">
                <img src={getTwoFactorQrUrl()} alt="2FA QR Code" className="w-48 h-48 rounded-lg" />
              </div>
              <p className="text-xs text-[#636d7d] text-center">
                Or enter this secret manually: <span className="font-mono text-indigo-400">{twoFASecret}</span>
              </p>
              <Input
                label="Verification Code"
                value={twoFACode}
                onChange={e => setTwoFACode(e.target.value)}
                placeholder="000000"
                maxLength={6}
              />
              <div className="flex gap-2">
                <Button onClick={handleVerify2FA} loading={twoFALoading} size="sm">
                  <Shield size={14} /> Verify & Enable
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowSetup(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[#636d7d]">Secure your account with two-factor authentication.</p>
              <Button onClick={handleSetup2FA} loading={twoFALoading} size="sm">
                <Shield size={14} /> Setup 2FA
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Activity Log */}
      <Card>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-4 border-b border-white/[0.05]">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center border border-purple-500/10">
              <RefreshCw size={18} className="text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#e6edf3]">Recent Activity</h3>
              <p className="text-xs text-[#636d7d]">Your recent account activity</p>
            </div>
          </div>

          {activity.length === 0 ? (
            <p className="text-xs text-[#636d7d]">No activity recorded yet</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {activity.map(l => (
                <div key={l.id} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-white/[0.02] text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[#e6edf3]">{formatUserAction(l.action)}{l.details ? ` — ${l.details}` : ''}</p>
                    <p className="text-[10px] text-[#636d7d] mt-0.5">{formatDate(l.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Version Info */}
      {version && (
        <Card>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2.5 pb-4 border-b border-white/[0.05]">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center border border-cyan-500/10">
                <Terminal size={18} className="text-cyan-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#e6edf3]">Version Information</h3>
                <p className="text-xs text-[#636d7d]">Software versions</p>
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
          </div>
        </Card>
      )}
    </div>
  )
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleString()
  } catch {
    return dateStr
  }
}

function formatUserAction(action: string): string {
  const map: Record<string, string> = {
    login: 'Logged in',
    password_changed: 'Changed password',
    container_created: 'Created container',
    container_started: 'Started container',
    container_stopped: 'Stopped container',
    container_restarted: 'Restarted container',
    container_removed: 'Removed container',
    collaborator_added: 'Added collaborator',
    collaborator_removed: 'Removed collaborator',
    file_uploaded: 'Uploaded file',
    file_deleted: 'Deleted file',
    file_renamed: 'Renamed file',
    file_written: 'Saved file',
    file_created: 'Created directory',
    backup_created: 'Created backup',
    backup_restored: 'Restored backup',
    backup_deleted: 'Deleted backup',
  }
  return map[action] || action.replace(/_/g, ' ')
}

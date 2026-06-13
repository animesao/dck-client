import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { login } from '@/api/auth'
import { getPublicSettings } from '@/api/settings'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Shield } from 'lucide-react'

export function LoginPage() {
  const navigate = useNavigate()
  const { login: setAuth } = useAuthStore()
  const addToast = useUIStore(s => s.addToast)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [registrationOpen, setRegistrationOpen] = useState(false)

  useEffect(() => {
    getPublicSettings().then(s => setRegistrationOpen(s.registration)).catch(() => {})
  }, [])

  // 2FA state
  const [twofaToken, setTwofaToken] = useState('')
  const [twofaCode, setTwofaCode] = useState('')
  const [twofaRequired, setTwofaRequired] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await login(username, password, twofaCode || undefined, twofaToken || undefined)
      if (res.twofa_required) {
        setTwofaRequired(true)
        setTwofaToken(res.twofa_token || '')
        setLoading(false)
        return
      }
      setAuth(res.token, res.user)
      addToast('Welcome back!', 'success')
      navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-center mb-4">
        <h2 className="text-lg font-semibold text-[#e6edf3]">Sign In</h2>
        <p className="text-sm text-[#636d7d] mt-1">
          {twofaRequired ? 'Enter your 2FA code' : 'Enter your credentials to continue'}
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/[0.06] border border-red-500/15 text-red-400 text-sm flex items-center gap-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
          {error}
        </div>
      )}

      {twofaRequired ? (
        <>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
            <Shield size={14} />
            Two-factor authentication is required
          </div>
          <Input
            label="Authentication Code"
            type="text"
            value={twofaCode}
            onChange={e => setTwofaCode(e.target.value)}
            placeholder="000000"
            maxLength={6}
            required
            autoFocus
          />
          <Button type="submit" loading={loading} className="w-full">
            <Shield size={14} /> Verify
          </Button>
          <button
            type="button"
            onClick={() => { setTwofaRequired(false); setTwofaToken(''); setTwofaCode('') }}
            className="text-xs text-[#636d7d] hover:text-[#e6edf3] transition-colors text-center w-full"
          >
            Back to login
          </button>
        </>
      ) : (
        <>
          <Input
            label="Username"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Enter username"
            required
            autoFocus
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter password"
            required
          />
          <Button type="submit" loading={loading} className="w-full">
            Sign In
          </Button>
        </>
      )}

      {!twofaRequired && registrationOpen && (
        <p className="text-center text-sm text-[#636d7d]">
          Don't have an account?{' '}
          <Link to="/register" className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
            Register
          </Link>
        </p>
      )}
    </form>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { register } from '@/api/auth'
import { getPublicSettings } from '@/api/settings'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function RegisterPage() {
  const navigate = useNavigate()
  const { login: setAuth } = useAuthStore()
  const addToast = useUIStore(s => s.addToast)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [registrationOpen, setRegistrationOpen] = useState(true)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    getPublicSettings()
      .then(s => { setRegistrationOpen(s.registration); setChecking(false) })
      .catch(() => setChecking(false))
  }, [])

  if (checking) return null

  if (!registrationOpen) {
    return (
      <div className="text-center space-y-3">
        <h2 className="text-lg font-semibold text-[#e6edf3]">Registration Closed</h2>
        <p className="text-sm text-[#636d7d]">New user registration is currently disabled.</p>
        <Link to="/login" className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium text-sm">Back to Login</Link>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    try {
      const res = await register(username, password, email)
      setAuth(res.token, res.user)
      addToast('Account created successfully!', 'success')
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
        <h2 className="text-lg font-semibold text-[#e6edf3]">Create Account</h2>
        <p className="text-sm text-[#636d7d] mt-1">Register a new account</p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/[0.06] border border-red-500/15 text-red-400 text-sm flex items-center gap-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
          {error}
        </div>
      )}

      <Input label="Username" type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Choose a username" required autoFocus />
      <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required />
      <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Choose a password" required />
      <Input label="Confirm Password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat password" required />

      <Button type="submit" loading={loading} className="w-full">Create Account</Button>

      <p className="text-center text-sm text-[#636d7d]">
        Already have an account?{' '}
        <Link to="/login" className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">Sign In</Link>
      </p>
    </form>
  )
}

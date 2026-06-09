import { create } from 'zustand'
import type { User } from '@/types'
import { setAuthToken, getAuthToken, api } from '@/api/client'

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  login: (token: string, user: User) => void
  logout: () => void
  checkAuth: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: getAuthToken(),
  isLoading: true,
  isAuthenticated: false,

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  setToken: (token) => {
    setAuthToken(token)
    set({ token })
  },

  login: (token, user) => {
    setAuthToken(token)
    set({ token, user, isAuthenticated: true, isLoading: false })
  },

  logout: () => {
    setAuthToken(null)
    set({ token: null, user: null, isAuthenticated: false, isLoading: false })
  },

  checkAuth: async () => {
    const token = getAuthToken()
    if (!token) {
      set({ isLoading: false, isAuthenticated: false, user: null })
      return
    }
    try {
      const user = await api<User>('GET', '/auth/me')
      set({ user, isAuthenticated: true, isLoading: false, token })
    } catch {
      setAuthToken(null)
      set({ token: null, user: null, isAuthenticated: false, isLoading: false })
    }
  },
}))

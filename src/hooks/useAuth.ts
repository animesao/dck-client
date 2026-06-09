import { useAuthStore } from '@/store/authStore'

export function useAuth() {
  const store = useAuthStore()
  return {
    user: store.user,
    token: store.token,
    isLoading: store.isLoading,
    isAuthenticated: store.isAuthenticated,
    isAdmin: store.user?.role === 'admin',
    login: store.login,
    logout: store.logout,
    checkAuth: store.checkAuth,
  }
}

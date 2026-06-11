import { create } from 'zustand'
import type { Toast } from '@/types'
import { getSettings } from '@/api/settings'

interface UIState {
  sidebarOpen: boolean
  toasts: Toast[]
  sidebarCollapsed: boolean
  disabledFeatures: Set<string>
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  addToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
  loadSettings: () => Promise<void>
}

let toastId = 0

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: false,
  sidebarCollapsed: false,
  toasts: [],
  disabledFeatures: new Set(),

  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  addToast: (message, type = 'info') => {
    const id = String(++toastId)
    set(s => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => {
      get().removeToast(id)
    }, 4000)
  },

  removeToast: (id) => {
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
  },

  loadSettings: async () => {
    try {
      const settings = await getSettings()
      const raw = settings.disabled_features
      const features = raw
        ? new Set(raw.split(',').map(s => s.trim()).filter(Boolean))
        : new Set<string>()
      set({ disabledFeatures: features })
    } catch {
      // fallback: no features disabled
    }
  },
}))

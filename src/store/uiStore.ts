import { create } from 'zustand'
import type { Toast } from '@/types'

interface UIState {
  sidebarOpen: boolean
  toasts: Toast[]
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  addToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
}

let toastId = 0

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: false,
  sidebarCollapsed: false,
  toasts: [],

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
}))

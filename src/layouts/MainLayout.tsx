import React, { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useUIStore } from '@/store/uiStore'
import {
  LayoutDashboard,
  Container,
  Image,
  Box,
  FileCode2,
  BookOpen,
  Users,
  LogOut,
  Menu,
  X,
  Shield,
  List,
  Server,
  Sliders,
} from 'lucide-react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { ToastContainer } from '@/components/ui/Toast'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', feature: '' },
  { to: '/containers', icon: Container, label: 'Containers', feature: '' },
  { to: '/images', icon: Image, label: 'Images', feature: 'images' },
  { to: '/blueprints', icon: Box, label: 'Blueprints', feature: 'blueprints' },
  { to: '/projects', icon: FileCode2, label: 'Projects', feature: 'projects' },
  { to: '/config', icon: Sliders, label: 'Config', feature: 'config' },
  { to: '/guide', icon: BookOpen, label: 'Guide', feature: 'guide' },
  { to: '/settings', icon: Sliders, label: 'Settings', feature: '' },
]

const adminNavItems = [
  { to: '/admin', icon: Shield, label: 'Dashboard', exact: true },
  { to: '/admin/containers', icon: Server, label: 'Containers' },
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/activity', icon: List, label: 'Activity' },
  { to: '/admin/settings', icon: Sliders, label: 'Settings' },
]

export function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isAdmin, logout } = useAuth()
  const { sidebarOpen, toggleSidebar, setSidebarOpen, disabledFeatures, loadSettings } = useUIStore()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (window.innerWidth >= 1024) {
      setSidebarOpen(true)
    }
    loadSettings()
  }, [])

  const filteredNavItems = navItems.filter(item => !item.feature || !disabledFeatures.has(item.feature))

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#080b12]">
      {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 -left-40 w-96 h-96 bg-indigo-500/[0.03] rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-purple-500/[0.02] rounded-full blur-3xl" />
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 flex flex-col transition-all duration-300 ease-out w-64 ${
          sidebarOpen
            ? 'translate-x-0'
            : '-translate-x-full lg:translate-x-0 lg:w-16'
        }`}
      >
        <div className={`h-full flex flex-col bg-[#0c1219]/90 backdrop-blur-2xl border-r border-white/[0.05] ${!sidebarOpen && 'lg:border-r-0'}`}>
          {/* Logo */}
          <div className="flex items-center gap-3 px-5 h-16 shrink-0 border-b border-white/[0.05]">
            <img src="/logo.png" alt="dck" className="w-9 h-9 shrink-0" />
            <span className={`font-semibold text-[#e6edf3] whitespace-nowrap transition-opacity duration-200 ${!sidebarOpen && 'lg:opacity-0 lg:w-0 lg:overflow-hidden'}`}>
              dck Manager
            </span>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
            {filteredNavItems.map(item => {
              const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to))
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                    isActive
                      ? 'bg-indigo-500/10 text-indigo-300'
                      : 'text-[#636d7d] hover:text-[#e6edf3] hover:bg-white/[0.03]'
                  } ${!sidebarOpen && 'lg:justify-center lg:px-2'}`}
                >
                  <div className={`shrink-0 transition-colors duration-200 ${isActive ? 'text-indigo-400' : 'text-[#636d7d] group-hover:text-[#8b949e]'}`}>
                    <item.icon size={18} />
                  </div>
                  <span className={`whitespace-nowrap transition-all duration-200 ${!sidebarOpen && 'lg:w-0 lg:overflow-hidden lg:opacity-0'}`}>
                    {item.label}
                  </span>
                  {isActive && (
                    <span className={`ml-auto w-1 h-4 rounded-full bg-indigo-400 ${!sidebarOpen && 'lg:hidden'}`} />
                  )}
                </NavLink>
              )
            })}

            {isAdmin && (
              <>
                <div className={`border-t border-white/[0.05] my-3 ${!sidebarOpen && 'lg:mx-2'}`} />
                <div className={`px-3 py-1.5 text-[10px] uppercase tracking-widest text-[#484f58] font-semibold ${!sidebarOpen && 'lg:hidden'}`}>
                  Admin
                </div>
                {adminNavItems.map(item => {
                  const isActive = item.exact
                    ? location.pathname === item.to
                    : location.pathname.startsWith(item.to)
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                        isActive
                          ? 'bg-indigo-500/10 text-indigo-300'
                          : 'text-[#636d7d] hover:text-[#e6edf3] hover:bg-white/[0.03]'
                      } ${!sidebarOpen && 'lg:justify-center lg:px-2'}`}
                    >
                      <div className={`shrink-0 transition-colors duration-200 ${isActive ? 'text-indigo-400' : 'text-[#636d7d] group-hover:text-[#8b949e]'}`}>
                        <item.icon size={18} />
                      </div>
                      <span className={`whitespace-nowrap transition-all duration-200 ${!sidebarOpen && 'lg:w-0 lg:overflow-hidden lg:opacity-0'}`}>
                        {item.label}
                      </span>
                      {isActive && (
                        <span className={`ml-auto w-1 h-4 rounded-full bg-indigo-400 ${!sidebarOpen && 'lg:hidden'}`} />
                      )}
                    </NavLink>
                  )
                })}
              </>
            )}
          </nav>

          {/* User */}
          <div className={`p-3 border-t border-white/[0.05] ${!sidebarOpen && 'lg:px-2'}`}>
            <button
              onClick={() => navigate('/settings')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl w-full text-left transition-colors hover:bg-white/[0.03] ${!sidebarOpen && 'lg:justify-center'}`}
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 flex items-center justify-center shrink-0 border border-indigo-500/10">
                <span className="text-sm font-semibold text-indigo-300">
                  {user?.username?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className={`flex-1 min-w-0 transition-all duration-200 ${!sidebarOpen && 'lg:w-0 lg:overflow-hidden lg:opacity-0'}`}>
                <p className="text-sm font-medium text-[#e6edf3] truncate">{user?.username}</p>
                <p className="text-[11px] text-[#636d7d]">{user?.role === 'admin' ? 'Administrator' : 'User'}</p>
              </div>
              <LogOut
                size={15}
                onClick={(e) => { e.stopPropagation(); handleLogout() }}
                className={`text-[#636d7d] hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/[0.06] shrink-0 ${!sidebarOpen && 'lg:hidden'}`}
              />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Topbar */}
        <header className="h-14 flex items-center justify-between px-3 lg:px-6 bg-[#080b12]/80 backdrop-blur-xl border-b border-white/[0.05] shrink-0 z-10">
          <div className="flex items-center gap-4">
            <button onClick={toggleSidebar} className="btn-ghost p-2 rounded-xl hover:bg-white/[0.04]">
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <span
              onClick={toggleSidebar}
              className={`text-sm font-semibold text-[#e6edf3] truncate max-w-[160px] cursor-pointer ${sidebarOpen && 'hidden lg:inline'}`}
            >
              {filteredNavItems.find(i => location.pathname === i.to || (i.to !== '/' && location.pathname.startsWith(i.to)))?.label || 'dck'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/settings')} className="btn-ghost p-2 rounded-xl hover:bg-white/[0.04]" title="Settings">
              <Sliders size={18} />
            </button>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/10">
              <span className="status-dot-running" />
              <span className="text-[11px] font-medium text-emerald-400">All systems operational</span>
            </div>
            {isAdmin && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 text-[11px] font-medium border border-indigo-500/15">
                <Shield size={12} />
              </span>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-5 lg:p-8 max-w-7xl mx-auto">
            <div className={mounted ? 'animate-fade-in' : ''}>
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden animate-fade-in" onClick={toggleSidebar} />
      )}

      <ToastContainer />
    </div>
  )
}

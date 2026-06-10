import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useAuth } from '@/hooks/useAuth'
import { MainLayout } from '@/layouts/MainLayout'
import { AuthLayout } from '@/layouts/AuthLayout'
import { Spinner } from '@/components/ui/Spinner'

// Auth pages
import { LoginPage } from '@/pages/Login'
import { RegisterPage } from '@/pages/Register'

// Main pages
import { DashboardPage } from '@/pages/Dashboard'
import { ContainersPage } from '@/pages/Containers'
import { ContainerDetailPage } from '@/pages/ContainerDetail'
import { ImagesPage } from '@/pages/Images'
import { BlueprintsPage } from '@/pages/Blueprints'
import { ProjectsPage } from '@/pages/Projects'
import { ConfigPage } from '@/pages/Config'
import { GuidePage } from '@/pages/Guide'
import { SettingsPage } from '@/pages/Settings'
import { FileManagerPage } from '@/pages/FileManager'
import { BackupsPage } from '@/pages/Backups'

// Admin pages
import { AdminDashboardPage } from '@/pages/admin/AdminDashboard'
import { AdminContainersPage } from '@/pages/admin/AdminContainers'
import { AdminUsersPage } from '@/pages/admin/AdminUsers'
import { AdminActivityPage } from '@/pages/admin/AdminActivity'
import { AdminSettingsPage } from '@/pages/admin/AdminSettings'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
        <Spinner className="h-8 w-8 text-indigo-400" />
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, isAuthenticated, isLoading } = useAuth()
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
        <Spinner className="h-8 w-8 text-indigo-400" />
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
        <Spinner className="h-8 w-8 text-indigo-400" />
      </div>
    )
  }
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  const checkAuth = useAuthStore(s => s.checkAuth)

  useEffect(() => {
    checkAuth()
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        {/* Auth routes */}
        <Route element={<PublicRoute><AuthLayout /></PublicRoute>}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        {/* Main app routes */}
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/containers" element={<ContainersPage />} />
          <Route path="/containers/:id" element={<ContainerDetailPage />} />
          <Route path="/images" element={<ImagesPage />} />
          <Route path="/blueprints" element={<BlueprintsPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/containers/:id/files" element={<FileManagerPage />} />
          <Route path="/containers/:id/backups" element={<BackupsPage />} />

          {/* Admin routes */}
          <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
          <Route path="/admin/containers" element={<AdminRoute><AdminContainersPage /></AdminRoute>} />
          <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
          <Route path="/admin/activity" element={<AdminRoute><AdminActivityPage /></AdminRoute>} />
          <Route path="/admin/settings" element={<AdminRoute><AdminSettingsPage /></AdminRoute>} />

          {/* Redirects */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

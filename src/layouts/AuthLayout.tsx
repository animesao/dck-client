import React from 'react'
import { Outlet, Link } from 'react-router-dom'

export function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080b12] p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/[0.03] rounded-full blur-3xl" />
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/[0.02] rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/[0.01] rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm animate-slide-up relative">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="dck" className="w-16 h-16 mx-auto mb-5" />
          <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">dck Manager</h1>
          <p className="text-[#636d7d] text-sm mt-1.5">Container Management Platform</p>
        </div>
        <div className="rounded-2xl bg-[#0c1219]/80 backdrop-blur-2xl border border-white/[0.06] shadow-2xl shadow-black/40 p-6">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

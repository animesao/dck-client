import React from 'react'

interface TabsProps {
  tabs: { id: string; label: string; icon?: React.ReactNode }[]
  activeTab: string
  onChange: (tab: string) => void
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/[0.06] overflow-x-auto scrollbar-none">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all duration-200 ${
            activeTab === tab.id
              ? 'bg-indigo-500/20 text-indigo-300 shadow-sm'
              : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-white/5'
          }`}
        >
          {tab.icon && tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  )
}

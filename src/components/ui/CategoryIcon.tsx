import React from 'react'
import {
  Bot,
  Globe,
  Database,
  Gamepad2,
  Wrench,
  Code2,
  FileText,
  Terminal,
  Link2,
  Package,
} from 'lucide-react'

const iconMap: Record<string, React.ReactNode> = {
  bot: <Bot size={20} />,
  web: <Globe size={20} />,
  database: <Database size={20} />,
  game: <Gamepad2 size={20} />,
  tool: <Wrench size={20} />,
  runtime: <Code2 size={20} />,
  cms: <FileText size={20} />,
  dev: <Terminal size={20} />,
  multi: <Link2 size={20} />,
}

const colorMap: Record<string, string> = {
  bot: 'text-purple-400 bg-purple-500/10',
  web: 'text-sky-400 bg-sky-500/10',
  database: 'text-orange-400 bg-orange-500/10',
  game: 'text-green-400 bg-green-500/10',
  tool: 'text-yellow-400 bg-yellow-500/10',
  runtime: 'text-pink-400 bg-pink-500/10',
  cms: 'text-blue-400 bg-blue-500/10',
  dev: 'text-cyan-400 bg-cyan-500/10',
  multi: 'text-violet-400 bg-violet-500/10',
}

export function CategoryIcon({ category, size = 20 }: { category: string; size?: number }) {
  const icon = iconMap[category]
  if (icon) {
    return React.cloneElement(icon as React.ReactElement, { size })
  }
  return <Package size={size} />
}

export function CategoryIconBox({ category }: { category: string }) {
  const colors = colorMap[category] || 'text-indigo-400 bg-indigo-500/10'
  return (
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors}`}>
      <CategoryIcon category={category} size={20} />
    </div>
  )
}

export function CategoryBadge({ category }: { category: string }) {
  const colors = colorMap[category] || 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${colors}`}>
      <CategoryIcon category={category} size={12} />
      {category}
    </span>
  )
}

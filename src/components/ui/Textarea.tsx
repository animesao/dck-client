import React from 'react'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export function Textarea({ label, className = '', ...props }: TextareaProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-[#8b949e]">{label}</label>
      )}
      <textarea
        className={`w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-[#e6edf3] placeholder-[#8b949e] text-sm font-mono focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all duration-200 resize-none ${className}`}
        {...props}
      />
    </div>
  )
}

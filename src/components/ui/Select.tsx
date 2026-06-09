import React from 'react'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export function Select({ label, options, placeholder, className = '', ...props }: SelectProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-[#8b949e]">{label}</label>
      )}
      <div className="relative">
        <select
          className={`w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-[#e6edf3] text-sm appearance-none cursor-pointer focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all duration-200 ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" className="bg-[#0d1117]">{placeholder}</option>
          )}
          {options.map(opt => (
            <option key={opt.value} value={opt.value} className="bg-[#0d1117]">
              {opt.label}
            </option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#8b949e]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>
    </div>
  )
}

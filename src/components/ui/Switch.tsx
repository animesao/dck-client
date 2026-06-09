interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
}

export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div className="relative">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className={`w-10 h-6 rounded-full transition-colors duration-200 ${checked ? 'bg-indigo-500' : 'bg-white/10'}`}>
          <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 mt-1 ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
        </div>
      </div>
      {label && <span className="text-sm text-[#e6edf3]">{label}</span>}
    </label>
  )
}

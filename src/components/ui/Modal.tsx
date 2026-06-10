import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'md' | 'lg'
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-8 sm:pt-4 overflow-y-auto bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === overlayRef.current && onClose()}
    >
      <div className={`w-full my-auto bg-[#161b22] border border-white/[0.08] rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col ${size === 'lg' ? 'max-w-4xl' : 'max-w-2xl'}`}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
            <h2 className="text-sm font-semibold text-[#e6edf3]">{title}</h2>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-[#8b949e] hover:text-[#e6edf3] transition-colors">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

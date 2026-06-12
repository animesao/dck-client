export function cn(...inputs: (string | undefined | null | false)[]) {
  return inputs.filter(Boolean).join(' ')
}

export function parseSize(str: string | number): number {
  if (typeof str === 'number') return str
  if (!str) return 0
  const s = str.trim().toUpperCase()
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|K|M|G|T)?$/)
  if (!match) return parseInt(s) || 0
  const val = parseFloat(match[1])
  const unit = match[2] || 'B'
  const units: Record<string, number> = {
    B: 1, K: 1024, KB: 1024, M: 1024 ** 2, MB: 1024 ** 2,
    G: 1024 ** 3, GB: 1024 ** 3, T: 1024 ** 4, TB: 1024 ** 4,
  }
  return Math.round(val * (units[unit] || 1))
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  parts.push(`${m}m`)
  return parts.join(' ')
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '-'
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(dateStr)
}

export function statusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'running':
      return 'emerald'
    case 'stopped':
    case 'exited':
      return 'red'
    case 'created':
      return 'yellow'
    default:
      return 'gray'
  }
}

export function statusLabel(status: string): string {
  switch (status?.toLowerCase()) {
    case 'running':
      return 'Running'
    case 'stopped':
      return 'Stopped'
    case 'exited':
      return 'Exited'
    case 'created':
      return 'Created'
    default:
      return status || 'Unknown'
  }
}

export function truncate(str: string, len: number): string {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '...' : str
}

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_URL || ''
}

export function getWsBaseUrl(): string {
  const apiUrl = getApiBaseUrl()
  if (apiUrl) {
    return apiUrl.replace(/^http/, 'ws')
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}`
}

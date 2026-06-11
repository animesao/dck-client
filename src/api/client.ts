import { getApiBaseUrl } from '@/utils'

let token: string | null = localStorage.getItem('dck_token')
let refreshHandlers: (() => void)[] = []

export function setAuthToken(newToken: string | null) {
  token = newToken
  if (newToken) {
    localStorage.setItem('dck_token', newToken)
  } else {
    localStorage.removeItem('dck_token')
  }
}

export function getAuthToken(): string | null {
  return token
}

export function onAuthRefresh(handler: () => void) {
  refreshHandlers.push(handler)
  return () => {
    refreshHandlers = refreshHandlers.filter(h => h !== handler)
  }
}

function notifyAuthRefresh() {
  refreshHandlers.forEach(h => h())
}

function isTokenExpired(): boolean {
  if (!token) return true
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp * 1000 < Date.now()
  } catch {
    return true
  }
}

export async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  if (token && isTokenExpired()) {
    setAuthToken(null)
    notifyAuthRefresh()
    throw new Error('Token expired')
  }

  const baseUrl = getApiBaseUrl()
  const url = `${baseUrl}/api${path}`

  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  })

  if (res.status === 401) {
    setAuthToken(null)
    notifyAuthRefresh()
    throw new Error('Unauthorized')
  }

  if (res.status === 204) {
    return undefined as T
  }

  const text = await res.text()
  if (!text) {
    if (!res.ok) throw new Error(`Request failed: ${res.status}`)
    return undefined as T
  }

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    if (!res.ok) {
      throw new Error(`Request failed (${res.status}): ${text.slice(0, 200)}`)
    }
    throw new Error(`Invalid JSON response: ${text.slice(0, 200)}`)
  }

  if (!res.ok) {
    throw new Error((data as Record<string, unknown>)?.error as string || (data as Record<string, unknown>)?.message as string || `Request failed: ${res.status}`)
  }

  return data as T
}

export function apiUrl(path: string): string {
  const baseUrl = getApiBaseUrl()
  const token = getAuthToken()
  const separator = path.includes('?') ? '&' : '?'
  return `${baseUrl}/api${path}${token ? `${separator}token=${token}` : ''}`
}

export function sseUrl(path: string): string {
  const baseUrl = getApiBaseUrl().replace(/^http/, 'http')
  const token = getAuthToken()
  const separator = path.includes('?') ? '&' : '?'
  return `${baseUrl}/api${path}${token ? `${separator}token=${token}` : ''}`
}

export function wsUrl(path: string): string {
  const baseUrl = getApiBaseUrl().replace(/^http/, 'ws')
  const token = getAuthToken()
  const separator = path.includes('?') ? '&' : '?'
  return `${baseUrl}/api${path}${token ? `${separator}token=${token}` : ''}`
}

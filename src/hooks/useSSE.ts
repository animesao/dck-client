import { useEffect, useRef, useState, useCallback } from 'react'
import { getAuthToken } from '@/api/client'

export function useSSE<T>(
  path: string,
  onMessage: (data: T) => void,
  enabled = true
) {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const handlersRef = useRef(onMessage)
  handlersRef.current = onMessage

  const connect = useCallback(() => {
    const token = getAuthToken()
    if (!token) return

    const baseUrl = import.meta.env.VITE_API_URL || ''
    const separator = path.includes('?') ? '&' : '?'
    const url = `${baseUrl}/api${path}${separator}token=${token}`

    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onopen = () => {
      setConnected(true)
      setError(null)
    }

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as T
        handlersRef.current(data)
      } catch { /* ignore parse errors */ }
    }

    es.onerror = () => {
      setConnected(false)
      setError('Connection lost')
      es.close()
    }
  }, [path])

  useEffect(() => {
    if (!enabled) return
    connect()
    return () => {
      eventSourceRef.current?.close()
      eventSourceRef.current = null
    }
  }, [connect, enabled])

  const reconnect = useCallback(() => {
    eventSourceRef.current?.close()
    connect()
  }, [connect])

  return { connected, error, reconnect }
}

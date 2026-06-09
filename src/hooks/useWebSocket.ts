import { useEffect, useRef, useState, useCallback } from 'react'
import { getAuthToken } from '@/api/client'

interface UseWebSocketOptions {
  onMessage?: (data: string) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Event) => void
  enabled?: boolean
}

export function useWebSocket(
  path: string,
  options: UseWebSocketOptions = {}
) {
  const { onMessage, onOpen, onClose, onError, enabled = true } = options
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const handlersRef = useRef({ onMessage, onOpen, onClose, onError })
  handlersRef.current = { onMessage, onOpen, onClose, onError }

  const connect = useCallback(() => {
    const token = getAuthToken()
    if (!token) return

    const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/^http/, 'ws')
    const separator = path.includes('?') ? '&' : '?'
    const url = `${baseUrl}/api${path}${separator}token=${token}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      handlersRef.current.onOpen?.()
    }

    ws.onmessage = (event) => {
      handlersRef.current.onMessage?.(event.data)
    }

    ws.onclose = () => {
      setConnected(false)
      handlersRef.current.onClose?.()
    }

    ws.onerror = (error) => {
      handlersRef.current.onError?.(error)
    }
  }, [path])

  useEffect(() => {
    if (!enabled) return
    connect()
    return () => {
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect, enabled])

  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data)
    }
  }, [])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
  }, [])

  return { connected, send, disconnect }
}

import { useEffect, useRef, useCallback } from 'react'

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
  const wsRef = useRef<WebSocket | null>(null)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const mountedRef = useRef(true)
  const retryCountRef = useRef(0)
  const pathRef = useRef(path)
  const handlersRef = useRef({ onMessage, onOpen, onClose, onError })
  pathRef.current = path
  handlersRef.current = { onMessage, onOpen, onClose, onError }

  const connect = useCallback(() => {
    if (!mountedRef.current) return

    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.onmessage = null
      wsRef.current.close()
    }

    const token = localStorage.getItem('dck_token')
    if (!token) return

    const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/^http/, 'ws')
    const separator = pathRef.current.includes('?') ? '&' : '?'
    const url = `${baseUrl}/api${pathRef.current}${separator}token=${token}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      retryCountRef.current = 0
      handlersRef.current.onOpen?.()
    }

    ws.onmessage = (event) => {
      handlersRef.current.onMessage?.(event.data)
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000)
      retryCountRef.current++
      retryTimeoutRef.current = setTimeout(connect, delay)
      handlersRef.current.onClose?.()
    }

    ws.onerror = () => {
      ws.close()
      handlersRef.current.onError?.(new Event('error'))
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    if (enabled) connect()

    return () => {
      mountedRef.current = false
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.onerror = null
        wsRef.current.onmessage = null
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [enabled, connect])

  const send = useCallback((data: string | ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data)
    }
  }, [])

  const disconnect = useCallback(() => {
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }
    retryCountRef.current = 0
  }, [])

  return { send, disconnect, ws: wsRef }
}

import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { wsUrl } from '@/api/client'
import 'xterm/css/xterm.css'

interface ContainerConsoleProps {
  containerId: string
}

export function ContainerConsole({ containerId }: ContainerConsoleProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<{ terminal: Terminal; fitAddon: FitAddon } | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!terminalRef.current || !containerId) return

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      convertEol: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'SFMono-Regular', 'Fira Code', monospace",
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#6366f1',
        selectionBackground: '#6366f140',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
      allowTransparency: true,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(terminalRef.current)

    const resizeObserver = new ResizeObserver(() => {
      try { fitAddon.fit() } catch {}
    })
    resizeObserver.observe(terminalRef.current)

    setTimeout(() => {
      try { fitAddon.fit() } catch {}
    }, 100)

    const url = wsUrl(`/containers/${containerId}/console`)
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      terminal.focus()
    }

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        terminal.write(event.data)
      } else {
        terminal.write(new Uint8Array(event.data))
      }
    }

    ws.onerror = () => {
      terminal.write('\r\n[Console connection error]\r\n')
    }

    ws.onclose = () => {
      setConnected(false)
    }

    terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    terminal.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    })

    xtermRef.current = { terminal, fitAddon }

    return () => {
      resizeObserver.disconnect()
      ws.close()
      terminal.dispose()
      xtermRef.current = null
    }
  }, [containerId])

  return (
    <div className="relative rounded-lg overflow-hidden border border-white/[0.08]">
      <div className="flex items-center justify-between px-3 py-2 bg-[#0d1117] border-b border-white/[0.06]">
        <span className="text-xs text-[#8b949e]">Console — {containerId.slice(0, 12)}</span>
        <span className={`text-xs flex items-center gap-1.5 ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      <div ref={terminalRef} className="h-[500px]" />
    </div>
  )
}

/**
 * XTerminal — xterm.js wrapper component.
 * Bridges the xterm surface to the persistent per-session PTY connection
 * (see terminal-connection.ts). Switching conversation tabs away and back
 * detaches/re-attaches the surface but reuses the same PTY session; buffered
 * output produced while detached is replayed on the fresh xterm.
 */

import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import { useTerminal } from './use-terminal.ts'

/** XTerminal component props. */
interface XTerminalProps {
  /** The session id; keys the persistent PTY connection. */
  sessionId?: string
  /** WebSocket URL of the terminal bridge (optional; auto-detected). */
  wsUrl?: string
}

/**
 * Interactive terminal component using xterm.js.
 * @param props - session id (connection key) and optional ws url.
 */
export function XTerminal({ sessionId, wsUrl }: XTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  // Output arriving from the connection holder before the xterm surface is
  // mounted (buffered replay on re-attach); flushed into the terminal once it
  // exists.
  const pendingRef = useRef('')

  const { spawn, sendInput } = useTerminal({
    sessionId,
    wsUrl,
    onOutput: (data) => {
      const term = termRef.current
      if (term !== null) term.write(data)
      else pendingRef.current += data
    },
  })

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    let term: Terminal | undefined
    let fitAddon: FitAddon | undefined
    let observer: ResizeObserver | undefined

    try {
      term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#d4d4d4',
          selectionBackground: '#264f78',
        },
      })
      termRef.current = term
      fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(container)
      fitAddon.fit()

      // Flush any buffered output that arrived before this surface mounted.
      if (pendingRef.current !== '') {
        term.write(pendingRef.current)
        pendingRef.current = ''
      }

      // User input → PTY via WebSocket.
      term.onData((data) => { sendInput(data) })
      // Resize → refit the terminal; the server-side PTY ignores size for now.
      term.onResize(() => { fitAddon?.fit() })

      observer = new ResizeObserver(() => { fitAddon?.fit() })
      observer.observe(container)

      spawn(term.cols, term.rows)
    } catch (error) {
      container.textContent = `终端初始化失败: ${error instanceof Error ? error.message : String(error)}`
    }

    return () => {
      observer?.disconnect()
      termRef.current = null
      term?.dispose()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} style={styles.container} />
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
}

/**
 * useTerminal — React hook bridging an xterm surface to the persistent
 * terminal connection holder. The connection (WebSocket + PTY) is keyed by
 * session id and survives view unmounts, so switching conversation tabs away
 * and back reuses the same PTY session instead of respawning it.
 */

import { useCallback, useEffect, useRef } from 'react'
import { attachConnection } from './terminal-connection.ts'

/** useTerminal hook options. */
interface UseTerminalOptions {
  /** The session id (connection key); one persistent PTY per session. */
  sessionId?: string
  /** WebSocket URL (default: auto-detect from page). */
  wsUrl?: string
  /** Callback when PTY output is received. */
  onOutput?: (data: string) => void
  /** Callback when the PTY exits. */
  onExit?: (code: number) => void
}

/** useTerminal hook return value. */
interface UseTerminalReturn {
  /** Spawn the PTY session (idempotent per connection). */
  spawn: (cols: number, rows: number) => void
  /** Send input to the PTY. */
  sendInput: (data: string) => void
  /** Force-close the PTY session and drop the connection. */
  close: () => void
}

/**
 * Attach a terminal surface to the persistent per-session PTY connection.
 * @param options - session id, optional ws url, output/exit callbacks.
 * @returns spawn/send/close verbs; the connection is NOT closed on unmount.
 */
export function useTerminal(options: UseTerminalOptions = {}): UseTerminalReturn {
  const { sessionId = 'default', wsUrl, onOutput, onExit } = options

  // Stable callbacks via refs so the connection holder sees fresh handlers
  // without re-attaching on every render.
  const onOutputRef = useRef(onOutput)
  const onExitRef = useRef(onExit)
  onOutputRef.current = onOutput
  onExitRef.current = onExit

  const apiRef = useRef<ReturnType<typeof attachConnection> | null>(null)

  // Build the WebSocket URL once (auto-detect host).
  const resolvedWsUrl = wsUrl ?? ((): string => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws/terminal`
  })()

  useEffect(() => {
    const handleOutput = (data: string): void => { onOutputRef.current?.(data) }
    const handleExit = (code: number): void => { onExitRef.current?.(code) }
    const api = attachConnection(sessionId, resolvedWsUrl, handleOutput, handleExit)
    apiRef.current = api
    // Do NOT close the connection on unmount — it (and the PTY) must survive
    // view tab switches. It only dies on explicit close() or a PTY exit.
    return () => {
      api.detach()
      apiRef.current = null
    }
  }, [sessionId, resolvedWsUrl])

  const spawn = useCallback((cols: number, rows: number): void => {
    apiRef.current?.spawn(cols, rows)
  }, [])

  const sendInput = useCallback((data: string): void => {
    apiRef.current?.sendInput(data)
  }, [])

  const close = useCallback((): void => {
    apiRef.current?.close()
    apiRef.current = null
  }, [])

  return { spawn, sendInput, close }
}

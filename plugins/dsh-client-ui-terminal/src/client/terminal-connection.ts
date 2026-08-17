/**
 * terminal-connection — module-level WebSocket/PTY connection holder that
 * survives conversation view unmounts. One live connection per terminal key
 * (the session id). When a view tab is switched away the component detaches
 * its handlers but the WebSocket (and so the PTY session) stays open; switching
 * back reattaches and replays the buffered output, reusing the same session
 * instead of spawning a fresh one.
 */

/** Client message to the bridge. */
type ClientMessage =
  | { type: 'spawn'; cols: number; rows: number; cwd?: string }
  | { type: 'input'; data: string }
  | { type: 'close' }

interface LiveConnection {
  ws: WebSocket | null
  /** Messages queued while the socket was not yet open (flushed on open). */
  queue: ClientMessage[]
  /** Accumulated output since the last exit, replayed on each new attach. */
  buffer: string
  /** Whether a spawn request has been sent for this connection. */
  spawnSent: boolean
  /** Output listeners (0 when the view is detached). */
  outputs: Set<(data: string) => void>
  /** Exit listeners (0 when the view is detached). */
  exits: Set<(code: number) => void>
  wsUrl: string
}

/** One live connection per terminal key (session id). */
const connections = new Map<string, LiveConnection>()

/** Flush queued messages once the socket is open. */
function flush(conn: LiveConnection): void {
  if (conn.ws === null || conn.ws.readyState !== WebSocket.OPEN) return
  while (conn.queue.length > 0) {
    conn.ws.send(JSON.stringify(conn.queue.shift()))
  }
}

/** Open (or reopen) the WebSocket for a connection. */
function open(conn: LiveConnection): void {
  if (conn.ws !== null && conn.ws.readyState !== WebSocket.CLOSED) return
  const ws = new WebSocket(conn.wsUrl)
  conn.ws = ws
  ws.onopen = (): void => { flush(conn) }
  ws.onmessage = (ev: MessageEvent<string>): void => {
    let msg: { type: string; data?: string; exitCode?: number; error?: string }
    try {
      msg = JSON.parse(ev.data)
    } catch {
      return
    }
    if (msg.type === 'output' && msg.data !== undefined) {
      conn.buffer += msg.data
      for (const h of conn.outputs) h(msg.data)
    } else if (msg.type === 'exit') {
      const code = msg.exitCode ?? 0
      for (const h of conn.exits) h(code)
      // PTY exited: drop the connection so the next attach spawns fresh.
      conn.spawnSent = false
      conn.buffer = ''
      conn.queue = []
      conn.ws = null
      try { ws.close() } catch { /* already closing */ }
    } else if (msg.type === 'error') {
      for (const h of conn.exits) h(-1)
      conn.spawnSent = false
      conn.queue = []
      conn.ws = null
      try { ws.close() } catch { /* already closing */ }
    }
  }
  ws.onclose = (): void => {
    if (conn.ws === ws) conn.ws = null
  }
}

/** Send a message, queueing it until the socket is open. */
function send(conn: LiveConnection, message: ClientMessage): void {
  if (conn.ws === null || conn.ws.readyState === WebSocket.CLOSED) return
  if (conn.ws.readyState !== WebSocket.OPEN) {
    conn.queue.push(message)
    return
  }
  conn.ws.send(JSON.stringify(message))
}

/**
 * Attach a view to the live connection for a key, creating it on first use.
 * @param key - the terminal identity (session id); one PTY per key.
 * @param wsUrl - WebSocket bridge URL used when the connection is first created.
 * @param onOutput - output handler (replayed with buffered output immediately).
 * @param onExit - PTY exit handler.
 * @returns an idempotent detacher, plus send/spawn verbs. The detacher removes
 *   the handlers but keeps the WebSocket and PTY session alive.
 */
export function attachConnection(
  key: string,
  wsUrl: string,
  onOutput: (data: string) => void,
  onExit: (code: number) => void,
): {
  detach: () => void
  sendInput: (data: string) => void
  spawn: (cols: number, rows: number, cwd?: string) => void
  close: () => void
} {
  let conn = connections.get(key)
  if (conn === undefined) {
    conn = {
      ws: null,
      queue: [],
      buffer: '',
      spawnSent: false,
      outputs: new Set(),
      exits: new Set(),
      wsUrl,
    }
    connections.set(key, conn)
  }
  conn.outputs.add(onOutput)
  conn.exits.add(onExit)
  // Replay any buffered output produced while detached.
  if (conn.buffer !== '') onOutput(conn.buffer)
  if (conn.ws === null) open(conn)

  return {
    detach: () => {
      conn?.outputs.delete(onOutput)
      conn?.exits.delete(onExit)
      // Intentionally NOT closing the WebSocket: the PTY session persists.
    },
    sendInput: (data: string) => { send(conn as LiveConnection, { type: 'input', data }) },
    spawn: (cols: number, rows: number, cwd?: string) => {
      const live = conn as LiveConnection
      if (live.ws === null) open(live)
      if (live.spawnSent) return
      live.spawnSent = true
      send(live, { type: 'spawn', cols, rows, ...(cwd !== undefined ? { cwd } : {}) })
    },
    close: () => {
      const live = connections.get(key)
      if (live === undefined) return
      send(live, { type: 'close' })
      live.spawnSent = false
      live.buffer = ''
      live.queue = []
      live.ws?.close()
      live.ws = null
      connections.delete(key)
    },
  }
}

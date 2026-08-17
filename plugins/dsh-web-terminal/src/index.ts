/**
 * dsh-web-terminal — WebSocket-to-PTY bridge plugin.
 * Exposes interactive terminal sessions to the web GUI via WebSocket.
 *
 * This plugin bypasses the batch-oriented TerminalSessionService and
 * directly uses SubprocessTerminalHandle for real-time streaming I/O.
 */

import { WebSocketServer, type WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

/** Plugin name for Cordis registration. */
export const name = 'web-terminal'

/** Required services: subprocess for PTY allocation, webServer for WebSocket upgrade. */
export const inject = ['subprocess', 'webServer']

/** Plugin configuration. */
export interface Config {
  /** WebSocket path (default: '/ws/terminal'). */
  wsPath?: string
  /** Default terminal columns. */
  defaultCols?: number
  /** Default terminal rows. */
  defaultRows?: number
}

/** Active terminal session state. */
interface TerminalSession {
  id: string
  terminal: any // SubprocessTerminalHandle
  socket: WebSocket
  alive: boolean
}

/** WebSocket message from client. */
interface ClientMessage {
  type: 'spawn' | 'input' | 'resize' | 'close'
  data?: string
  cols?: number
  rows?: number
  cwd?: string
}

/** WebSocket message to client. */
interface ServerMessage {
  type: 'output' | 'exit' | 'spawned' | 'error'
  data?: string
  exitCode?: number
  sessionId?: string
  error?: string
}

let sessionCounter = 0

/**
 * Apply the web-terminal plugin.
 * Registers a WebSocket upgrade route for interactive terminal sessions.
 */
export function apply(ctx: any, config: Config = {}): void {
  const wsPath = config.wsPath ?? '/ws/terminal'
  const defaultCols = config.defaultCols ?? 80
  const defaultRows = config.defaultRows ?? 24

  // Store active sessions for cleanup on dispose
  const sessions = new Map<string, TerminalSession>()

  // Register WebSocket upgrade route
  const dispose = ctx.webServer.registerUpgrade({
    path: wsPath,
    handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      handleUpgrade(ctx, req, socket, head, sessions, { defaultCols, defaultRows })
    },
  })

  // Cleanup on dispose
  ctx.effect(() => () => {
    dispose()
    for (const session of sessions.values()) {
      session.alive = false
      session.terminal?.terminate?.().catch(() => {})
      session.socket.close()
    }
    sessions.clear()
  }, 'web-terminal cleanup')
}

/**
 * Handle WebSocket upgrade request.
 */
function handleUpgrade(
  ctx: any,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  sessions: Map<string, TerminalSession>,
  config: { defaultCols: number; defaultRows: number },
): void {
  // Create WebSocket server for this connection
  const wss = new WebSocketServer({ noServer: true })

  wss.handleUpgrade(req, socket, head, (ws) => {
    const sessionId = `web-pty-${++sessionCounter}`
    let terminal: any = null
    let session: TerminalSession | null = null

    // Handle messages from client
    ws.on('message', async (raw) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString())

        switch (msg.type) {
          case 'spawn': {
            // Spawn a new PTY session
            const cols = msg.cols ?? config.defaultCols
            const rows = msg.rows ?? config.defaultRows
            const cwd = msg.cwd ?? process.cwd()

            try {
              // Use subprocess service to spawn terminal
              terminal = await ctx.subprocess.spawnTerminal({
                argv: [process.env.SHELL ?? '/bin/bash'],
                cwd,
                env: {
                  TERM: 'xterm-256color',
                  COLORTERM: 'truecolor',
                  ...(process.env as Record<string, string>),
                },
                cols,
                rows,
                graceMs: 5000,
              })

              session = {
                id: sessionId,
                terminal,
                socket: ws,
                alive: true,
              }
              sessions.set(sessionId, session)

              // Send spawned confirmation
              send(ws, { type: 'spawned', sessionId })

              // Bridge PTY output to WebSocket
              terminal.output.on('data', (chunk: Buffer) => {
                if (session?.alive) {
                  send(ws, { type: 'output', data: chunk.toString('utf-8') })
                }
              })

              // Handle PTY exit
              terminal.done.then(
                (outcome: any) => {
                  if (session?.alive) {
                    send(ws, { type: 'exit', exitCode: outcome.exitCode ?? 0 })
                    session.alive = false
                    sessions.delete(sessionId)
                  }
                },
                (error: Error) => {
                  if (session?.alive) {
                    send(ws, { type: 'error', error: error.message })
                    session.alive = false
                    sessions.delete(sessionId)
                  }
                },
              )
            } catch (error) {
              send(ws, {
                type: 'error',
                error: error instanceof Error ? error.message : String(error),
              })
            }
            break
          }

          case 'input': {
            // Write input to PTY
            if (terminal && msg.data) {
              try {
                await terminal.write(msg.data)
              } catch (error) {
                send(ws, {
                  type: 'error',
                  error: error instanceof Error ? error.message : String(error),
                })
              }
            }
            break
          }

          case 'resize': {
            // Resize PTY - node-pty handles this via the process
            // The resize is implicit in the next write
            break
          }

          case 'close': {
            // Close PTY session
            if (terminal) {
              try {
                await terminal.terminate()
              } catch {
                // Ignore close errors
              }
              if (session) {
                session.alive = false
                sessions.delete(sessionId)
              }
            }
            ws.close()
            break
          }
        }
      } catch (error) {
        send(ws, {
          type: 'error',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })

    // Handle WebSocket close
    ws.on('close', () => {
      if (session) {
        session.alive = false
        sessions.delete(sessionId)
        terminal?.terminate?.().catch(() => {})
      }
    })

    // Handle WebSocket error
    ws.on('error', (error) => {
      console.error(`WebSocket error for session ${sessionId}:`, error)
      if (session) {
        session.alive = false
        sessions.delete(sessionId)
        terminal?.terminate?.().catch(() => {})
      }
    })
  })
}

/**
 * Send a JSON message to WebSocket client.
 */
function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

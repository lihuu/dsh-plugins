/**
 * TerminalView — the "终端" conversation view tab. Registered into
 * conversation.view (a session-scoped list slot), so each session gets its own
 * terminal tab that follows the current session. Renders the xterm surface,
 * filling the whole view area. The session id keys the persistent PTY.
 */

import { XTerminal } from './XTerminal.tsx'

/** Full view props (session-scope standard kit). */
export interface TerminalViewProps {
  /** Session id of the current session; keys the persistent PTY connection. */
  sessionId?: string
}

/**
 * The terminal conversation view tab.
 * @param props - session view props; sessionId keys the persistent PTY.
 */
export function TerminalView({ sessionId }: TerminalViewProps) {
  return (
    <div style={styles.root} data-terminal-view="">
      <XTerminal sessionId={sessionId} />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: '100%',
    height: '100%',
    backgroundColor: 'var(--dsw-surface, #1e1e1e)',
    overflow: 'hidden',
  },
}

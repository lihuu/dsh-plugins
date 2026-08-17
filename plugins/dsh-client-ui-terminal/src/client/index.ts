/**
 * dsh-client-ui-terminal — browser plugin entry.
 * Registers the "终端" conversation view tab into conversation.view (a
 * session-scoped list slot), so each session carries its own terminal tab that
 * follows the current session. Selecting the tab swaps the whole view area to
 * the xterm surface.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { TerminalView } from './TerminalView.tsx'

/** Plugin row name used by the cordis loader entry. */
export const name = 'client-ui-terminal'

/** Required services: the slot system. */
export const inject = ['slots']

/**
 * Register the terminal conversation view tab once the view ring is on the
 * ledger (activation order vs ui-conversation is unconstrained).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'terminal',
    order: 20,
    label: () => '终端',
  }, TerminalView))
}

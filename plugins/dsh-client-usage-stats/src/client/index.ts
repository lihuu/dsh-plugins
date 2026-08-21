/**
 * dsh-client-usage-stats — browser plugin entry.
 * Registers the "用量统计" settings page into settings.section (a root-scoped
 * list slot), so the Settings panel gains one page aggregating the token
 * usage every session summary already carries in its projection column.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { UsageSection } from './UsageSection.tsx'
import type { UsageSectionComponentProps } from './UsageSection.tsx'
import { zh, en } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Usage statistics page copy. */
    'settings.usage': typeof zh
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.usage'

/** Plugin row name used by the cordis loader entry. */
export const name = 'client-usage-stats'

/** Required services: the slot system and the locale registry. */
export const inject = ['slots', 'locale']

/**
 * Register the Usage section once the `settings.section` declaration is on
 * the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'usage-stats: copy dictionaries')
  const t = ctx.locale.bind(NS) as UsageSectionComponentProps['t']
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'usage',
    order: 100,
    label: () => t('nav'),
    locale: NS,
  }, UsageSection))
}

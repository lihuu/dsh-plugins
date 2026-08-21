/**
 * UsageSection — the "用量统计" settings page. Rides the session-list
 * projection column: every session summary already carries its durable
 * tokenUsage projection values (live sessions from the watermark cache, cold
 * sessions from the persisted projection cache), so this page is a pure
 * client-side aggregate with no host round trip beyond the list itself.
 */

import { useMemo } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionSummary } from '@deepseek-ai/dsh-client-runtime/client'

/** Full component props: settings section owner share plus the locale seat. */
export type UsageSectionComponentProps = PropsRuntime<'settings.section'> & PropsLocale<'settings.usage'>

/** Aggregated usage across every listed session. */
export interface UsageTotals {
  /** Sessions whose projection carries token usage. */
  sessions: number
  uncachedInput: number
  cacheRead: number
  cacheWrite: number
  output: number
}

/** Sum the four disjoint usage buckets over all session summaries. */
export function aggregateUsage(byId: Record<string, SessionSummary>): UsageTotals {
  let sessions = 0
  let uncachedInput = 0
  let cacheRead = 0
  let cacheWrite = 0
  let output = 0
  for (const summary of Object.values(byId)) {
    const usage = summary.projectionValues?.tokenUsage
    if (usage === undefined) continue
    sessions += 1
    uncachedInput += usage.uncachedInputTokens
    cacheRead += usage.cacheReadTokens
    cacheWrite += usage.cacheWriteTokens
    output += usage.outputTokens
  }
  return { sessions, uncachedInput, cacheRead, cacheWrite, output }
}

/** Compact token count: 517 / 12.2K / 517K / 1.2M (one decimal under three digits). */
export function formatTokens(n: number): string {
  const scaled = (v: number): string =>
    v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${scaled(n / 1_000)}K`
  return `${scaled(n / 1_000_000)}M`
}

/**
 * The Usage statistics settings page.
 * @param props - settings section owner props plus the bound translator.
 * @returns the aggregate usage panel.
 */
export function UsageSection({ useSessions, t }: UsageSectionComponentProps) {
  const totals = useSessions(state => aggregateUsage(state.byId))
  const hasUsage = totals.sessions > 0
    && (totals.uncachedInput > 0 || totals.cacheRead > 0
      || totals.cacheWrite > 0 || totals.output > 0)
  const grandTotal = useMemo(() => (
    totals.uncachedInput + totals.cacheRead + totals.cacheWrite + totals.output
  ), [totals])

  if (!hasUsage) {
    return (
      <div style={styles.section}>
        <h2 style={styles.title}>{t('title')}</h2>
        <p style={styles.empty}>{t('empty')}</p>
      </div>
    )
  }

  const rows: Array<[string, number]> = [
    [t('uncachedInput'), totals.uncachedInput],
    [t('cacheRead'), totals.cacheRead],
    [t('cacheWrite'), totals.cacheWrite],
    [t('output'), totals.output],
  ]

  return (
    <div style={styles.section}>
      <h2 style={styles.title}>{t('title')}</h2>
      <p style={styles.description}>{t('description')}</p>

      <div style={styles.totalCard}>
        <div style={styles.totalValue}>{formatTokens(grandTotal)}</div>
        <div style={styles.totalLabel}>{t('total')}</div>
      </div>

      <div style={styles.rows}>
        {rows.map(([label, value]) => (
          <div key={label} style={styles.row}>
            <span style={styles.rowLabel}>{label}</span>
            <span style={styles.rowValue}>{formatTokens(value)}</span>
          </div>
        ))}
      </div>

      <p style={styles.sessions}>{t('sessions', { count: totals.sessions })}</p>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '4px 2px',
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--dsw-text, #e8e8e8)',
  },
  description: {
    margin: 0,
    fontSize: 13,
    color: 'var(--dsw-text-muted, #9a9a9a)',
  },
  totalCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '16px 20px',
    borderRadius: 10,
    backgroundColor: 'var(--dsw-surface-raised, rgba(255,255,255,0.06))',
  },
  totalValue: {
    fontSize: 32,
    fontWeight: 700,
    color: 'var(--dsw-accent, #4d9fff)',
  },
  totalLabel: {
    fontSize: 13,
    color: 'var(--dsw-text-muted, #9a9a9a)',
  },
  rows: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 14,
  },
  rowLabel: {
    color: 'var(--dsw-text, #e8e8e8)',
  },
  rowValue: {
    color: 'var(--dsw-text-strong, #ffffff)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  sessions: {
    margin: 0,
    fontSize: 13,
    color: 'var(--dsw-text-muted, #9a9a9a)',
  },
  empty: {
    margin: 0,
    fontSize: 14,
    color: 'var(--dsw-text-muted, #9a9a9a)',
  },
}

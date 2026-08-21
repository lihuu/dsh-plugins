/**
 * dsh-client-usage-stats — Node half.
 * The browser half lives in ./client; this half exists so the loader accepts
 * the package as a valid plugin row. Provides no host-side behavior.
 */

/** Stable plugin row name (used by the cordis loader entry). */
export const name = 'client-usage-stats'

/** No host-side dependencies needed. */
export const inject: string[] = []

/** Provides no host-side behavior. */
export function apply(): void {}

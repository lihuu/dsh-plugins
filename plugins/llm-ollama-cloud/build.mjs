/**
 * Bundle the plugin into a single loadable ESM file.
 *
 * Everything the plugin needs at runtime is inlined (the plugin's own code and
 * `eventsource-parser`); the only external kept is `@deepseek-ai/dsh-llm`, the
 * harness's LLM seam contract, which the running dsh must provide as the same
 * module instance (error classification relies on `instanceof LlmError`).
 *
 * The esbuild binary is located from, in order: `$ESBUILD_BIN`,
 * `$DSH_REPO/node_modules/.bin/esbuild`, or `esbuild` on PATH — no path is
 * hardcoded.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

function findEsbuild() {
  const candidates = [
    process.env.ESBUILD_BIN,
    process.env.DSH_REPO ? join(process.env.DSH_REPO, 'node_modules/.bin/esbuild') : undefined,
  ].filter((value) => value !== undefined && existsSync(value))
  if (candidates.length > 0) return candidates[0]
  return 'esbuild' // PATH fallback
}

const esbuild = findEsbuild()
const result = spawnSync(esbuild, [
  'src/index.ts',
  '--bundle',
  '--platform=node',
  '--format=esm',
  '--target=node22',
  '--outfile=dist/index.js',
  '--external:@deepseek-ai/dsh-llm',
  '--sourcemap',
  '--log-level=warning',
], { cwd: here, stdio: 'inherit' })

if (result.error !== undefined) {
  throw new Error(`esbuild failed to start (${esbuild}): ${String(result.error)}`)
}
process.exit(result.status ?? 1)

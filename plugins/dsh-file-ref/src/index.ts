/**
 * dsh-file-ref — independent `@file` workspace file reference plugin (HOST half).
 *
 * Provides the `fileRefFinder` Typert Remote service: the `@file` composer
 * source in the browser half resolves candidates through the runtime
 * `fileRefFinder/find` endpoint. The host gateway (`dsh-api-gateway`)
 * dispatches `/api/fileRefFinder/find` to this live service via source-mode
 * discovery (`typertRemote` binding + `Remote` markers), so NO compile-time
 * generated artifacts and NO main-repo changes are involved: the whole
 * feature mounts as an installable `@local` plugin.
 *
 * @module dsh-file-ref
 */

import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'

/** Stable plugin row name (used by the cordis loader entry). */
export const name = 'dsh-file-ref'

/** One discoverable file in the session's workspace. Paths only — no content. */
export interface FileRefCandidate {
  /** Basename, for a compact menu label. */
  readonly name: string
  /** Workspace-relative path (rooted at the session cwd). */
  readonly relPath: string
  /** Canonical absolute path in the host's execution world; what the pick inserts. */
  readonly path: string
}

// ---- Minimal structural faces of the optional host services. Type-only:
// the plugin reads them with ctx.get() and never imports the packages. ----

/** The `ctx.fs` service surface this plugin uses (dsh-fs FileSystem). */
interface FileSystemLike {
  resolve(path: string, options?: { cwd?: string }): Promise<unknown>
  listDir(target: unknown): Promise<readonly { name: string; type: string; target: unknown }[]>
  processPath(target: unknown): string
}

/** The `ctx.subprocess` service surface this plugin uses (dsh-subprocess SubprocessRuntime). */
interface SubprocessRuntimeLike {
  resolveExecutable(bin: string): Promise<string>
  spawn(spec: {
    argv: string[]
    cwd: string
    graceMs: number
    stdio: {
      stdin: 'ignore'
      stdout: { maxBytes: number }
      stderr: { maxBytes: number }
    }
  }): {
    done: Promise<void>
    terminate(): void
    collected: { stdout?: { readFrom(offset: number): { text: string } } }
  }
}

/** The `ctx.sessions` service surface (dsh-session SessionStore). */
interface SessionStoreLike {
  get(sessionId: string): { header: { cwd?: string } } | undefined
}

/** Result cap returned per query (the composer menu shows a short bounded list). */
export const FILE_REF_LIMIT = 12

/** Skipped heaviness/VCS directories in both search paths. */
const SKIPPED_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', '.next', '.dist', 'dist', 'build', 'target',
  'coverage', '.venv', 'venv', '__pycache__', '.gitkeep',
])

/** Directory budget for the fallback walk (visited dirs). */
const FS_WALK_MAX_DIRS = 1200
/** File budget for the fallback walk (scanned files). */
const FS_WALK_MAX_FILES = 4000
/** Raw `rg --files` stdout byte budget. */
const RG_STDOUT_MAX_BYTES = 2_000_000
/** Diagnostic stderr tail budget. */
const RG_STDERR_MAX_BYTES = 64 * 1024
/** Terminate-grace budget for the rg child. */
const RG_GRACE_MS = 3000

/** ripgrep path-negative globs excluding the same skipped directories. */
const RG_EXCLUDES: readonly string[] = Array.from(SKIPPED_DIRS).map(d => `!${d}/**`)

/** ripgrep argv for one `--glob`-bound exclusion list (bare patterns would be treated as search paths). */
function rgGlobArgs(): string[] {
  const out: string[] = []
  for (const glob of RG_EXCLUDES) out.push('--glob', glob)
  return out
}

/** Basename hits rank above path-substring hits; empty query returns a broad baseline. */
function scoreFileRef(rel: string, name: string, query: string): number {
  const lower = rel.toLowerCase()
  const nlower = name.toLowerCase()
  const ql = query.toLowerCase()
  if (ql === '') return 0
  if (nlower.includes(ql)) return 100 - Math.min(name.length, 60)
  if (lower.includes(ql)) return 60 - Math.min(rel.length, 40)
  return -1
}

function trimSlashes(value: string): string {
  // Trim trailing slashes only; an absolute path keeps its leading '/'.
  return value.replace(/\/+$/, '')
}

function aborted(signal: AbortSignal | undefined): boolean {
  return signal !== undefined && signal.aborted
}

interface UnscoredEntry {
  readonly rel: string
  readonly name: string
}

interface ScoreEntry extends UnscoredEntry {
  readonly score: number
}

function rankFiles(entries: readonly UnscoredEntry[], query: string, limit: number): ScoreEntry[] {
  const scored = entries
    .map(entry => ({ ...entry, score: scoreFileRef(entry.rel, entry.name, query) }))
    .filter(entry => entry.score >= 0)
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}

/**
 * File reference remote service. Registered under `fileRefFinder`; the `find`
 * method is the single `@Remote` endpoint the browser half calls through
 * `connection.rpc.call('/api', 'fileRefFinder/find', { args })`.
 */
export class FileRefFinderService extends TypertRemoteService {
  private readonly fs: FileSystemLike | undefined
  private readonly subprocess: SubprocessRuntimeLike | undefined
  private readonly sessions: SessionStoreLike | undefined

  /**
   * @param ctx - owning host context (fs/subprocess/sessions read optionally).
   */
  constructor(ctx: Context) {
    super(ctx, 'fileRefFinder')
    this.fs = ctx.get('fs') as FileSystemLike | undefined
    this.subprocess = ctx.get('subprocess') as SubprocessRuntimeLike | undefined
    this.sessions = ctx.get('sessions') as SessionStoreLike | undefined
  }

  /**
   * Find up to a bounded number of file candidates under the session's
   * workspace cwd matching the query. Prefers a fast ripgrep walk and falls
   * back to a constrained filesystem enumeration when rg is unreachable.
   * @Remote('find') — invoked by the host gateway in source mode.
   * @param sessionId - attached session whose header carries the workspace cwd.
   * @param query - the composer `@` query after the trigger token.
   * @returns candidates, bounded and ranked by basename/path scoring.
   */
  @Remote('find')
  async find(sessionId: string, query: string): Promise<readonly FileRefCandidate[]> {
    const session = this.sessions?.get(sessionId)
    const cwd = session?.header.cwd
    if (cwd === undefined) return []
    const signal = undefined
    if (aborted(signal)) return []
    let root: unknown
    let base = trimSlashes(cwd)
    if (this.fs !== undefined) {
      try {
        root = await this.fs.resolve('.', { cwd })
        base = trimSlashes(this.fs.processPath(root))
      } catch {
        root = undefined
        base = trimSlashes(cwd)
      }
    }

    let top: ScoreEntry[] | null = null
    if (root !== undefined && this.fs !== undefined) {
      top = await this.rgWalk(base, query, signal)
      if (top === null) {
        try {
          top = await this.fsWalk(root, query, signal)
        } catch {
          top = []
        }
      }
    }
    if (top === null) return []

    return top.map(entry => ({
      name: entry.name,
      relPath: entry.rel,
      path: `${base}/${entry.rel}`,
    }))
  }

  private async rgWalk(
    cwd: string,
    query: string,
    signal: AbortSignal | undefined,
  ): Promise<ScoreEntry[] | null> {
    if (this.subprocess === undefined || aborted(signal)) return null
    let bin: string
    try {
      bin = await this.subprocess.resolveExecutable('rg')
    } catch {
      return null
    }
    let handle
    try {
      handle = this.subprocess.spawn({
        argv: [bin, '--no-config', '--files', '--hidden', '--max-columns', '0', ...rgGlobArgs(), '.'],
        cwd,
        graceMs: RG_GRACE_MS,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: RG_STDOUT_MAX_BYTES },
          stderr: { maxBytes: RG_STDERR_MAX_BYTES },
        },
      })
    } catch {
      return null
    }
    try {
      await handle.done
    } catch {
      try {
        handle.terminate()
      } catch {
        // best-effort terminate on an already-failed spawn
      }
      return null
    }
    if (aborted(signal)) return null
    let text = ''
    try {
      const out = handle.collected.stdout?.readFrom(0)
      if (out !== undefined) text = out.text
    } catch {
      return null
    }
    const collected: ScoreEntry[] = []
    for (const raw of text.split('\n')) {
      // rg prints paths relative to cwd as `./foo`; normalize to a bare rel path.
      const rel = trimSlashes(raw.replace(/^\.\//, ''))
      if (rel === '') continue
      const slash = rel.lastIndexOf('/')
      const name = slash >= 0 ? rel.slice(slash + 1) : rel
      collected.push({ rel, name, score: -1 })
    }
    return rankFiles(collected, query, FILE_REF_LIMIT)
  }

  private async fsWalk(
    target: unknown,
    query: string,
    signal: AbortSignal | undefined,
  ): Promise<ScoreEntry[]> {
    const fs = this.fs
    if (fs === undefined) return []
    const collected: Array<{ rel: string; name: string }> = []
    let dirs = 0
    let files = 0
    const walk = async (dir: unknown, prefix: string): Promise<void> => {
      if (aborted(signal) || dirs >= FS_WALK_MAX_DIRS || files >= FS_WALK_MAX_FILES) return
      dirs += 1
      let entries
      try {
        entries = await fs.listDir(dir)
      } catch {
        return
      }
      for (const ent of entries) {
        if (aborted(signal) || files >= FS_WALK_MAX_FILES) return
        const rel = prefix === '' ? ent.name : `${prefix}/${ent.name}`
        if (ent.type === 'directory') {
          if (SKIPPED_DIRS.has(ent.name)) continue
          await walk(ent.target, rel)
        } else if (ent.type === 'file') {
          files += 1
          collected.push({ rel, name: ent.name })
        }
      }
    }
    try {
      await walk(target, '')
    } catch {
      // a mid-walk failure keeps whatever was collected
    }
    return rankFiles(collected, query, FILE_REF_LIMIT)
  }
}

/**
 * Plugin body: construct the `fileRefFinder` service (the Service base
 * constructor registers it under this fiber via `ctx.reflect.provide`).
 * @param ctx - host root context.
 */
export const inject = ['fs']

export function apply(ctx: Context): void {
  new FileRefFinderService(ctx)
}
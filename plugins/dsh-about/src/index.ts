/**
 * dsh-about — independent "About" settings section for DeepSeek Harness web GUI
 * (HOST half).
 *
 * Provides the `aboutInfo` Typert Remote service: the browser half's settings
 * "关于" page resolves the running version and build date through the runtime
 * `aboutInfo/get` endpoint. The host gateway (`dsh-api-gateway`) dispatches
 * `/api/aboutInfo/get` to this live service via source-mode discovery
 * (`typertRemote` binding + `Remote` markers), so NO compile-time generated
 * artifacts and NO main-repo changes are involved: the whole feature mounts as
 * an installable `@local` plugin.
 *
 * @module dsh-about
 */

import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'

/** Stable plugin row name (used by the cordis loader entry). */
export const name = 'dsh-about'

/** The about payload the settings page renders. */
export interface AboutInfo {
  /** Running version, read from apps/cli/package.json. */
  readonly version: string
  /** Build date, from the built CLI's mtime. */
  readonly buildDate: string
}

// ---- Minimal structural faces of the optional host services. Type-only:
// the plugin reads them with ctx.get() and never imports the packages. ----

/** The `ctx.fs` service surface this plugin uses (dsh-fs FileSystem). */
interface FileSystemLike {
  resolve(path: string, options?: { cwd?: string }): Promise<unknown>
  readText(target: unknown): Promise<string>
}

/** The `ctx.shell` service surface this plugin uses (dsh-shell ShellExecutor). */
interface ShellLike {
  resolve(request: { command: string; workdir?: string }): unknown
  run(spec: unknown): Promise<{ stdout: { text: string } }>
}

/** Absolute path of the harness source checkout this deployment runs from. */
const REPO = '/Users/lihu/git/deepseek-harness'

/**
 * About info remote service. Registered under `aboutInfo`; the `get` method is
 * the single `@Remote` endpoint the browser half calls through
 * `connection.rpc.call('/api', 'aboutInfo/get', { args })`.
 */
export class AboutInfoService extends TypertRemoteService {
  private readonly fs: FileSystemLike | undefined
  private readonly shell: ShellLike | undefined

  /**
   * @param ctx - owning host context (fs/shell read optionally).
   */
  constructor(ctx: Context) {
    super(ctx, 'aboutInfo')
    this.fs = ctx.get('fs') as FileSystemLike | undefined
    this.shell = ctx.get('shell') as ShellLike | undefined
  }

  /**
   * Read the running version and build date.
   * @Remote('get') — invoked by the host gateway in source mode.
   * @returns version + build date; unknown fields degrade to 'unknown'.
   */
  @Remote('get')
  async get(): Promise<AboutInfo> {
    let version = 'unknown'
    let buildDate = 'unknown'

    if (this.fs !== undefined) {
      try {
        const target = await this.fs.resolve(`${REPO}/apps/cli/package.json`)
        const text = await this.fs.readText(target)
        const m = text.match(/"version"\s*:\s*"([^"]+)"/)
        if (m !== null) version = m[1]
      } catch {
        // fs unavailable or read failed — keep 'unknown'
      }
    }

    if (this.shell !== undefined) {
      try {
        const spec = this.shell.resolve({
          command: `stat -f "%Sm" -t "%Y-%m-%d %H:%M" ${REPO}/apps/cli/lib/bin.js`,
        })
        const result = await this.shell.run(spec)
        const out = result.stdout.text.trim()
        if (out !== '') buildDate = out
      } catch {
        // shell unavailable or stat failed — keep 'unknown'
      }
    }

    return { version, buildDate }
  }
}

/**
 * Plugin body: construct the `aboutInfo` service (the Service base constructor
 * registers it under this fiber via `ctx.reflect.provide`).
 * @param ctx - host root context.
 */
export const inject = ['fs', 'shell']

export function apply(ctx: Context): void {
  new AboutInfoService(ctx)
}

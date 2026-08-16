/**
 * dsh-tavily-search — user-level `@local` plugin that registers a Tavily-backed
 * `WebSearchProvider` into `ctx.web`, so the standard `web_search` tool can use
 * Tavily. Zero main-repo changes: the whole feature ships as this installable
 * `@local` plugin.
 *
 * @module dsh-tavily-search
 */

import type { Context } from '@deepseek-ai/cordis'

/** Stable plugin row name (used by the cordis loader entry). */
export const name = 'dsh-tavily-search'

// ---- Minimal structural faces of the optional host services. Type-only:
// the plugin reads them with ctx.get() and never imports the packages. ----

/** The `ctx.web` service surface this plugin registers into (dsh-web WebRuntime). */
interface WebRuntimeLike {
  registerSearchProvider(provider: WebSearchProviderLike): () => void
}

/** One search-capable backend, as the web seam expects. */
interface WebSearchProviderLike {
  readonly id: string
  available(): boolean
  search(request: WebSearchRequestLike, signal?: AbortSignal): Promise<WebSearchResultLike>
}

/** The model-facing search request; `maxResults` is a bound the seam enforces. */
interface WebSearchRequestLike {
  readonly query: string
  readonly maxResults?: number
}

/** Normalized search outcome; `content` is optional provider-generated answer text. */
interface WebSearchResultLike {
  readonly content?: string
  readonly sources: readonly WebSearchSourceLike[]
  readonly truncated: boolean
}

/** One citeable source; only `url` is required. */
interface WebSearchSourceLike {
  readonly url: string
  readonly title?: string
  readonly snippet?: string
  readonly publishedAt?: string
}

/** Stable id this provider registers under. */
export const TAVILY_PROVIDER_ID = 'tavily'

/** Default Tavily search endpoint; `/search` is the operation. */
export const TAVILY_DEFAULT_BASE_URL = 'https://api.tavily.com'

/** Attribution header sent on every request. */
const USER_AGENT = 'deepseek-harness/0.0.1'

/** Resolved provider options (the plugin's `apply` supplies env-var and constant defaults). */
export interface TavilySearchProviderOptions {
  /** Tavily API key. Empty/absent makes the provider unavailable. */
  apiKey: string
  /** Endpoint base; `/search` is appended. */
  baseURL: string
  /** Default result count when a request carries no `maxResults`. */
  maxResults?: number
}

/**
 * Map one Tavily result to a normalized source, or `undefined` when it carries
 * no URL (a source without a URL is not citeable).
 */
export function mapTavilyResult(result: TavilyResult): WebSearchSourceLike | undefined {
  if (typeof result.url !== 'string' || result.url.length === 0) return undefined
  const snippet = typeof result.content === 'string' && result.content.trim().length > 0 ? result.content : undefined
  return {
    url: result.url,
    ...typeof result.title === 'string' && result.title.length > 0 ? { title: result.title } : {},
    ...snippet !== undefined ? { snippet } : {},
    ...typeof result.published_date === 'string' && result.published_date.length > 0 ? { publishedAt: result.published_date } : {},
  }
}

/**
 * Map a Tavily response envelope to a normalized search result. Tavily's
 * generated `answer` becomes `content`; the seam owns the final `maxResults`
 * truncation, so this provider reports `truncated: false`.
 */
export function mapTavilyResponse(payload: TavilySearchResponse): WebSearchResultLike {
  const sources = (payload.results ?? [])
    .map(mapTavilyResult)
    .filter((source): source is WebSearchSourceLike => source !== undefined)
  return {
    ...typeof payload.answer === 'string' && payload.answer.length > 0 ? { content: payload.answer } : {},
    sources,
    truncated: false,
  }
}

/** The Tavily-backed search provider; HTTP redirects fail as a provider error. */
export class TavilySearchProvider implements WebSearchProviderLike {
  readonly id = TAVILY_PROVIDER_ID

  constructor(private readonly options: TavilySearchProviderOptions) {}

  available(): boolean {
    return this.options.apiKey.length > 0
  }

  async search(request: WebSearchRequestLike, signal?: AbortSignal): Promise<WebSearchResultLike> {
    // A per-request bound wins over the configured default; either may be absent.
    const maxResults = request.maxResults ?? this.options.maxResults
    let response: Response
    try {
      response = await fetch(`${this.options.baseURL}/search`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'user-agent': USER_AGENT,
        },
        body: JSON.stringify({
          api_key: this.options.apiKey,
          query: request.query,
          ...maxResults !== undefined ? { max_results: maxResults } : {},
          include_answer: true,
        }),
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error: unknown) {
      if (isAbortError(error)) throw new Error('Tavily search aborted')
      throw new Error(`Tavily search request failed: ${String(error)}`)
    }

    if (!response.ok) {
      let message = `Tavily API error (HTTP ${response.status})`
      try {
        const parsed = await response.json() as TavilyError
        const detail = parsed.message
        if (typeof detail === 'string' && detail.length > 0) message = detail
      } catch {
        // The HTTP status is already captured in `message`; a malformed error
        // body can only cost a richer provider message, never the real error.
      }
      throw new Error(message)
    }

    try {
      const payload = await response.json() as TavilySearchResponse
      return mapTavilyResponse(payload)
    } catch (error: unknown) {
      if (isAbortError(error)) throw new Error('Tavily search aborted')
      throw new Error(`Tavily returned an unprocessable response body: ${String(error)}`)
    }
  }
}

/** True for a fetch/`AbortSignal` abort. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** One entry of Tavily's `results[]`. */
interface TavilyResult {
  readonly title?: string
  readonly url?: string
  readonly content?: string
  readonly published_date?: string
}

/** The parsed `POST /search` response body. */
interface TavilySearchResponse {
  readonly answer?: string
  readonly results?: readonly TavilyResult[]
}

/** A Tavily error body. */
interface TavilyError {
  readonly message?: string
}

/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
  /** Tavily API key. Falls back to `$TAVILY_API_KEY`. Empty → provider unavailable. */
  apiKey?: string
  /** Endpoint base; `/search` is appended. Defaults to the public API. */
  baseURL?: string
  /** Default result count when a request carries no `maxResults`. Omitted = none. */
  maxResults?: number
}

/** The web seam this provider registers into. */
export const inject = ['web']

/** Register the Tavily search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  const web = ctx.get('web') as WebRuntimeLike | undefined
  if (web === undefined) return
  web.registerSearchProvider(new TavilySearchProvider({
    apiKey: config.apiKey ?? process.env.TAVILY_API_KEY ?? '',
    baseURL: config.baseURL ?? TAVILY_DEFAULT_BASE_URL,
    ...config.maxResults !== undefined ? { maxResults: config.maxResults } : {},
  }))
}

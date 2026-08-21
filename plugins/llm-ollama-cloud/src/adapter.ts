/**
 * `OllamaAdapter`: fetch + SSE against an Ollama (OpenAI-compatible)
 * chat-completions endpoint, emitting harness StreamChunks. Transport-only:
 * connection facts arrive through a thunk resolved once per operation and the
 * bearer token through a per-request resolver.
 *
 * Model ids are normalized to Ollama's `:cloud` naming on every operation: a
 * request for `deepseek-v4-flash` is sent as `deepseek-v4-flash:cloud`, and an
 * already-suffixed id is forwarded unchanged.
 *
 * Dependencies are intentionally minimal: `@deepseek-ai/dsh-llm` (the harness
 * LLM seam contract), `@deepseek-ai/cordis` (plugin framework), and
 * `eventsource-parser` (SSE framing). Everything else is hand-rolled here.
 *
 * @module llm-ollama-cloud/adapter
 */

import {
  attributionHeaders,
  contentHasImage,
  CONTEXT_WINDOW_EXCEEDED_CODE,
  isContextWindowExceededError,
  isQuotaExceededError,
  LlmAdapter,
  LlmError,
  ProviderRequestId,
  QUOTA_EXCEEDED_CODE,
  ReasoningEffortId,
} from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  ModelModality,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { serializeRequest } from './serialize.ts'
import type { RequestDefaults } from './serialize.ts'
import { parseSse } from './sse.ts'
import { translate } from './translate.ts'
import type { WireError } from './types.ts'

/** One optional model entry advertised by the direct-fetch adapter. */
export interface OllamaCatalogModel {
  /** Wire model id accepted by the configured endpoint; a missing `:cloud` suffix is appended. */
  id: string
  /** Selector label; defaults to {@link id}. */
  name?: string
  /** Optional selector detail for deployments with similar model variants. */
  description?: string
  /** Known combined request/response context capacity; omitted when deployment metadata is unavailable. */
  contextWindow?: number
  /** Per-request output cap for this model; omission falls back to the profile's {@link OllamaConnectionOptions.maxTokens}. */
  maxTokens?: number
  /** Accepted request modalities; omission is text-only. */
  inputModalities?: ModelModality[]
}

/**
 * Validated connection facts for one operation. The plugin's
 * `resolveAdapterOptions` is the one explicit resolve step producing this
 * shape; the adapter trusts it and re-reads it per operation.
 */
export interface OllamaConnectionOptions {
  /** Endpoint base; `/chat/completions` is appended. */
  baseURL: string
  /** Environment-variable name holding the bearer token, resolved per request. */
  apiKeyEnv: string
  /** Request defaults applied to every call (thinking mode, effort). */
  defaults: RequestDefaults
  /** Default per-request output cap; explicit request values win. */
  maxTokens: number
  /** Positive context capacity used when the selected model has no exact value. */
  defaultContextWindow: number
  /** Advisory models exposed to discovery consumers; requests remain unrestricted. */
  models: readonly OllamaCatalogModel[]
  /** Maximum provider idle time while one stream read is outstanding. */
  streamIdleTimeoutMs: number
  /** Provider-owned model-request retry policy, already resolved. */
  retryPolicy: ResolvedRetryPolicy
}

/** Constructor options for {@link OllamaAdapter}: the operation-local resolution hooks the plugin owns. */
export interface OllamaAdapterOptions {
  /** Current validated connection facts; called once per operation. */
  options: () => OllamaConnectionOptions
  /**
   * Resolve the bearer token for the connection facts of one request. The
   * snapshot is passed in — never re-read — so the key can only ever come
   * from the same resolution as the endpoint it is sent to.
   */
  resolveApiKey: (connection: OllamaConnectionOptions) => Promise<string>
}

/** Default maximum idle interval while an adapter stream read is outstanding. */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
/** Default combined request/response context capacity. */
export const DEFAULT_CONTEXT_WINDOW = 1_000_000
/** Default per-request output-token cap. */
export const DEFAULT_MAX_TOKENS = 65_536
/** The Ollama cloud model-name suffix this adapter appends when missing. */
export const CLOUD_SUFFIX = ':cloud'
/** Largest value `setTimeout` accepts (2^31 - 1 ms). */
export const MAX_TIMER_DELAY_MS = 2_147_483_647
const STREAM_IDLE_TIMEOUT_CODE = 'LLM_STREAM_IDLE_TIMEOUT'
const OFF_REASONING_EFFORT = ReasoningEffortId('off')
const LOW_REASONING_EFFORT = ReasoningEffortId('low')
const HIGH_REASONING_EFFORT = ReasoningEffortId('high')
const MAX_REASONING_EFFORT = ReasoningEffortId('max')
const REASONING_EFFORTS = [
  { id: OFF_REASONING_EFFORT, name: 'Off' },
  { id: LOW_REASONING_EFFORT, name: 'Low' },
  { id: HIGH_REASONING_EFFORT, name: 'High' },
  { id: MAX_REASONING_EFFORT, name: 'Max' },
] as const
const OFF_ONLY_REASONING_EFFORTS = [
  { id: OFF_REASONING_EFFORT, name: 'Off' },
] as const

/**
 * Normalize a model id to Ollama's cloud naming. An id already carrying the
 * `:cloud` suffix is returned unchanged; any other id gets it appended. This
 * is the one place a bare harness model name becomes a wire model name.
 * @param model - the requested model id.
 * @returns the id with a `:cloud` suffix.
 */
export function normalizeCloud(model: string): string {
  return model.endsWith(CLOUD_SUFFIX) ? model : `${model}${CLOUD_SUFFIX}`
}

/**
 * Minimal idle watchdog: arms a timer on construction and after every read,
 * and aborts its signal when the idle budget elapses without a pulse. The
 * {@link OllamaAdapter} maps the expired flag to `TIMEOUT` and the caller's
 * own abort to `ABORTED`.
 */
class IdleWatchdog {
  private readonly controller = new AbortController()
  private timer: ReturnType<typeof setTimeout> | undefined
  private expired = false
  /** Combined caller + watchdog signal; aborts when either fires. */
  readonly signal: AbortSignal

  constructor(upstream: AbortSignal, private readonly timeoutMs: number) {
    this.signal = upstream.aborted
      ? upstream
      : AbortSignal.any([upstream, this.controller.signal])
    if (!upstream.aborted) {
      upstream.addEventListener('abort', () => this.stop(), { once: true })
    }
  }

  get didExpire(): boolean {
    return this.expired
  }

  private arm(): void {
    this.stop()
    this.timer = setTimeout(() => {
      this.expired = true
      this.controller.abort(new Error(STREAM_IDLE_TIMEOUT_CODE))
    }, this.timeoutMs)
  }

  /** Rearm the idle window; called after each provider read. */
  pulse(): void {
    this.arm()
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
  }
}

function modelInfo(provider: string, model: OllamaCatalogModel): LlmModelInfo {
  return {
    provider,
    id: model.id,
    name: model.name ?? model.id,
    ...model.description === undefined ? {} : { description: model.description },
    inputModalities: model.inputModalities ?? ['text'],
  }
}

function providerRetryAfterMs(value: string | null): number | undefined {
  if (value === null) return undefined
  if (/^\d+$/.test(value)) {
    const delay = Number(value) * 1_000
    return Number.isFinite(delay) && delay > 0 ? delay : undefined
  }
  const delay = Date.parse(value) - Date.now()
  return Number.isFinite(delay) && delay > 0 ? delay : undefined
}

function requestId(headers: Headers): ReturnType<typeof ProviderRequestId> | undefined {
  const value = headers.get('x-request-id') ?? headers.get('x-ollama-request-id')
  return value === null || value.length === 0 ? undefined : ProviderRequestId(value)
}

/**
 * Map an HTTP status to a stable LlmError code.
 * @param status - status of a non-2xx provider response.
 * @param error - parsed provider error body, when available.
 * @returns the normalized harness error code.
 */
export function httpErrorCode(status: number, error?: WireError['error']): string {
  if (status === 401 || status === 403) return 'AUTH'
  if (status === 413) return 'INVALID_REQUEST'
  const detail = [error?.code, error?.type, error?.message].filter(Boolean).join(' ')
  if (isQuotaExceededError(detail)) return QUOTA_EXCEEDED_CODE
  if (status === 429) return 'RATE_LIMIT'
  if (status === 400) {
    if (isContextWindowExceededError(detail)) return CONTEXT_WINDOW_EXCEEDED_CODE
    return 'INVALID_REQUEST'
  }
  if (status >= 500) return 'SERVER'
  return `HTTP_${status}`
}

/**
 * One instance serves every model name it was registered under. The harness
 * model name is normalized to its cloud form and IS the wire model name.
 *
 * One stable signal reaches both initial fetch and body reads. Caller aborts
 * map to `ABORTED`; the configured per-read idle watchdog maps to `TIMEOUT`.
 */
export class OllamaAdapter extends LlmAdapter {
  constructor(private readonly config: OllamaAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Ollama' }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    return this.config.options().retryPolicy
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(this.config.options().models.map(model => modelInfo(provider, model)))
  }

  override resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    const connection = this.config.options()
    // Resolve against the wire (cloud-suffixed) id so an unsuffixed request
    // still matches its catalog entry and reports the cloud id onward.
    const wireModel = normalizeCloud(model)
    const configured = connection.models.find(entry => entry.id === wireModel)
    const contextWindow = configured?.contextWindow
      ?? connection.defaultContextWindow
    return Promise.resolve({
      // An uncatalogued endpoint is safely treated as text-only.
      ...configured === undefined
        ? { provider, id: wireModel, name: wireModel, inputModalities: ['text' as const] }
        : modelInfo(provider, configured),
      context: { contextWindow },
      defaultMaxTokens: configured?.maxTokens ?? connection.maxTokens,
      ...connection.defaults.thinking === 'disabled'
        ? {
          reasoning: {
            efforts: OFF_ONLY_REASONING_EFFORTS,
            defaultEffort: OFF_REASONING_EFFORT,
          },
        }
        : {
          reasoning: {
            efforts: REASONING_EFFORTS,
            defaultEffort: connection.defaults.reasoningEffort === 'off'
              ? OFF_REASONING_EFFORT
              : connection.defaults.reasoningEffort === 'low'
                ? LOW_REASONING_EFFORT
                : connection.defaults.reasoningEffort === 'max'
                  ? MAX_REASONING_EFFORT
                  : HIGH_REASONING_EFFORT,
          },
        },
    })
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // One resolution per stream call: connection facts and the credential
    // freeze here and hold for this whole request.
    const connection = this.config.options()
    if (options.messages.some(message => contentHasImage(message.content))) {
      throw new LlmError(
        'Ollama image input is not supported yet.',
        'UNSUPPORTED_CONTENT',
      )
    }
    const apiKey = await this.config.resolveApiKey(connection)
    const consumer = new AbortController()
    const upstream = options.signal === undefined
      ? consumer.signal
      : AbortSignal.any([options.signal, consumer.signal])
    const watchdog = new IdleWatchdog(upstream, connection.streamIdleTimeoutMs)
    const iterator = this.request(
      options,
      watchdog.signal,
      connection,
      apiKey,
      () => watchdog.pulse(),
    )[Symbol.asyncIterator]()
    let exhausted = false
    try {
      while (true) {
        watchdog.pulse()
        const result = await iterator.next()
        if (result.done) {
          exhausted = true
          return
        }
        yield result.value
      }
    } catch (error: unknown) {
      if (watchdog.didExpire) {
        throw new LlmError(
          `Ollama stream idle timeout after ${connection.streamIdleTimeoutMs}ms`,
          'TIMEOUT',
          { cause: error },
        )
      }
      if (options.signal?.aborted) {
        throw new LlmError('Ollama request aborted by caller', 'ABORTED', { cause: error })
      }
      if (error instanceof LlmError) throw error
      throw new LlmError(`Ollama API stream from ${connection.baseURL} failed`, 'TRANSPORT', { cause: error })
    } finally {
      watchdog.stop()
      consumer.abort('Ollama stream consumer stopped')
      if (!exhausted && iterator.return !== undefined) {
        try {
          await iterator.return()
        } catch (_abortedTransportTeardown) {
          // The consumer controller already owns termination; a return-time abort cannot add a second outcome.
        }
      }
    }
  }

  private async * request(
    options: GenerateOptions,
    signal: AbortSignal,
    connection: OllamaConnectionOptions,
    apiKey: string,
    onComment: () => void,
  ): AsyncIterable<StreamChunk> {
    const body = serializeRequest(
      { ...options, model: normalizeCloud(options.model) },
      connection.defaults,
    )
    // Prepared outside the try so the TRANSPORT label below covers exactly the
    // transport boundary, never a serialization failure.
    const payload = JSON.stringify(body)
    const headers = {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'accept': 'text/event-stream',
      ...attributionHeaders(),
      ...options.sessionId !== undefined
        ? { 'x-deepseek-harness-session-id': String(options.sessionId) }
        : {},
      ...options.purpose === 'compaction'
        ? { 'x-deepseek-harness-compact': '1' }
        : {},
    }

    let response: Response
    try {
      response = await fetch(`${connection.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: payload,
        signal,
      })
    } catch (error: unknown) {
      // The outer stream distinguishes caller cancellation and watchdog expiry.
      if (signal.aborted) throw error
      // fetch wraps every transport failure (DNS, refused connection, TLS,
      // proxy) in a bare `TypeError: fetch failed` whose actionable detail
      // lives on `cause`.
      throw new LlmError(
        `Ollama API request to ${connection.baseURL} failed`,
        'TRANSPORT',
        { cause: error },
      )
    }

    if (!response.ok) {
      let message = `Ollama API error (HTTP ${response.status})`
      let providerError: WireError['error']
      try {
        const parsed = await response.json() as WireError
        providerError = parsed.error
        if (providerError?.message) message = providerError.message
      } catch {
        // Only swallow error-body parsing: the HTTP status still identifies the
        // failure, so malformed gateway JSON must not mask it.
      }
      const delay = providerRetryAfterMs(response.headers.get('retry-after'))
      const id = requestId(response.headers)
      throw new LlmError(message, httpErrorCode(response.status, providerError), {
        status: response.status,
        ...delay === undefined ? {} : { providerRetryAfterMs: delay },
        ...id === undefined ? {} : { requestId: id },
      })
    }
    if (!response.body) {
      throw new LlmError('Ollama API returned no response body', 'EMPTY_RESPONSE')
    }

    yield* translate(parseSse(response.body, onComment))
  }
}

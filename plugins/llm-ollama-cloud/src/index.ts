/**
 * Register an {@link OllamaAdapter} for the `ollama-cloud-direct` provider route
 * on `ctx.llm`, with connection facts resolved once per operation from the
 * plugin's `cordis.yml` mount config and the bearer token read from the
 * environment at each request.
 *
 * Dependencies are intentionally minimal — `@deepseek-ai/dsh-llm` (the harness
 * LLM seam contract), `@deepseek-ai/cordis` (plugin framework), and
 * `eventsource-parser` (SSE framing). There is no settings-section wiring, no
 * credential seam, no telemetry id, and no schema library: configuration is
 * static from the mount, the key comes from `process.env`, and validation is
 * hand-rolled. The route is `ollama-cloud-direct` (not `ollama-cloud`) so it
 * can coexist with a pi-ai-configured `ollama-cloud` route.
 *
 * @module llm-ollama-cloud
 */

import type { Context } from '@deepseek-ai/cordis'
import { assertUsableApiKey, LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { ModelModality, RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  MAX_TIMER_DELAY_MS,
  normalizeCloud,
  OllamaAdapter,
} from './adapter.ts'
import type { OllamaCatalogModel, OllamaConnectionOptions } from './adapter.ts'

export {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  MAX_TIMER_DELAY_MS,
  normalizeCloud,
  OllamaAdapter,
} from './adapter.ts'
export type { OllamaAdapterOptions, OllamaCatalogModel, OllamaConnectionOptions } from './adapter.ts'
export type { RequestDefaults } from './serialize.ts'
export type * from './types.ts'

export const name = 'llm-ollama-cloud'
export const inject = ['llm']

const DEFAULT_API_KEY_ENV = 'OLLAMA_CLOUD_API_KEY'
/** The single provider route this plugin owns. */
const PROVIDER = 'ollama-cloud-direct'

const DEFAULT_MODELS: OllamaCatalogModel[] = [
  { id: 'deepseek-v4-flash:cloud', name: 'DeepSeek-V4-Flash (cloud)', contextWindow: DEFAULT_CONTEXT_WINDOW },
  { id: 'deepseek-v4-pro:cloud', name: 'DeepSeek-V4-Pro (cloud)', contextWindow: DEFAULT_CONTEXT_WINDOW },
  { id: 'glm-5.2:cloud', name: 'GLM-5.2 (cloud)', contextWindow: DEFAULT_CONTEXT_WINDOW },
]

const MODEL_MODALITIES = ['text', 'image'] as const satisfies readonly ModelModality[]

/**
 * Plugin config from the `cordis.yml` mount entry. Every field is optional: a
 * missing API key fails per request with `MISSING_CREDENTIAL`, omitted
 * thinking mode uses the provider default, and omitted reasoning effort lets
 * the server auto-enable thinking at its default.
 */
export interface Config {
  /** Environment-variable name resolved per request; defaults to `OLLAMA_CLOUD_API_KEY`. */
  apiKeyEnv?: string
  /** Endpoint base; defaults to the Ollama cloud API. */
  baseURL?: string
  /** Deployment thinking policy; `disabled` limits every conversation request to `none` effort. */
  thinking?: 'enabled' | 'disabled'
  /** Default thinking effort (default unset, so the server picks); `off` maps to wire `none`. */
  reasoningEffort?: 'off' | 'low' | 'high' | 'max'
  /** Default per-request output cap (default 65,536); a model's own cap and explicit request values win. */
  maxTokens?: number
  /** Positive context capacity used when the selected model has no exact value (default 1,000,000). */
  defaultContextWindow?: number
  /** Advisory models shown by discovery consumers; a missing `:cloud` suffix is appended. */
  models?: OllamaCatalogModel[]
  /** Maximum provider idle time while one stream read is outstanding (default five minutes). */
  streamIdleTimeoutMs?: number
  /** Provider-owned model-request retry policy; omission uses normal mode with five retries. */
  retryPolicy?: RetryPolicyConfig
}

/** The public Ollama cloud API base. */
export const PUBLIC_BASE_URL = 'https://ollama.com/v1'

/** Resolve, validate, and detach the advisory model catalog, normalizing every id to cloud naming. */
function resolveModels(models: readonly OllamaCatalogModel[] | undefined): OllamaCatalogModel[] {
  const seen = new Set<string>()
  return (models ?? DEFAULT_MODELS).map((model) => {
    if (model.id.length === 0) throw new Error('llm-ollama-cloud: catalog model ids must be non-empty')
    const id = normalizeCloud(model.id)
    if (model.name !== undefined && model.name.length === 0) {
      throw new Error(`llm-ollama-cloud: catalog model "${id}" has an empty name`)
    }
    if (model.contextWindow !== undefined
      && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) {
      throw new Error(
        `llm-ollama-cloud: catalog model "${id}" contextWindow must be a positive integer`,
      )
    }
    if (model.maxTokens !== undefined
      && (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)) {
      throw new Error(
        `llm-ollama-cloud: catalog model "${id}" maxTokens must be a positive integer`,
      )
    }
    const inputModalities = model.inputModalities ?? ['text']
    if (inputModalities.length === 0) {
      throw new Error(`llm-ollama-cloud: catalog model "${id}" inputModalities must not be empty`)
    }
    if (inputModalities.some(modality => !MODEL_MODALITIES.includes(modality))) {
      throw new Error(
        `llm-ollama-cloud: catalog model "${id}" inputModalities must contain only "text" and "image"`,
      )
    }
    if (new Set(inputModalities).size !== inputModalities.length) {
      throw new Error(`llm-ollama-cloud: catalog model "${id}" inputModalities must not contain duplicates`)
    }
    if (seen.has(id)) throw new Error(`llm-ollama-cloud: duplicate catalog model "${id}"`)
    seen.add(id)
    return {
      id,
      ...model.name === undefined ? {} : { name: model.name },
      ...model.description === undefined ? {} : { description: model.description },
      ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
      ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
      inputModalities: [...inputModalities],
    }
  })
}

/**
 * The one explicit resolve step from raw mount config to validated connection
 * facts, with every default and bound re-judged here (fail loud at load).
 * @param config - raw plugin config.
 * @returns validated connection facts plus the credential reference.
 */
export function resolveAdapterOptions(config: Config): OllamaConnectionOptions {
  if (config.thinking === 'disabled'
    && config.reasoningEffort !== undefined
    && config.reasoningEffort !== 'off') {
    throw new Error('llm-ollama-cloud: only reasoningEffort "off" can be configured when thinking is disabled')
  }
  if (config.defaultContextWindow !== undefined
    && (!Number.isInteger(config.defaultContextWindow) || config.defaultContextWindow <= 0)) {
    throw new Error('llm-ollama-cloud: defaultContextWindow must be a positive integer')
  }
  if (config.maxTokens !== undefined
    && (!Number.isSafeInteger(config.maxTokens) || config.maxTokens <= 0)) {
    throw new Error('llm-ollama-cloud: maxTokens must be a positive safe integer')
  }
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(streamIdleTimeoutMs)
    || streamIdleTimeoutMs <= 0
    || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `llm-ollama-cloud: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  return {
    apiKeyEnv: config.apiKeyEnv ?? DEFAULT_API_KEY_ENV,
    baseURL: config.baseURL ?? PUBLIC_BASE_URL,
    defaults: {
      thinking: config.thinking,
      reasoningEffort: config.reasoningEffort,
    },
    maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    defaultContextWindow: config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
    models: resolveModels(config.models),
    streamIdleTimeoutMs,
    retryPolicy: resolveRetryPolicy(config.retryPolicy, 'llm-ollama-cloud: retryPolicy'),
  }
}

export function apply(ctx: Context, config: Config): void {
  // Static composition: connection facts resolve once at load. A config
  // change in the mount requires a restart — there is no settings section.
  const options = (): OllamaConnectionOptions => resolveAdapterOptions(config)
  options()

  const adapter = new OllamaAdapter({
    options,
    resolveApiKey: async (connection) => {
      const ref = connection.apiKeyEnv
      const value = process.env[ref]
      if (value !== undefined && value.length > 0) {
        return assertUsableApiKey(value, 'llm-ollama-cloud', ref)
      }
      throw new LlmError(
        `llm-ollama-cloud: no API key for provider route "${PROVIDER}"; export ${ref} in the launching environment`,
        'MISSING_CREDENTIAL',
      )
    },
  })
  ctx.llm.registerAdapter([PROVIDER], adapter)
}

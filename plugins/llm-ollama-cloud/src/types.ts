/**
 * Ollama chat-completions wire format (OpenAI-compatible). Types only.
 *
 * Source of truth: Ollama's OpenAI-compatible `/v1/chat/completions` endpoint
 * (https://ollama.com) plus the empirical behaviour of local Ollama serving
 * `deepseek-v4-flash:cloud` (2026-08). Reasoning reaches the model in the
 * `reasoning` delta field (not `reasoning_content`), and reasoning effort is a
 * single `reasoning_effort` value (`none`/`low`/`medium`/`high`/`max`) rather
 * than a separate `thinking` toggle: omitting the field auto-enables thinking
 * at the server default, while `none` disables it.
 *
 * @module dsh-llm-ollama-cloud/types
 */

/** Request body for `POST {baseURL}/chat/completions`. */
export interface WireRequest {
  model: string
  messages: WireMessage[]
  stream: true
  stream_options: { include_usage: true }
  /** Thinking effort; `none` disables reasoning and an omission uses the provider default. */
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high' | 'max'
  tools?: WireTool[]
  temperature?: number
  max_tokens?: number
  /** Stop sequences (OpenAI `stop`); generation halts as soon as the model produces one. */
  stop?: string[]
}

/** System-role message: a single string of instructions. */
export interface WireSystemMessage {
  role: 'system'
  content: string
}

/** User-role message; Ollama accepts a plain string for text-only input. */
export interface WireUserMessage {
  role: 'user'
  content: string
}

/** Tool-role message: the result of one tool call, keyed by its call id. */
export interface WireToolMessage {
  role: 'tool'
  tool_call_id: string
  content: string
}

/** One entry of the request `messages` array, discriminated on `role`. */
export type WireMessage =
  | WireSystemMessage
  | WireUserMessage
  | WireAssistantMessage
  | WireToolMessage

/**
 * Assistant-role history message. The harness replays `content: ""` (never
 * null) on tool-call-only turns — some gateways reject null — and sends null
 * only when the turn carried neither text nor tool calls.
 */
export interface WireAssistantMessage {
  role: 'assistant'
  content: string | null
  /**
   * CoT passback, present only on a turn whose assistant content carried
   * reasoning AND whose model is reasoning-capable (a wire id containing
   * `deepseek`). Ollama accepts the `reasoning` field on assistant history
   * messages; a non-reasoning model simply ignores it, so it is only written
   * for reasoning-capable models to keep non-reasoning traces clean.
   */
  reasoning?: string
  tool_calls?: WireToolCall[]
}

/** A completed tool call replayed on an assistant history message; `arguments` is the raw JSON string. */
export interface WireToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** One entry of the request `tools` array; `parameters` is a JSON Schema object. */
export interface WireTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** One parsed SSE `data:` payload (a chat.completion.chunk). */
export interface WireChunk {
  choices?: WireChoice[]
  /** Arrives attached to the finish chunk and/or as a trailing usage-only chunk. */
  usage?: WireUsage | null
}

/** One streamed choice (requests always ask for a single one); `finish_reason` is non-null only on its terminal chunk. */
export interface WireChoice {
  delta?: WireDelta
  finish_reason?: string | null
}

/** The incremental content of one streamed choice; any subset of fields may be present per chunk. */
export interface WireDelta {
  role?: string
  /** Visible text. Null/empty on reasoning/tool-call chunks. */
  content?: string | null
  /**
   * Thinking-mode CoT. The FIRST chunk carries an empty string (must not open
   * a reasoning block); absent entirely in non-thinking mode.
   */
  reasoning?: string | null
  tool_calls?: WireToolCallDelta[]
}

/** A streamed fragment of one tool call; fragments sharing an `index` concatenate into one call. */
export interface WireToolCallDelta {
  /** Disambiguates parallel tool calls; stable across a call's deltas. */
  index: number
  /** Present on the first delta of each call only. */
  id?: string
  type?: 'function'
  function?: {
    /** Present on the first delta of each call only. */
    name?: string
    /** Argument JSON fragment (concatenate across deltas). */
    arguments?: string
  }
}

/**
 * Wire token accounting. Ollama's OpenAI-compatible endpoint reports standard
 * `prompt_tokens`/`completion_tokens`; the cache and reasoning details follow
 * the OpenAI-compat spelling when the backend supplies them.
 */
export interface WireUsage {
  prompt_tokens: number
  completion_tokens: number
  prompt_tokens_details?: { cached_tokens?: number }
  completion_tokens_details?: { reasoning_tokens?: number }
}

/** Non-2xx error body. */
export interface WireError {
  error?: { message?: string; type?: string; code?: string }
}

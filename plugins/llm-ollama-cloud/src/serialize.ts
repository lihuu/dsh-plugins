/**
 * Serialize harness messages into an Ollama chat completions request.
 * Text-only (the OpenAI-compatible endpoint's image path is deferred); tool
 * results become standalone `role: 'tool'` messages. Reasoning is replayed as
 * the `reasoning` assistant field only for reasoning-capable models (a wire id
 * containing `deepseek`), so non-reasoning models keep clean traces.
 * @module dsh-llm-ollama-cloud/serialize
 */

import { contentHasImage, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type {
  WireMessage,
  WireRequest,
  WireTool,
} from './types.ts'

/** Adapter-level request defaults (from plugin config). */
export interface RequestDefaults {
  thinking?: 'enabled' | 'disabled' | undefined
  reasoningEffort?: 'off' | 'low' | 'high' | 'max' | undefined
}

/** The Ollama reasoning-effort values this adapter emits on the wire. */
export type WireReasoningEffort = 'none' | 'low' | 'high' | 'max'

interface ResolvedThinking {
  reasoningEffort?: WireReasoningEffort
}

/**
 * Whether a model's reasoning should be passed back on assistant history.
 * Only reasoning-capable models accept the `reasoning` field; a non-reasoning
 * model ignores it, so it is written only for wire ids containing `deepseek`.
 * @param model - the wire model id.
 * @returns true when the model is treated as reasoning-capable.
 */
export function passReasoning(model: string): boolean {
  return model.includes('deepseek')
}

/** Validate the adapter-owned effort before resolving its Ollama wire value. */
function reasoningEffort(effort: NonNullable<GenerateOptions['reasoningEffort']>): 'off' | 'low' | 'high' | 'max' {
  if (effort === 'off' || effort === 'low' || effort === 'high' || effort === 'max') {
    return effort as 'off' | 'low' | 'high' | 'max'
  }
  throw new LlmError(
    `Ollama does not support reasoning effort "${effort}"`,
    'UNSUPPORTED_REASONING_EFFORT',
  )
}

/**
 * Resolve one legal thinking/effort pair into an Ollama wire effort. An `off`
 * (or a `disabled` deployment default) maps to `none`; an explicit effort maps
 * to its Ollama spelling; an omitted effort with thinking enabled sends
 * nothing so the server auto-enables thinking at its default.
 * @param options - the harness request.
 * @param defaults - adapter-level thinking defaults.
 * @returns the wire `reasoning_effort`, or nothing when the server default should apply.
 */
function resolveThinking(options: GenerateOptions, defaults: RequestDefaults): ResolvedThinking {
  if (options.purpose === 'session-title') return { reasoningEffort: 'none' }
  const effort = options.reasoningEffort === undefined
    ? defaults.reasoningEffort
    : reasoningEffort(options.reasoningEffort)
  if (defaults.thinking === 'disabled' && effort !== undefined && effort !== 'off') {
    throw new LlmError(
      `Ollama deployment does not support reasoning effort "${effort}"`,
      'UNSUPPORTED_REASONING_EFFORT',
    )
  }
  if (effort === 'off') return { reasoningEffort: 'none' }
  if (effort === 'low' || effort === 'high' || effort === 'max') {
    return { reasoningEffort: effort }
  }
  // effort undefined: disabled defaults suppress reasoning, enabled or unset
  // ones send nothing and let the server pick its default.
  return defaults.thinking === 'disabled' ? { reasoningEffort: 'none' } : {}
}

/** Join the text blocks of a message (used for user/tool-result content). */
function flattenText(blocks: ContentBlock[]): string {
  return blocks
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/** Reject core image content before any text-flattening path can silently erase it. */
function assertTextOnly(blocks: readonly ContentBlock[]): void {
  if (contentHasImage(blocks)) {
    throw new LlmError('The Ollama chat-completions adapter does not support image content yet.', 'UNSUPPORTED_CONTENT')
  }
}

/** Serialize one assistant message (text + optional reasoning + tool calls). */
function serializeAssistant(message: Message, model: string): WireMessage {
  const text = flattenText(message.content)
  const reasoning = message.content
    .filter(block => block.type === 'reasoning')
    .map(block => block.text)
    .join('')
  const toolCalls = message.content
    .filter(block => block.type === 'tool-call')
    .map(block => ({
      id: block.id,
      type: 'function' as const,
      function: { name: block.name, arguments: block.arguments },
    }))

  return {
    role: 'assistant',
    // Text-less turns send "" — NEVER null. Reasoning-only turns (the model
    // can answer entirely in the reasoning channel) risk a gateway 400, and
    // since the message sits durably in the session log, a null here bricks
    // every later turn of that session.
    content: text,
    // CoT passback only for reasoning-capable models, via the `reasoning`
    // field Ollama accepts on assistant history.
    ...passReasoning(model) && reasoning.length > 0 ? { reasoning } : {},
    ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {},
  }
}

/**
 * Serialize the conversation. `tool-result` blocks become standalone
 * `{role: 'tool'}` messages; the harness puts each tool result in its own
 * user-role message, so a mixed user message contributes its text first and
 * its tool results as separate wire messages after.
 * @param model - the wire model id, used to decide reasoning passback.
 * @param messages - the harness conversation, in order.
 * @returns the wire messages; order preserved, each tool result expanded into its own entry.
 */
export function serializeMessages(model: string, messages: Message[]): WireMessage[] {
  const wire: WireMessage[] = []
  for (const message of messages) {
    assertTextOnly(message.content)
    if (message.role === 'system') {
      wire.push({ role: 'system', content: flattenText(message.content) })
      continue
    }
    if (message.role === 'assistant') {
      wire.push(serializeAssistant(message, model))
      continue
    }
    // user role: tool results ride in user messages in the harness
    // vocabulary, but Ollama wants them as role:'tool' messages.
    const toolResults = message.content.filter(block => block.type === 'tool-result')
    const text = flattenText(message.content)
    if (text.length > 0 || toolResults.length === 0) {
      wire.push({ role: 'user', content: text })
    }
    for (const result of toolResults) {
      wire.push({
        role: 'tool',
        tool_call_id: result.toolCallId,
        // Empty tool output still needs SOME content on the wire.
        content: flattenText(result.content) || '(no output)',
      })
    }
  }
  return wire
}

/** Assemble request fields shared by every conversion. */
function requestWithMessages(
  options: GenerateOptions,
  messages: WireMessage[],
  defaults: RequestDefaults,
): WireRequest {
  const tools: WireTool[] | undefined = options.tools?.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
  const resolvedThinking = resolveThinking(options, defaults)
  return {
    model: options.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...resolvedThinking.reasoningEffort !== undefined
      ? { reasoning_effort: resolvedThinking.reasoningEffort }
      : {},
    ...tools !== undefined && tools.length > 0 ? { tools } : {},
    ...options.temperature !== undefined ? { temperature: options.temperature } : {},
    ...options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens },
    ...options.stop !== undefined ? { stop: options.stop } : {},
  }
}

/**
 * Build the full wire request. Always streaming (`stream: true`, usage
 * reporting on); optional fields are omitted rather than sent as null, so
 * provider defaults apply.
 * @param options - the harness request (model, history, system, tools, sampling).
 * @param defaults - adapter-level thinking defaults; undefined fields put nothing on the wire.
 * @returns the chat-completions request body.
 */
export function serializeRequest(
  options: GenerateOptions,
  defaults: RequestDefaults = {},
): WireRequest {
  const messages: WireMessage[] = []
  if (options.system !== undefined) {
    messages.push({ role: 'system', content: options.system })
  }
  messages.push(...serializeMessages(options.model, options.messages))

  return requestWithMessages(options, messages, defaults)
}

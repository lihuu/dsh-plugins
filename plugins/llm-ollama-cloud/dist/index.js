// src/index.ts
import { assertUsableApiKey, LlmError as LlmError5, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";

// src/adapter.ts
import {
  attributionHeaders,
  contentHasImage as contentHasImage2,
  CONTEXT_WINDOW_EXCEEDED_CODE,
  isContextWindowExceededError,
  isQuotaExceededError,
  LlmAdapter,
  LlmError as LlmError4,
  ProviderRequestId,
  QUOTA_EXCEEDED_CODE,
  ReasoningEffortId
} from "@deepseek-ai/dsh-llm";

// src/serialize.ts
import { contentHasImage, LlmError } from "@deepseek-ai/dsh-llm";
function passReasoning(model) {
  return model.includes("deepseek");
}
function reasoningEffort(effort) {
  if (effort === "off" || effort === "low" || effort === "high" || effort === "max") {
    return effort;
  }
  throw new LlmError(
    `Ollama does not support reasoning effort "${effort}"`,
    "UNSUPPORTED_REASONING_EFFORT"
  );
}
function resolveThinking(options, defaults) {
  if (options.purpose === "session-title") return { reasoningEffort: "none" };
  const effort = options.reasoningEffort === void 0 ? defaults.reasoningEffort : reasoningEffort(options.reasoningEffort);
  if (defaults.thinking === "disabled" && effort !== void 0 && effort !== "off") {
    throw new LlmError(
      `Ollama deployment does not support reasoning effort "${effort}"`,
      "UNSUPPORTED_REASONING_EFFORT"
    );
  }
  if (effort === "off") return { reasoningEffort: "none" };
  if (effort === "low" || effort === "high" || effort === "max") {
    return { reasoningEffort: effort };
  }
  return defaults.thinking === "disabled" ? { reasoningEffort: "none" } : {};
}
function flattenText(blocks) {
  return blocks.filter((block) => block.type === "text").map((block) => block.text).join("");
}
function assertTextOnly(blocks) {
  if (contentHasImage(blocks)) {
    throw new LlmError("The Ollama chat-completions adapter does not support image content yet.", "UNSUPPORTED_CONTENT");
  }
}
function serializeAssistant(message, model) {
  const text = flattenText(message.content);
  const reasoning = message.content.filter((block) => block.type === "reasoning").map((block) => block.text).join("");
  const toolCalls = message.content.filter((block) => block.type === "tool-call").map((block) => ({
    id: block.id,
    type: "function",
    function: { name: block.name, arguments: block.arguments }
  }));
  return {
    role: "assistant",
    // Text-less turns send "" — NEVER null. Reasoning-only turns (the model
    // can answer entirely in the reasoning channel) risk a gateway 400, and
    // since the message sits durably in the session log, a null here bricks
    // every later turn of that session.
    content: text,
    // CoT passback only for reasoning-capable models, via the `reasoning`
    // field Ollama accepts on assistant history.
    ...passReasoning(model) && reasoning.length > 0 ? { reasoning } : {},
    ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {}
  };
}
function serializeMessages(model, messages) {
  const wire = [];
  for (const message of messages) {
    assertTextOnly(message.content);
    if (message.role === "system") {
      wire.push({ role: "system", content: flattenText(message.content) });
      continue;
    }
    if (message.role === "assistant") {
      wire.push(serializeAssistant(message, model));
      continue;
    }
    const toolResults = message.content.filter((block) => block.type === "tool-result");
    const text = flattenText(message.content);
    if (text.length > 0 || toolResults.length === 0) {
      wire.push({ role: "user", content: text });
    }
    for (const result of toolResults) {
      wire.push({
        role: "tool",
        tool_call_id: result.toolCallId,
        // Empty tool output still needs SOME content on the wire.
        content: flattenText(result.content) || "(no output)"
      });
    }
  }
  return wire;
}
function requestWithMessages(options, messages, defaults) {
  const tools = options.tools?.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
  const resolvedThinking = resolveThinking(options, defaults);
  return {
    model: options.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...resolvedThinking.reasoningEffort !== void 0 ? { reasoning_effort: resolvedThinking.reasoningEffort } : {},
    ...tools !== void 0 && tools.length > 0 ? { tools } : {},
    ...options.temperature !== void 0 ? { temperature: options.temperature } : {},
    ...options.maxTokens === void 0 ? {} : { max_tokens: options.maxTokens },
    ...options.stop !== void 0 ? { stop: options.stop } : {}
  };
}
function serializeRequest(options, defaults = {}) {
  const messages = [];
  if (options.system !== void 0) {
    messages.push({ role: "system", content: options.system });
  }
  messages.push(...serializeMessages(options.model, options.messages));
  return requestWithMessages(options, messages, defaults);
}

// ../../../git/deepseek-harness/node_modules/.pnpm/eventsource-parser@3.1.0/node_modules/eventsource-parser/dist/index.js
var ParseError = class extends Error {
  constructor(message, options) {
    super(message), this.name = "ParseError", this.type = options.type, this.field = options.field, this.value = options.value, this.line = options.line;
  }
};
var LF = 10;
var CR = 13;
var SPACE = 32;
function noop(_arg) {
}
function createParser(config) {
  if (typeof config == "function")
    throw new TypeError(
      "`config` must be an object, got a function instead. Did you mean `createParser({onEvent: fn})`?"
    );
  const { onEvent = noop, onError = noop, onRetry = noop, onComment, maxBufferSize } = config, pendingFragments = [];
  let pendingFragmentsLength = 0, isFirstChunk = true, id, data = "", dataLines = 0, eventType, terminated = false;
  function feed(chunk) {
    if (terminated)
      throw new Error(
        "Cannot feed parser: it was terminated after exceeding the configured max buffer size. Call `reset()` to resume parsing."
      );
    if (isFirstChunk && (isFirstChunk = false, chunk.charCodeAt(0) === 239 && chunk.charCodeAt(1) === 187 && chunk.charCodeAt(2) === 191 && (chunk = chunk.slice(3))), pendingFragments.length === 0) {
      const trailing2 = processLines(chunk);
      trailing2 !== "" && (pendingFragments.push(trailing2), pendingFragmentsLength = trailing2.length), checkBufferSize();
      return;
    }
    if (chunk.indexOf(`
`) === -1 && chunk.indexOf("\r") === -1) {
      pendingFragments.push(chunk), pendingFragmentsLength += chunk.length, checkBufferSize();
      return;
    }
    pendingFragments.push(chunk);
    const input = pendingFragments.join("");
    pendingFragments.length = 0, pendingFragmentsLength = 0;
    const trailing = processLines(input);
    trailing !== "" && (pendingFragments.push(trailing), pendingFragmentsLength = trailing.length), checkBufferSize();
  }
  function checkBufferSize() {
    maxBufferSize !== void 0 && (pendingFragmentsLength + data.length <= maxBufferSize || (terminated = true, pendingFragments.length = 0, pendingFragmentsLength = 0, id = void 0, data = "", dataLines = 0, eventType = void 0, onError(
      new ParseError(`Buffered data exceeded max buffer size of ${maxBufferSize} characters`, {
        type: "max-buffer-size-exceeded"
      })
    )));
  }
  function processLines(chunk) {
    let searchIndex = 0;
    if (chunk.indexOf("\r") === -1) {
      let lfIndex = chunk.indexOf(`
`, searchIndex);
      for (; lfIndex !== -1; ) {
        if (searchIndex === lfIndex) {
          dataLines > 0 && onEvent({ id, event: eventType, data }), id = void 0, data = "", dataLines = 0, eventType = void 0, searchIndex = lfIndex + 1, lfIndex = chunk.indexOf(`
`, searchIndex);
          continue;
        }
        const firstCharCode = chunk.charCodeAt(searchIndex);
        if (isDataPrefix(chunk, searchIndex, firstCharCode)) {
          const valueStart = chunk.charCodeAt(searchIndex + 5) === SPACE ? searchIndex + 6 : searchIndex + 5, value = chunk.slice(valueStart, lfIndex);
          if (dataLines === 0 && chunk.charCodeAt(lfIndex + 1) === LF) {
            onEvent({ id, event: eventType, data: value }), id = void 0, data = "", eventType = void 0, searchIndex = lfIndex + 2, lfIndex = chunk.indexOf(`
`, searchIndex);
            continue;
          }
          data = dataLines === 0 ? value : `${data}
${value}`, dataLines++;
        } else isEventPrefix(chunk, searchIndex, firstCharCode) ? eventType = chunk.slice(
          chunk.charCodeAt(searchIndex + 6) === SPACE ? searchIndex + 7 : searchIndex + 6,
          lfIndex
        ) || void 0 : parseLine(chunk, searchIndex, lfIndex);
        searchIndex = lfIndex + 1, lfIndex = chunk.indexOf(`
`, searchIndex);
      }
      return chunk.slice(searchIndex);
    }
    for (; searchIndex < chunk.length; ) {
      const crIndex = chunk.indexOf("\r", searchIndex), lfIndex = chunk.indexOf(`
`, searchIndex);
      let lineEnd = -1;
      if (crIndex !== -1 && lfIndex !== -1 ? lineEnd = crIndex < lfIndex ? crIndex : lfIndex : crIndex !== -1 ? crIndex === chunk.length - 1 ? lineEnd = -1 : lineEnd = crIndex : lfIndex !== -1 && (lineEnd = lfIndex), lineEnd === -1)
        break;
      parseLine(chunk, searchIndex, lineEnd), searchIndex = lineEnd + 1, chunk.charCodeAt(searchIndex - 1) === CR && chunk.charCodeAt(searchIndex) === LF && searchIndex++;
    }
    return chunk.slice(searchIndex);
  }
  function parseLine(chunk, start, end) {
    if (start === end) {
      dispatchEvent();
      return;
    }
    const firstCharCode = chunk.charCodeAt(start);
    if (isDataPrefix(chunk, start, firstCharCode)) {
      const valueStart = chunk.charCodeAt(start + 5) === SPACE ? start + 6 : start + 5, value2 = chunk.slice(valueStart, end);
      data = dataLines === 0 ? value2 : `${data}
${value2}`, dataLines++;
      return;
    }
    if (isEventPrefix(chunk, start, firstCharCode)) {
      eventType = chunk.slice(chunk.charCodeAt(start + 6) === SPACE ? start + 7 : start + 6, end) || void 0;
      return;
    }
    if (firstCharCode === 105 && chunk.charCodeAt(start + 1) === 100 && chunk.charCodeAt(start + 2) === 58) {
      const value2 = chunk.slice(chunk.charCodeAt(start + 3) === SPACE ? start + 4 : start + 3, end);
      id = value2.includes("\0") ? void 0 : value2;
      return;
    }
    if (firstCharCode === 58) {
      if (onComment) {
        const line2 = chunk.slice(start, end);
        onComment(line2.slice(chunk.charCodeAt(start + 1) === SPACE ? 2 : 1));
      }
      return;
    }
    const line = chunk.slice(start, end), fieldSeparatorIndex = line.indexOf(":");
    if (fieldSeparatorIndex === -1) {
      processField(line, "", line);
      return;
    }
    const field = line.slice(0, fieldSeparatorIndex), offset = line.charCodeAt(fieldSeparatorIndex + 1) === SPACE ? 2 : 1, value = line.slice(fieldSeparatorIndex + offset);
    processField(field, value, line);
  }
  function processField(field, value, line) {
    switch (field) {
      case "event":
        eventType = value || void 0;
        break;
      case "data":
        data = dataLines === 0 ? value : `${data}
${value}`, dataLines++;
        break;
      case "id":
        id = value.includes("\0") ? void 0 : value;
        break;
      case "retry":
        /^\d+$/.test(value) ? onRetry(parseInt(value, 10)) : onError(
          new ParseError(`Invalid \`retry\` value: "${value}"`, {
            type: "invalid-retry",
            value,
            line
          })
        );
        break;
      default:
        onError(
          new ParseError(
            `Unknown field "${field.length > 20 ? `${field.slice(0, 20)}\u2026` : field}"`,
            { type: "unknown-field", field, value, line }
          )
        );
        break;
    }
  }
  function dispatchEvent() {
    dataLines > 0 && onEvent({
      id,
      event: eventType,
      data
    }), id = void 0, data = "", dataLines = 0, eventType = void 0;
  }
  function reset(options = {}) {
    if (options.consume && pendingFragments.length > 0) {
      const incompleteLine = pendingFragments.join("");
      parseLine(incompleteLine, 0, incompleteLine.length);
    }
    isFirstChunk = true, id = void 0, data = "", dataLines = 0, eventType = void 0, pendingFragments.length = 0, pendingFragmentsLength = 0, terminated = false;
  }
  return { feed, reset };
}
function isDataPrefix(chunk, i, firstCharCode) {
  return firstCharCode === 100 && chunk.charCodeAt(i + 1) === 97 && chunk.charCodeAt(i + 2) === 116 && chunk.charCodeAt(i + 3) === 97 && chunk.charCodeAt(i + 4) === 58;
}
function isEventPrefix(chunk, i, firstCharCode) {
  return firstCharCode === 101 && chunk.charCodeAt(i + 1) === 118 && chunk.charCodeAt(i + 2) === 101 && chunk.charCodeAt(i + 3) === 110 && chunk.charCodeAt(i + 4) === 116 && chunk.charCodeAt(i + 5) === 58;
}

// ../../../git/deepseek-harness/node_modules/.pnpm/eventsource-parser@3.1.0/node_modules/eventsource-parser/dist/stream.js
var EventSourceParserStream = class extends TransformStream {
  constructor({ onError, onRetry, onComment, maxBufferSize } = {}) {
    let parser;
    super({
      start(controller) {
        parser = createParser({
          onEvent: (event) => {
            controller.enqueue(event);
          },
          onError(error) {
            typeof onError == "function" && onError(error), (onError === "terminate" || error.type === "max-buffer-size-exceeded") && controller.error(error);
          },
          onRetry,
          onComment,
          maxBufferSize
        });
      },
      transform(chunk) {
        parser.feed(chunk);
      }
    });
  }
};

// src/sse.ts
import { LlmError as LlmError2 } from "@deepseek-ai/dsh-llm";
var DONE = "[DONE]";
async function* parseSse(stream, onComment) {
  const events = stream.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream({ onComment }));
  for await (const { data } of events) {
    yield data;
    if (data === DONE) return;
  }
  throw new LlmError2("SSE stream ended without [DONE]", "STREAM_CLOSED");
}

// src/translate.ts
import { CallId, EMPTY_RESPONSE_CODE, LlmError as LlmError3 } from "@deepseek-ai/dsh-llm";
function mapFinishReason(reason) {
  switch (reason) {
    case "stop":
      return { kind: "stop" };
    case "tool_calls":
      return { kind: "tool-calls" };
    case "length":
      return { kind: "max-tokens" };
    default:
      return {
        kind: "error",
        failure: { message: `model stopped: ${reason}`, code: reason.toUpperCase() }
      };
  }
}
function mapUsage(usage) {
  const cacheRead = usage.prompt_tokens_details?.cached_tokens;
  const reasoning = usage.completion_tokens_details?.reasoning_tokens;
  return {
    inputTokens: usage.prompt_tokens - (cacheRead ?? 0),
    outputTokens: usage.completion_tokens,
    ...cacheRead !== void 0 ? { cacheReadTokens: cacheRead } : {},
    ...reasoning !== void 0 ? { reasoningTokens: reasoning } : {}
  };
}
function closeBlock(block) {
  switch (block.kind) {
    case "text":
      return { type: "text", text: block.text };
    case "reasoning":
      return { type: "reasoning", text: block.text };
    case "tool-call":
      return {
        type: "tool-call",
        id: CallId(block.callId ?? ""),
        name: block.name ?? "",
        arguments: block.text
      };
  }
}
async function* translate(payloads) {
  let nextIndex = 0;
  let textBlock;
  let reasoningBlock;
  const toolBlocks = /* @__PURE__ */ new Map();
  const order = [];
  let pendingFinish;
  let pendingUsage;
  function open(kind) {
    const block = { index: nextIndex++, kind, text: "" };
    order.push(block);
    return block;
  }
  for await (const payload of payloads) {
    if (payload === DONE) {
      for (const block of order) {
        yield { type: "block-end", index: block.index, block: closeBlock(block) };
      }
      if (pendingUsage) yield { type: "usage", usage: pendingUsage };
      const reason = pendingFinish ?? { kind: "stop" };
      yield {
        type: "finish",
        reason: reason.kind === "stop" && order.length === 0 ? {
          kind: "error",
          failure: { message: "model returned a completed response with no content", code: EMPTY_RESPONSE_CODE }
        } : reason
      };
      return;
    }
    let chunk;
    try {
      chunk = JSON.parse(payload);
    } catch {
      throw new LlmError3(`malformed SSE payload: ${payload.slice(0, 120)}`, "MALFORMED_RESPONSE");
    }
    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta;
      const reasoning = delta?.reasoning;
      if (typeof reasoning === "string" && reasoning.length > 0) {
        if (!reasoningBlock) {
          reasoningBlock = open("reasoning");
          yield { type: "block-start", index: reasoningBlock.index, blockType: "reasoning" };
        }
        reasoningBlock.text += reasoning;
        yield { type: "reasoning-delta", index: reasoningBlock.index, text: reasoning };
      }
      const content = delta?.content;
      if (typeof content === "string" && content.length > 0) {
        if (!textBlock) {
          textBlock = open("text");
          yield { type: "block-start", index: textBlock.index, blockType: "text" };
        }
        textBlock.text += content;
        yield { type: "text-delta", index: textBlock.index, text: content };
      }
      for (const call of delta?.tool_calls ?? []) {
        let block = toolBlocks.get(call.index);
        if (!block) {
          block = open("tool-call");
          toolBlocks.set(call.index, block);
          yield { type: "block-start", index: block.index, blockType: "tool-call" };
        }
        if (call.id !== void 0) block.callId = call.id;
        if (call.function?.name !== void 0) block.name = call.function.name;
        const fragment = call.function?.arguments ?? "";
        block.text += fragment;
        yield {
          type: "tool-call-delta",
          index: block.index,
          id: CallId(block.callId ?? ""),
          ...block.name !== void 0 ? { name: block.name } : {},
          argumentsDelta: fragment
        };
      }
      if (typeof choice.finish_reason === "string") {
        pendingFinish = mapFinishReason(choice.finish_reason);
      }
    }
    if (chunk.usage) pendingUsage = mapUsage(chunk.usage);
  }
  throw new LlmError3("SSE payload stream ended without [DONE]", "STREAM_CLOSED");
}

// src/adapter.ts
var DEFAULT_STREAM_IDLE_TIMEOUT_MS = 3e5;
var DEFAULT_CONTEXT_WINDOW = 1e6;
var DEFAULT_MAX_TOKENS = 65536;
var CLOUD_SUFFIX = ":cloud";
var MAX_TIMER_DELAY_MS = 2147483647;
var STREAM_IDLE_TIMEOUT_CODE = "LLM_STREAM_IDLE_TIMEOUT";
var OFF_REASONING_EFFORT = ReasoningEffortId("off");
var LOW_REASONING_EFFORT = ReasoningEffortId("low");
var HIGH_REASONING_EFFORT = ReasoningEffortId("high");
var MAX_REASONING_EFFORT = ReasoningEffortId("max");
var REASONING_EFFORTS = [
  { id: OFF_REASONING_EFFORT, name: "Off" },
  { id: LOW_REASONING_EFFORT, name: "Low" },
  { id: HIGH_REASONING_EFFORT, name: "High" },
  { id: MAX_REASONING_EFFORT, name: "Max" }
];
var OFF_ONLY_REASONING_EFFORTS = [
  { id: OFF_REASONING_EFFORT, name: "Off" }
];
function normalizeCloud(model) {
  return model.endsWith(CLOUD_SUFFIX) ? model : `${model}${CLOUD_SUFFIX}`;
}
var IdleWatchdog = class {
  constructor(upstream, timeoutMs) {
    this.timeoutMs = timeoutMs;
    this.signal = upstream.aborted ? upstream : AbortSignal.any([upstream, this.controller.signal]);
    if (!upstream.aborted) {
      upstream.addEventListener("abort", () => this.stop(), { once: true });
    }
  }
  timeoutMs;
  controller = new AbortController();
  timer;
  expired = false;
  /** Combined caller + watchdog signal; aborts when either fires. */
  signal;
  get didExpire() {
    return this.expired;
  }
  arm() {
    this.stop();
    this.timer = setTimeout(() => {
      this.expired = true;
      this.controller.abort(new Error(STREAM_IDLE_TIMEOUT_CODE));
    }, this.timeoutMs);
  }
  /** Rearm the idle window; called after each provider read. */
  pulse() {
    this.arm();
  }
  stop() {
    if (this.timer !== void 0) {
      clearTimeout(this.timer);
      this.timer = void 0;
    }
  }
};
function modelInfo(provider, model) {
  return {
    provider,
    id: model.id,
    name: model.name ?? model.id,
    ...model.description === void 0 ? {} : { description: model.description },
    inputModalities: model.inputModalities ?? ["text"]
  };
}
function providerRetryAfterMs(value) {
  if (value === null) return void 0;
  if (/^\d+$/.test(value)) {
    const delay2 = Number(value) * 1e3;
    return Number.isFinite(delay2) && delay2 > 0 ? delay2 : void 0;
  }
  const delay = Date.parse(value) - Date.now();
  return Number.isFinite(delay) && delay > 0 ? delay : void 0;
}
function requestId(headers) {
  const value = headers.get("x-request-id") ?? headers.get("x-ollama-request-id");
  return value === null || value.length === 0 ? void 0 : ProviderRequestId(value);
}
function httpErrorCode(status, error) {
  if (status === 401 || status === 403) return "AUTH";
  if (status === 413) return "INVALID_REQUEST";
  const detail = [error?.code, error?.type, error?.message].filter(Boolean).join(" ");
  if (isQuotaExceededError(detail)) return QUOTA_EXCEEDED_CODE;
  if (status === 429) return "RATE_LIMIT";
  if (status === 400) {
    if (isContextWindowExceededError(detail)) return CONTEXT_WINDOW_EXCEEDED_CODE;
    return "INVALID_REQUEST";
  }
  if (status >= 500) return "SERVER";
  return `HTTP_${status}`;
}
var OllamaAdapter = class extends LlmAdapter {
  constructor(config) {
    super();
    this.config = config;
  }
  config;
  providerInfo(provider) {
    return { id: provider, name: "Ollama" };
  }
  providerRetryPolicy(_provider) {
    return this.config.options().retryPolicy;
  }
  listModels(provider) {
    return Promise.resolve(this.config.options().models.map((model) => modelInfo(provider, model)));
  }
  resolveModel(provider, model, _signal) {
    const connection = this.config.options();
    const wireModel = normalizeCloud(model);
    const configured = connection.models.find((entry) => entry.id === wireModel);
    const contextWindow = configured?.contextWindow ?? connection.defaultContextWindow;
    return Promise.resolve({
      // An uncatalogued endpoint is safely treated as text-only.
      ...configured === void 0 ? { provider, id: wireModel, name: wireModel, inputModalities: ["text"] } : modelInfo(provider, configured),
      context: { contextWindow },
      defaultMaxTokens: configured?.maxTokens ?? connection.maxTokens,
      ...connection.defaults.thinking === "disabled" ? {
        reasoning: {
          efforts: OFF_ONLY_REASONING_EFFORTS,
          defaultEffort: OFF_REASONING_EFFORT
        }
      } : {
        reasoning: {
          efforts: REASONING_EFFORTS,
          defaultEffort: connection.defaults.reasoningEffort === "off" ? OFF_REASONING_EFFORT : connection.defaults.reasoningEffort === "low" ? LOW_REASONING_EFFORT : connection.defaults.reasoningEffort === "max" ? MAX_REASONING_EFFORT : HIGH_REASONING_EFFORT
        }
      }
    });
  }
  async *stream(options) {
    const connection = this.config.options();
    if (options.messages.some((message) => contentHasImage2(message.content))) {
      throw new LlmError4(
        "Ollama image input is not supported yet.",
        "UNSUPPORTED_CONTENT"
      );
    }
    const apiKey = await this.config.resolveApiKey(connection);
    const consumer = new AbortController();
    const upstream = options.signal === void 0 ? consumer.signal : AbortSignal.any([options.signal, consumer.signal]);
    const watchdog = new IdleWatchdog(upstream, connection.streamIdleTimeoutMs);
    const iterator = this.request(
      options,
      watchdog.signal,
      connection,
      apiKey,
      () => watchdog.pulse()
    )[Symbol.asyncIterator]();
    let exhausted = false;
    try {
      while (true) {
        watchdog.pulse();
        const result = await iterator.next();
        if (result.done) {
          exhausted = true;
          return;
        }
        yield result.value;
      }
    } catch (error) {
      if (watchdog.didExpire) {
        throw new LlmError4(
          `Ollama stream idle timeout after ${connection.streamIdleTimeoutMs}ms`,
          "TIMEOUT",
          { cause: error }
        );
      }
      if (options.signal?.aborted) {
        throw new LlmError4("Ollama request aborted by caller", "ABORTED", { cause: error });
      }
      if (error instanceof LlmError4) throw error;
      throw new LlmError4(`Ollama API stream from ${connection.baseURL} failed`, "TRANSPORT", { cause: error });
    } finally {
      watchdog.stop();
      consumer.abort("Ollama stream consumer stopped");
      if (!exhausted && iterator.return !== void 0) {
        try {
          await iterator.return();
        } catch (_abortedTransportTeardown) {
        }
      }
    }
  }
  async *request(options, signal, connection, apiKey, onComment) {
    const body = serializeRequest(
      { ...options, model: normalizeCloud(options.model) },
      connection.defaults
    );
    const payload = JSON.stringify(body);
    const headers = {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
      "accept": "text/event-stream",
      ...attributionHeaders(),
      ...options.sessionId !== void 0 ? { "x-deepseek-harness-session-id": String(options.sessionId) } : {},
      ...options.purpose === "compaction" ? { "x-deepseek-harness-compact": "1" } : {}
    };
    let response;
    try {
      response = await fetch(`${connection.baseURL}/chat/completions`, {
        method: "POST",
        headers,
        body: payload,
        signal
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new LlmError4(
        `Ollama API request to ${connection.baseURL} failed`,
        "TRANSPORT",
        { cause: error }
      );
    }
    if (!response.ok) {
      let message = `Ollama API error (HTTP ${response.status})`;
      let providerError;
      try {
        const parsed = await response.json();
        providerError = parsed.error;
        if (providerError?.message) message = providerError.message;
      } catch {
      }
      const delay = providerRetryAfterMs(response.headers.get("retry-after"));
      const id = requestId(response.headers);
      throw new LlmError4(message, httpErrorCode(response.status, providerError), {
        status: response.status,
        ...delay === void 0 ? {} : { providerRetryAfterMs: delay },
        ...id === void 0 ? {} : { requestId: id }
      });
    }
    if (!response.body) {
      throw new LlmError4("Ollama API returned no response body", "EMPTY_RESPONSE");
    }
    yield* translate(parseSse(response.body, onComment));
  }
};

// src/index.ts
var name = "llm-ollama-cloud";
var inject = ["llm"];
var DEFAULT_API_KEY_ENV = "OLLAMA_CLOUD_API_KEY";
var PROVIDER = "ollama-cloud-direct";
var DEFAULT_MODELS = [
  { id: "deepseek-v4-flash:cloud", name: "DeepSeek-V4-Flash (cloud)", contextWindow: DEFAULT_CONTEXT_WINDOW },
  { id: "deepseek-v4-pro:cloud", name: "DeepSeek-V4-Pro (cloud)", contextWindow: DEFAULT_CONTEXT_WINDOW },
  { id: "glm-5.2:cloud", name: "GLM-5.2 (cloud)", contextWindow: DEFAULT_CONTEXT_WINDOW }
];
var MODEL_MODALITIES = ["text", "image"];
var PUBLIC_BASE_URL = "https://ollama.com/v1";
function resolveModels(models) {
  const seen = /* @__PURE__ */ new Set();
  return (models ?? DEFAULT_MODELS).map((model) => {
    if (model.id.length === 0) throw new Error("llm-ollama-cloud: catalog model ids must be non-empty");
    const id = normalizeCloud(model.id);
    if (model.name !== void 0 && model.name.length === 0) {
      throw new Error(`llm-ollama-cloud: catalog model "${id}" has an empty name`);
    }
    if (model.contextWindow !== void 0 && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) {
      throw new Error(
        `llm-ollama-cloud: catalog model "${id}" contextWindow must be a positive integer`
      );
    }
    if (model.maxTokens !== void 0 && (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)) {
      throw new Error(
        `llm-ollama-cloud: catalog model "${id}" maxTokens must be a positive integer`
      );
    }
    const inputModalities = model.inputModalities ?? ["text"];
    if (inputModalities.length === 0) {
      throw new Error(`llm-ollama-cloud: catalog model "${id}" inputModalities must not be empty`);
    }
    if (inputModalities.some((modality) => !MODEL_MODALITIES.includes(modality))) {
      throw new Error(
        `llm-ollama-cloud: catalog model "${id}" inputModalities must contain only "text" and "image"`
      );
    }
    if (new Set(inputModalities).size !== inputModalities.length) {
      throw new Error(`llm-ollama-cloud: catalog model "${id}" inputModalities must not contain duplicates`);
    }
    if (seen.has(id)) throw new Error(`llm-ollama-cloud: duplicate catalog model "${id}"`);
    seen.add(id);
    return {
      id,
      ...model.name === void 0 ? {} : { name: model.name },
      ...model.description === void 0 ? {} : { description: model.description },
      ...model.contextWindow === void 0 ? {} : { contextWindow: model.contextWindow },
      ...model.maxTokens === void 0 ? {} : { maxTokens: model.maxTokens },
      inputModalities: [...inputModalities]
    };
  });
}
function resolveAdapterOptions(config) {
  if (config.thinking === "disabled" && config.reasoningEffort !== void 0 && config.reasoningEffort !== "off") {
    throw new Error('llm-ollama-cloud: only reasoningEffort "off" can be configured when thinking is disabled');
  }
  if (config.defaultContextWindow !== void 0 && (!Number.isInteger(config.defaultContextWindow) || config.defaultContextWindow <= 0)) {
    throw new Error("llm-ollama-cloud: defaultContextWindow must be a positive integer");
  }
  if (config.maxTokens !== void 0 && (!Number.isSafeInteger(config.maxTokens) || config.maxTokens <= 0)) {
    throw new Error("llm-ollama-cloud: maxTokens must be a positive safe integer");
  }
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
  if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `llm-ollama-cloud: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`
    );
  }
  return {
    apiKeyEnv: config.apiKeyEnv ?? DEFAULT_API_KEY_ENV,
    baseURL: config.baseURL ?? PUBLIC_BASE_URL,
    defaults: {
      thinking: config.thinking,
      reasoningEffort: config.reasoningEffort
    },
    maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    defaultContextWindow: config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
    models: resolveModels(config.models),
    streamIdleTimeoutMs,
    retryPolicy: resolveRetryPolicy(config.retryPolicy, "llm-ollama-cloud: retryPolicy")
  };
}
function apply(ctx, config) {
  const options = () => resolveAdapterOptions(config);
  options();
  const adapter = new OllamaAdapter({
    options,
    resolveApiKey: async (connection) => {
      const ref = connection.apiKeyEnv;
      const value = process.env[ref];
      if (value !== void 0 && value.length > 0) {
        return assertUsableApiKey(value, "llm-ollama-cloud", ref);
      }
      throw new LlmError5(
        `llm-ollama-cloud: no API key for provider route "${PROVIDER}"; export ${ref} in the launching environment`,
        "MISSING_CREDENTIAL"
      );
    }
  });
  ctx.llm.registerAdapter([PROVIDER], adapter);
}
export {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  MAX_TIMER_DELAY_MS,
  OllamaAdapter,
  PUBLIC_BASE_URL,
  apply,
  inject,
  name,
  normalizeCloud,
  resolveAdapterOptions
};
//# sourceMappingURL=index.js.map

export type DeveloperTranscriptEventKind = "llm" | "search" | "tool";

export interface DeveloperTranscriptConversation {
  id: string;
  title: string;
  mode: string | null;
  topic?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeveloperTranscriptMessage {
  id: string;
  role: string;
  content: string;
  provider: string | null;
  model: string | null;
  botId: string | null;
  audienceBotIds: string | null;
  toolPayload: string | null;
  createdAt: string;
}

export interface DeveloperTranscriptEvent {
  id: string;
  requestId: string;
  requestSequence: number;
  messageId: string | null;
  kind: DeveloperTranscriptEventKind;
  purpose: string;
  provider: string | null;
  model: string | null;
  payloadJson: string;
  createdAt: string;
}

export interface BuildDeveloperTranscriptInput {
  conversation: DeveloperTranscriptConversation;
  messages: readonly DeveloperTranscriptMessage[];
  events: readonly DeveloperTranscriptEvent[];
  exportedAt?: string;
  /** Runtime-only values to scrub. Callers should pass sensitive/config environment values. */
  secretValues?: readonly string[];
}

type JsonRecord = Record<string, unknown>;

const SENSITIVE_FIELD_PATTERN =
  /(?:api[_-]?key|authorization|credential|password|secret|subscription[_-]?token|token)/iu;

function replaceKnownValues(text: string, values: readonly string[]): string {
  const uniqueValues = Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length >= 4)),
  ).sort((left, right) => right.length - left.length || left.localeCompare(right));
  let redacted = text;
  for (const value of uniqueValues) {
    redacted = redacted.split(value).join("[REDACTED_ENV_VALUE]");
  }
  return redacted;
}

/**
 * Deterministic, provider-agnostic transcript redaction. It intentionally runs over the
 * complete rendered document so secrets are removed whether they came from a prompt,
 * response, error, header dump, tool payload, or configuration field.
 */
export function redactDeveloperTranscript(
  input: string,
  options: { secretValues?: readonly string[] } = {},
): string {
  let output = replaceKnownValues(input, options.secretValues ?? []);

  // JSON-shaped sensitive properties, including escaped provider request/response dumps.
  output = output.replace(
    /("[^"\n]*(?:api[_-]?key|authorization|credential|password|secret|subscription[_-]?token|token)[^"\n]*"\s*:\s*)"(?:\\.|[^"\\])*"/giu,
    '$1"[REDACTED]"',
  );
  // Header and config-line forms.
  output = output.replace(
    /\b(authorization|x-api-key|x-subscription-token)\s*[:=]\s*(?:Bearer\s+)?[^\s,;\n]+/giu,
    "$1: [REDACTED]",
  );
  output = output.replace(
    /\b([A-Z][A-Z0-9_]*(?:API_KEY|AUTHORIZATION|CREDENTIAL|PASSWORD|SECRET|TOKEN)[A-Z0-9_]*)\s*=\s*[^\s\n]+/gu,
    "$1=[REDACTED]",
  );
  // Common bearer/API-key token shapes even when a provider returned them without a label.
  output = output.replace(/\bBearer\s+[^\s"'`,;]+/giu, "Bearer [REDACTED]");
  output = output.replace(
    /\b(?:sk-(?:proj-)?|xai-|brv-)[A-Za-z0-9._-]{8,}\b/gu,
    "[REDACTED_API_KEY]",
  );
  // Secret-bearing query parameters.
  output = output.replace(
    /([?&](?:api[_-]?key|authorization|credential|password|secret|token)=)[^&#\s]+/giu,
    "$1[REDACTED]",
  );
  // Machine-local paths are not useful in a portable session diagnostic.
  output = output.replace(
    /\/Users\/[^/\s]+(?:\/[^\s\])}"'`,;>]*)?/gu,
    "[REDACTED_LOCAL_PATH]",
  );
  output = output.replace(
    /\b[A-Za-z]:\\Users\\[^\\\s]+(?:\\[^\s\])}"'`,;>]*)?/gu,
    "[REDACTED_LOCAL_PATH]",
  );
  return output;
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortedJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJsonValue);
  if (!isJsonRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, sortedJsonValue(value[key])]),
  );
}

function stableJson(value: unknown): string {
  try {
    return JSON.stringify(sortedJsonValue(value), null, 2);
  } catch {
    return String(value);
  }
}

function parseJsonRecord(value: string | null): JsonRecord | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isJsonRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function longestBacktickRun(value: string): number {
  let longest = 0;
  for (const match of value.matchAll(/`+/gu)) {
    longest = Math.max(longest, match[0].length);
  }
  return longest;
}

function fenced(value: unknown): string[] {
  const text = typeof value === "string" ? value : stableJson(value);
  const fence = "`".repeat(Math.max(3, longestBacktickRun(text) + 1));
  return [fence, text || "(empty)", fence];
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function providerMessages(payload: JsonRecord): Array<{ role: string; content: string }> {
  const request = payload.request;
  if (!isJsonRecord(request) || !Array.isArray(request.messages)) return [];
  return request.messages.flatMap((entry) => {
    if (!isJsonRecord(entry)) return [];
    const role = nullableText(entry.role);
    const content = typeof entry.content === "string" ? entry.content : null;
    return role && content !== null ? [{ role, content }] : [];
  });
}

function displayedState(
  event: DeveloperTranscriptEvent,
  payload: JsonRecord,
  messageById: ReadonlyMap<string, DeveloperTranscriptMessage>,
): string {
  if (nullableText(payload.error)) return "Failed before a displayable result.";
  if (event.kind !== "llm") return "Hidden external/tool activity.";
  const linkedMessage = event.messageId ? messageById.get(event.messageId) : undefined;
  const parsedOutput = nullableText(payload.parsedOutput);
  if (linkedMessage?.role === "assistant" && parsedOutput === linkedMessage.content.trim()) {
    return "Displayed verbatim in the linked assistant message.";
  }
  if (
    event.purpose === "chat_reply" ||
    event.purpose === "chat_fallback" ||
    event.purpose === "chat_web_search_followup" ||
    event.purpose === "coffee_turn"
  ) {
    return linkedMessage
      ? "Generated output was transformed, rejected, retried, or not displayed verbatim."
      : "Generated output was never linked to a displayed message.";
  }
  return "Hidden helper call; output was not intended for the visible transcript.";
}

function eventActivityLabel(
  event: DeveloperTranscriptEvent,
  messages: readonly { role: string; content: string }[],
): string {
  const promptText = messages.map((message) => message.content).join("\n").toLowerCase();
  if (event.kind === "search" || event.purpose.includes("web_search")) return "Search call";
  if (event.purpose.includes("topic_selection")) return "Coffee topic selection metadata";
  if (
    event.purpose.includes("topic_generation") ||
    (event.purpose === "coffee_router" && /\b(?:starter )?topics?\b/u.test(promptText))
  ) {
    return "Coffee topic-generation call";
  }
  if (/\bepilogue\b/u.test(promptText)) return "Hidden epilogue call";
  if (event.purpose === "coffee_summary") return "Coffee synopsis call";
  if (event.purpose === "memory_summary") return "Memory synopsis / summary call";
  if (event.purpose === "conversation_title") return "Conversation title-generation call";
  if (event.purpose === "coffee_router") return "Coffee routing decision";
  if (event.purpose === "psychic_planning") return "Planning / routing decision";
  if (event.purpose === "memory_inference" && /\bpower(?:s|-related)?\b/u.test(promptText)) {
    return "Power-related helper call";
  }
  if (event.kind === "tool") return "Tool or non-text provider call";
  return "LLM call";
}

function ambientPayloads(messages: readonly DeveloperTranscriptMessage[]): Array<{
  createdAt: string;
  messageId: string;
  name: string;
  value: unknown;
}> {
  const ambient: Array<{
    createdAt: string;
    messageId: string;
    name: string;
    value: unknown;
  }> = [];
  for (const message of messages) {
    const payload = parseJsonRecord(message.toolPayload);
    if (!payload) continue;
    if (payload.coffeeAmbientAction !== undefined) {
      ambient.push({
        createdAt: message.createdAt,
        messageId: message.id,
        name: "coffeeAmbientAction",
        value: payload.coffeeAmbientAction,
      });
    }
    if (Array.isArray(payload.coffeeReplayEvents)) {
      for (const event of payload.coffeeReplayEvents) {
        ambient.push({
          createdAt: message.createdAt,
          messageId: message.id,
          name: "coffeeReplayEvent",
          value: event,
        });
      }
    }
  }
  return ambient;
}

export function buildDeveloperTranscript(input: BuildDeveloperTranscriptInput): string {
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  const messageById = new Map(input.messages.map((message) => [message.id, message]));
  const lines: string[] = [
    "# PRISM Developer Transcript",
    `> Exported ${exportedAt}`,
    "> Sensitive credentials, environment values, authorization data, and machine-local paths are deterministically redacted.",
    "",
    "## Session",
    "",
    `- ID: ${input.conversation.id}`,
    `- Title: ${input.conversation.title}`,
    `- Mode: ${input.conversation.mode ?? "legacy / unknown"}`,
    `- Selected topic: ${input.conversation.topic?.trim() || "none"}`,
    `- Created: ${input.conversation.createdAt}`,
    `- Updated: ${input.conversation.updatedAt}`,
    `- Stored messages: ${input.messages.length}`,
    `- Recorded external calls: ${input.events.length}`,
    "",
    "## LLM, Search, and Tool Calls",
    "",
  ];

  if (input.events.length === 0) {
    lines.push("(No provider-level diagnostic calls were recorded for this session.)", "");
  }

  input.events.forEach((event, index) => {
    const payload = parseJsonRecord(event.payloadJson) ?? {};
    const messages = providerMessages(payload);
    const systemPrompts = messages.filter((message) => message.role === "system");
    const developerPrompts = messages.filter((message) => message.role === "developer");
    const inputMessages = messages.filter(
      (message) => message.role !== "system" && message.role !== "developer",
    );
    const usage = isJsonRecord(payload.usage) ? payload.usage : {};
    const durationMs = numberOrNull(payload.durationMs);
    const stopReason = nullableText(payload.stopReason);
    const error = nullableText(payload.error);
    const fallback = event.purpose.includes("fallback") || payload.fallback === true;

    lines.push(`### Call ${index + 1}`);
    lines.push("");
    lines.push(`- Timestamp: ${event.createdAt}`);
    lines.push(`- Kind: ${event.kind === "llm" ? "LLM" : event.kind === "search" ? "Search" : "Tool"}`);
    lines.push(`- Activity: ${eventActivityLabel(event, messages)}`);
    lines.push(`- Request ID: ${event.requestId}`);
    lines.push(`- Request sequence: ${event.requestSequence}`);
    lines.push(`- Purpose / routing decision: ${event.purpose}`);
    lines.push(`- Provider: ${event.provider ?? "unavailable"}`);
    lines.push(`- Model: ${event.model ?? "unavailable"}`);
    lines.push(`- Retry / fallback: ${fallback ? "yes" : "no recorded marker"}`);
    lines.push(`- Streaming: ${payload.streaming === true ? "true" : "false"}`);
    lines.push(`- Stop reason: ${stopReason ?? "unavailable"}`);
    lines.push(`- Latency: ${durationMs === null ? "unavailable" : `${Math.round(durationMs)} ms`}`);
    lines.push(`- Input tokens: ${numberOrNull(usage.inputTokens) ?? "unavailable"}`);
    lines.push(`- Output tokens: ${numberOrNull(usage.outputTokens) ?? "unavailable"}`);
    lines.push(`- Total tokens: ${numberOrNull(usage.totalTokens) ?? "unavailable"}`);
    lines.push(`- Error: ${error ?? "none"}`);
    lines.push(`- Display state: ${displayedState(event, payload, messageById)}`);
    if (event.messageId) lines.push(`- Linked message: ${event.messageId}`);
    lines.push("");

    lines.push("#### System prompts", "");
    if (systemPrompts.length === 0) {
      lines.push("(None recorded.)", "");
    } else {
      systemPrompts.forEach((message, promptIndex) => {
        lines.push(`System prompt ${promptIndex + 1}:`, ...fenced(message.content), "");
      });
    }

    lines.push("#### Developer prompts", "");
    if (developerPrompts.length === 0) {
      lines.push("(No separate developer-role prompt was recorded.)", "");
    } else {
      developerPrompts.forEach((message, promptIndex) => {
        lines.push(`Developer prompt ${promptIndex + 1}:`, ...fenced(message.content), "");
      });
    }

    lines.push("#### Input messages", "");
    if (inputMessages.length === 0) {
      const request = payload.request;
      lines.push(...fenced(request ?? "(No input messages recorded.)"), "");
    } else {
      inputMessages.forEach((message, messageIndex) => {
        lines.push(`${messageIndex + 1}. ${message.role}`, ...fenced(message.content), "");
      });
    }

    lines.push("#### Raw model / service output", "", ...fenced(payload.rawOutput ?? "(unavailable)"), "");
    lines.push("#### Parsed output", "", ...fenced(payload.parsedOutput ?? "(unavailable)"), "");
  });

  lines.push("## Canonical Message Records", "");
  if (input.messages.length === 0) lines.push("(No stored messages.)", "");
  input.messages.forEach((message, index) => {
    lines.push(`### Message ${index + 1}`);
    lines.push("");
    lines.push(`- ID: ${message.id}`);
    lines.push(`- Timestamp: ${message.createdAt}`);
    lines.push(`- Role: ${message.role}`);
    lines.push(`- Provider: ${message.provider ?? "unavailable"}`);
    lines.push(`- Model: ${message.model ?? "unavailable"}`);
    lines.push(`- Bot ID: ${message.botId ?? "none"}`);
    lines.push(
      `- Mention resolution / audience bot IDs: ${message.audienceBotIds ?? "none recorded"}`,
    );
    lines.push("", "Content / parsed visible output:", ...fenced(message.content), "");
    if (message.toolPayload) {
      const parsedToolPayload = parseJsonRecord(message.toolPayload);
      lines.push(
        "Tool calls, search results, routing metadata, and retry state:",
        ...fenced(parsedToolPayload ?? message.toolPayload),
        "",
      );
    }
  });

  lines.push("## Ambient Events (not LLM calls)", "");
  const ambient = ambientPayloads(input.messages);
  if (ambient.length === 0) {
    lines.push("(No ambient events were recorded.)", "");
  } else {
    ambient.forEach((event, index) => {
      lines.push(
        `### Ambient event ${index + 1}`,
        "",
        `- Timestamp: ${event.createdAt}`,
        `- Source message: ${event.messageId}`,
        `- Type: ${event.name}`,
        "",
        ...fenced(event.value),
        "",
      );
    });
  }

  const rendered = lines.join("\n").trimEnd() + "\n";
  return redactDeveloperTranscript(rendered, { secretValues: input.secretValues });
}

export function sensitiveEnvironmentValues(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  return Object.entries(environment)
    .filter(([name, value]) => Boolean(value) && SENSITIVE_FIELD_PATTERN.test(name))
    .map(([, value]) => value!)
    .filter((value) => value.trim().length >= 4);
}

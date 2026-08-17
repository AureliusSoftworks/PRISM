export const BOT_DIAGNOSTIC_CLIPBOARD_SCHEMA = "prism-bot-diagnostic-v1";

export interface BotDiagnosticClipboardInput {
  prismVersion: string;
  capturedAt?: string;
  bot: Record<string, unknown>;
}

const PRIVATE_FIELD_PATTERN =
  /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|cookie|password|secret|user[_-]?id)/iu;
const LEARNED_CONTEXT_FIELD_PATTERN =
  /^(?:conversation|conversations|learnedMemories|memories|messages)$/iu;
const EMBEDDED_MEDIA_FIELD_PATTERN =
  /^(?:audioDataUrl|paintColorMapBase64|paintMaskBase64)$/iu;

function omittedEmbeddedValue(
  value: string,
  fieldName: string,
): Record<string, unknown> {
  const mediaType = /^data:([^;,]+)/iu.exec(value)?.[1] ?? null;
  return {
    omitted: fieldName.toLowerCase().includes("audio")
      ? "embedded audio"
      : "encoded avatar mask",
    characterCount: value.length,
    ...(mediaType ? { mediaType } : {}),
  };
}

function sanitizeDiagnosticValue(
  value: unknown,
  fieldName = "",
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    if (EMBEDDED_MEDIA_FIELD_PATTERN.test(fieldName) || /^data:/iu.test(value)) {
      return omittedEmbeddedValue(value, fieldName);
    }
    return value;
  }
  if (
    typeof value === "undefined" ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map(
      (item) => sanitizeDiagnosticValue(item, fieldName, seen) ?? null,
    );
  }
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular value omitted]";
  seen.add(value);

  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (PRIVATE_FIELD_PATTERN.test(key)) {
      sanitized[key] = "[redacted]";
      continue;
    }
    if (LEARNED_CONTEXT_FIELD_PATTERN.test(key)) {
      sanitized[key] = "[omitted: learned or conversation context]";
      continue;
    }
    const nested = sanitizeDiagnosticValue(
      (value as Record<string, unknown>)[key],
      key,
      seen,
    );
    if (nested !== undefined) sanitized[key] = nested;
  }
  seen.delete(value);
  return sanitized;
}

export function formatBotDiagnosticClipboardText(
  input: BotDiagnosticClipboardInput,
): string {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const bot = sanitizeDiagnosticValue(input.bot) as Record<string, unknown>;
  const botName =
    typeof input.bot.name === "string" && input.bot.name.trim()
      ? input.bot.name.trim()
      : "Unnamed bot";
  const record = {
    schema: BOT_DIAGNOSTIC_CLIPBOARD_SCHEMA,
    capturedAt,
    prismVersion: input.prismVersion,
    privacy: {
      excludes: [
        "account secrets",
        "learned memories",
        "conversation history",
        "embedded media payloads",
      ],
      purpose: "Testing and support context for one bot",
    },
    bot,
  };

  return [
    "# PRISM Bot Diagnostic",
    "",
    `Bot: ${botName}`,
    `Format: ${BOT_DIAGNOSTIC_CLIPBOARD_SCHEMA}`,
    `Captured: ${capturedAt}`,
    "",
    "This record contains authored bot settings and runtime metadata. It intentionally omits learned memories, conversation history, secrets, and embedded media payloads.",
    "",
    "```json",
    JSON.stringify(record, null, 2),
    "```",
  ].join("\n");
}

export interface WebRequestDiagnosticContext {
  method: string;
  path: string;
  status?: number;
}

export interface WebDiagnosticReportInput {
  app: string;
  appVersion: string;
  surface: string;
  operation: string;
  stage: string;
  summary: string;
  error: unknown;
  timestamp?: string;
}

const MAX_DIAGNOSTIC_DEPTH = 4;
const MAX_DIAGNOSTIC_ITEMS = 24;
const MAX_DIAGNOSTIC_STRING_LENGTH = 700;
const MAX_DIAGNOSTIC_OUTPUT_LENGTH = 12_000;
const SENSITIVE_KEY =
  /(?:api[-_]?key|authorization|auth|cookie|credential|secret|token|password|passphrase|prompt|transcript|message|body|content|input|output|instruction|system|user|assistant|conversation|producer[-_]?brief)/iu;
const SENSITIVE_VALUE =
  /(?:bearer\s+[\w.\-~+/=]+|(?:sk|rk|pk|sess|token)[-_][\w.\-]+|api[-_]?key\s*[:=]\s*\S+|authorization\s*[:=]\s*\S+|cookie\s*[:=]\s*\S+)/giu;
const URL_QUERY = /((?:https?|file):\/\/[^\s)?]+)\?[^\s)]*/giu;
const HTTP_ORIGIN = /https?:\/\/[^/\s)]+/giu;
const LOCAL_FILE_URL = /file:\/\/\/[^\s)]+/giu;

const requestContextByError = new WeakMap<object, WebRequestDiagnosticContext>();

function truncate(value: string, max = MAX_DIAGNOSTIC_STRING_LENGTH): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length > max
    ? `${normalized.slice(0, Math.max(0, max - 14))}… [truncated]`
    : normalized;
}

function safePath(path: string): string {
  try {
    const parsed = new URL(path, "https://prism.local");
    return parsed.pathname || "/";
  } catch {
    return path.split("?", 1)[0] || "/";
  }
}

function sanitizeString(value: string): string {
  return truncate(value).replace(SENSITIVE_VALUE, "[redacted]");
}

function sanitizeErrorStack(stack: string): string[] {
  return stack
    .split(/\r?\n/gu)
    .slice(1, 13)
    .map((frame) =>
      frame
        .trim()
        .replace(URL_QUERY, "$1?[redacted]")
        .replace(HTTP_ORIGIN, "app://local")
        .replace(LOCAL_FILE_URL, (url) => {
          const workspacePath = url.match(/\/(?:apps|packages)\/.*$/u)?.[0];
          const basename = url.split("/").at(-1) ?? "frame";
          return `file:///[local]${workspacePath ?? `/${basename}`}`;
        })
        .replace(SENSITIVE_VALUE, "[redacted]"),
    )
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Removes user content and credentials before diagnostic data leaves memory. */
export function sanitizeDiagnosticValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (depth >= MAX_DIAGNOSTIC_DEPTH) return "[max depth]";
  if (typeof value === "string") return sanitizeString(value);
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "undefined") return "[undefined]";
  if (typeof value === "function" || typeof value === "symbol") {
    return `[${typeof value}]`;
  }
  if (typeof value !== "object") return "[unavailable]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, MAX_DIAGNOSTIC_ITEMS).map((item) =>
      sanitizeDiagnosticValue(item, depth + 1, seen),
    );
  }
  if (value instanceof Error) {
    const details: Record<string, unknown> = {
      name: sanitizeString(value.name || "Error"),
      // Error messages can contain server echoes of user text. The visible
      // summary is recorded separately, so never duplicate the raw message.
      message: "[redacted]",
    };
    if (value.stack) {
      details.stackFrames = sanitizeErrorStack(value.stack);
    }
    const errorWithMetadata = value as Error & {
      cause?: unknown;
      code?: unknown;
      errors?: unknown;
    };
    if (errorWithMetadata.code !== undefined) {
      details.code = sanitizeDiagnosticValue(
        errorWithMetadata.code,
        depth + 1,
        seen,
      );
    }
    if (errorWithMetadata.cause !== undefined) {
      details.cause = sanitizeDiagnosticValue(
        errorWithMetadata.cause,
        depth + 1,
        seen,
      );
    }
    if (errorWithMetadata.errors !== undefined) {
      details.errors = sanitizeDiagnosticValue(
        errorWithMetadata.errors,
        depth + 1,
        seen,
      );
    }
    for (const [key, item] of Object.entries(value).slice(0, MAX_DIAGNOSTIC_ITEMS)) {
      if (
        key === "stack" ||
        key === "message" ||
        key === "cause" ||
        key === "code" ||
        key === "errors"
      ) {
        continue;
      }
      details[key] = SENSITIVE_KEY.test(key)
        ? "[redacted]"
        : sanitizeDiagnosticValue(item, depth + 1, seen);
    }
    return details;
  }
  if (!isRecord(value)) return `[${Object.prototype.toString.call(value)}]`;

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, MAX_DIAGNOSTIC_ITEMS)) {
    sanitized[key] = SENSITIVE_KEY.test(key)
      ? "[redacted]"
      : sanitizeDiagnosticValue(item, depth + 1, seen);
  }
  return sanitized;
}

export function attachWebRequestDiagnostic(
  error: unknown,
  context: WebRequestDiagnosticContext,
): unknown {
  if (error && typeof error === "object") {
    requestContextByError.set(error, {
      method: context.method.trim().toUpperCase() || "GET",
      path: safePath(context.path),
      ...(typeof context.status === "number" && Number.isFinite(context.status)
        ? { status: Math.trunc(context.status) }
        : {}),
    });
  }
  return error;
}

export function webRequestDiagnosticFor(
  error: unknown,
): WebRequestDiagnosticContext | null {
  return error && typeof error === "object"
    ? (requestContextByError.get(error) ?? null)
    : null;
}

function browserRuntimeContext(): Record<string, unknown> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { environment: "server" };
  }
  return {
    environment: "browser",
    route: safePath(window.location.pathname),
    language: navigator.language || "unknown",
    online: navigator.onLine,
    secureContext: window.isSecureContext,
    visibility:
      typeof document === "undefined" ? "unknown" : document.visibilityState,
    timeZone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    userAgent: sanitizeString(navigator.userAgent || "unknown"),
  };
}

function json(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '"[unserializable]"';
  }
}

export function buildWebDiagnosticReport(input: WebDiagnosticReportInput): string {
  const request = webRequestDiagnosticFor(input.error);
  const report = [
    "PRISM diagnostic report",
    "reportFormat: 1",
    "Privacy note: request bodies, prompts, transcripts, credentials, cookies, and auth headers are excluded. The visible toast summary is included as shown.",
    "",
    "Failure",
    `timestamp: ${input.timestamp ?? new Date().toISOString()}`,
    `app: ${sanitizeString(input.app)}`,
    `appVersion: ${sanitizeString(input.appVersion)}`,
    `surface: ${sanitizeString(input.surface)}`,
    `operation: ${sanitizeString(input.operation)}`,
    `stage: ${sanitizeString(input.stage)}`,
    `visibleSummary: ${sanitizeString(input.summary)}`,
    "",
    "Request",
    `method: ${request?.method ?? "unavailable"}`,
    `path: ${request?.path ?? "unavailable"}`,
    `httpStatus: ${request?.status ?? "unavailable"}`,
    "",
    "Runtime",
    json(browserRuntimeContext()),
    "",
    "Underlying error (sanitized)",
    json(sanitizeDiagnosticValue(input.error)),
  ].join("\n");
  return report.length > MAX_DIAGNOSTIC_OUTPUT_LENGTH
    ? `${report.slice(0, MAX_DIAGNOSTIC_OUTPUT_LENGTH - 14)}… [truncated]`
    : report;
}

export async function writeDiagnosticClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // A user gesture can still permit the legacy path on LAN HTTP.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard copy command failed.");
    }
  } finally {
    textarea.remove();
  }
}

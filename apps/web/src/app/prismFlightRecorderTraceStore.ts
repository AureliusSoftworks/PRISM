export type PrismFlightEventLevel = "info" | "warn" | "error";

export type PrismFlightEvent = Readonly<{
  at: string;
  area: string;
  name: string;
  level: PrismFlightEventLevel;
  detail: Readonly<Record<string, string | number | boolean>>;
}>;

const MAX_EVENTS = 480;
const PRIVATE_KEY = /(?:prompt|message|content|memory|secret|token|credential|password|audio|transcript|cookie|key|body)/iu;
const SAFE_VALUE = /^[a-zA-Z0-9_.:-]{1,120}$/u;
const listeners = new Set<() => void>();
let events: readonly PrismFlightEvent[] = [];

function safeText(value: unknown, max = 120): string | number | boolean | null {
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\\r\\n]+/gu, " ").trim().slice(0, max);
  // Detail strings are diagnostic identifiers/states, never free text. Drop
  // anything that could be authored content rather than trying to redact it.
  return SAFE_VALUE.test(normalized) ? normalized : null;
}

/** Records bounded, content-free local telemetry. It is never persisted or sent automatically. */
export function recordPrismFlightEvent(input: {
  area: string;
  name: string;
  level?: PrismFlightEventLevel;
  detail?: Record<string, unknown>;
}): void {
  const detail: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input.detail ?? {})) {
    if (PRIVATE_KEY.test(key)) continue;
    const safe = safeText(value);
    if (safe !== null && safe !== "") detail[key.slice(0, 48)] = safe;
  }
  events = [...events, {
    at: new Date().toISOString(),
    area: input.area.replace(/[^a-z0-9_-]/giu, "").slice(0, 32) || "runtime",
    name: input.name.replace(/[^a-z0-9_.-]/giu, "").slice(0, 64) || "event",
    level: input.level ?? "info",
    detail,
  }].slice(-MAX_EVENTS);
  for (const listener of listeners) listener();
}

export function clearPrismFlightEvents(): void {
  events = [];
  for (const listener of listeners) listener();
}

export function getPrismFlightEvents(): readonly PrismFlightEvent[] { return events; }
export function subscribePrismFlightEvents(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function buildPrismFlightTrace(items = events): string {
  return [
    "PRISM Flight Recorder",
    "Privacy: local, per-session, content-free telemetry. No prompts, messages, memories, credentials, raw audio, or hidden reasoning.",
    `Captured: ${new Date().toISOString()}`,
    `Events: ${items.length}`,
    "",
    ...items.map((event) => {
      const detail = Object.entries(event.detail).map(([key, value]) => `${key}=${String(value)}`).join(" ");
      return `${event.at} [${event.level.toUpperCase()}] ${event.area}.${event.name}${detail ? ` ${detail}` : ""}`;
    }),
  ].join("\n");
}

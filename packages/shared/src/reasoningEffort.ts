export const REASONING_EFFORT_VALUES = [
  "auto",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORT_VALUES)[number];
export type RequestReasoningEffort = Exclude<ReasoningEffort, "auto">;

export function normalizeReasoningEffort(value: unknown): ReasoningEffort {
  if (typeof value !== "string") return "auto";
  const normalized = value.trim().toLowerCase();
  return (REASONING_EFFORT_VALUES as readonly string[]).includes(normalized)
    ? (normalized as ReasoningEffort)
    : "auto";
}

export function reasoningEffortForRequest(
  value: unknown
): RequestReasoningEffort | null {
  const normalized = normalizeReasoningEffort(value);
  return normalized === "auto" ? null : normalized;
}

export function openAiModelSupportsReasoningEffort(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("-search-api")) return false;
  if (normalized.endsWith("-chat-latest")) return false;
  if (/^(?:o1|o3|o4|o5)(?:-|$)/.test(normalized)) return true;
  return normalized.startsWith("gpt-5");
}

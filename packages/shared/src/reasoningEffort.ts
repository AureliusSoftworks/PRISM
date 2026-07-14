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
export type RequestReasoningEffort = Exclude<ReasoningEffort, "auto" | "none">;
export type NativeReasoningEffortProvider = "local" | "openai" | "anthropic";
export type AnthropicRequestReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

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
  return normalized === "auto" || normalized === "none" ? null : normalized;
}

export function openAiModelSupportsReasoningEffort(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("-search-api")) return false;
  if (normalized.endsWith("-chat-latest")) return false;
  if (/^(?:o1|o3|o4|o5)(?:-|$)/.test(normalized)) return true;
  return normalized.startsWith("gpt-5");
}

type AnthropicModelVersion = {
  family: string;
  major: number;
  minor: number;
};

function anthropicModelVersion(modelId: string): AnthropicModelVersion | null {
  const normalized = modelId.trim().toLowerCase();
  const match = normalized.match(
    /^claude-([a-z0-9]+)-(\d+)(?:-(\d+))?(?:-\d{8})?$/
  );
  if (!match) return null;
  return {
    family: match[1] ?? "",
    major: Number(match[2]),
    minor: Number(match[3] ?? 0),
  };
}

export function anthropicModelSupportsReasoningEffort(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  if (normalized === "claude-mythos-preview") return true;
  const model = anthropicModelVersion(normalized);
  if (!model) return false;
  if (model.family === "opus") {
    return model.major > 4 || (model.major === 4 && model.minor >= 5);
  }
  if (model.family === "sonnet") {
    return model.major > 4 || (model.major === 4 && model.minor >= 6);
  }
  return (
    (model.family === "fable" || model.family === "mythos") &&
    model.major >= 5
  );
}

function anthropicModelSupportsXHighReasoningEffort(modelId: string): boolean {
  const model = anthropicModelVersion(modelId);
  if (!model) return false;
  if (model.family === "opus") {
    return model.major > 4 || (model.major === 4 && model.minor >= 7);
  }
  if (model.family === "sonnet") return model.major >= 5;
  return (
    (model.family === "fable" || model.family === "mythos") &&
    model.major >= 5
  );
}

function anthropicModelSupportsMaxReasoningEffort(modelId: string): boolean {
  if (!anthropicModelSupportsReasoningEffort(modelId)) return false;
  const model = anthropicModelVersion(modelId);
  return !(
    model?.family === "opus" &&
    model.major === 4 &&
    model.minor === 5
  );
}

export function modelSupportsNativeReasoningEffort(
  provider: NativeReasoningEffortProvider,
  modelId: string
): boolean {
  if (provider === "openai") return openAiModelSupportsReasoningEffort(modelId);
  if (provider === "anthropic") return anthropicModelSupportsReasoningEffort(modelId);
  return false;
}

export function anthropicReasoningEffortForRequest(
  modelId: string,
  value: unknown
): AnthropicRequestReasoningEffort | null {
  if (!anthropicModelSupportsReasoningEffort(modelId)) return null;
  const effort = reasoningEffortForRequest(value);
  if (!effort) return null;
  if (effort === "minimal") return "low";
  if (effort !== "xhigh") return effort;
  if (anthropicModelSupportsXHighReasoningEffort(modelId)) return "xhigh";
  if (anthropicModelSupportsMaxReasoningEffort(modelId)) return "max";
  return "high";
}

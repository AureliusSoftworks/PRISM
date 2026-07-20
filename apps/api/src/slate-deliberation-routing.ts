import type {
  SlateAiProvider,
  SlateDeliberationSpeaker,
  SlateProseMode,
} from "@localai/shared";

export interface SlateDeliberationModelOverride {
  provider: SlateAiProvider;
  model: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function resolveSlateDeliberationModelOverride(
  rawConfig: string,
  speaker: SlateDeliberationSpeaker,
  mode: SlateProseMode,
): SlateDeliberationModelOverride | null {
  if (speaker === "synthesis") return null;
  try {
    const config = record(JSON.parse(rawConfig));
    const hemisphere = record(config?.[speaker]);
    const provider =
      hemisphere?.provider === "local" ||
      hemisphere?.provider === "openai" ||
      hemisphere?.provider === "anthropic"
        ? hemisphere.provider
        : null;
    const model =
      typeof hemisphere?.model === "string" && hemisphere.model.trim()
        ? hemisphere.model.trim()
        : null;
    const routeIsCompatible =
      mode === "auto" ||
      (mode === "offline" && provider === "local") ||
      (mode === "online" && provider !== "local");
    return provider && model && routeIsCompatible ? { provider, model } : null;
  } catch {
    return null;
  }
}

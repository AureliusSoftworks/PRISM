export const TEXT_MODEL_DISPLAY_NAME_MAX_LENGTH = 80;
export const TEXT_MODEL_DISPLAY_NAME_MAX_ENTRIES = 200;

export type TextModelProvider = "local" | "ollama_cloud" | "openai" | "anthropic";
export type TextModelDisplayNames = Record<string, string>;

function isTextModelProvider(value: string): value is TextModelProvider {
  return (
    value === "local" ||
    value === "ollama_cloud" ||
    value === "openai" ||
    value === "anthropic"
  );
}

/**
 * Provider/model IDs remain the routing identity. This key is only an
 * account-local presentation lookup, so two providers may name the same ID.
 */
export function textModelDisplayNameKey(
  provider: TextModelProvider,
  modelId: string,
): string {
  return `${provider}:${modelId.trim()}`;
}

export function normalizeTextModelDisplayNames(
  value: unknown,
): TextModelDisplayNames {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries: Array<[string, string]> = [];
  for (const [key, rawName] of Object.entries(value as Record<string, unknown>)) {
    const separator = key.indexOf(":");
    const provider = key.slice(0, separator);
    const modelId = key.slice(separator + 1).trim();
    if (
      separator <= 0 ||
      !isTextModelProvider(provider) ||
      !modelId ||
      modelId.length > 240 ||
      typeof rawName !== "string"
    ) {
      continue;
    }
    const name = rawName.trim().replace(/\s+/gu, " ");
    if (
      !name ||
      name.length > TEXT_MODEL_DISPLAY_NAME_MAX_LENGTH ||
      /[\p{Cc}\p{Cf}]/u.test(name)
    ) {
      continue;
    }
    entries.push([textModelDisplayNameKey(provider, modelId), name]);
    if (entries.length === TEXT_MODEL_DISPLAY_NAME_MAX_ENTRIES) break;
  }
  return Object.fromEntries(entries);
}

export function parseStoredTextModelDisplayNames(
  value: string | null | undefined,
): TextModelDisplayNames {
  if (!value) return {};
  try {
    return normalizeTextModelDisplayNames(JSON.parse(value));
  } catch {
    return {};
  }
}

export function resolveTextModelDisplayName(args: {
  displayNames: TextModelDisplayNames | null | undefined;
  provider: TextModelProvider;
  modelId: string;
  fallback: string;
}): string {
  return (
    args.displayNames?.[textModelDisplayNameKey(args.provider, args.modelId)] ??
    args.fallback
  );
}

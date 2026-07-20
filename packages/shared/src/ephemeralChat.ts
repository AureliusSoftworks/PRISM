export const EPHEMERAL_CHAT_MODE_IDS = [
  "chat",
  "zen",
  "coffee",
  "botcast",
  "slate",
] as const;

export type EphemeralChatModeId = (typeof EPHEMERAL_CHAT_MODE_IDS)[number];

export const EPHEMERAL_CHAT_PROVIDER_PREFERENCES = [
  "global",
  "local",
  "online",
] as const;

export type EphemeralChatProviderPreference =
  (typeof EPHEMERAL_CHAT_PROVIDER_PREFERENCES)[number];

export type EphemeralChatProviderPreferences = Record<
  EphemeralChatModeId,
  EphemeralChatProviderPreference
>;

export type EphemeralChatResolvedProvider =
  | "local"
  | "openai"
  | "anthropic";

export function defaultEphemeralChatProviderPreferences(): EphemeralChatProviderPreferences {
  return {
    chat: "global",
    zen: "global",
    coffee: "global",
    botcast: "global",
    slate: "global",
  };
}

export function isEphemeralChatProviderPreference(
  value: unknown,
): value is EphemeralChatProviderPreference {
  return EPHEMERAL_CHAT_PROVIDER_PREFERENCES.some(
    (preference) => preference === value,
  );
}

export function normalizeEphemeralChatProviderPreferences(
  value: unknown,
): EphemeralChatProviderPreferences {
  let source: unknown = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = null;
    }
  }
  const record =
    source && typeof source === "object" && !Array.isArray(source)
      ? (source as Record<string, unknown>)
      : {};
  const normalized = defaultEphemeralChatProviderPreferences();
  for (const mode of EPHEMERAL_CHAT_MODE_IDS) {
    if (isEphemeralChatProviderPreference(record[mode])) {
      normalized[mode] = record[mode];
    }
  }
  return normalized;
}

export function resolveEphemeralChatProvider(options: {
  preference: EphemeralChatProviderPreference;
  globalProvider: EphemeralChatResolvedProvider;
  onlineProvider: Exclude<EphemeralChatResolvedProvider, "local">;
}): EphemeralChatResolvedProvider {
  if (options.preference === "local") return "local";
  if (options.preference === "online") {
    return options.globalProvider === "local" ? "local" : options.onlineProvider;
  }
  return options.globalProvider;
}

export type ModeAwareTextModelProvider = "local" | "openai" | "anthropic";
export type ModeAwareResponseMode = "local" | "auto" | "online";

export interface ModeAwareModelOption {
  provider: ModeAwareTextModelProvider;
  disabledReason?: string;
}

export const LOCAL_MODE_ONLINE_MODEL_DISABLED_REASON =
  "Switch to AUTO or ONLINE to use this model.";
export const ONLINE_MODE_LOCAL_MODEL_DISABLED_REASON =
  "Switch to LOCAL or AUTO to use this model.";

/**
 * Keeps every Settings-visible model in every routing picker. Provider or
 * discovery failures remain authoritative; routing mode only disables the
 * opposite lane instead of hiding it.
 */
export function modeAwareModelOptions<T extends ModeAwareModelOption>(args: {
  local: readonly T[];
  online: readonly T[];
  responseMode: ModeAwareResponseMode;
}): T[] {
  return [...args.local, ...args.online].map((model) => {
    if (model.disabledReason) return model;
    if (args.responseMode === "local" && model.provider !== "local") {
      return {
        ...model,
        disabledReason: LOCAL_MODE_ONLINE_MODEL_DISABLED_REASON,
      };
    }
    if (args.responseMode === "online" && model.provider === "local") {
      return {
        ...model,
        disabledReason: ONLINE_MODE_LOCAL_MODEL_DISABLED_REASON,
      };
    }
    return model;
  });
}

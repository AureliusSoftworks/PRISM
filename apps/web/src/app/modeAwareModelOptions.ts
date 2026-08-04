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
 * Contextual Auto is a model choice, not a privacy lane. Routing pickers only
 * list models that can actually run inside the active LOCAL or ONLINE lane.
 */
export function modeAwareModelOptions<T extends ModeAwareModelOption>(args: {
  local: readonly T[];
  online: readonly T[];
  responseMode: ModeAwareResponseMode;
}): T[] {
  if (args.responseMode === "local") return [...args.local];
  if (args.responseMode === "online") return [...args.online];
  return [...args.local, ...args.online];
}

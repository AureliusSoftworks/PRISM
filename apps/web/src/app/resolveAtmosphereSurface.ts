export type AtmospherePresentation = "chat" | "zen";

export type AtmosphereSurface =
  | "prism"
  | "homeBot"
  | "zenConversation"
  | "none";

export type ResolveAtmosphereSurfaceArgs = {
  presentation: AtmospherePresentation;
  /** True when Prism / all-bots new-session hero is showing (no focused bot). */
  prismSession: boolean;
  focusedBotId: string | null;
  prismAtmosphereEnabled: boolean;
  prismAtmosphereImageId: string | null;
};

/**
 * Hard-separates wallpaper surfaces:
 * - Collapsed Chat / transcript home (any bot focus) → CSS gradient only
 * - Immersive Zen all-bots home → CSS gradient only
 * - Immersive Zen persona / conversation → Zen conversation atmospheres
 *
 * Shared Home hub wallpaper may still generate for Settings, but it is not
 * mounted on collapsed Chat/Zen home — detailed rooms are for Zen.
 * `prism` / `homeBot` remain in the union for older callers and cleanup refs.
 */
export function resolveAtmosphereSurface(
  args: ResolveAtmosphereSurfaceArgs,
): AtmosphereSurface {
  // Collapsed Chat / transcript home: gradient plate only for every bot.
  if (args.presentation === "chat") {
    return "none";
  }

  // Immersive Zen: detailed atmospheres only once a persona/conversation is open.
  return args.prismSession ? "none" : "zenConversation";
}

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
 * - Prism / all-bots → full-color shared Home wallpaper
 * - Chat / collapsed Zen + focused bot → same Home wallpaper (tinted in UI)
 * - Expanded Zen → Zen conversation atmospheres only
 *
 * Home uses one shared hub atmosphere image. Bot focus does not select a
 * per-bot daily scene; the UI desaturates and color-blends instead.
 */
export function resolveAtmosphereSurface(
  args: ResolveAtmosphereSurfaceArgs,
): AtmosphereSurface {
  if (args.presentation === "zen") {
    return args.prismSession ? "none" : "zenConversation";
  }

  if (!args.prismAtmosphereEnabled || !args.prismAtmosphereImageId) {
    return "none";
  }

  // presentation === "chat" (SMS Chat or collapsed Zen)
  if (args.prismSession || !args.focusedBotId) {
    return "prism";
  }

  return "homeBot";
}

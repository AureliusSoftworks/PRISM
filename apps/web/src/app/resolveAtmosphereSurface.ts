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
 * Chat and Zen are two presentations of the same conversation room, so a
 * focused conversation resolves to the same Atmosphere in either view. The
 * all-bots new-session Home remains on its gradient plate.
 *
 * `prism` / `homeBot` remain in the union for older callers and cleanup refs.
 */
export function resolveAtmosphereSurface(
  args: ResolveAtmosphereSurfaceArgs,
): AtmosphereSurface {
  // Presentation changes layout, not the room the conversation belongs to.
  return args.prismSession ? "none" : "zenConversation";
}

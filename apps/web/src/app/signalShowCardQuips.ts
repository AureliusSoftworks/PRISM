import type { BotcastShow } from "@localai/shared";

type SignalShowCardQuipContext = Pick<BotcastShow, "episodeCount" | "name">;

/**
 * Local copy used until Signal can generate show-specific host commentary.
 * Keep the four-line tuple explicit so the dashboard always has a complete fallback rotation.
 */
export function fallbackSignalShowCardQuips(
  show: SignalShowCardQuipContext,
): readonly [string, string, string, string] {
  return [
    "The mic is warm. My opinions are warmer.",
    "Guest chair’s open. Bring me someone interesting.",
    `${show.name} is between episodes. I’m between opinions.`,
    show.episodeCount > 0
      ? `Episode ${show.episodeCount + 1}: now with 12% more dramatic pause.`
      : "The pilot is ready. No pressure. Cameras love pressure.",
  ];
}

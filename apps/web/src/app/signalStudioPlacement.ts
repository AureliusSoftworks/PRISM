import {
  normalizeBotcastStudioLayout,
  type BotcastSpeakerRole,
  type BotcastStudioLayout,
  type BotcastStudioLayoutItem,
} from "@localai/shared";

export const SIGNAL_STUDIO_VOICE_MAX_PAN = 0.18;

export function signalStudioPlacementStyle(
  layout: BotcastStudioLayout | null | undefined,
  item: BotcastStudioLayoutItem,
): { left: string; top: string } {
  const point = normalizeBotcastStudioLayout(layout)[item];
  return {
    left: `${point.x}%`,
    top: `${point.y}%`,
  };
}

/**
 * Maps the saved on-screen seat to restrained stereo staging. The full
 * left/right range intentionally stays narrow so Signal remains intelligible
 * on speakers and collapses cleanly to mono.
 */
export function signalStudioVoicePan(
  layout: BotcastStudioLayout | null | undefined,
  role: BotcastSpeakerRole,
): number {
  const point = normalizeBotcastStudioLayout(layout)[
    role === "host" ? "hostBot" : "guestBot"
  ];
  const normalizedFromCenter = Math.max(-1, Math.min(1, (point.x - 50) / 40));
  return Math.round(normalizedFromCenter * SIGNAL_STUDIO_VOICE_MAX_PAN * 1_000) /
    1_000;
}

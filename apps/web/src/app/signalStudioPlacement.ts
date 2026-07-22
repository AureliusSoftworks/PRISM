import {
  BOTCAST_STUDIO_FLOOR_GLOW_SCALE_MAX,
  normalizeBotcastStudioLayout,
  type BotcastSpeakerRole,
  type BotcastStudioLayout,
  type BotcastStudioLayoutItem,
} from "@localai/shared";

export const SIGNAL_STUDIO_VOICE_MAX_PAN = 0.18;
export const SIGNAL_STUDIO_ARTWORK_OVERSCAN_PERCENT = 5;
export const SIGNAL_STUDIO_FLOOR_GLOW_MAX_WIDTH_PERCENT = 26;
export const SIGNAL_STUDIO_FLOOR_GLOW_MAX_HEIGHT_PERCENT = 8.5;

type SignalStudioFloorGlowItem = "hostFloorGlow" | "guestFloorGlow";

function signalStudioPercent(value: number): string {
  return `${Math.round(value * 10_000) / 10_000}%`;
}

/**
 * The studio artwork and receiver matte share a 5% overscanned canvas. Convert
 * a stage-space point so the light emitter remains centered on the visible bot
 * after that larger canvas is cropped by the viewport.
 */
export function signalStudioOverscanCoordinate(value: number): number {
  const overscan = SIGNAL_STUDIO_ARTWORK_OVERSCAN_PERCENT;
  const projected = (value + overscan) / (1 + (overscan * 2) / 100);
  return Math.round(projected * 10_000) / 10_000;
}

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

/** Keeps the editor hit target at the saved on-screen point and footprint. */
export function signalStudioFloorGlowHandleStyle(
  layout: BotcastStudioLayout | null | undefined,
  item: SignalStudioFloorGlowItem,
): { left: string; top: string; width: string; height: string } {
  const point = normalizeBotcastStudioLayout(layout)[item];
  const scale = point.scale ?? BOTCAST_STUDIO_FLOOR_GLOW_SCALE_MAX;
  return {
    left: `${point.x}%`,
    top: `${point.y}%`,
    width: signalStudioPercent(
      SIGNAL_STUDIO_FLOOR_GLOW_MAX_WIDTH_PERCENT * scale,
    ),
    height: signalStudioPercent(
      SIGNAL_STUDIO_FLOOR_GLOW_MAX_HEIGHT_PERCENT * scale,
    ),
  };
}

/**
 * Projects a floor glow into the same 5%-overscanned canvas as the studio
 * receiver matte so masking and visible stage placement stay aligned.
 */
export function signalStudioMaskedFloorGlowStyle(
  layout: BotcastStudioLayout | null | undefined,
  item: SignalStudioFloorGlowItem,
): { left: string; top: string; width: string; height: string } {
  const point = normalizeBotcastStudioLayout(layout)[item];
  const scale = point.scale ?? BOTCAST_STUDIO_FLOOR_GLOW_SCALE_MAX;
  const overscannedCanvasScale =
    1 + (SIGNAL_STUDIO_ARTWORK_OVERSCAN_PERCENT * 2) / 100;
  return {
    left: signalStudioPercent(signalStudioOverscanCoordinate(point.x)),
    top: signalStudioPercent(signalStudioOverscanCoordinate(point.y)),
    width: signalStudioPercent(
      (SIGNAL_STUDIO_FLOOR_GLOW_MAX_WIDTH_PERCENT * scale) /
        overscannedCanvasScale,
    ),
    height: signalStudioPercent(
      (SIGNAL_STUDIO_FLOOR_GLOW_MAX_HEIGHT_PERCENT * scale) /
        overscannedCanvasScale,
    ),
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

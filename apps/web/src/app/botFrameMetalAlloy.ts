import type { BotVoicePreset } from "@localai/shared";

/**
 * Soft chassis alloys keyed by Communication Style. Mixed lightly into the
 * bot-frame tint so bodies read as different metals without overpowering the
 * bot's identity color on LEDs and phosphor ink.
 */
export const BOT_FRAME_METAL_ALLOY_BY_VOICE: Record<BotVoicePreset, string> = {
  neutral: "#B8C0C8", // brushed steel
  warm: "#C4876A", // copper
  concise: "#D0D6DC", // chrome
  playful: "#C9A85C", // brass
  formal: "#A8B2BC", // platinum
  reflective: "#8E9AA6", // pewter
  direct: "#6E747C", // dark iron
};

/** Default wash strength — enough to read as alloy, not costume paint. */
export const BOT_FRAME_METAL_ALLOY_MIX = "26%";

/** Private / neutralized chassis stays on brushed steel. */
export const BOT_FRAME_METAL_ALLOY_PRIVATE = BOT_FRAME_METAL_ALLOY_BY_VOICE.neutral;

export type BotFrameMetalAlloyStyle = Record<`--${string}`, string>;

/**
 * CSS variables for the communication-style metal wash on bot-frame bodies.
 * Pass `enabled: false` for Prism's rainbow chassis so the spectrum stays clean.
 */
export function botFrameMetalAlloyStyle(
  voicePreset: BotVoicePreset | null | undefined = "neutral",
  options: { privateMode?: boolean; enabled?: boolean } = {},
): BotFrameMetalAlloyStyle {
  const enabled = options.enabled !== false;
  if (!enabled) {
    return {
      "--bot-face-metal-alloy-color": BOT_FRAME_METAL_ALLOY_BY_VOICE.neutral,
      "--bot-face-metal-alloy-mix": "0%",
    };
  }
  const preset = voicePreset && voicePreset in BOT_FRAME_METAL_ALLOY_BY_VOICE
    ? voicePreset
    : "neutral";
  const alloy = options.privateMode
    ? BOT_FRAME_METAL_ALLOY_PRIVATE
    : BOT_FRAME_METAL_ALLOY_BY_VOICE[preset];
  return {
    "--bot-face-metal-alloy-color": alloy,
    "--bot-face-metal-alloy-mix": BOT_FRAME_METAL_ALLOY_MIX,
  };
}

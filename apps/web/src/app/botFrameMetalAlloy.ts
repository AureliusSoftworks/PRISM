import type { BotVoicePreset } from "@localai/shared";

/**
 * Low-chroma chassis alloys keyed by the seven Communication Styles. Each hue
 * is an undertone on the authored steel raster, not a replacement metal or
 * identity-color paint pass.
 */
export const BOT_FRAME_METAL_ALLOY_BY_VOICE: Record<BotVoicePreset, string> = {
  neutral: "#AEB8C1", // Balanced — cool brushed steel
  warm: "#B59D92", // Warm — rose-bronze steel
  concise: "#C3C9CE", // Concise — clean silver steel
  playful: "#B7AA8B", // Playful — champagne steel
  formal: "#ABB2B8", // Formal — restrained platinum
  reflective: "#939CA6", // Reflective — slate pewter
  direct: "#7C8389", // Direct — dark gunmetal
};

/** Talking wash strength — enough to read as alloy, not costume paint. */
export const BOT_FRAME_METAL_ALLOY_MIX = "26%";

/** Idle alloy is legible, but the authored steel texture remains dominant. */
export const BOT_FRAME_METAL_ALLOY_IDLE_MIX = "42%";

/**
 * Unlit LED bulb fill. Sits above alloy/metal so idle flasks read as dark glass
 * instead of white, alloy-tinted, or accent-glowing.
 */
export const BOT_FRAME_LED_UNLIT_COLOR = "#3A3F46";

/** Private / neutralized chassis stays on brushed steel. */
export const BOT_FRAME_METAL_ALLOY_PRIVATE = BOT_FRAME_METAL_ALLOY_BY_VOICE.neutral;

export type BotFrameMetalAlloyStyle = Record<`--${string}`, string>;

export type BotFrameMetalAlloyOptions = {
  privateMode?: boolean;
  enabled?: boolean;
};

/**
 * Resolve the Communication Style alloy hex for a voice preset.
 */
export function botFrameMetalAlloyColor(
  voicePreset: BotVoicePreset | null | undefined = "neutral",
  options: BotFrameMetalAlloyOptions = {},
): string {
  if (options.enabled === false) {
    return BOT_FRAME_METAL_ALLOY_BY_VOICE.neutral;
  }
  if (options.privateMode) {
    return BOT_FRAME_METAL_ALLOY_PRIVATE;
  }
  const preset =
    voicePreset && voicePreset in BOT_FRAME_METAL_ALLOY_BY_VOICE
      ? voicePreset
      : "neutral";
  return BOT_FRAME_METAL_ALLOY_BY_VOICE[preset];
}

/**
 * CSS variables for the communication-style metal wash on bot-frame bodies.
 * Pass `enabled: false` for Default Prism. Its authored chassis stays raw;
 * the spectrum is owned by the separate LED/emitter mask.
 * Idle vs talking mix is applied in CSS / paint selection; this default is the
 * talking wash so non-live surfaces keep a light alloy read.
 */
export function botFrameMetalAlloyStyle(
  voicePreset: BotVoicePreset | null | undefined = "neutral",
  options: BotFrameMetalAlloyOptions = {},
): BotFrameMetalAlloyStyle {
  const enabled = options.enabled !== false;
  if (!enabled) {
    return {
      "--bot-face-metal-alloy-color": BOT_FRAME_METAL_ALLOY_BY_VOICE.neutral,
      "--bot-face-metal-alloy-mix": "0%",
      "--bot-face-metal-alloy-idle-mix": "0%",
      "--bot-face-frame-led-unlit-color": BOT_FRAME_LED_UNLIT_COLOR,
    };
  }
  return {
    "--bot-face-metal-alloy-color": botFrameMetalAlloyColor(voicePreset, options),
    "--bot-face-metal-alloy-mix": BOT_FRAME_METAL_ALLOY_MIX,
    "--bot-face-metal-alloy-idle-mix": BOT_FRAME_METAL_ALLOY_IDLE_MIX,
    "--bot-face-frame-led-unlit-color": BOT_FRAME_LED_UNLIT_COLOR,
  };
}

/**
 * Choose the baked tint-mask color: accent while talking, Communication Style
 * alloy while silent. Idle CSS hides that glow mask and shows the softer alloy
 * chassis layer below it. A no-alloy caller may still request explicit accent
 * paint; Default Prism passes no accent and keeps this chassis layer hidden.
 */
export function botFrameIdentityPaintColor(options: {
  isTalking: boolean;
  accentColor: string | null | undefined;
  voicePreset?: BotVoicePreset | null;
  privateMode?: boolean;
  metalAlloyEnabled?: boolean;
}): string | null {
  const accent = typeof options.accentColor === "string"
    ? options.accentColor.trim()
    : "";
  if (!accent) return null;
  if (options.isTalking || options.metalAlloyEnabled === false) {
    return accent;
  }
  return botFrameMetalAlloyColor(options.voicePreset, {
    privateMode: options.privateMode === true,
    enabled: true,
  });
}

/**
 * Choose the baked LED bulb paint: accent while talking, dark-gray unlit glass
 * while silent. Always returns a concrete color so unlit bulbs stay opaque above
 * the alloy chassis.
 */
export function botFrameLedPaintColor(options: {
  isTalking: boolean;
  accentColor: string | null | undefined;
}): string {
  if (!options.isTalking) return BOT_FRAME_LED_UNLIT_COLOR;
  const accent =
    typeof options.accentColor === "string" ? options.accentColor.trim() : "";
  return accent || BOT_FRAME_LED_UNLIT_COLOR;
}

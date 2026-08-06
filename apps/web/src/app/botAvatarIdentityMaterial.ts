import type { BotVoicePreset } from "@localai/shared";

import { botFrameMetalAlloyStyle } from "./botFrameMetalAlloy.ts";

export type BotAvatarIdentityMaterialStyle = Record<`--${string}`, string>;

const PRIVATE_AVATAR_INK = "#e8eee8";

export interface BotAvatarIdentityMaterialOptions {
  privateMode?: boolean;
  /** Communication Style → soft metal alloy wash on the chassis. */
  voicePreset?: BotVoicePreset | null;
  /** Disable alloy wash (Prism rainbow chassis). */
  metalAlloyEnabled?: boolean;
}

/**
 * Shared material variables for persona avatars in both Avatar Studio and
 * live Chat/Zen. Keep identity color on normal alpha-composited layers so the
 * result stays consistent in Chromium and the macOS Tauri WebKit renderer.
 * Communication Style adds a soft metal-alloy wash on the frame body only;
 * LEDs and phosphor ink stay on the identity color.
 */
export function botAvatarIdentityMaterialStyle(
  privateModeOrOptions: boolean | BotAvatarIdentityMaterialOptions = false,
): BotAvatarIdentityMaterialStyle {
  const options: BotAvatarIdentityMaterialOptions =
    typeof privateModeOrOptions === "boolean"
      ? { privateMode: privateModeOrOptions }
      : privateModeOrOptions;
  const privateMode = options.privateMode === true;
  const identityColor = privateMode
    ? PRIVATE_AVATAR_INK
    : "var(--coffee-bot-color)";
  const phosphorInk = privateMode ? PRIVATE_AVATAR_INK : "#ffffff";

  return {
    "--zen-live-bot-frame-tint-color": identityColor,
    "--bot-face-frame-led-color": identityColor,
    "--zen-live-bot-face-phosphor-ink": phosphorInk,
    "--zen-live-bot-face-ink": identityColor,
    "--zen-live-bot-glyph-ink": "var(--zen-live-bot-face-phosphor-ink)",
    ...botFrameMetalAlloyStyle(options.voicePreset, {
      privateMode,
      enabled: options.metalAlloyEnabled,
    }),
  };
}

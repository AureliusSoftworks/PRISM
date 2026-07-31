export type BotAvatarIdentityMaterialStyle = Record<`--${string}`, string>;

const PRIVATE_AVATAR_INK = "#e8eee8";

/**
 * Shared material variables for persona avatars in both Avatar Studio and
 * live Chat/Zen. Keep identity color on normal alpha-composited layers so the
 * result stays consistent in Chromium and the macOS Tauri WebKit renderer.
 */
export function botAvatarIdentityMaterialStyle(
  privateMode = false,
): BotAvatarIdentityMaterialStyle {
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
  };
}

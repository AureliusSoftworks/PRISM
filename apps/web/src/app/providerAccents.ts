/**
 * Canonical API-provider accent colors for Prism UI chrome.
 *
 * OpenAI has no singular official brand color, so Prism uses the hue-inverse
 * of Anthropic terracotta for a stable complementary pair. ElevenLabs is
 * officially mono; Prism invents a warm-ink accent for list/status chrome.
 */

export const PROVIDER_ACCENT_OPENAI = "#57b9d9";
export const PROVIDER_ACCENT_ANTHROPIC = "#d97757";
export const PROVIDER_ACCENT_LOCAL = "#68e6a6";
export const PROVIDER_ACCENT_ELEVENLABS = "#777169";
/** Slightly lifted ElevenLabs ink for dark surfaces. */
export const PROVIDER_ACCENT_ELEVENLABS_ON_DARK = "#b8b2aa";

export type ProviderAccentId =
  | "openai"
  | "anthropic"
  | "local"
  | "elevenlabs";

export function providerAccentHex(
  provider: ProviderAccentId,
  options?: { onDark?: boolean },
): string {
  switch (provider) {
    case "openai":
      return PROVIDER_ACCENT_OPENAI;
    case "anthropic":
      return PROVIDER_ACCENT_ANTHROPIC;
    case "local":
      return PROVIDER_ACCENT_LOCAL;
    case "elevenlabs":
      return options?.onDark
        ? PROVIDER_ACCENT_ELEVENLABS_ON_DARK
        : PROVIDER_ACCENT_ELEVENLABS;
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

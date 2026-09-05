import { normalizeBotIdentityColor } from "@localai/shared";

export type DebateForumAccentRole = "for" | "moderator" | "against";

export const DEBATE_FORUM_ACCENT_KEY_SOURCE = {
  backdrop: "/debate/forum-accent-keys.png",
  foreground: "/debate/forum-accent-keys-foreground.png",
} as const;

/**
 * Exact authoring keys used only inside the Forum accent-source rasters.
 * Visible layers replace these pixels before the canvas is presented.
 */
export const DEBATE_FORUM_ACCENT_KEY_RGB: Record<
  DebateForumAccentRole,
  readonly [red: number, green: number, blue: number]
> = {
  for: [255, 0, 0],
  moderator: [0, 255, 0],
  against: [0, 0, 255],
};

export const DEBATE_FORUM_ACCENT_FALLBACK_COLOR: Record<
  DebateForumAccentRole,
  string
> = {
  for: "#42d9ff",
  moderator: "#d9d2ff",
  against: "#ff5f8f",
};

export function normalizedDebateForumAccentColor(
  value: unknown,
  role: DebateForumAccentRole,
): string {
  return (
    normalizeBotIdentityColor(value) ??
    DEBATE_FORUM_ACCENT_FALLBACK_COLOR[role]
  );
}

function fullHexRgb(value: string): readonly [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

export function renderDebateForumAccentPixels(
  source: Uint8ClampedArray,
  colors: Record<DebateForumAccentRole, unknown>,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source.length);
  const tints: Record<
    DebateForumAccentRole,
    readonly [number, number, number]
  > = {
    for: fullHexRgb(normalizedDebateForumAccentColor(colors.for, "for")),
    moderator: fullHexRgb(
      normalizedDebateForumAccentColor(colors.moderator, "moderator"),
    ),
    against: fullHexRgb(
      normalizedDebateForumAccentColor(colors.against, "against"),
    ),
  };

  for (let offset = 0; offset < source.length; offset += 4) {
    const alpha = source[offset + 3] ?? 0;
    if (alpha === 0) continue;
    const red = source[offset] ?? 0;
    const green = source[offset + 1] ?? 0;
    const blue = source[offset + 2] ?? 0;
    // The installed room mask blends neighboring keys at their boundaries.
    // Remove neutral content, then retain the authored RGB ownership weights.
    const neutral = Math.min(red, green, blue);
    const forWeight = red - neutral;
    const moderatorWeight = green - neutral;
    const againstWeight = blue - neutral;
    const total = forWeight + moderatorWeight + againstWeight;
    if (total === 0) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      output[offset + channel] =
        (tints.for[channel]! * forWeight +
          tints.moderator[channel]! * moderatorWeight +
          tints.against[channel]! * againstWeight) /
        total;
    }
    output[offset + 3] = alpha;
  }

  return output;
}

/**
 * Extract one role from an exact-key source and tint it with that seated bot's
 * normalized identity color. Other authoring keys become transparent, so raw
 * red/green/blue key pixels never reach the visible Forum canvas.
 */
export function renderDebateForumAccentRolePixels(
  source: Uint8ClampedArray,
  role: DebateForumAccentRole,
  color: unknown,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source.length);
  const key = DEBATE_FORUM_ACCENT_KEY_RGB[role];
  const tint = fullHexRgb(normalizedDebateForumAccentColor(color, role));

  for (let offset = 0; offset < source.length; offset += 4) {
    const alpha = source[offset + 3] ?? 0;
    if (
      alpha === 0 ||
      source[offset] !== key[0] ||
      source[offset + 1] !== key[1] ||
      source[offset + 2] !== key[2]
    ) {
      continue;
    }
    output[offset] = tint[0];
    output[offset + 1] = tint[1];
    output[offset + 2] = tint[2];
    output[offset + 3] = alpha;
  }

  return output;
}

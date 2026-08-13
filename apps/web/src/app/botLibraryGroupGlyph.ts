import { createElement, type CSSProperties, type ReactElement } from "react";

export const BOT_LIBRARY_GROUP_GLYPH_VERSION = 1 as const;

export interface BotLibraryGroupGlyphIdentity {
  version: typeof BOT_LIBRARY_GROUP_GLYPH_VERSION;
  seed: string;
}

export interface BotLibraryGroupGlyphProps {
  groupId: string;
  glyph?: BotLibraryGroupGlyphIdentity | null;
  className?: string;
  style?: CSSProperties;
  size?: number | string;
}

export interface BotLibraryGroupGlyphTriangle {
  points: string;
  opacity: number;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unit(seed: string): number {
  return hashSeed(seed) / 0xffffffff;
}

export function normalizeBotLibraryGroupGlyphIdentity(
  value: unknown,
): BotLibraryGroupGlyphIdentity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<BotLibraryGroupGlyphIdentity>;
  if (
    record.version !== BOT_LIBRARY_GROUP_GLYPH_VERSION ||
    typeof record.seed !== "string"
  ) {
    return null;
  }
  const seed = record.seed.trim().slice(0, 160);
  return seed ? { version: BOT_LIBRARY_GROUP_GLYPH_VERSION, seed } : null;
}

/** Old groups retain this stable recipe until the player deliberately rerolls. */
export function resolveBotLibraryGroupGlyphIdentity(
  groupId: string,
  glyph?: BotLibraryGroupGlyphIdentity | null,
): BotLibraryGroupGlyphIdentity {
  return (
    normalizeBotLibraryGroupGlyphIdentity(glyph) ?? {
      version: BOT_LIBRARY_GROUP_GLYPH_VERSION,
      seed: `legacy-group:${groupId}`,
    }
  );
}

export function createBotLibraryGroupGlyphIdentity(
  groupId: string,
): BotLibraryGroupGlyphIdentity {
  return {
    version: BOT_LIBRARY_GROUP_GLYPH_VERSION,
    seed: `group:${groupId}:identity`,
  };
}

export function rerollBotLibraryGroupGlyphIdentity(
  groupId: string,
  glyph?: BotLibraryGroupGlyphIdentity | null,
): BotLibraryGroupGlyphIdentity {
  const current = resolveBotLibraryGroupGlyphIdentity(groupId, glyph);
  const nextHash = hashSeed(`${current.seed}:${groupId}:next`).toString(36);
  const companionHash = hashSeed(`${groupId}:${current.seed}:companion`).toString(36);
  return {
    version: BOT_LIBRARY_GROUP_GLYPH_VERSION,
    seed: `group:${groupId}:reroll:${nextHash}:${companionHash}`.slice(0, 160),
  };
}

export function botLibraryGroupGlyphTriangles(
  groupId: string,
  glyph?: BotLibraryGroupGlyphIdentity | null,
): readonly BotLibraryGroupGlyphTriangle[] {
  const identity = resolveBotLibraryGroupGlyphIdentity(groupId, glyph);
  const seed = `${identity.version}:${identity.seed}`;
  const triangles: BotLibraryGroupGlyphTriangle[] = [];
  const count = 4 + Math.floor(unit(`${seed}:count`) * 3);
  for (let index = 0; index < count; index += 1) {
    const size = 17 + unit(`${seed}:${index}:size`) * 30;
    const x = 50 + (unit(`${seed}:${index}:x`) - 0.5) * (84 - size);
    const y = 50 + (unit(`${seed}:${index}:y`) - 0.5) * (84 - size);
    const rotation = unit(`${seed}:${index}:rotation`) * Math.PI * 2;
    const points = [0, 1, 2]
      .map((corner) => {
        const angle = rotation + (corner * Math.PI * 2) / 3 - Math.PI / 2;
        return `${(x + Math.cos(angle) * size / 2).toFixed(2)},${(
          y + Math.sin(angle) * size / 2
        ).toFixed(2)}`;
      })
      .join(" ");
    triangles.push({
      points,
      opacity: 0.45 + unit(`${seed}:${index}:opacity`) * 0.5,
    });
  }
  return triangles;
}

/** A deliberately tiny SVG vocabulary: every visible mark is a triangle. */
export function BotLibraryGroupGlyph({
  groupId,
  glyph,
  className,
  style,
  size = 24,
}: BotLibraryGroupGlyphProps): ReactElement {
  return createElement(
    "svg",
    {
      className,
      style,
      width: size,
      height: size,
      viewBox: "0 0 100 100",
      fill: "currentColor",
      "aria-hidden": true,
      focusable: "false",
    },
    botLibraryGroupGlyphTriangles(groupId, glyph).map((triangle, index) =>
      createElement("polygon", {
        key: `${triangle.points}:${index}`,
        points: triangle.points,
        opacity: triangle.opacity,
      }),
    ),
  );
}

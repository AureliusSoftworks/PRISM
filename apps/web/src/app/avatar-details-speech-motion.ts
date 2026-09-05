import { AVATAR_DETAILS_CANVAS_SIZE } from "./avatar-details.ts";

export interface AvatarDetailsSpeechMotionOrigin {
  xPct: number;
  yPct: number;
}

/**
 * Keeps Speech ink moving as one authored item instead of orbiting the full
 * CRT canvas. Every motion pivots around the complete item's visual center.
 */
export function avatarDetailsSpeechMotionOrigin(
  rgba: Uint8ClampedArray,
): AvatarDetailsSpeechMotionOrigin | null {
  const expectedLength =
    AVATAR_DETAILS_CANVAS_SIZE * AVATAR_DETAILS_CANVAS_SIZE * 4;
  if (rgba.length !== expectedLength) {
    throw new RangeError(
      `Avatar Details speech pixels must contain ${expectedLength} channels.`,
    );
  }

  let minX = AVATAR_DETAILS_CANVAS_SIZE;
  let minY = AVATAR_DETAILS_CANVAS_SIZE;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < AVATAR_DETAILS_CANVAS_SIZE; y += 1) {
    for (let x = 0; x < AVATAR_DETAILS_CANVAS_SIZE; x += 1) {
      const alpha = rgba[(y * AVATAR_DETAILS_CANVAS_SIZE + x) * 4 + 3] ?? 0;
      if (alpha === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;

  const centerX = (minX + maxX + 1) / 2;
  const centerY = (minY + maxY + 1) / 2;
  return {
    xPct: (centerX / AVATAR_DETAILS_CANVAS_SIZE) * 100,
    yPct: (centerY / AVATAR_DETAILS_CANVAS_SIZE) * 100,
  };
}

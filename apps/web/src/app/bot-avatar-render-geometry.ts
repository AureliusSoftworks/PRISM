export interface BotAvatarFacePlacement {
  xPct: number;
  yPct: number;
  scale: number;
}

/** Canonical face geometry shared by the full avatar and screen editor. */
export const BOT_AVATAR_CANONICAL_FACE_PLACEMENT: BotAvatarFacePlacement = {
  xPct: 50,
  yPct: 43.8,
  scale: 1.68,
};

/** Matches the full-avatar glyph size derived from the body frame. */
export const BOT_AVATAR_FACE_GLYPH_FRAME_RATIO = 0.217;

/**
 * The editor uses container-relative type instead of the preview's fixed body
 * frame. These calibrated values make the rendered feature centers coincide
 * after font metrics and the shared face scale are applied.
 */
export const BOT_AVATAR_SCREEN_EDITOR_FACE_PLACEMENT: BotAvatarFacePlacement = {
  xPct: 50,
  yPct: 42.75,
  scale: BOT_AVATAR_CANONICAL_FACE_PLACEMENT.scale,
};
export const BOT_AVATAR_SCREEN_EDITOR_FACE_GLYPH_FRAME_RATIO = 0.2337;

/** Authored punctuation faces read normally with this post-rotation flip. */
export const BOT_AVATAR_CANONICAL_FACE_SCALE_Y = "-1";

/**
 * Authored screen ink is stored in the editor's front-facing coordinates.
 * The face glyph always carries a canonical post-rotation `scaleY(-1)` just to
 * make punctuation readable, so only the opposite runtime scale represents an
 * actual horizontal bot flip for the authored canvas.
 */
export function botAvatarDetailsFacingScaleX(
  faceScaleY: string | number,
): "1" | "-1" {
  const faceIsNegative =
    typeof faceScaleY === "number"
      ? faceScaleY < 0
      : String(faceScaleY).trim().startsWith("-");
  const canonicalIsNegative = BOT_AVATAR_CANONICAL_FACE_SCALE_Y.startsWith("-");
  return faceIsNegative === canonicalIsNegative ? "1" : "-1";
}

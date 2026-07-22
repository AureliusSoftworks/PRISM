export interface BotAvatarFacePlacement {
  xPct: number;
  yPct: number;
  scale: number;
}

/** Canonical face geometry used by live avatars without registered screen ink. */
export const BOT_AVATAR_CANONICAL_FACE_PLACEMENT: BotAvatarFacePlacement = {
  xPct: 50,
  yPct: 43.8,
  scale: 1.68,
};

/** Matches the full-avatar glyph size derived from the body frame. */
export const BOT_AVATAR_FACE_GLYPH_FRAME_RATIO = 0.217;

/**
 * Face registration shared by the Details editor and every live avatar that
 * renders authored screen ink. Keeping this contract separate from the
 * ink-free default prevents face-relative paint from drifting at runtime.
 */
export const BOT_AVATAR_DETAILS_FACE_PLACEMENT: BotAvatarFacePlacement = {
  xPct: 50,
  yPct: 42.75,
  scale: BOT_AVATAR_CANONICAL_FACE_PLACEMENT.scale,
};
export const BOT_AVATAR_DETAILS_FACE_GLYPH_FRAME_RATIO = 0.2337;

export const BOT_AVATAR_DETAILS_FACE_REGISTRATION_STYLE = {
  "--zen-live-bot-face-x": `${BOT_AVATAR_DETAILS_FACE_PLACEMENT.xPct}%`,
  "--zen-live-bot-face-y": `${BOT_AVATAR_DETAILS_FACE_PLACEMENT.yPct}%`,
  "--zen-live-bot-face-scale": BOT_AVATAR_DETAILS_FACE_PLACEMENT.scale,
  "--zen-live-bot-avatar-face-glyph-size": `calc(var(--zen-live-bot-body-frame-size) * ${BOT_AVATAR_DETAILS_FACE_GLYPH_FRAME_RATIO})`,
} as const;

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

/**
 * The mirrored runtime glyph settles three authored pixels above the raw
 * canvas reflection. Preserve the editor/front-facing registration and apply
 * that optical correction only when the bot turns to face screen-left.
 */
export function botAvatarDetailsFacingOffsetY(
  faceScaleY: string | number,
): "0%" | "-2.34375%" {
  return botAvatarDetailsFacingScaleX(faceScaleY) === "-1"
    ? "-2.34375%"
    : "0%";
}

/**
 * Signal's scaled Align-stage preview rasterizes authored ink a touch below
 * the same avatar in Studio and live surfaces. Lift that preview by one pixel
 * on the authored 128px canvas without changing the saved stage coordinate.
 */
export function botAvatarDetailsSignalFacingOffsetY(
  faceScaleY: string | number,
  surface: "dashboard" | "stage" | "alignment",
): string {
  const facingOffset = botAvatarDetailsFacingOffsetY(faceScaleY);
  return surface === "alignment"
    ? `calc(${facingOffset} - 0.78125%)`
    : facingOffset;
}

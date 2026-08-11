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
 * Avatar Studio's canonical ink-free face registration. Apply this at the
 * shared mannequin boundary so live surfaces cannot introduce their own
 * face offsets or scale.
 */
export const BOT_AVATAR_CANONICAL_FACE_REGISTRATION_STYLE = {
  "--zen-live-bot-face-x": `${BOT_AVATAR_CANONICAL_FACE_PLACEMENT.xPct}%`,
  "--zen-live-bot-face-y": `${BOT_AVATAR_CANONICAL_FACE_PLACEMENT.yPct}%`,
  "--zen-live-bot-face-scale": BOT_AVATAR_CANONICAL_FACE_PLACEMENT.scale,
  "--zen-live-bot-avatar-face-glyph-size": `${BOT_AVATAR_FACE_GLYPH_FRAME_RATIO * 100}cqw`,
} as const;

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

/**
 * Optical baseline used by Avatar Studio for authored faces. Presentation
 * surfaces must not replace this with a room- or breakpoint-specific nudge,
 * because Ink is authored against this exact glyph baseline.
 */
export const BOT_AVATAR_DETAILS_FACE_NUDGE_Y =
  "clamp(-5px, -2.6%, -2px)";

/**
 * The writable 128px mask is already sampled from the physical CRT aperture,
 * so it must remain at a one-to-one presentation scale. Insetting the complete
 * canvas a second time creates a visible screen perimeter that authored ink
 * can never reach.
 */
export const BOT_AVATAR_DETAILS_INK_APERTURE_SCALE = 1;

export const BOT_AVATAR_DETAILS_FACE_REGISTRATION_STYLE = {
  "--zen-live-bot-face-x": `${BOT_AVATAR_DETAILS_FACE_PLACEMENT.xPct}%`,
  "--zen-live-bot-face-y": `${BOT_AVATAR_DETAILS_FACE_PLACEMENT.yPct}%`,
  "--zen-live-bot-face-scale": BOT_AVATAR_DETAILS_FACE_PLACEMENT.scale,
  "--zen-live-bot-avatar-face-glyph-size": `${BOT_AVATAR_DETAILS_FACE_GLYPH_FRAME_RATIO * 100}cqw`,
  "--coffee-plate-emoji-nudge-y": BOT_AVATAR_DETAILS_FACE_NUDGE_Y,
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
 * Keep the live face and authored screen ink on one facing contract.
 * Applying this at the shared mannequin boundary prevents individual
 * presentation surfaces from mirroring one layer without the other.
 */
export function botAvatarFaceFacingStyle(faceScaleY: string | number) {
  const screenFacingScaleX = botAvatarDetailsFacingScaleX(faceScaleY);
  return {
    "--coffee-plate-emoji-face-scale-y": String(faceScaleY),
    "--zen-live-bot-screen-facing-scale-x": screenFacingScaleX,
    "--avatar-details-facing-scale-x": screenFacingScaleX,
  } as const;
}

/**
 * Avatar Studio's front-facing orientation is the safe default. Presentation
 * surfaces may turn a bot, but only by applying `botAvatarFaceFacingStyle` to
 * the complete face-and-authored-ink coordinate space.
 */
export const BOT_AVATAR_CANONICAL_FACE_FACING_STYLE =
  botAvatarFaceFacingStyle(BOT_AVATAR_CANONICAL_FACE_SCALE_Y);

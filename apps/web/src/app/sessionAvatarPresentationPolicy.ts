export type SessionAvatarPresentation = "full" | "mini";

export type DebateAvatarConsumer = "forum" | "jury" | "gallery";
export type DebateAvatarCameraView =
  | "wide"
  | "left"
  | "moderator"
  | "right"
  | "jury";
export type DebateAvatarRole = "moderator" | "for" | "against";

/**
 * Authored bot identity is never a live-performance budget. Signal may shed
 * motion, rasterization, lighting, and compositing, but not the mannequin.
 */
export function signalAvatarPresentation(args: {
  live: boolean;
}): SessionAvatarPresentation {
  void args.live;
  return "full";
}

/**
 * Coffee keeps the complete authored body live and in replay. Performance
 * shedding is limited to peripheral rendering work around that identity.
 */
export function coffeeAvatarPresentation(args: {
  live: boolean;
}): SessionAvatarPresentation {
  void args.live;
  return "full";
}

/**
 * True when the forum Moderator should use the compact mini chassis instead of
 * the full authored body. Wide, Left, and Right keep that distant desk readable;
 * the Moderator close-up keeps the complete chassis.
 */
export function debateForumModeratorUsesMini(
  cameraView: DebateAvatarCameraView,
): boolean {
  switch (cameraView) {
    case "wide":
    case "left":
    case "right":
      return true;
    case "moderator":
    case "jury":
      return false;
    default: {
      const _exhaustive: never = cameraView;
      return _exhaustive;
    }
  }
}

/**
 * Debate has two deliberate compact compositions: gallery/Jury portraits and
 * the Moderator in the wide, left, and right forum shots. Camera-close
 * advocates and the Moderator close-up always retain the complete authored
 * chassis.
 */
export function debateAvatarPresentation(args: {
  consumer: DebateAvatarConsumer;
  role: DebateAvatarRole;
  cameraView: DebateAvatarCameraView;
}): SessionAvatarPresentation {
  // The Jury chamber seats its jurors at a real table: full mannequins whose
  // lower frames the tabletop occludes. Only the background gallery strip
  // keeps the compact ring plates.
  if (args.consumer === "jury") return "full";
  if (args.consumer === "gallery") return "mini";
  return args.role === "moderator" &&
    debateForumModeratorUsesMini(args.cameraView)
    ? "mini"
    : "full";
}

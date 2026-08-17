export type SessionAvatarPresentation = "full" | "mini";

export type DebateAvatarConsumer = "forum" | "jury" | "gallery";
export type DebateAvatarCameraView =
  | "wide"
  | "left"
  | "moderator"
  | "right"
  | "jury";
export type DebateAvatarRole = "moderator" | "for" | "against";

/** Signal's stage presentation is never a runtime quality budget. */
export function signalAvatarPresentation(): SessionAvatarPresentation {
  return "full";
}

/** Coffee keeps the complete authored chassis for every live and replay seat. */
export function coffeeAvatarPresentation(): SessionAvatarPresentation {
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
  if (args.consumer === "jury" || args.consumer === "gallery") return "mini";
  return args.role === "moderator" &&
    debateForumModeratorUsesMini(args.cameraView)
    ? "mini"
    : "full";
}

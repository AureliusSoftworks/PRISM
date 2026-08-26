export interface SignalCupSipRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Signal relaxes before the cup's 76% return beat so the expression reads
// as a quick sip instead of lingering after the rim has left the mouth.
export const SIGNAL_CUP_SIP_FACE_ACTIVE_PROGRESS = 0.6;
// The authored sip sheet's rim center sits at roughly 25.5% of each frame.
// After the active 0.98 scale, it is about 24% of the mug height above center.
const SIGNAL_CUP_SIP_RIM_OFFSET_HEIGHT_RATIO = 0.24;
// The guest cup reads too centrally when it meets the already inward-faced
// avatar. Keep the host's directly measured path intact, but bring the guest
// rim visibly toward the guest's holding side rather than across their face.
const SIGNAL_GUEST_CUP_SIP_LEFT_OFFSET_HEIGHT_RATIO = 0.3;

export function signalCupSipFaceReleaseMs(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Math.round(durationMs * SIGNAL_CUP_SIP_FACE_ACTIVE_PROGRESS);
}

export function signalStageLocalPointFromViewport(args: {
  sceneBounds: SignalCupSipRect;
  sceneLocalWidth: number;
  sceneLocalHeight: number;
  viewportX: number;
  viewportY: number;
}): { x: number; y: number } | null {
  const scaleX = args.sceneBounds.width / args.sceneLocalWidth;
  const scaleY = args.sceneBounds.height / args.sceneLocalHeight;
  if (
    !Number.isFinite(scaleX) ||
    !Number.isFinite(scaleY) ||
    scaleX <= 0 ||
    scaleY <= 0
  ) {
    return null;
  }
  return {
    x: (args.viewportX - args.sceneBounds.left) / scaleX,
    y: (args.viewportY - args.sceneBounds.top) / scaleY,
  };
}

export function signalCupSipTargetFromMouth(args: {
  role: "host" | "guest";
  sceneBounds: SignalCupSipRect;
  sceneLocalWidth: number;
  sceneLocalHeight: number;
  mouthBounds: SignalCupSipRect;
  mugLocalHeight: number;
}): { x: number; y: number } | null {
  const mouthCenterX = args.mouthBounds.left + args.mouthBounds.width / 2;
  const mouthCenterY = args.mouthBounds.top + args.mouthBounds.height / 2;
  const mouthLocal = signalStageLocalPointFromViewport({
    sceneBounds: args.sceneBounds,
    sceneLocalWidth: args.sceneLocalWidth,
    sceneLocalHeight: args.sceneLocalHeight,
    viewportX: mouthCenterX,
    viewportY: mouthCenterY,
  });
  if (!mouthLocal) return null;
  const rimOffsetY =
    args.mugLocalHeight * SIGNAL_CUP_SIP_RIM_OFFSET_HEIGHT_RATIO;

  return {
    // Signal deliberately zeros the shared Coffee sprite's local sip X/Y.
    // The outer stage wrapper therefore owns all travel and can target the
    // already-faced, already-authored mouth directly for either role.
    x:
      mouthLocal.x -
      (args.role === "guest"
        ? args.mugLocalHeight * SIGNAL_GUEST_CUP_SIP_LEFT_OFFSET_HEIGHT_RATIO
        : 0),
    // The active sprite's rim is above its wrapper center, so lower the wrapper
    // by that authored offset to put the rim itself on the measured mouth.
    y: mouthLocal.y + rimOffsetY,
  };
}

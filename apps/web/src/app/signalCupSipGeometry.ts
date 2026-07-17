export type SignalCupSipRole = "host" | "guest";

export interface SignalCupSipRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const SIGNAL_CUP_SIP_X_MIN_PX = 28;
const SIGNAL_CUP_SIP_X_MAX_PX = 40;
const SIGNAL_CUP_SIP_X_VIEWPORT_RATIO = 0.031;
const SIGNAL_CUP_SIP_Y_MIN_PX = 6;
const SIGNAL_CUP_SIP_Y_MAX_PX = 10;
const SIGNAL_CUP_SIP_Y_VIEWPORT_RATIO = 0.0075;
// Signal relaxes before the cup's 76% return beat so the expression reads
// as a quick sip instead of lingering after the rim has left the mouth.
export const SIGNAL_CUP_SIP_FACE_ACTIVE_PROGRESS = 0.6;
// The authored sip sheet's rim center sits at roughly 25.5% of each frame.
// After the active 0.98 scale, it is about 24% of the mug height above center.
const SIGNAL_CUP_SIP_RIM_OFFSET_HEIGHT_RATIO = 0.24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

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
  role: SignalCupSipRole;
  sceneBounds: SignalCupSipRect;
  sceneLocalWidth: number;
  sceneLocalHeight: number;
  mouthBounds: SignalCupSipRect;
  mugLocalHeight: number;
  viewportWidth: number;
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
  const sipDistanceX = clamp(
    args.viewportWidth * SIGNAL_CUP_SIP_X_VIEWPORT_RATIO,
    SIGNAL_CUP_SIP_X_MIN_PX,
    SIGNAL_CUP_SIP_X_MAX_PX,
  );
  const sipDistanceY = clamp(
    args.viewportWidth * SIGNAL_CUP_SIP_Y_VIEWPORT_RATIO,
    SIGNAL_CUP_SIP_Y_MIN_PX,
    SIGNAL_CUP_SIP_Y_MAX_PX,
  );
  const rimOffsetY =
    args.mugLocalHeight * SIGNAL_CUP_SIP_RIM_OFFSET_HEIGHT_RATIO;

  return {
    // Cancel the inner Coffee sprite's role-facing X translation so its rim,
    // rather than the mug wrapper, lands on the measured mouth glyph.
    x:
      mouthLocal.x +
      (args.role === "host" ? sipDistanceX : -sipDistanceX),
    // The tilted sprite translates upward and its rim is above frame center.
    // Move the wrapper down by both amounts to put that rim on the glyph.
    y: mouthLocal.y + sipDistanceY + rimOffsetY,
  };
}

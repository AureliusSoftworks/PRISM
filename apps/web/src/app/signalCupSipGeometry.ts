export interface SignalCupSipRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SignalCupShadowProfile {
  scaleX: number;
  scaleY: number;
  blurPx: number;
  opacity: number;
}

// Signal relaxes before the cup's 76% return beat so the expression reads
// as a quick sip instead of lingering after the rim has left the mouth.
export const SIGNAL_CUP_SIP_FACE_ACTIVE_PROGRESS = 0.6;
// The authored sip sheet's rim center sits at roughly 25.5% of each frame.
// After the active 0.98 scale, it is about 24% of the mug height above center.
const SIGNAL_CUP_SIP_RIM_OFFSET_HEIGHT_RATIO = 0.24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

export function signalCupShadowProfileForTravel(args: {
  spawnX: number;
  spawnY: number;
  cupX: number;
  cupY: number;
  sceneWidth: number;
  sceneHeight: number;
}): SignalCupShadowProfile {
  const values = [
    args.spawnX,
    args.spawnY,
    args.cupX,
    args.cupY,
    args.sceneWidth,
    args.sceneHeight,
  ];
  const sceneSize = Math.min(args.sceneWidth, args.sceneHeight);
  const distance = Math.hypot(
    args.cupX - args.spawnX,
    args.cupY - args.spawnY,
  );
  const travel =
    values.every(Number.isFinite) && sceneSize > 0
      ? clamp(distance / (sceneSize * 0.45), 0, 1)
      : 0;

  return {
    scaleX: round(0.76 + travel * 0.66),
    scaleY: round(0.38 + travel * 0.44),
    blurPx: round(2 + travel * 5),
    opacity: round(0.7 - travel * 0.44),
  };
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
    // Signal moves the mug wrapper itself, while its inner sip sprite stays
    // centered. This keeps Coffee's independent seat-relative travel from
    // becoming a second offset here.
    x: mouthLocal.x,
    // The authored tilted sprite's rim is above frame center, so move the
    // wrapper down by that amount to put the rim on the measured mouth glyph.
    y: mouthLocal.y + rimOffsetY,
  };
}

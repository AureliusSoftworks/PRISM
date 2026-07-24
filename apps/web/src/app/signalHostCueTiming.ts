export const SIGNAL_HOST_CUE_REDIRECT_LATEST_PROGRESS = 0.72;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Early control-room cues can plausibly make a host break off and redirect.
 * That chance fades as the host lands the point and reaches zero near the end.
 */
export function signalHostCueRedirectProbability(progress: number): number {
  const normalized = clampUnit(progress);
  if (normalized >= SIGNAL_HOST_CUE_REDIRECT_LATEST_PROGRESS) return 0;
  if (normalized <= 0.2) return 0.9;
  if (normalized <= 0.5) {
    return 0.9 - ((normalized - 0.2) / 0.3) * 0.35;
  }
  return (
    0.55 -
    ((normalized - 0.5) /
      (SIGNAL_HOST_CUE_REDIRECT_LATEST_PROGRESS - 0.5)) *
      0.55
  );
}

export function signalHostCueShouldRedirect(args: {
  progress: number;
  spokenContent: string;
  randomValue: number;
}): boolean {
  if (!args.spokenContent.trim()) return false;
  return (
    clampUnit(args.randomValue) <
    signalHostCueRedirectProbability(args.progress)
  );
}

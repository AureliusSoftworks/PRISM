export const MIN_CRT_FOCUS = 0;
export const MAX_CRT_FOCUS = 100;
export const DEFAULT_CRT_FOCUS = 50;
export const CRT_FOCUS_STEP = 5;

/**
 * Account-wide focus for the physical CRT beam. Fifty preserves the authored
 * material recipe; lower values soften the beam and higher values tighten it.
 * Silhouette geometry and the canonical phosphor grid never change.
 */
export function normalizeCrtFocus(
  value: unknown,
  fallback = DEFAULT_CRT_FOCUS,
): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  const normalizedFallback = Number.isFinite(fallback)
    ? Math.round(fallback)
    : DEFAULT_CRT_FOCUS;
  if (!Number.isFinite(numeric)) {
    return Math.max(MIN_CRT_FOCUS, Math.min(MAX_CRT_FOCUS, normalizedFallback));
  }
  return Math.max(MIN_CRT_FOCUS, Math.min(MAX_CRT_FOCUS, Math.round(numeric)));
}

/** Maps 0..100 focus onto a restrained 1.3x softer .. 0.7x crisper beam. */
export function crtFocusRadiusScale(value: unknown): number {
  const focus = normalizeCrtFocus(value);
  return Number((1.3 - focus * 0.006).toFixed(3));
}

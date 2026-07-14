export const APP_SHELL_TOP_NAV_HEIGHT_FALLBACK_PX = 60;

/**
 * Round upward so fractional layout pixels produced by browser zoom cannot
 * leave the first content pixel underneath the measured navigation bar.
 */
export function appShellTopNavHeightCssValue(measuredHeight: number): string {
  const height =
    Number.isFinite(measuredHeight) && measuredHeight > 0
      ? measuredHeight
      : APP_SHELL_TOP_NAV_HEIGHT_FALLBACK_PX;
  return `${Math.ceil(height)}px`;
}

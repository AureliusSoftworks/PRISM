export function modelPickerStepValue(
  values: readonly string[],
  current: string | null,
  direction: -1 | 1,
): string | null {
  if (values.length === 0) return null;
  const currentIndex = current === null ? -1 : values.indexOf(current);
  const fallbackIndex = direction > 0 ? 0 : values.length - 1;
  const nextIndex =
    currentIndex < 0
      ? fallbackIndex
      : Math.min(
          values.length - 1,
          Math.max(0, currentIndex + direction),
        );
  return values[nextIndex] ?? null;
}

/** Scroll down/right advances through the visibly ordered model choices. */
export function modelPickerWheelDirection(
  deltaX: number,
  deltaY: number,
): -1 | 0 | 1 {
  const dominantDelta = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX;
  return dominantDelta === 0 ? 0 : dominantDelta > 0 ? 1 : -1;
}

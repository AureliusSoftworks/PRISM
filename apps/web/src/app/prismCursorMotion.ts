export interface PrismCursorPoint {
  x: number;
  y: number;
}

export interface PrismCursorMotionStep extends PrismCursorPoint {
  settled: boolean;
}

export function prismCursorMotionStep(
  current: PrismCursorPoint,
  target: PrismCursorPoint,
  easing: number,
  snapDistancePx: number,
): PrismCursorMotionStep {
  const deltaX = target.x - current.x;
  const deltaY = target.y - current.y;
  const x =
    Math.abs(deltaX) <= snapDistancePx
      ? target.x
      : current.x + deltaX * easing;
  const y =
    Math.abs(deltaY) <= snapDistancePx
      ? target.y
      : current.y + deltaY * easing;
  return {
    x,
    y,
    settled: x === target.x && y === target.y,
  };
}

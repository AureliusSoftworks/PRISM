export interface AdjustmentPadPoint {
  x: number;
  y: number;
}

export type AdjustmentPadDirection = "left" | "right" | "up" | "down";
export type AdjustmentPadInputSource = "pointer" | "keyboard";

export interface AdjustmentPadAdapter<TValue> {
  toPoint: (value: TValue) => AdjustmentPadPoint;
  fromPoint: (point: AdjustmentPadPoint, current: TValue) => TValue;
  nudge: (
    value: TValue,
    direction: AdjustmentPadDirection,
    multiplier: number,
  ) => TValue;
  valueText: (value: TValue) => string;
}

export interface AdjustmentPadCoordinateValue {
  x: number;
  y: number;
}

export interface AdjustmentPadCoordinateAxis {
  min: number;
  max: number;
  step: number;
  inverted?: boolean;
}

export interface AdjustmentPadCoordinateAdapterOptions {
  x: AdjustmentPadCoordinateAxis;
  y: AdjustmentPadCoordinateAxis;
  valueText: (value: AdjustmentPadCoordinateValue) => string;
}

export function clampAdjustmentPadPoint(
  point: AdjustmentPadPoint,
): AdjustmentPadPoint {
  return {
    x: Math.max(0, Math.min(1, point.x)),
    y: Math.max(0, Math.min(1, point.y)),
  };
}

function snapAdjustmentPadCoordinate(
  value: number,
  axis: AdjustmentPadCoordinateAxis,
): number {
  const stepped = Math.round(value / axis.step) * axis.step;
  return Number(Math.max(axis.min, Math.min(axis.max, stepped)).toFixed(4));
}

export function createAdjustmentPadCoordinateAdapter({
  x,
  y,
  valueText,
}: AdjustmentPadCoordinateAdapterOptions): AdjustmentPadAdapter<AdjustmentPadCoordinateValue> {
  const pointForAxis = (
    value: number,
    axis: AdjustmentPadCoordinateAxis,
  ): number => {
    const range = axis.max - axis.min;
    if (range <= 0) return 0.5;
    const ratio = (value - axis.min) / range;
    return axis.inverted ? 1 - ratio : ratio;
  };
  const valueForAxis = (
    ratio: number,
    axis: AdjustmentPadCoordinateAxis,
  ): number => {
    const resolvedRatio = axis.inverted ? 1 - ratio : ratio;
    return snapAdjustmentPadCoordinate(
      axis.min + resolvedRatio * (axis.max - axis.min),
      axis,
    );
  };
  return {
    toPoint: (value) => ({
      x: pointForAxis(value.x, x),
      y: pointForAxis(value.y, y),
    }),
    fromPoint: (point) => ({
      x: valueForAxis(point.x, x),
      y: valueForAxis(point.y, y),
    }),
    nudge: (value, direction, multiplier) => {
      const point = {
        x: pointForAxis(value.x, x),
        y: pointForAxis(value.y, y),
      };
      const xDelta = (x.step / Math.max(x.step, x.max - x.min)) * multiplier;
      const yDelta = (y.step / Math.max(y.step, y.max - y.min)) * multiplier;
      if (direction === "left") point.x -= xDelta;
      else if (direction === "right") point.x += xDelta;
      else if (direction === "up") point.y -= yDelta;
      else point.y += yDelta;
      return {
        x: valueForAxis(Math.max(0, Math.min(1, point.x)), x),
        y: valueForAxis(Math.max(0, Math.min(1, point.y)), y),
      };
    },
    valueText,
  };
}

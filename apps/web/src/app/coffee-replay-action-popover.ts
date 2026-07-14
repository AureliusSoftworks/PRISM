export type CoffeeReplayActionPopoverSide =
  | "above"
  | "below"
  | "left"
  | "right";

export type CoffeeReplayActionPopoverRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type CoffeeReplayActionPopoverPlacement = {
  side: CoffeeReplayActionPopoverSide;
  left: number;
  top: number;
  maxWidth: number;
  maxHeight: number;
  pointerOffset: number;
};

type CoffeeReplayActionPopoverPlacementArgs = {
  anchorRect: CoffeeReplayActionPopoverRect;
  stageRect: CoffeeReplayActionPopoverRect;
  panelSize: { width: number; height: number };
  viewport: { width: number; height: number };
  gap?: number;
  edgePadding?: number;
  pointerInset?: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum <= minimum) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveCoffeeReplayActionPopoverPlacement({
  anchorRect,
  stageRect,
  panelSize,
  viewport,
  gap = 12,
  edgePadding = 10,
  pointerInset = 18,
}: CoffeeReplayActionPopoverPlacementArgs): CoffeeReplayActionPopoverPlacement {
  const viewportWidth = finitePositive(viewport.width, stageRect.right);
  const viewportHeight = finitePositive(viewport.height, stageRect.bottom);
  const safeLeft = Math.max(edgePadding, stageRect.left + edgePadding);
  const safeTop = Math.max(edgePadding, stageRect.top + edgePadding);
  const safeRight = Math.max(
    safeLeft + 1,
    Math.min(viewportWidth - edgePadding, stageRect.right - edgePadding),
  );
  const safeBottom = Math.max(
    safeTop + 1,
    Math.min(viewportHeight - edgePadding, stageRect.bottom - edgePadding),
  );
  const maxWidth = Math.max(1, safeRight - safeLeft);
  const maxHeight = Math.max(1, safeBottom - safeTop);
  const panelWidth = Math.min(
    finitePositive(panelSize.width, maxWidth),
    maxWidth,
  );
  const panelHeight = Math.min(
    finitePositive(panelSize.height, maxHeight),
    maxHeight,
  );
  const anchorCenterX = (anchorRect.left + anchorRect.right) / 2;
  const anchorCenterY = (anchorRect.top + anchorRect.bottom) / 2;
  const stageCenterX = (safeLeft + safeRight) / 2;
  const stageCenterY = (safeTop + safeBottom) / 2;
  const spaces: Record<CoffeeReplayActionPopoverSide, number> = {
    above: anchorRect.top - safeTop - gap,
    below: safeBottom - anchorRect.bottom - gap,
    left: anchorRect.left - safeLeft - gap,
    right: safeRight - anchorRect.right - gap,
  };
  const horizontalDistance = anchorCenterX - stageCenterX;
  const verticalDistance = anchorCenterY - stageCenterY;
  const horizontalPrimary = Math.abs(horizontalDistance) >= Math.abs(verticalDistance);
  const primary: CoffeeReplayActionPopoverSide = horizontalPrimary
    ? horizontalDistance < 0
      ? "left"
      : "right"
    : verticalDistance < 0
      ? "above"
      : "below";
  const opposite: Record<
    CoffeeReplayActionPopoverSide,
    CoffeeReplayActionPopoverSide
  > = {
    above: "below",
    below: "above",
    left: "right",
    right: "left",
  };
  const perpendicular: [
    CoffeeReplayActionPopoverSide,
    CoffeeReplayActionPopoverSide,
  ] = horizontalPrimary
    ? spaces.above >= spaces.below
      ? ["above", "below"]
      : ["below", "above"]
    : spaces.left >= spaces.right
      ? ["left", "right"]
      : ["right", "left"];
  const preference = [primary, ...perpendicular, opposite[primary]];
  const requiredSpace = (side: CoffeeReplayActionPopoverSide): number =>
    side === "left" || side === "right" ? panelWidth : panelHeight;
  const fittingSide = preference.find(
    (side) => spaces[side] >= requiredSpace(side),
  );
  const side =
    fittingSide ??
    preference.reduce((best, candidate) =>
      spaces[candidate] / requiredSpace(candidate) >
      spaces[best] / requiredSpace(best)
        ? candidate
        : best,
    );

  const desired = {
    above: {
      left: anchorCenterX - panelWidth / 2,
      top: anchorRect.top - gap - panelHeight,
    },
    below: {
      left: anchorCenterX - panelWidth / 2,
      top: anchorRect.bottom + gap,
    },
    left: {
      left: anchorRect.left - gap - panelWidth,
      top: anchorCenterY - panelHeight / 2,
    },
    right: {
      left: anchorRect.right + gap,
      top: anchorCenterY - panelHeight / 2,
    },
  } satisfies Record<
    CoffeeReplayActionPopoverSide,
    { left: number; top: number }
  >;
  const left = clamp(desired[side].left, safeLeft, safeRight - panelWidth);
  const top = clamp(desired[side].top, safeTop, safeBottom - panelHeight);
  const pointerAxisSize = side === "left" || side === "right" ? panelHeight : panelWidth;
  const pointerTarget =
    side === "left" || side === "right"
      ? anchorCenterY - top
      : anchorCenterX - left;
  const effectiveInset = Math.min(pointerInset, pointerAxisSize / 2);
  const pointerOffset = clamp(
    pointerTarget,
    effectiveInset,
    pointerAxisSize - effectiveInset,
  );

  return {
    side,
    left,
    top,
    maxWidth,
    maxHeight,
    pointerOffset,
  };
}

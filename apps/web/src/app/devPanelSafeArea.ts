export type DevPanelSafeAreaSide = "top" | "right" | "bottom" | "left";

export type DevPanelSafeAreaInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type DevPanelSafeAreaRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type DevPanelSafeAreaBlocker = {
  rect: DevPanelSafeAreaRect;
  sides: readonly DevPanelSafeAreaSide[];
};

export type DevPanelPosition = {
  x: number;
  y: number;
};

export type DevPanelRect = DevPanelPosition & {
  width: number;
  height: number;
};

export const DEV_PANEL_SAFE_AREA_DEFAULT_INSETS: DevPanelSafeAreaInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

export const DEV_PANEL_SAFE_AREA_SIDES = ["top", "right", "bottom", "left"] as const;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizePositive(value: number, fallback: number): number {
  return Math.max(0, finiteOr(value, fallback));
}

function normalizeMargin(margin: number, viewportSize: number): number {
  const safeViewportSize = normalizePositive(viewportSize, 0);
  return Math.min(normalizePositive(margin, 0), safeViewportSize / 2);
}

function rectIntersectsViewport(
  rect: DevPanelSafeAreaRect,
  viewportWidth: number,
  viewportHeight: number
): boolean {
  return (
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < viewportWidth &&
    rect.top < viewportHeight
  );
}

export function normalizeDevPanelSafeAreaInsets(
  insets: Partial<DevPanelSafeAreaInsets> | null | undefined
): DevPanelSafeAreaInsets {
  return {
    top: normalizePositive(insets?.top ?? 0, 0),
    right: normalizePositive(insets?.right ?? 0, 0),
    bottom: normalizePositive(insets?.bottom ?? 0, 0),
    left: normalizePositive(insets?.left ?? 0, 0),
  };
}

export function devPanelSafeAreaInsetsEqual(
  a: DevPanelSafeAreaInsets,
  b: DevPanelSafeAreaInsets
): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

export function resolveDevPanelSafeAreaInsets({
  blockers,
  viewportWidth,
  viewportHeight,
  gap = 0,
}: {
  blockers: readonly DevPanelSafeAreaBlocker[];
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
}): DevPanelSafeAreaInsets {
  const safeViewportWidth = normalizePositive(viewportWidth, 0);
  const safeViewportHeight = normalizePositive(viewportHeight, 0);
  const safeGap = normalizePositive(gap, 0);
  const insets: DevPanelSafeAreaInsets = { ...DEV_PANEL_SAFE_AREA_DEFAULT_INSETS };

  for (const blocker of blockers) {
    const rect = {
      left: finiteOr(blocker.rect.left, 0),
      top: finiteOr(blocker.rect.top, 0),
      right: finiteOr(blocker.rect.right, 0),
      bottom: finiteOr(blocker.rect.bottom, 0),
    };

    if (!rectIntersectsViewport(rect, safeViewportWidth, safeViewportHeight)) continue;

    for (const side of blocker.sides) {
      if (side === "top") {
        insets.top = Math.max(
          insets.top,
          clamp(rect.bottom + safeGap, 0, safeViewportHeight)
        );
      } else if (side === "right") {
        insets.right = Math.max(
          insets.right,
          clamp(safeViewportWidth - rect.left + safeGap, 0, safeViewportWidth)
        );
      } else if (side === "bottom") {
        insets.bottom = Math.max(
          insets.bottom,
          clamp(safeViewportHeight - rect.top + safeGap, 0, safeViewportHeight)
        );
      } else if (side === "left") {
        insets.left = Math.max(
          insets.left,
          clamp(rect.right + safeGap, 0, safeViewportWidth)
        );
      }
    }
  }

  return insets;
}

function resolveSafeAxisBounds({
  viewportSize,
  panelSize,
  margin,
  startInset,
  endInset,
}: {
  viewportSize: number;
  panelSize: number;
  margin: number;
  startInset: number;
  endInset: number;
}): { min: number; max: number } {
  const safeViewportSize = normalizePositive(viewportSize, 0);
  const safePanelSize = normalizePositive(panelSize, 0);
  const safeMargin = normalizeMargin(margin, safeViewportSize);
  const safeStartInset = normalizePositive(startInset, 0);
  const safeEndInset = normalizePositive(endInset, 0);

  const viewportMin = safeMargin;
  const viewportMax = Math.max(viewportMin, safeViewportSize - safeMargin - safePanelSize);
  const safeMin = Math.max(viewportMin, safeStartInset + safeMargin);
  const safeSpace = safeViewportSize - safeStartInset - safeEndInset - safeMargin * 2;

  if (safeSpace >= safePanelSize) {
    return {
      min: safeMin,
      max: Math.max(safeMin, safeViewportSize - safeEndInset - safeMargin - safePanelSize),
    };
  }

  const startPriorityMax = safeViewportSize - safePanelSize;
  if (startPriorityMax >= safeMin) {
    return {
      min: safeMin,
      max: startPriorityMax,
    };
  }

  const endPriorityMax = safeViewportSize - safeEndInset - safeMargin - safePanelSize;
  if (endPriorityMax >= viewportMin) {
    return {
      min: viewportMin,
      max: endPriorityMax,
    };
  }

  return {
    min: viewportMin,
    max: viewportMax,
  };
}

export function clampDevPanelPositionToSafeArea({
  x,
  y,
  panelWidth,
  panelHeight,
  viewportWidth,
  viewportHeight,
  margin,
  safeAreaInsets,
}: {
  x: number;
  y: number;
  panelWidth: number;
  panelHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  margin: number;
  safeAreaInsets?: Partial<DevPanelSafeAreaInsets> | null;
}): DevPanelPosition {
  const insets = normalizeDevPanelSafeAreaInsets(safeAreaInsets);
  const xBounds = resolveSafeAxisBounds({
    viewportSize: viewportWidth,
    panelSize: panelWidth,
    margin,
    startInset: insets.left,
    endInset: insets.right,
  });
  const yBounds = resolveSafeAxisBounds({
    viewportSize: viewportHeight,
    panelSize: panelHeight,
    margin,
    startInset: insets.top,
    endInset: insets.bottom,
  });

  return {
    x: clamp(finiteOr(x, xBounds.min), xBounds.min, xBounds.max),
    y: clamp(finiteOr(y, yBounds.min), yBounds.min, yBounds.max),
  };
}

export function clampDevPanelRectToSafeArea({
  rect,
  viewportWidth,
  viewportHeight,
  margin,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
  safeAreaInsets,
}: {
  rect: DevPanelRect;
  viewportWidth: number;
  viewportHeight: number;
  margin: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  safeAreaInsets?: Partial<DevPanelSafeAreaInsets> | null;
}): DevPanelRect {
  const insets = normalizeDevPanelSafeAreaInsets(safeAreaInsets);
  const safeViewportWidth = normalizePositive(viewportWidth, 0);
  const safeViewportHeight = normalizePositive(viewportHeight, 0);
  const safeMarginX = normalizeMargin(margin, safeViewportWidth);
  const safeMarginY = normalizeMargin(margin, safeViewportHeight);
  const safeMinWidth = normalizePositive(minWidth, 0);
  const safeMinHeight = normalizePositive(minHeight, 0);
  const safeMaxWidth = Math.max(safeMinWidth, normalizePositive(maxWidth, safeMinWidth));
  const safeMaxHeight = Math.max(safeMinHeight, normalizePositive(maxHeight, safeMinHeight));
  const viewportWidthLimit = Math.max(
    safeMinWidth,
    safeViewportWidth - safeMarginX * 2
  );
  const viewportHeightLimit = Math.max(
    safeMinHeight,
    safeViewportHeight - safeMarginY * 2
  );
  const safeAreaWidthLimit =
    safeViewportWidth - insets.left - insets.right - safeMarginX * 2;
  const safeAreaHeightLimit =
    safeViewportHeight - insets.top - insets.bottom - safeMarginY * 2;
  const widthLimit =
    safeAreaWidthLimit >= safeMinWidth ? safeAreaWidthLimit : viewportWidthLimit;
  const heightLimit =
    safeAreaHeightLimit >= safeMinHeight ? safeAreaHeightLimit : viewportHeightLimit;
  const width = clamp(
    finiteOr(rect.width, safeMinWidth),
    safeMinWidth,
    Math.min(safeMaxWidth, widthLimit)
  );
  const height = clamp(
    finiteOr(rect.height, safeMinHeight),
    safeMinHeight,
    Math.min(safeMaxHeight, heightLimit)
  );
  const position = clampDevPanelPositionToSafeArea({
    x: rect.x,
    y: rect.y,
    panelWidth: width,
    panelHeight: height,
    viewportWidth: safeViewportWidth,
    viewportHeight: safeViewportHeight,
    margin,
    safeAreaInsets: insets,
  });

  return {
    ...position,
    width,
    height,
  };
}

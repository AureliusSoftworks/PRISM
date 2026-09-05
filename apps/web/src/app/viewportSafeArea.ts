export type ViewportSafeAreaSide = "top" | "right" | "bottom" | "left";

export type ViewportSafeAreaInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type ViewportSafeAreaBlocker = {
  rect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  sides: readonly ViewportSafeAreaSide[];
};

export const VIEWPORT_SAFE_AREA_DEFAULT_INSETS: ViewportSafeAreaInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

export const VIEWPORT_SAFE_AREA_SIDES = [
  "top",
  "right",
  "bottom",
  "left",
] as const;

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

function normalizeViewportSafeAreaInsets(
  insets: Partial<ViewportSafeAreaInsets> | null | undefined,
): ViewportSafeAreaInsets {
  return {
    top: normalizePositive(insets?.top ?? 0, 0),
    right: normalizePositive(insets?.right ?? 0, 0),
    bottom: normalizePositive(insets?.bottom ?? 0, 0),
    left: normalizePositive(insets?.left ?? 0, 0),
  };
}

export function resolveViewportSafeAreaInsets({
  blockers,
  viewportWidth,
  viewportHeight,
  gap = 0,
}: {
  blockers: readonly ViewportSafeAreaBlocker[];
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
}): ViewportSafeAreaInsets {
  const safeViewportWidth = normalizePositive(viewportWidth, 0);
  const safeViewportHeight = normalizePositive(viewportHeight, 0);
  const safeGap = normalizePositive(gap, 0);
  const insets = { ...VIEWPORT_SAFE_AREA_DEFAULT_INSETS };

  for (const blocker of blockers) {
    const rect = {
      left: finiteOr(blocker.rect.left, 0),
      top: finiteOr(blocker.rect.top, 0),
      right: finiteOr(blocker.rect.right, 0),
      bottom: finiteOr(blocker.rect.bottom, 0),
    };
    const intersectsViewport =
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < safeViewportWidth &&
      rect.top < safeViewportHeight;
    if (!intersectsViewport) continue;

    for (const side of blocker.sides) {
      if (side === "top") {
        insets.top = Math.max(
          insets.top,
          clamp(rect.bottom + safeGap, 0, safeViewportHeight),
        );
      } else if (side === "right") {
        insets.right = Math.max(
          insets.right,
          clamp(
            safeViewportWidth - rect.left + safeGap,
            0,
            safeViewportWidth,
          ),
        );
      } else if (side === "bottom") {
        insets.bottom = Math.max(
          insets.bottom,
          clamp(
            safeViewportHeight - rect.top + safeGap,
            0,
            safeViewportHeight,
          ),
        );
      } else {
        insets.left = Math.max(
          insets.left,
          clamp(rect.right + safeGap, 0, safeViewportWidth),
        );
      }
    }
  }

  return insets;
}

function resolveSafeAxisBounds({
  viewportSize,
  itemSize,
  margin,
  startInset,
  endInset,
}: {
  viewportSize: number;
  itemSize: number;
  margin: number;
  startInset: number;
  endInset: number;
}): { min: number; max: number } {
  const safeViewportSize = normalizePositive(viewportSize, 0);
  const safeItemSize = normalizePositive(itemSize, 0);
  const safeMargin = normalizeMargin(margin, safeViewportSize);
  const safeStartInset = normalizePositive(startInset, 0);
  const safeEndInset = normalizePositive(endInset, 0);
  const viewportMin = safeMargin;
  const viewportMax = Math.max(
    viewportMin,
    safeViewportSize - safeMargin - safeItemSize,
  );
  const safeMin = Math.max(viewportMin, safeStartInset + safeMargin);
  const safeSpace =
    safeViewportSize - safeStartInset - safeEndInset - safeMargin * 2;

  if (safeSpace >= safeItemSize) {
    return {
      min: safeMin,
      max: Math.max(
        safeMin,
        safeViewportSize - safeEndInset - safeMargin - safeItemSize,
      ),
    };
  }

  const startPriorityMax = safeViewportSize - safeItemSize;
  if (startPriorityMax >= safeMin) {
    return { min: safeMin, max: startPriorityMax };
  }
  const endPriorityMax =
    safeViewportSize - safeEndInset - safeMargin - safeItemSize;
  if (endPriorityMax >= viewportMin) {
    return { min: viewportMin, max: endPriorityMax };
  }
  return { min: viewportMin, max: viewportMax };
}

export function clampPositionToViewportSafeArea({
  x,
  y,
  width,
  height,
  viewportWidth,
  viewportHeight,
  margin,
  safeAreaInsets,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  margin: number;
  safeAreaInsets?: Partial<ViewportSafeAreaInsets> | null;
}): { x: number; y: number } {
  const insets = normalizeViewportSafeAreaInsets(safeAreaInsets);
  const xBounds = resolveSafeAxisBounds({
    viewportSize: viewportWidth,
    itemSize: width,
    margin,
    startInset: insets.left,
    endInset: insets.right,
  });
  const yBounds = resolveSafeAxisBounds({
    viewportSize: viewportHeight,
    itemSize: height,
    margin,
    startInset: insets.top,
    endInset: insets.bottom,
  });
  return {
    x: clamp(finiteOr(x, xBounds.min), xBounds.min, xBounds.max),
    y: clamp(finiteOr(y, yBounds.min), yBounds.min, yBounds.max),
  };
}

export type PrismMenuPlacement =
  | "bottom-start"
  | "bottom-end"
  | "top-start"
  | "top-end"
  | "right-start"
  | "left-start";

export interface PrismMenuRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface PrismMenuPositionInput {
  anchor: PrismMenuRect;
  menuWidth: number;
  menuHeight: number;
  boundary: PrismMenuRect;
  placement: PrismMenuPlacement;
  gap?: number;
  margin?: number;
}

export interface PrismMenuPosition {
  left: number;
  top: number;
  placement: PrismMenuPlacement;
  maxHeight: number;
}

const OPPOSITE_PLACEMENT: Record<PrismMenuPlacement, PrismMenuPlacement> = {
  "bottom-start": "top-start",
  "bottom-end": "top-end",
  "top-start": "bottom-start",
  "top-end": "bottom-end",
  "right-start": "left-start",
  "left-start": "right-start",
};

function positionForPlacement(
  anchor: PrismMenuRect,
  menuWidth: number,
  menuHeight: number,
  placement: PrismMenuPlacement,
  gap: number,
): { left: number; top: number } {
  switch (placement) {
    case "bottom-end":
      return { left: anchor.right - menuWidth, top: anchor.bottom + gap };
    case "top-start":
      return { left: anchor.left, top: anchor.top - menuHeight - gap };
    case "top-end":
      return {
        left: anchor.right - menuWidth,
        top: anchor.top - menuHeight - gap,
      };
    case "right-start":
      return { left: anchor.right + gap, top: anchor.top };
    case "left-start":
      return { left: anchor.left - menuWidth - gap, top: anchor.top };
    case "bottom-start":
    default:
      return { left: anchor.left, top: anchor.bottom + gap };
  }
}

function overflowScore(
  position: { left: number; top: number },
  menuWidth: number,
  menuHeight: number,
  boundary: PrismMenuRect,
  margin: number,
): number {
  const minX = boundary.left + margin;
  const maxX = boundary.right - margin;
  const minY = boundary.top + margin;
  const maxY = boundary.bottom - margin;
  return (
    Math.max(0, minX - position.left) +
    Math.max(0, position.left + menuWidth - maxX) +
    Math.max(0, minY - position.top) +
    Math.max(0, position.top + menuHeight - maxY)
  );
}

/**
 * Measures first, then flips and shifts into the usable boundary. This keeps
 * menus out of the composer and makes the same positioning rule reusable for
 * pointer, element, and submenu anchors.
 */
export function resolvePrismMenuPosition(
  input: PrismMenuPositionInput,
): PrismMenuPosition {
  const gap = input.gap ?? 6;
  const margin = input.margin ?? 8;
  const preferred = positionForPlacement(
    input.anchor,
    input.menuWidth,
    input.menuHeight,
    input.placement,
    gap,
  );
  const oppositePlacement = OPPOSITE_PLACEMENT[input.placement];
  const opposite = positionForPlacement(
    input.anchor,
    input.menuWidth,
    input.menuHeight,
    oppositePlacement,
    gap,
  );
  const preferredScore = overflowScore(
    preferred,
    input.menuWidth,
    input.menuHeight,
    input.boundary,
    margin,
  );
  const oppositeScore = overflowScore(
    opposite,
    input.menuWidth,
    input.menuHeight,
    input.boundary,
    margin,
  );
  const placement =
    oppositeScore < preferredScore ? oppositePlacement : input.placement;
  const raw = placement === input.placement ? preferred : opposite;
  const minX = input.boundary.left + margin;
  const minY = input.boundary.top + margin;
  const maxX = Math.max(
    minX,
    input.boundary.right - margin - input.menuWidth,
  );
  const maxY = Math.max(
    minY,
    input.boundary.bottom - margin - input.menuHeight,
  );
  return {
    left: Math.round(Math.min(Math.max(raw.left, minX), maxX)),
    top: Math.round(Math.min(Math.max(raw.top, minY), maxY)),
    placement,
    maxHeight: Math.max(96, Math.floor(input.boundary.height - margin * 2)),
  };
}

export function prismMenuTypeaheadMatch(
  labels: string[],
  query: string,
  currentIndex: number,
): number {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle || labels.length === 0) return -1;
  for (let offset = 1; offset <= labels.length; offset += 1) {
    const index = (currentIndex + offset + labels.length) % labels.length;
    if (labels[index]?.toLocaleLowerCase().startsWith(needle)) return index;
  }
  return -1;
}

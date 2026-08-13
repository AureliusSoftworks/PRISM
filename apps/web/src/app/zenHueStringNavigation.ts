// The deepest Zenith directory is a two-row close-up. It gives the cable one
// extra meaningful pull beyond the previous three-row floor.
export const ZEN_HUE_DIRECTORY_MIN_ROWS = 2;

export type ZenHueDirectoryTier = "root" | number;

export interface ZenHueDirectoryState {
  hueAnchor: number | null;
  tier: ZenHueDirectoryTier;
}

export const ZEN_HUE_DIRECTORY_ROOT: ZenHueDirectoryState = Object.freeze({
  hueAnchor: null,
  tier: "root",
});

export interface ZenHueDirectoryLayout {
  rootRows: number;
  rootCols: number;
  tiers: readonly number[];
}

export const ZEN_HUE_ATMOSPHERE_MAX_NODES = 5;

export function zenHueAtmosphereNodeCount(
  tier: ZenHueDirectoryTier,
): number {
  if (tier === "root") return ZEN_HUE_ATMOSPHERE_MAX_NODES;
  return Math.max(
    ZEN_HUE_DIRECTORY_MIN_ROWS,
    Math.min(ZEN_HUE_ATMOSPHERE_MAX_NODES, Math.round(tier)),
  );
}

export function zenHueAtmosphereColors(options: {
  tier: ZenHueDirectoryTier;
  visibleColors: readonly string[];
  rootColors: readonly string[];
}): string[] {
  if (options.tier === "root") {
    return options.rootColors.slice(0, ZEN_HUE_ATMOSPHERE_MAX_NODES);
  }
  const candidates = options.visibleColors.filter(
    (color) => color.trim().length > 0,
  );
  if (candidates.length === 0) return [];
  const count = zenHueAtmosphereNodeCount(options.tier);
  if (count === 1) return [candidates[Math.floor(candidates.length / 2)]!];
  return Array.from({ length: count }, (_, index) => {
    const candidateIndex = Math.round(
      (index / (count - 1)) * Math.max(0, candidates.length - 1),
    );
    return candidates[candidateIndex]!;
  });
}

export function wrapZenHue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return ((value % 360) + 360) % 360;
}

export function zenHueDirectoryColumns(
  rows: number,
  frameWidth: number,
  frameHeight: number,
  minimumColumns = 1,
): number {
  const safeRows = Math.max(1, Math.floor(rows));
  const aspect = Math.max(1, frameWidth / Math.max(1, frameHeight));
  return Math.max(minimumColumns, Math.round(safeRows * aspect));
}

export function zenHueDirectoryLayout(options: {
  totalBots: number;
  filterableBots: number;
  frameWidth: number;
  frameHeight: number;
  rootRows: number;
  rootCols: number;
  minimumColumns?: number;
}): ZenHueDirectoryLayout {
  const totalBots = Math.max(0, Math.floor(options.totalBots));
  const filterableBots = Math.max(0, Math.floor(options.filterableBots));
  const rootRows = Math.max(1, Math.floor(options.rootRows));
  const rootCols = Math.max(1, Math.floor(options.rootCols));
  const tiers: number[] = [];

  for (let rows = ZEN_HUE_DIRECTORY_MIN_ROWS; rows < rootRows; rows += 1) {
    const cols = zenHueDirectoryColumns(
      rows,
      options.frameWidth,
      options.frameHeight,
      options.minimumColumns,
    );
    const capacity = Math.min(filterableBots, rows * cols);
    if (capacity >= ZEN_HUE_DIRECTORY_MIN_ROWS && capacity < totalBots) {
      tiers.push(rows);
    }
  }

  return { rootRows, rootCols, tiers };
}

export function clampZenHueDirectoryState(
  state: ZenHueDirectoryState,
  layout: ZenHueDirectoryLayout,
): ZenHueDirectoryState {
  if (state.hueAnchor === null || layout.tiers.length === 0) {
    return {
      hueAnchor:
        state.hueAnchor === null || layout.tiers.length === 0
          ? null
          : wrapZenHue(state.hueAnchor),
      tier: "root",
    };
  }
  if (state.tier === "root") {
    return { hueAnchor: wrapZenHue(state.hueAnchor), tier: "root" };
  }
  const requested = Math.max(
    ZEN_HUE_DIRECTORY_MIN_ROWS,
    Math.round(state.tier),
  );
  const closest = layout.tiers.reduce((best, tier) =>
    Math.abs(tier - requested) < Math.abs(best - requested) ? tier : best,
  );
  return { hueAnchor: wrapZenHue(state.hueAnchor), tier: closest };
}

export function zenHueTierIndex(
  tier: ZenHueDirectoryTier,
  tiers: readonly number[],
): number {
  if (tier === "root") return tiers.length;
  const index = tiers.indexOf(tier);
  if (index >= 0) return index;
  if (tiers.length === 0) return 0;
  return tiers.reduce(
    (bestIndex, candidate, indexValue) =>
      Math.abs(candidate - tier) < Math.abs(tiers[bestIndex] - tier)
        ? indexValue
        : bestIndex,
    0,
  );
}

export function zenHueTierAtIndex(
  index: number,
  tiers: readonly number[],
): ZenHueDirectoryTier {
  const clamped = Math.max(0, Math.min(tiers.length, Math.round(index)));
  return clamped >= tiers.length ? "root" : tiers[clamped];
}

function logarithmicDetentPosition(index: number, lastIndex: number): number {
  if (lastIndex <= 0) return 0;
  const strength = 5;
  return Math.log1p((Math.max(0, index) / lastIndex) * strength) /
    Math.log1p(strength);
}

/**
 * Maps vertical string travel onto discrete directory tiers. Logarithmic
 * detents reserve more physical travel near the intimate two-row view and
 * progressively compress the broader directories near the rainbow root.
 */
export function zenHueTierForVerticalDrag(options: {
  startTier: ZenHueDirectoryTier;
  previousTier: ZenHueDirectoryTier;
  tiers: readonly number[];
  deltaY: number;
  travelPx?: number;
  deadZonePx?: number;
  hysteresisPx?: number;
}): ZenHueDirectoryTier {
  const { tiers } = options;
  if (tiers.length === 0) return "root";
  const deadZone = options.deadZonePx ?? 8;
  if (Math.abs(options.deltaY) <= deadZone) return options.previousTier;
  const lastIndex = tiers.length;
  const startIndex = zenHueTierIndex(options.startTier, tiers);
  const startPosition = logarithmicDetentPosition(startIndex, lastIndex);
  const travel = Math.max(48, options.travelPx ?? 150);
  const direction = Math.sign(options.deltaY);
  const adjustedDelta =
    direction * Math.max(0, Math.abs(options.deltaY) - deadZone);
  const targetPosition = Math.max(
    0,
    Math.min(1, startPosition + adjustedDelta / travel),
  );
  let candidateIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index <= lastIndex; index += 1) {
    const distance = Math.abs(
      logarithmicDetentPosition(index, lastIndex) - targetPosition,
    );
    if (distance < bestDistance) {
      candidateIndex = index;
      bestDistance = distance;
    }
  }

  const previousIndex = zenHueTierIndex(options.previousTier, tiers);
  if (candidateIndex !== previousIndex) {
    const boundary =
      (logarithmicDetentPosition(previousIndex, lastIndex) +
        logarithmicDetentPosition(candidateIndex, lastIndex)) /
      2;
    const hysteresis = (options.hysteresisPx ?? 5) / travel;
    if (
      (candidateIndex > previousIndex && targetPosition < boundary + hysteresis) ||
      (candidateIndex < previousIndex && targetPosition > boundary - hysteresis)
    ) {
      return options.previousTier;
    }
  }
  return zenHueTierAtIndex(candidateIndex, tiers);
}

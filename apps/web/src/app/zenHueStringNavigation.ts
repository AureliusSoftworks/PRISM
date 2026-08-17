// The deepest Zenith directory is a single, intimate row. It is deliberately
// a card view rather than another density stage.
export const ZEN_HUE_DIRECTORY_MIN_ROWS = 1;
// The one-row close-up is intentionally shorter than the rest of the ladder so
// its named bot cards can become the largest, most legible picker treatment.
export const ZEN_HUE_DIRECTORY_ONE_ROW_COLUMNS = 10;

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

export interface ZenHueAtmospherePalette {
  coherence: number;
  saturation: number;
  representativeColors: string[];
}

export function zenHueAtmosphereNodeCount(
  tier: ZenHueDirectoryTier,
): number {
  if (tier === "root") return ZEN_HUE_ATMOSPHERE_MAX_NODES;
  return Math.max(
    ZEN_HUE_DIRECTORY_MIN_ROWS,
    Math.min(ZEN_HUE_ATMOSPHERE_MAX_NODES, Math.round(tier)),
  );
}

function parseHexColor(color: string): [number, number, number] | null {
  const clean = color.trim().replace(/^#/u, "");
  const expanded =
    clean.length === 3
      ? clean
          .split("")
          .map((channel) => `${channel}${channel}`)
          .join("")
      : clean;
  if (!/^[0-9a-f]{6}$/iu.test(expanded)) return null;
  return [
    Number.parseInt(expanded.slice(0, 2), 16) / 255,
    Number.parseInt(expanded.slice(2, 4), 16) / 255,
    Number.parseInt(expanded.slice(4, 6), 16) / 255,
  ];
}

function hueAndUsableChroma(
  color: string,
): { hue: number; usableChroma: number } | null {
  const channels = parseHexColor(color);
  if (!channels) return null;
  const [red, green, blue] = channels;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const chroma = max - min;
  if (chroma <= 0.015) return null;

  let sector = 0;
  if (max === red) sector = (green - blue) / chroma;
  else if (max === green) sector = (blue - red) / chroma + 2;
  else sector = (red - green) / chroma + 4;
  const hue = wrapZenHue(sector * 60);
  // RGB chroma already falls away for near-gray and near-black colors. The
  // small floor above rejects unstable hues that should not steer the room.
  return { hue, usableChroma: chroma };
}

/**
 * Reduces the visible bot palette to representative spectrum nodes and a
 * circular hue resultant. A coherent family earns extra saturation; a broad
 * spectrum keeps its complete representative gradient at baseline saturation.
 * Every bot contributes in proportion to its usable RGB chroma, so gray
 * identity colors do not invent an atmosphere.
 *
 * The returned palette is intentionally independent from directory tier.
 * Zen composes depth with two painters instead: a hue-specific atmosphere
 * below the broad group gradient, whose opacity fades toward the one-row
 * directory. Keeping that blend out of the palette math makes it reversible.
 */
export function zenHueAtmospherePalette(options: {
  tier: ZenHueDirectoryTier;
  visibleColors: readonly string[];
}): ZenHueAtmospherePalette {
  const candidates = options.visibleColors.flatMap((color) => {
    const parsed = hueAndUsableChroma(color);
    return parsed ? [{ color: color.trim(), ...parsed }] : [];
  });
  if (candidates.length === 0) {
    return { coherence: 0, saturation: 1, representativeColors: [] };
  }

  let vectorX = 0;
  let vectorY = 0;
  let totalWeight = 0;
  for (const candidate of candidates) {
    const radians = (candidate.hue * Math.PI) / 180;
    vectorX += Math.cos(radians) * candidate.usableChroma;
    vectorY += Math.sin(radians) * candidate.usableChroma;
    totalWeight += candidate.usableChroma;
  }
  const coherence = Math.max(
    0,
    Math.min(1, Math.hypot(vectorX, vectorY) / Math.max(totalWeight, 0.001)),
  );
  const saturation = 1 + coherence * 0.45;
  const sorted = [...candidates].sort(
    (a, b) => a.hue - b.hue || a.color.localeCompare(b.color),
  );
  const count = Math.min(ZEN_HUE_ATMOSPHERE_MAX_NODES, sorted.length);
  const representativeColors =
    count === 1
      ? [sorted[Math.floor(sorted.length / 2)]!.color]
      : Array.from({ length: count }, (_, index) => {
          const candidateIndex = Math.round(
            (index / (count - 1)) * Math.max(0, sorted.length - 1),
          );
          return sorted[candidateIndex]!.color;
        });

  return { coherence, saturation, representativeColors };
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
  if (safeRows === ZEN_HUE_DIRECTORY_MIN_ROWS) {
    return ZEN_HUE_DIRECTORY_ONE_ROW_COLUMNS;
  }
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

/**
 * Opacity for the broad group-gradient painter above the hue-specific room.
 * Root fully preserves the familiar spectrum; the deepest directory fully
 * reveals the selected hue. Intermediate row tiers blend monotonically.
 */
export function zenHueGradientOverlayOpacity(
  tier: ZenHueDirectoryTier,
  tiers: readonly number[],
): number {
  if (tier === "root" || tiers.length === 0) return 1;
  return Math.max(0, Math.min(1, zenHueTierIndex(tier, tiers) / tiers.length));
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
 * detents reserve more physical travel near the intimate one-row view and
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

/** Physical-only cable recoil. It never alters the committed directory. */
export interface ZenHueCableSpringState {
  displacement: number;
  velocity: number;
}

export interface ZenHueCableHorizontalInertiaState {
  sliderValue: number;
  velocity: number;
}

export interface ZenHueCableHorizontalStepOptions {
  sliderValue: number;
  deltaClientX: number;
  surfaceWidth: number;
  gain?: number;
}

export type ZenHueCableDragDirection = -1 | 0 | 1;

export interface ZenHueCableTraversalStep {
  deltaY: number;
  direction: ZenHueCableDragDirection;
  normalizedPull: number;
  pullBoost: number;
}

export interface ZenHueCableTraversalStepOptions {
  deltaY: number;
  deadZonePx: number;
  currentDirection: ZenHueCableDragDirection;
  directionLatchPx: number;
  pullScalePx?: number;
  pullBoost?: number;
}

export interface ZenHueCableTraversalFrame {
  normalizedPosition: number;
  direction: ZenHueCableDragDirection;
  normalizedPull: number;
  tierSpeed: number;
}

export interface ZenHueCableTraversalFrameOptions
  extends ZenHueCableTraversalStepOptions {
  normalizedPosition: number;
  elapsedSeconds: number;
  tierCount: number;
  baseTierSpeed?: number;
}

const ZEN_HUE_CABLE_PULL_BOOST_MAX = 1.85;
const ZEN_HUE_CABLE_PULL_SCALE_PX = 170;
export const ZEN_HUE_CABLE_HORIZONTAL_GAIN = 1.18;
const ZEN_HUE_CABLE_HORIZONTAL_FRICTION_PER_FRAME = 0.86;

export interface ZenHueCableHandleClientPointOptions {
  svgX: number;
  svgY: number;
  viewBoxWidth: number;
  viewBoxHeight: number;
  clientLeft: number;
  clientTop: number;
  clientWidth: number;
  clientHeight: number;
}

/**
 * Maps a point from the cable SVG into webview client coordinates. The SVG
 * uses the browser default `xMidYMid meet` preservation, so its fitted viewBox
 * can be letterboxed inside the interactive surface.
 */
export function zenHueCableHandleClientPoint(
  options: ZenHueCableHandleClientPointOptions,
): { x: number; y: number } {
  const viewBoxWidth = Math.max(1, options.viewBoxWidth);
  const viewBoxHeight = Math.max(1, options.viewBoxHeight);
  const clientWidth = Math.max(0, options.clientWidth);
  const clientHeight = Math.max(0, options.clientHeight);
  const scale = Math.min(
    clientWidth / viewBoxWidth,
    clientHeight / viewBoxHeight,
  );
  const renderedWidth = viewBoxWidth * scale;
  const renderedHeight = viewBoxHeight * scale;
  return {
    x:
      options.clientLeft +
      (clientWidth - renderedWidth) / 2 +
      options.svgX * scale,
    y:
      options.clientTop +
      (clientHeight - renderedHeight) / 2 +
      options.svgY * scale,
  };
}

export function zenHueCableAcceleratedSliderStep(
  options: ZenHueCableHorizontalStepOptions,
): number {
  const surfaceWidth = Math.max(1, options.surfaceWidth);
  const gain = Math.max(1, options.gain ?? ZEN_HUE_CABLE_HORIZONTAL_GAIN);
  const delta = (options.deltaClientX / surfaceWidth) * 359 * gain;
  return Math.max(0, Math.min(359, options.sliderValue + delta));
}

export function stepZenHueCableHorizontalInertia(
  state: ZenHueCableHorizontalInertiaState,
  elapsedSeconds: number,
): ZenHueCableHorizontalInertiaState {
  const dt = Math.max(0, Math.min(0.032, elapsedSeconds));
  const friction = Math.pow(
    ZEN_HUE_CABLE_HORIZONTAL_FRICTION_PER_FRAME,
    dt * 60,
  );
  const velocity = state.velocity * friction;
  const unboundedSliderValue = state.sliderValue + velocity * dt;
  const sliderValue = Math.max(0, Math.min(359, unboundedSliderValue));
  return {
    sliderValue,
    velocity: sliderValue === unboundedSliderValue ? velocity : 0,
  };
}

export function zenHueCableHorizontalInertiaHasSettled(
  state: ZenHueCableHorizontalInertiaState,
): boolean {
  return Math.abs(state.velocity) < 2;
}

export interface ZenHueCableBoundaryWhiteoutOptions {
  tier: ZenHueDirectoryTier;
  tiers: readonly number[];
  deltaY: number;
  deadZonePx: number;
  fullWhitePullPx?: number;
}

/**
 * Turns blocked overpull into a visual-only whiteout. Downward pull is blocked
 * at the rainbow root; upward pull is blocked at the deepest hue directory.
 */
export function zenHueCableBoundaryWhiteoutProgress(
  options: ZenHueCableBoundaryWhiteoutOptions,
): number {
  const deadZonePx = Math.max(0, options.deadZonePx);
  const deepestTier = options.tiers[0];
  const blockedPullPx =
    options.tier === "root" && options.deltaY > deadZonePx
      ? options.deltaY
      : deepestTier !== undefined &&
          options.tier === deepestTier &&
          options.deltaY < -deadZonePx
        ? -options.deltaY
        : 0;
  if (blockedPullPx <= deadZonePx) return 0;
  const fullWhitePullPx = Math.max(
    deadZonePx + 1,
    options.fullWhitePullPx ?? 48,
  );
  return Math.min(
    1,
    (blockedPullPx - deadZonePx) / (fullWhitePullPx - deadZonePx),
  );
}

/** Converts rAF's millisecond clock to a bounded seconds delta. */
export function zenHueCableFrameElapsedSeconds(
  nowMs: number,
  previousMs: number,
): number {
  if (!Number.isFinite(nowMs) || !Number.isFinite(previousMs)) return 0;
  return Math.max(0, Math.min(50, nowMs - previousMs)) / 1000;
}

export function zenHueCableTraversalStep(
  options: ZenHueCableTraversalStepOptions,
): ZenHueCableTraversalStep {
  const deadZonePx = Math.max(0, options.deadZonePx);
  const directionLatchPx = Math.max(
    deadZonePx,
    Math.max(1, options.directionLatchPx),
  );
  const pullScalePx = Math.max(1, options.pullScalePx ?? ZEN_HUE_CABLE_PULL_SCALE_PX);
  const pullBoostMax = Math.max(1, options.pullBoost ?? ZEN_HUE_CABLE_PULL_BOOST_MAX);
  const absDelta = Math.abs(options.deltaY);
  if (absDelta <= deadZonePx) {
    return {
      deltaY: 0,
      direction: options.currentDirection,
      normalizedPull: 0,
      pullBoost: 1,
    };
  }

  let nextDirection = options.currentDirection;
  if (nextDirection === 0) {
    nextDirection = options.deltaY > 0 ? 1 : -1;
  }

  const nextOpposite = nextDirection === 1 ? options.deltaY < 0 : options.deltaY > 0;
  if (nextOpposite && absDelta < directionLatchPx) {
    return {
      deltaY: 0,
      direction: nextDirection,
      normalizedPull: 0,
      pullBoost: 1,
    };
  }
  if (nextOpposite) {
    nextDirection = options.deltaY > 0 ? 1 : -1;
  }

  const normalizedPull = Math.min(
    1,
    Math.max(0, (absDelta - deadZonePx) / pullScalePx),
  );
  const pullBoost = 1 + normalizedPull * (pullBoostMax - 1);
  return {
    deltaY: options.deltaY * pullBoost,
    direction: nextDirection,
    normalizedPull,
    pullBoost,
  };
}

/**
 * Integrates a held cable pull. Position is normalized across the live tier
 * ladder, so a full-strength pull crosses a 100-bot and a 100,000-bot
 * directory in nearly the same time. `tierSpeed` still scales by tier count
 * so every individual detent receives the same physical cadence.
 */
export function zenHueCableTraversalFrame(
  options: ZenHueCableTraversalFrameOptions,
): ZenHueCableTraversalFrame {
  const step = zenHueCableTraversalStep(options);
  const tierCount = Math.max(1, Math.floor(options.tierCount));
  const elapsedSeconds = Math.max(0, Math.min(0.05, options.elapsedSeconds));
  const baseTierSpeed = Math.max(0, options.baseTierSpeed ?? 1.35);
  // Movement begins gently at the edge of the dead zone, then accelerates
  // sharply as the cable is pulled taut. This keeps a small held deflection
  // from racing through directories while preserving a fast full pull.
  const pullResponse = Math.pow(step.normalizedPull, 1.2);
  const tierSpeed =
    baseTierSpeed * tierCount * pullResponse * step.pullBoost;
  const normalizedVelocity = tierSpeed / tierCount;
  const signedVelocity = step.direction * normalizedVelocity;
  const active = step.deltaY !== 0 ? signedVelocity : 0;
  return {
    normalizedPosition: Math.max(
      0,
      Math.min(1, options.normalizedPosition + active * elapsedSeconds),
    ),
    direction: step.direction,
    normalizedPull: step.normalizedPull,
    tierSpeed: step.deltaY !== 0 ? signedVelocity * tierCount : 0,
  };
}

export function zenHueTierForNormalizedPosition(
  normalizedPosition: number,
  tiers: readonly number[],
): ZenHueDirectoryTier {
  return zenHueTierAtIndex(
    Math.round(Math.max(0, Math.min(1, normalizedPosition)) * tiers.length),
    tiers,
  );
}

export function stepZenHueCableSpring(
  state: ZenHueCableSpringState,
  elapsedSeconds: number,
): ZenHueCableSpringState {
  const dt = Math.max(0, Math.min(0.032, elapsedSeconds));
  const stiffness = 430;
  const damping = 21;
  const acceleration =
    -stiffness * state.displacement - damping * state.velocity;
  const velocity = state.velocity + acceleration * dt;
  return { displacement: state.displacement + velocity * dt, velocity };
}

export function zenHueCableSpringHasSettled(
  state: ZenHueCableSpringState,
): boolean {
  return Math.abs(state.displacement) < 0.12 && Math.abs(state.velocity) < 2;
}

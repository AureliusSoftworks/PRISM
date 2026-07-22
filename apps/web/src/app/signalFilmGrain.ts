export const REPLAY_VIDEO_BITRATE = 6_000_000;
export const SIGNAL_GRAIN_REPLAY_VIDEO_BITRATE = 12_000_000;
export const SIGNAL_FILM_GRAIN_TILE_SIZE = 256;

export interface SignalFilmGrainFramePlan {
  level: number;
  seed: number;
  opacity: number;
  scanlineOpacity: number;
  offsetX: number;
  offsetY: number;
  dustCount: number;
  scratchCount: number;
}

function clampSignalFilmGrainLevel(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

/**
 * Keeps the encoder treatment deterministic while changing the emulsion on
 * every encoded frame. This is intentionally independent of the live CSS
 * animation because foreign-object canvas capture does not preserve it.
 */
export function signalFilmGrainFramePlan(
  levelValue: unknown,
  frame: number,
): SignalFilmGrainFramePlan {
  const level = clampSignalFilmGrainLevel(levelValue);
  const safeFrame = Math.max(0, Math.floor(frame));
  const seed = (
    0x9e3779b9 ^ Math.imul(safeFrame + 1, 0x85ebca6b)
  ) >>> 0;
  return {
    level,
    seed,
    opacity: Number((level * 0.34).toFixed(4)),
    scanlineOpacity: Number((level * 0.1).toFixed(4)),
    offsetX: (seed & 31) - 16,
    offsetY: ((seed >>> 5) & 31) - 16,
    dustCount: Math.round(level * 18),
    scratchCount: safeFrame % 19 === 0 ? Math.round(level * 2) : 0,
  };
}

export function replayVideoBitrateForFilmGrain(levelValue: unknown): number {
  return signalFilmGrainFramePlan(levelValue, 0).level > 0
    ? SIGNAL_GRAIN_REPLAY_VIDEO_BITRATE
    : REPLAY_VIDEO_BITRATE;
}

function nextGrainRandom(state: { value: number }): number {
  state.value = (state.value + 0x6d2b79f5) >>> 0;
  let value = state.value;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
}

export function paintSignalFilmGrain(args: {
  targetContext: OffscreenCanvasRenderingContext2D;
  noiseCanvas: OffscreenCanvas;
  noiseContext: OffscreenCanvasRenderingContext2D;
  noiseImageData: ImageData;
  width: number;
  height: number;
  level: number;
  frame: number;
}): void {
  const plan = signalFilmGrainFramePlan(args.level, args.frame);
  if (plan.level <= 0) return;

  const random = { value: plan.seed };
  const pixels = args.noiseImageData.data;
  for (let y = 0; y < SIGNAL_FILM_GRAIN_TILE_SIZE; y += 2) {
    for (let x = 0; x < SIGNAL_FILM_GRAIN_TILE_SIZE; x += 2) {
      const roll = nextGrainRandom(random);
      const value =
        roll < 0.08
          ? 0
          : roll > 0.92
            ? 255
            : Math.round(42 + nextGrainRandom(random) * 171);
      for (let deltaY = 0; deltaY < 2; deltaY += 1) {
        for (let deltaX = 0; deltaX < 2; deltaX += 1) {
          const offset =
            ((y + deltaY) * SIGNAL_FILM_GRAIN_TILE_SIZE + x + deltaX) * 4;
          pixels[offset] = value;
          pixels[offset + 1] = value;
          pixels[offset + 2] = value;
          pixels[offset + 3] = 255;
        }
      }
    }
  }
  args.noiseContext.putImageData(args.noiseImageData, 0, 0);

  const target = args.targetContext;
  const tileSize = SIGNAL_FILM_GRAIN_TILE_SIZE;
  const pattern = target.createPattern(args.noiseCanvas, "repeat");
  target.save();
  target.globalCompositeOperation = "overlay";
  target.globalAlpha = plan.opacity;
  if (pattern) {
    target.translate(plan.offsetX, plan.offsetY);
    target.fillStyle = pattern;
    target.fillRect(
      -tileSize,
      -tileSize,
      args.width + tileSize * 2,
      args.height + tileSize * 2,
    );
  }
  target.restore();

  target.save();
  target.globalCompositeOperation = "multiply";
  target.globalAlpha = plan.scanlineOpacity;
  target.fillStyle = "#10131a";
  const scanlinePhase = args.frame % 4;
  for (let y = scanlinePhase; y < args.height; y += 4) {
    target.fillRect(0, y, args.width, 1);
  }
  target.restore();

  target.save();
  target.globalCompositeOperation = "screen";
  target.globalAlpha = 0.14 * plan.level;
  target.fillStyle = "#f3eee2";
  for (let index = 0; index < plan.dustCount; index += 1) {
    const x = nextGrainRandom(random) * args.width;
    const y = nextGrainRandom(random) * args.height;
    const size = 1 + nextGrainRandom(random) * 2.4;
    target.fillRect(x, y, size, size);
  }
  target.globalAlpha = 0.1 * plan.level;
  for (let index = 0; index < plan.scratchCount; index += 1) {
    const x = nextGrainRandom(random) * args.width;
    const length = args.height * (0.08 + nextGrainRandom(random) * 0.2);
    const y = nextGrainRandom(random) * (args.height - length);
    target.fillRect(x, y, 1, length);
  }
  target.restore();
}

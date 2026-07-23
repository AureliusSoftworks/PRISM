export const PRISM_COMPANION_GLASS_TAP_SOURCES = [
  "/audio/prism-companion/glass-tap-01.mp3",
  "/audio/prism-companion/glass-tap-02.mp3",
  "/audio/prism-companion/glass-tap-03.mp3",
  "/audio/prism-companion/glass-tap-04.mp3",
] as const;

interface PrismCompanionTapAudio {
  currentTime: number;
  preload: string;
  volume: number;
  addEventListener(
    type: "ended" | "error",
    listener: () => void,
    options?: { once?: boolean },
  ): void;
  pause(): void;
  play(): Promise<void>;
}

type PrismCompanionTapAudioFactory = (
  src: string,
) => PrismCompanionTapAudio;

export interface PrismCompanionGlassTapPlaybackOptions {
  createAudio?: PrismCompanionTapAudioFactory;
  random?: () => number;
}

const PRISM_COMPANION_GLASS_TAP_VOLUME = 0.42;
const activeTapAudio = new Set<PrismCompanionTapAudio>();
let previousTapVariantIndex = -1;

export function prismCompanionGlassTapVariantIndex(
  randomValue: number,
  previousVariantIndex: number,
): number {
  const count = PRISM_COMPANION_GLASS_TAP_SOURCES.length;
  const normalizedRandom = Number.isFinite(randomValue)
    ? Math.max(0, Math.min(0.999999, randomValue))
    : 0;
  const candidate = Math.floor(normalizedRandom * count);
  return candidate === previousVariantIndex ? (candidate + 1) % count : candidate;
}

function releasePrismCompanionTapAudio(audio: PrismCompanionTapAudio): void {
  activeTapAudio.delete(audio);
  audio.pause();
  audio.currentTime = 0;
}

export function playPrismCompanionGlassTap(
  options: PrismCompanionGlassTapPlaybackOptions = {},
): boolean {
  const createAudio =
    options.createAudio ??
    (typeof Audio === "function" ? (src: string) => new Audio(src) : null);
  if (!createAudio) return false;

  const nextVariantIndex = prismCompanionGlassTapVariantIndex(
    (options.random ?? Math.random)(),
    previousTapVariantIndex,
  );
  previousTapVariantIndex = nextVariantIndex;
  const audio = createAudio(
    PRISM_COMPANION_GLASS_TAP_SOURCES[nextVariantIndex]!,
  );
  audio.preload = "auto";
  audio.volume = PRISM_COMPANION_GLASS_TAP_VOLUME;
  activeTapAudio.add(audio);
  const release = (): void => releasePrismCompanionTapAudio(audio);
  audio.addEventListener("ended", release, { once: true });
  audio.addEventListener("error", release, { once: true });
  void audio.play().catch(release);
  return true;
}

export function stopPrismCompanionGlassTapAudio(): void {
  for (const audio of [...activeTapAudio]) {
    releasePrismCompanionTapAudio(audio);
  }
}

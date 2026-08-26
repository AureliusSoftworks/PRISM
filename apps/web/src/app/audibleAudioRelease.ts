export const PRISM_APPLET_AUDIO_RELEASE_MS = 220;

export interface AudibleAudioReleaseOptions {
  durationMs?: number;
  resetTime?: boolean;
  clearSource?: boolean;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => number;
  cancel?: (timer: number) => void;
  onReleased?: () => void;
}

interface ActiveAudibleRelease {
  promise: Promise<void>;
  cancel: (restoreVolume?: number) => void;
}

const activeReleases = new WeakMap<HTMLMediaElement, ActiveAudibleRelease>();

/** Revive a detached element when the same owner resumes before its fade ends. */
export function cancelAudibleAudioRelease(
  media: HTMLMediaElement,
  restoreVolume?: number,
): void {
  activeReleases.get(media)?.cancel(restoreVolume);
}

/** Detach ownership before calling this helper. It preserves an audible tail,
 * then performs media teardown exactly once even if multiple owners release
 * the same element concurrently. */
export function releaseAudibleAudioElement(
  media: HTMLMediaElement,
  options: AudibleAudioReleaseOptions = {},
): Promise<void> {
  const existing = activeReleases.get(media);
  if (existing) return existing.promise;
  const durationMs = Math.max(
    0,
    Math.round(options.durationMs ?? PRISM_APPLET_AUDIO_RELEASE_MS),
  );
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((callback, delayMs) =>
    globalThis.setTimeout(callback, delayMs) as unknown as number);
  const cancel = options.cancel ?? ((timer) => globalThis.clearTimeout(timer));
  const initialVolume = Math.max(0, media.volume);
  let timer: number | null = null;
  let released = false;
  let cancelled = false;
  let resolveRelease: (() => void) | null = null;
  const finished = new Promise<void>((resolve) => {
    resolveRelease = resolve;
  });
  const cancelRelease = (restoreVolume = initialVolume): void => {
    if (released || cancelled) return;
    cancelled = true;
    if (timer !== null) cancel(timer);
    timer = null;
    media.volume = Math.max(0, Math.min(1, restoreVolume));
    activeReleases.delete(media);
    resolveRelease?.();
    resolveRelease = null;
  };
  activeReleases.set(media, { promise: finished, cancel: cancelRelease });

  const finish = (): void => {
    if (released || cancelled) return;
    released = true;
    if (timer !== null) cancel(timer);
    timer = null;
    media.pause();
    if (options.resetTime) {
      try { media.currentTime = 0; } catch { /* metadata may be unavailable */ }
    }
    if (options.clearSource) {
      media.removeAttribute("src");
      media.load();
    }
    activeReleases.delete(media);
    options.onReleased?.();
    resolveRelease?.();
    resolveRelease = null;
  };

  if (durationMs === 0 || media.paused || initialVolume <= 0) {
    finish();
    return finished;
  }
  const startedAt = now();
  const step = (): void => {
    if (cancelled) return;
    const progress = Math.min(1, Math.max(0, (now() - startedAt) / durationMs));
    media.volume = initialVolume * Math.cos((progress * Math.PI) / 2);
    if (progress >= 1) {
      finish();
      return;
    }
    timer = schedule(step, 16);
  };
  step();
  return finished;
}

/** Immediate cleanup is reserved for silent, prepared, failed, or naturally
 * ended media. Audible player-facing cancellation uses release above. */
export function teardownSilentMediaElementImmediately(
  media: HTMLMediaElement,
  options: Pick<AudibleAudioReleaseOptions, "resetTime" | "clearSource" | "onReleased"> = {},
): void {
  media.pause();
  if (options.resetTime) {
    try { media.currentTime = 0; } catch { /* metadata may be unavailable */ }
  }
  if (options.clearSource) {
    media.removeAttribute("src");
    media.load();
  }
  options.onReleased?.();
}

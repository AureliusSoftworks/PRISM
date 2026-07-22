export const SIGNAL_REPLAY_STAGE_MOUNT_MAX_FRAMES = 60;
export const SIGNAL_REPLAY_CAPTURE_TIMEOUT_MS = 30_000;

type NextFrame = () => Promise<void>;

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * The hidden Signal Studio is mounted by React after the replay renderer asks
 * for it. Do not assume two animation frames are enough on a busy client.
 */
export async function waitForSignalReplayRenderStage<T>(
  getStage: () => T | null,
  {
    maxFrames = SIGNAL_REPLAY_STAGE_MOUNT_MAX_FRAMES,
    nextFrame = nextAnimationFrame,
  }: {
    maxFrames?: number;
    nextFrame?: NextFrame;
  } = {},
): Promise<T> {
  const frameLimit = Math.max(1, maxFrames);
  for (let frame = 0; frame <= frameLimit; frame += 1) {
    const stage = getStage();
    if (stage) return stage;
    if (frame < frameLimit) await nextFrame();
  }
  throw new Error("Signal studio capture did not mount.");
}

/** Keeps a stalled foreign-object capture from holding a replay lease forever. */
export async function withSignalReplayCaptureTimeout<T>(
  operation: string,
  promise: Promise<T>,
  timeoutMs = SIGNAL_REPLAY_CAPTURE_TIMEOUT_MS,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new Error(`${operation} timed out. Retry the episode video render.`),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

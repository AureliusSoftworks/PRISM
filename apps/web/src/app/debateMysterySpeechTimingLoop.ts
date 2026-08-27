export interface WhodunnitSpeechTimingLoop {
  start: () => void;
  stop: () => void;
}

interface WhodunnitSpeechTimingLoopOptions {
  requestFrame: (callback: (now: number) => void) => number;
  cancelFrame: (frameId: number) => void;
  onFrame: (now: number, publish: boolean) => boolean;
  publishIntervalMs?: number;
}

export function createWhodunnitSpeechTimingLoop({
  requestFrame,
  cancelFrame,
  onFrame,
  publishIntervalMs = 50,
}: WhodunnitSpeechTimingLoopOptions): WhodunnitSpeechTimingLoop {
  let frameId: number | null = null;
  let lastPublishedAt: number | null = null;
  let stopped = false;

  const tick = (now: number): void => {
    frameId = null;
    if (stopped) return;
    const publish = lastPublishedAt === null || now - lastPublishedAt >= publishIntervalMs;
    if (publish) lastPublishedAt = now;
    if (onFrame(now, publish) && !stopped) frameId = requestFrame(tick);
  };

  return {
    start: () => {
      if (stopped || frameId !== null) return;
      frameId = requestFrame(tick);
    },
    stop: () => {
      stopped = true;
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
    },
  };
}

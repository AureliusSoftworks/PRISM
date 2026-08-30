export interface SignalOpeningStudioRevealTiming {
  fadeMs: number;
  hostEntranceDelayMs: number;
}

/** Lets the studio arrive as a place before the host claims the microphone. */
export function signalOpeningStudioRevealTiming(args: {
  reducedMotion: boolean;
  skipped: boolean;
}): SignalOpeningStudioRevealTiming {
  if (args.skipped) {
    return {
      fadeMs: args.reducedMotion ? 90 : 360,
      hostEntranceDelayMs: 1_000,
    };
  }
  if (args.reducedMotion) {
    return { fadeMs: 90, hostEntranceDelayMs: 1_250 };
  }
  return { fadeMs: 720, hostEntranceDelayMs: 1_650 };
}

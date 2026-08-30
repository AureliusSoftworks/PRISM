interface SignalReplayStageBeatBoundary {
  startMs: number;
  endMs: number;
}

interface SignalReplayStageDirectionBoundary {
  atMs: number;
  endMs?: number;
}

interface SignalReplaySpeechActivityBoundarySource {
  cues: readonly { atMs: number }[];
}

interface SignalReplayOwnerBoundaryManifest {
  direction?: readonly SignalReplayStageDirectionBoundary[];
  presentation?: {
    speechActivityTracks?: readonly SignalReplaySpeechActivityBoundarySource[];
  };
}

/**
 * Discrete boundaries that require the full Signal owner to reconcile.
 *
 * Speech-activity cues are intentionally excluded: faithful replay mouths and
 * voice lights sample those dense tracks from the media element inside the
 * isolated live-visual sampler. Publishing the owner clock for every cue would
 * bypass its low-frequency cadence without improving visual fidelity.
 */
export function signalReplayOwnerBoundaryTimesMs(args: {
  beats?: readonly SignalReplayStageBeatBoundary[];
  manifest?: SignalReplayOwnerBoundaryManifest | null;
}): number[] {
  const boundaries = new Set<number>();
  for (const beat of args.beats ?? []) {
    boundaries.add(Math.max(0, Math.round(beat.startMs)));
    boundaries.add(Math.max(0, Math.round(beat.endMs)));
  }
  for (const event of args.manifest?.direction ?? []) {
    boundaries.add(Math.max(0, Math.round(event.atMs)));
    if (event.endMs !== undefined) {
      boundaries.add(Math.max(0, Math.round(event.endMs)));
    }
  }
  return [...boundaries].sort((left, right) => left - right);
}

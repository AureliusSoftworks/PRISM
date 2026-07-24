"use client";

import type {
  ReplayRecordingV1,
  ReplaySurfaceV1,
  ReplayTimelineV1,
} from "@localai/shared";

export const REPLAY_RECORDING_CHANGED_EVENT = "prism:replay-recording-changed";

/**
 * Kept as a compatibility type for the released Signal canvas. Faithful
 * session replay is audio plus procedural direction and never renders video.
 */
export interface ReplayFrameRenderer {
  captureFps: number;
  prepare: (
    recording: ReplayRecordingV1,
    timeline: ReplayTimelineV1,
  ) => Promise<void>;
  renderAt: (timeMs: number) => Promise<HTMLCanvasElement>;
  finish?: () => void;
}

/**
 * Historical callers can remain mounted while old saved rows are preserved,
 * but no client may claim or encode a replay render.
 */
export function ReplayRenderCoordinator(
  props: {
    surface?: ReplaySurfaceV1;
    sourceId?: string;
    frameRenderer?: ReplayFrameRenderer;
  } = {},
): null {
  void props;
  return null;
}

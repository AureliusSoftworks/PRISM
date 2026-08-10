"use client";

import { useEffect, useRef } from "react";
import type {
  ReplayRecordingV1,
  ReplaySurfaceV1,
  ReplayTimelineV1,
} from "@localai/shared";
import {
  claimReplayStudioCutMix,
  completeReplayStudioCutMix,
  failReplayStudioCutMix,
  replayFetch,
  resumeReplayStudioCut,
} from "./replayClient";
import {
  replayCoordinatorSessionState,
} from "./replayRenderCoordinatorSession.ts";
import { encodeReplayAudioWindows } from "./replayRenderAudio";
import { prepareSignalStudioCut } from "./signalStudioCutAudio";

export const REPLAY_RECORDING_CHANGED_EVENT = "prism:replay-recording-changed";

export interface ReplayFrameRenderer {
  captureFps: number;
  prepare: (
    recording: ReplayRecordingV1,
    timeline: ReplayTimelineV1,
  ) => Promise<void>;
  renderAt: (timeMs: number) => Promise<HTMLCanvasElement>;
  finish?: () => void;
}

const REPLAY_COORDINATOR_POLL_MS = 3_000;
const REPLAY_COORDINATOR_AUTH_RETRY_MS = 30_000;
const REPLAY_COORDINATOR_ERROR_RETRY_MS = 15_000;

async function signalReplayRecordings(): Promise<{
  response: Response;
  recordings: ReplayRecordingV1[];
}> {
  const response = await replayFetch("/api/replays?surface=signal");
  const payload = response.ok
    ? ((await response.json().catch(() => null)) as
        | { recordings?: ReplayRecordingV1[] }
        | null)
    : null;
  return { response, recordings: payload?.recordings ?? [] };
}

async function mixStudioCut(recordingId: string): Promise<void> {
  const claim = await claimReplayStudioCutMix(recordingId);
  if (!claim) return;
  try {
    const prepared = await prepareSignalStudioCut(
      claim.recording,
      claim.premiumSegments,
      claim.takes,
    );
    await encodeReplayAudioWindows({
      recordingId,
      renderToken: claim.renderToken,
      title: `${claim.recording.manifest?.title ?? "Signal"} — Premium audio`,
      uploadPath: `/api/replays/${encodeURIComponent(recordingId)}/studio-cut/mix/audio-chunk`,
      windows: prepared.renderWindows(),
    });
    await completeReplayStudioCutMix({
      recordingId,
      renderToken: claim.renderToken,
      durationMs: prepared.durationMs,
      timeline: prepared.timeline,
      manifest: prepared.manifest,
      warning: prepared.warnings.join(" ") || null,
    });
  } catch (error) {
    await failReplayStudioCutMix({
      recordingId,
      renderToken: claim.renderToken,
      error: error instanceof Error ? error.message : "Premium audio mixing failed.",
    }).catch(() => undefined);
  } finally {
    window.dispatchEvent(new CustomEvent(REPLAY_RECORDING_CHANGED_EVENT));
  }
}

/**
 * Global, navigation-safe Signal audio finisher. Voice generation runs on the
 * server; this coordinator performs bounded-window Web Audio mixing and
 * streams 192 kbps Opus/WebM chunks without allocating a full episode buffer.
 */
export function ReplayRenderCoordinator(
  props: {
    surface?: ReplaySurfaceV1;
    sourceId?: string;
    frameRenderer?: ReplayFrameRenderer;
  } = {},
): null {
  const activeRef = useRef(new Set<string>());
  useEffect(() => {
    if (props.surface && props.surface !== "signal") return;
    let cancelled = false;
    let timer = 0;
    let sessionReady = false;
    const poll = async (): Promise<void> => {
      if (!sessionReady) {
        const sessionState = await replayCoordinatorSessionState();
        if (cancelled) return;
        if (sessionState !== "authenticated") {
          timer = window.setTimeout(
            () => void poll(),
            sessionState === "signed-out"
              ? REPLAY_COORDINATOR_AUTH_RETRY_MS
              : REPLAY_COORDINATOR_ERROR_RETRY_MS,
          );
          return;
        }
        sessionReady = true;
      }

      const result = await signalReplayRecordings().catch(() => null);
      if (cancelled) return;
      if (!result?.response.ok) {
        if (
          result?.response.status === 400 ||
          result?.response.status === 401 ||
          result?.response.status === 403
        ) {
          sessionReady = false;
        }
        timer = window.setTimeout(
          () => void poll(),
          sessionReady
            ? REPLAY_COORDINATOR_ERROR_RETRY_MS
            : REPLAY_COORDINATOR_AUTH_RETRY_MS,
        );
        return;
      }

      for (const recording of result.recordings) {
        if (recording.studioCutProduction?.phase === "mastering_voices") {
          void resumeReplayStudioCut(recording.id).catch(() => undefined);
        }
      }
      for (const recording of result.recordings) {
        if (
          recording.studioCutProduction?.phase !== "mixing_episode" ||
          !recording.studioCutProduction.masterReady
        ) {
          continue;
        }
        if (cancelled || activeRef.current.has(recording.id)) continue;
        activeRef.current.add(recording.id);
        void mixStudioCut(recording.id).finally(() => {
          activeRef.current.delete(recording.id);
        });
      }
      if (!cancelled) {
        timer = window.setTimeout(
          () => void poll(),
          REPLAY_COORDINATOR_POLL_MS,
        );
      }
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [props.surface]);
  return null;
}

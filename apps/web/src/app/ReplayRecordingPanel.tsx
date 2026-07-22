"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReplayRecordingV1 } from "@localai/shared";
import {
  deleteReplayRecording,
  replayRecordingForSource,
  retryReplayRecording,
} from "./replayClient";
import { REPLAY_RECORDING_CHANGED_EVENT } from "./ReplayRenderCoordinator";
import styles from "./replayRecording.module.css";

function statusLabel(recording: ReplayRecordingV1): string {
  switch (recording.status) {
    case "collecting":
      return recording.manifest ? "Recording deleted" : "Collecting replay";
    case "queued":
      return "Queued";
    case "preparing_audio":
      return "Preparing audio";
    case "rendering":
      return `Rendering ${Math.round(recording.progress * 100)}%`;
    case "ready":
      return "Ready";
    case "ready_with_warnings":
      return "Ready · Needs attention";
    case "failed":
      return "Needs attention";
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ReplayRecordingPanel({
  surface,
  sourceId,
}: {
  surface: "signal" | "coffee";
  sourceId: string;
}): React.JSX.Element | null {
  const [recording, setRecording] = useState<ReplayRecordingV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const refresh = useCallback(async () => {
    const next = await replayRecordingForSource(surface, sourceId).catch(() => null);
    setRecording(next);
  }, [sourceId, surface]);
  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(REPLAY_RECORDING_CHANGED_EVENT, onChange);
    const timer = window.setInterval(
      onChange,
      recording?.status === "rendering" || recording?.status === "preparing_audio"
        ? 2_000
        : 8_000,
    );
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(REPLAY_RECORDING_CHANGED_EVENT, onChange);
    };
  }, [recording?.status, refresh]);
  const transcriptBeats = useMemo(
    () => recording?.timeline?.beats.filter((beat) => beat.kind === "utterance") ?? [],
    [recording?.timeline?.beats],
  );
  if (!recording) return null;
  const ready =
    (recording.status === "ready" || recording.status === "ready_with_warnings") &&
    recording.videoUrl;
  const retry = async () => {
    setBusy(true);
    try {
      setRecording(await retryReplayRecording(recording.id));
      window.dispatchEvent(new Event(REPLAY_RECORDING_CHANGED_EVENT));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm("Delete this replay video and its captured audio? The original session and transcript will remain.")) return;
    setBusy(true);
    try {
      setRecording(await deleteReplayRecording(recording.id));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.panel} data-replay-status={recording.status}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Director&apos;s cut</p>
          <h3>{recording.manifest?.title ?? "Replay video"}</h3>
        </div>
        <span className={styles.status}>{statusLabel(recording)}</span>
      </header>
      {(recording.status === "rendering" || recording.status === "preparing_audio") && (
        <div className={styles.progress} aria-label={statusLabel(recording)}>
          <span style={{ width: `${Math.max(4, recording.progress * 100)}%` }} />
        </div>
      )}
      {ready ? (
        <>
          <video
            ref={videoRef}
            className={styles.video}
            controls
            preload="metadata"
            src={recording.videoUrl ?? undefined}
            onTimeUpdate={(event) =>
              setCurrentTimeMs(event.currentTarget.currentTime * 1_000)
            }
          >
            {recording.transcriptVttUrl && (
              <track
                kind="captions"
                src={recording.transcriptVttUrl}
                srcLang="en"
                label="English"
              />
            )}
          </video>
          <div className={styles.actions}>
            <a href={`${recording.videoUrl}?download=1`} download>
              Download video
            </a>
            {recording.transcriptMarkdownUrl && (
              <a href={recording.transcriptMarkdownUrl} download>
                Download transcript
              </a>
            )}
            {recording.status === "ready_with_warnings" && (
              <button type="button" disabled={busy} onClick={() => void retry()}>
                Retry
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void remove()}>
              Delete recording
            </button>
          </div>
        </>
      ) : (
        <div className={styles.pending}>
          <p>{recording.error ?? recording.warning ?? "PRISM will finish this replay while a capable client is open."}</p>
          {(recording.status === "failed" ||
            (recording.status === "collecting" && recording.manifest)) && (
            <button type="button" disabled={busy} onClick={() => void retry()}>
              {recording.status === "collecting" ? "Rebuild video" : "Retry"}
            </button>
          )}
        </div>
      )}
      {transcriptBeats.length > 0 && (
        <div className={styles.transcript} aria-label="Synchronized transcript">
          {transcriptBeats.map((beat) => {
            const active = currentTimeMs >= beat.startMs && currentTimeMs < beat.endMs;
            return (
              <button
                key={beat.id}
                type="button"
                data-active={active || undefined}
                onClick={() => {
                  if (!videoRef.current) return;
                  videoRef.current.currentTime = beat.startMs / 1_000;
                  void videoRef.current.play();
                }}
              >
                <span>{formatDuration(beat.startMs)}</span>
                <strong>{beat.speakerName ?? "Speaker"}</strong>
                <p>{beat.text}</p>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

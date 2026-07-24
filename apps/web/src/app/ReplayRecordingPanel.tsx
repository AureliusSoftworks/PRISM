"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ReplayRecordingV1 } from "@localai/shared";
import { replayRecordingForSource } from "./replayClient";
import { REPLAY_RECORDING_CHANGED_EVENT } from "./ReplayRenderCoordinator";
import styles from "./replayRecording.module.css";

function statusLabel(recording: ReplayRecordingV1): string {
  switch (recording.availability) {
    case "faithful":
      return "Faithful replay";
    case "transcript_only":
      return "Transcript only";
    case "saving":
    default:
      return "Saving replay";
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ReplayRecordingStatusBadge({
  surface,
  sourceId,
  onRecordingChange,
}: {
  surface: "signal" | "coffee";
  sourceId: string;
  onRecordingChange?: (
    sourceId: string,
    recording: ReplayRecordingV1 | null,
  ) => void;
}): React.JSX.Element | null {
  const [recording, setRecording] = useState<ReplayRecordingV1 | null>(null);
  useEffect(() => {
    let disposed = false;
    const refresh = () =>
      void replayRecordingForSource(surface, sourceId)
        .then((next) => {
          if (disposed) return;
          setRecording(next);
          onRecordingChange?.(sourceId, next);
        })
        .catch(() => undefined);
    refresh();
    window.addEventListener(REPLAY_RECORDING_CHANGED_EVENT, refresh);
    const timer = window.setInterval(refresh, 8_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener(REPLAY_RECORDING_CHANGED_EVENT, refresh);
    };
  }, [onRecordingChange, sourceId, surface]);
  return recording ? (
    <span className={styles.badge} data-replay-status={recording.availability}>
      {statusLabel(recording)}
    </span>
  ) : null;
}

export function ReplayRecordingPanel({
  surface,
  sourceId,
  preview,
}: {
  surface: "signal" | "coffee";
  sourceId: string;
  preview?: ReactNode;
}): React.JSX.Element | null {
  const [recording, setRecording] = useState<ReplayRecordingV1 | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const refresh = useCallback(async () => {
    setRecording(
      await replayRecordingForSource(surface, sourceId).catch(() => null),
    );
  }, [sourceId, surface]);
  useEffect(() => {
    const onChange = () => void refresh();
    const initialRefresh = window.setTimeout(onChange, 0);
    window.addEventListener(REPLAY_RECORDING_CHANGED_EVENT, onChange);
    const timer = window.setInterval(onChange, 8_000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(timer);
      window.removeEventListener(REPLAY_RECORDING_CHANGED_EVENT, onChange);
    };
  }, [refresh]);
  const transcriptBeats = useMemo(
    () =>
      recording?.timeline?.beats.filter(
        (beat) => beat.kind === "utterance" && beat.text.trim().length > 0,
      ) ?? [],
    [recording?.timeline?.beats],
  );
  if (!recording) {
    return preview ? (
      <section className={styles.panel} data-replay-status="saving">
        <div className={styles.screen}>{preview}</div>
        <p className={styles.pending}>Saving the faithful session…</p>
      </section>
    ) : null;
  }
  const faithful =
    recording.availability === "faithful" && Boolean(recording.audioUrl);
  return (
    <section
      className={styles.panel}
      data-replay-status={recording.availability}
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Session replay</p>
          <h3>{recording.manifest?.title ?? "Recorded session"}</h3>
        </div>
        <span className={styles.status}>{statusLabel(recording)}</span>
      </header>
      {preview ? <div className={styles.screen}>{preview}</div> : null}
      {faithful ? (
        <audio
          ref={audioRef}
          className={styles.audio}
          controls
          preload="metadata"
          src={recording.audioUrl ?? undefined}
          onTimeUpdate={(event) =>
            setCurrentTimeMs(event.currentTarget.currentTime * 1_000)
          }
        />
      ) : (
        <p className={styles.pending}>
          {recording.availability === "saving"
            ? "The session is still saving."
            : "The exact session audio is unavailable. The readable transcript remains available."}
        </p>
      )}
      <div className={styles.actions}>
        {recording.transcriptMarkdownUrl ? (
          <a href={recording.transcriptMarkdownUrl} download>
            Download transcript
          </a>
        ) : null}
      </div>
      {transcriptBeats.length > 0 ? (
        <div className={styles.transcript} aria-label="Synchronized transcript">
          {transcriptBeats.map((beat) => (
            <button
              key={beat.id}
              type="button"
              disabled={!faithful}
              data-active={
                (currentTimeMs >= beat.startMs && currentTimeMs < beat.endMs) ||
                undefined
              }
              onClick={() => {
                if (!audioRef.current) return;
                audioRef.current.currentTime = beat.startMs / 1_000;
                void audioRef.current.play();
              }}
            >
              <span>{formatDuration(beat.startMs)}</span>
              <strong>{beat.speakerName ?? "Speaker"}</strong>
              <p>{beat.text}</p>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

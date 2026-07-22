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
      return recording.manifest ? "Video deleted" : "Capturing episode";
    case "queued":
      return "Video queued";
    case "preparing_audio":
      return "Preparing video";
    case "rendering":
      return `Rendering ${Math.round(recording.progress * 100)}%`;
    case "ready":
      return "Video ready";
    case "ready_with_warnings":
      return "Video ready · Needs attention";
    case "failed":
      return "Needs attention";
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
          if (!disposed) {
            setRecording(next);
            onRecordingChange?.(sourceId, next);
          }
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
    <span className={styles.badge} data-replay-status={recording.status}>
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
  if (!recording) {
    if (surface === "signal") return null;
    return preview ? (
      <section className={styles.panel} data-replay-status="collecting">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Episode video</p>
            <h3>Preparing recording</h3>
          </div>
          <span className={styles.status}>Starting render</span>
        </header>
        <div className={styles.screen}>{preview}</div>
        <div className={styles.pending}>
          <p>
            PRISM is preparing this session video while the recap remains open.
          </p>
        </div>
      </section>
    ) : null;
  }
  const legacySignalVideo =
    surface === "signal" &&
    recording.manifest?.visual.metadata?.renderContract !==
      "signal-studio-dom-v2";
  const ready =
    !legacySignalVideo &&
    (recording.status === "ready" || recording.status === "ready_with_warnings") &&
    recording.videoUrl;
  if (surface === "signal" && !ready) return null;
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
          <p className={styles.eyebrow}>Episode video</p>
          <h3>{recording.manifest?.title ?? "Replay video"}</h3>
        </div>
        <span className={styles.status}>
          {legacySignalVideo ? "Updating video" : statusLabel(recording)}
        </span>
      </header>
      {(recording.status === "rendering" || recording.status === "preparing_audio") && (
        <div className={styles.progress} aria-label={statusLabel(recording)}>
          <span style={{ width: `${Math.max(4, recording.progress * 100)}%` }} />
        </div>
      )}
      {ready ? (
        <>
          <div className={styles.screen}>
            <video
              ref={videoRef}
              className={styles.video}
              controls
              playsInline
              preload="metadata"
              src={recording.videoUrl ?? undefined}
              onTimeUpdate={(event) =>
                setCurrentTimeMs(event.currentTarget.currentTime * 1_000)
              }
            />
          </div>
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
        <>
          {preview ? <div className={styles.screen}>{preview}</div> : null}
          <div className={styles.pending}>
          <p>
            {recording.error ??
              recording.warning ??
              "PRISM will finish this replay while a capable client is open."}
          </p>
          {(recording.status === "failed" ||
            (recording.status === "collecting" && recording.manifest)) && (
            <button type="button" disabled={busy} onClick={() => void retry()}>
              {recording.status === "collecting" ? "Rebuild video" : "Retry"}
            </button>
          )}
          </div>
        </>
      )}
      {surface === "coffee" && transcriptBeats.length > 0 && (
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

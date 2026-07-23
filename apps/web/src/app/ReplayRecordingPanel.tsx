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
  deleteReplayPremiumMedia,
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

function premiumStatusLabel(recording: ReplayRecordingV1): string {
  switch (recording.premiumProduction?.phase) {
    case "mastering_voices":
      return "Mastering voices";
    case "mixing_episode":
      return "Mixing episode";
    case "rendering_studio":
      return "Rendering studio";
    case "finalizing":
      return "Finalizing";
    case "ready":
      return "Premium video ready";
    case "failed":
      return "Premium needs attention";
    default:
      return "Premium available";
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
  preferredProvider,
  onExportVideo,
  onExportPremium,
  onRetryPremium,
}: {
  surface: "signal" | "coffee";
  sourceId: string;
  preview?: ReactNode;
  preferredProvider?: "local" | "openai" | "anthropic";
  onExportVideo?: () => Promise<void>;
  onExportPremium?: (regenerate: boolean) => Promise<void>;
  onRetryPremium?: () => Promise<void>;
}): React.JSX.Element | null {
  const [recording, setRecording] = useState<ReplayRecordingV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
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
  if (surface === "signal") {
    // Standard and Premium exports are independent jobs with independent media.
    const premium = recording.premiumProduction;
    const videoReady =
      (recording.status === "ready" || recording.status === "ready_with_warnings") &&
      recording.videoUrl;
    const videoProducing =
      recording.status === "queued" ||
      recording.status === "preparing_audio" ||
      recording.status === "rendering";
    const premiumReady = premium?.phase === "ready" && premium.videoUrl;
    const premiumProducing =
      premium?.phase === "mastering_voices" ||
      premium?.phase === "mixing_episode" ||
      premium?.phase === "rendering_studio" ||
      premium?.phase === "finalizing";
    const exportVideo = async (): Promise<void> => {
      if (!onExportVideo) return;
      setBusy(true);
      setActionError(null);
      try {
        await onExportVideo();
        await refresh();
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Video export failed.",
        );
      } finally {
        setBusy(false);
      }
    };
    const exportPremium = async (regenerate: boolean): Promise<void> => {
      if (!onExportPremium) return;
      const confirmed = window.confirm(
        `${regenerate ? "Regenerate" : "Export"} this Premium video? The exact spoken transcript and selected voice IDs will be sent to ElevenLabs and may consume credits.`,
      );
      if (!confirmed) return;
      setBusy(true);
      setActionError(null);
      try {
        await onExportPremium(regenerate);
        await refresh();
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Premium production failed.",
        );
      } finally {
        setBusy(false);
      }
    };
    const retryPremium = async (): Promise<void> => {
      if (!onRetryPremium) return;
      setBusy(true);
      try {
        await onRetryPremium();
        await refresh();
      } finally {
        setBusy(false);
      }
    };
    const removePremium = async (): Promise<void> => {
      if (
        !window.confirm(
          "Delete the Premium audio and video? The episode and local replay will remain.",
        )
      ) return;
      setBusy(true);
      try {
        setRecording(await deleteReplayPremiumMedia(recording.id));
      } finally {
        setBusy(false);
      }
    };
    return (
      <section className={styles.panel} data-replay-status={recording.status}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Video export</p>
            <h3>{recording.manifest?.title ?? "Signal episode"}</h3>
          </div>
          <span className={styles.status} aria-live="polite">
            {busy && !videoProducing && !premiumProducing
              ? "Starting export"
              : videoProducing || videoReady
                ? statusLabel(recording)
                : "Ready to export"}
          </span>
        </header>
        {videoProducing ? (
          <div className={styles.progress} aria-label={statusLabel(recording)}>
            <span style={{ width: `${Math.max(4, recording.progress * 100)}%` }} />
          </div>
        ) : null}
        {videoReady ? (
          <>
            <div className={styles.screen}>
              <video
                ref={videoRef}
                className={styles.video}
                controls
                playsInline
                preload="metadata"
                src={recording.videoUrl ?? undefined}
              />
            </div>
            <div className={styles.actions}>
              <a href={`${recording.videoUrl}?download=1`} download>
                Download video
              </a>
            </div>
          </>
        ) : (
          <div className={styles.pending}>
            <p>
              {actionError ??
                recording.error ??
                recording.warning ??
                (videoProducing
                  ? "PRISM is rendering the studio visuals in the background and adding the captured episode audio."
                  : "Export the recorded episode as a video. This uses the captured audio and makes no new voice call.")}
            </p>
            <button
              type="button"
              disabled={busy || videoProducing}
              onClick={() => void exportVideo()}
              aria-busy={busy && !premiumProducing}
            >
              {recording.status === "failed" ? "Retry export" : "Export video"}
            </button>
          </div>
        )}
        <div className={styles.pending} data-premium-status={premium?.phase ?? "idle"}>
          <p>
            <strong>{premiumStatusLabel(recording)}.</strong>{" "}
            {premiumReady
              ? "This version uses the cached ElevenLabs dialogue master."
              : premiumProducing
                ? "PRISM is preparing the ElevenLabs voice master and Premium studio cut."
                : "Optionally remaster the voices with ElevenLabs and export a separate Premium video."}
          </p>
          {premiumProducing ? (
            <div className={styles.progress} aria-label={premiumStatusLabel(recording)}>
              <span style={{ width: `${Math.max(4, (premium?.progress ?? 0) * 100)}%` }} />
            </div>
          ) : null}
          {premiumReady ? (
            <div className={styles.actions}>
              <a href={premium.videoUrl ?? undefined}>Watch Premium video</a>
              <a href={`${premium.videoUrl}?download=1`} download>
                Download Premium video
              </a>
              <button
                type="button"
                disabled={busy || preferredProvider === "local"}
                onClick={() => void exportPremium(true)}
              >
                Export Premium video again
              </button>
              <button type="button" disabled={busy} onClick={() => void removePremium()}>
                Delete Premium media
              </button>
            </div>
          ) : premium?.phase === "failed" && premium.masterReady ? (
            <button type="button" disabled={busy} onClick={() => void retryPremium()}>
              Retry Premium video from cached audio
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || premiumProducing || preferredProvider === "local"}
              title={
                preferredProvider === "local"
                  ? "Switch to ONLINE mode to use ElevenLabs Premium export."
                  : undefined
              }
              onClick={() => void exportPremium(false)}
              aria-busy={busy && !videoProducing}
            >
              Export Premium video
            </button>
          )}
            {preferredProvider === "local" ? (
            <small>Switch to ONLINE to export with your ElevenLabs key.</small>
            ) : null}
        </div>
      </section>
    );
  }
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
          <p className={styles.eyebrow}>Episode video</p>
          <h3>{recording.manifest?.title ?? "Replay video"}</h3>
        </div>
        <span className={styles.status}>
          {statusLabel(recording)}
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

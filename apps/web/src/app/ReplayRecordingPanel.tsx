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
import { COFFEE_REPLAY_RENDER_CONTRACT } from "./replayManifest";
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
      return "Enhancing voices";
    case "mixing_episode":
      return "Mixing the recording";
    case "rendering_studio":
      return "Finishing the recording";
    case "finalizing":
      return "Finalizing";
    case "ready":
      return "Enhanced recording ready";
    case "failed":
      return "Enhancement needs attention";
    default:
      return "Enhancement available";
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
      {surface === "signal"
        ? recording.premiumProduction?.phase === "ready"
          ? "Recording · Enhanced"
          : "Recording ready"
        : statusLabel(recording)}
    </span>
  ) : null;
}

export function ReplayRecordingPanel({
  surface,
  sourceId,
  preview,
  preferredProvider,
  blocksOnlineCapabilities = preferredProvider === "local",
  onRebuildVideo,
  onEnhanceAudio,
  onDownloadFaithfulAudio,
}: {
  surface: "signal" | "coffee";
  sourceId: string;
  preview?: ReactNode;
  preferredProvider?: "local" | "openai" | "anthropic";
  /** True only for hard LOCAL privacy — AUTO/ONLINE may enhance with ElevenLabs. */
  blocksOnlineCapabilities?: boolean;
  onRebuildVideo?: () => Promise<void>;
  onEnhanceAudio?: (regenerate: boolean) => Promise<void>;
  onDownloadFaithfulAudio?: () => void;
}): React.JSX.Element | null {
  const [recording, setRecording] = useState<ReplayRecordingV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const enhancedAudioRef = useRef<HTMLAudioElement | null>(null);
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
    () =>
      recording?.timeline?.beats.filter(
        (beat) => beat.kind === "utterance" && beat.text.trim().length > 0,
      ) ?? [],
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
    const premium = recording.premiumProduction;
    const premiumReady = premium?.phase === "ready" && premium.audioUrl;
    const premiumProducing =
      premium?.phase === "mastering_voices" ||
      premium?.phase === "mixing_episode" ||
      premium?.phase === "rendering_studio" ||
      premium?.phase === "finalizing";
    const enhanceAudio = async (regenerate: boolean): Promise<void> => {
      if (!onEnhanceAudio) return;
      const confirmed = window.confirm(
        `${regenerate ? "Enhance this recording again" : "Enhance this recording"} with ElevenLabs v3 dialogue? The exact spoken transcript and selected voice IDs will be sent to ElevenLabs and may consume credits. The faithful recording will remain unchanged.`,
      );
      if (!confirmed) return;
      setBusy(true);
      setActionError(null);
      try {
        await onEnhanceAudio(regenerate);
        await refresh();
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Audio enhancement failed.",
        );
      } finally {
        setBusy(false);
      }
    };
    const removePremium = async (): Promise<void> => {
      if (
        !window.confirm(
          "Delete the enhanced recording? The faithful recording and transcript will remain.",
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
            <p className={styles.eyebrow}>Episode recording</p>
            <h3>{recording.manifest?.title ?? "Signal episode"}</h3>
          </div>
          <span className={styles.status} aria-live="polite">
            {busy
              ? "Enhancing recording"
              : premiumProducing
                ? premiumStatusLabel(recording)
                : "Faithful recording ready"}
          </span>
        </header>
        <div className={styles.pending}>
          <p>
            The replay above uses the canonical live master: the same flattened
            Signal output heard on air, with every overlapping voice, effect,
            room layer, ident, and fader move already captured in place.
          </p>
          <div className={styles.actions}>
            {onDownloadFaithfulAudio ? (
              <button type="button" onClick={onDownloadFaithfulAudio}>
                Download faithful audio
              </button>
            ) : null}
            {recording.transcriptMarkdownUrl ? (
              <a href={`${recording.transcriptMarkdownUrl}?download=1`} download>
                Download transcript
              </a>
            ) : null}
            {recording.transcriptVttUrl ? (
              <a href={`${recording.transcriptVttUrl}?download=1`} download>
                Download captions
              </a>
            ) : null}
          </div>
        </div>
        <div className={styles.pending} data-premium-status={premium?.phase ?? "idle"}>
          <p>
            <strong>{premiumStatusLabel(recording)}.</strong>{" "}
            {premiumReady
              ? "ElevenLabs v3 re-performed the spoken transcript, then PRISM mixed those voices against the same saved studio effects. The faithful recording is still untouched."
              : premiumProducing
                ? "PRISM is creating a separate ElevenLabs v3 dialogue performance and mixing it against the saved production bed."
                : "Enhance creates a separate, more expressive ElevenLabs v3 dialogue master. It does not rewrite the transcript or replace the faithful recording."}
          </p>
          {actionError ? <p role="alert">{actionError}</p> : null}
          {premiumProducing ? (
            <div className={styles.progress} aria-label={premiumStatusLabel(recording)}>
              <span style={{ width: `${Math.max(4, (premium?.progress ?? 0) * 100)}%` }} />
            </div>
          ) : null}
          {premiumReady ? (
            <>
              <audio
                ref={enhancedAudioRef}
                className={styles.audio}
                controls
                preload="metadata"
                src={premium.audioUrl ?? undefined}
                onTimeUpdate={(event) =>
                  setCurrentTimeMs(event.currentTarget.currentTime * 1_000)
                }
              />
              <div className={styles.actions}>
              <a href={`${premium.audioUrl}?download=1`} download>
                Download enhanced audio
              </a>
              <button
                type="button"
                disabled={busy || blocksOnlineCapabilities}
                onClick={() => void enhanceAudio(true)}
              >
                Enhance again
              </button>
              <button type="button" disabled={busy} onClick={() => void removePremium()}>
                Delete enhanced audio
              </button>
              </div>
            </>
          ) : premium?.phase === "failed" && premium.masterReady ? (
            <button type="button" disabled={busy} onClick={() => void enhanceAudio(false)}>
              Finish enhanced recording
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || premiumProducing || blocksOnlineCapabilities}
              title={
                blocksOnlineCapabilities
                  ? "Switch to AUTO or ONLINE mode to use ElevenLabs enhancement."
                  : undefined
              }
              onClick={() => void enhanceAudio(false)}
              aria-busy={busy}
            >
              Enhance recording
            </button>
          )}
          {blocksOnlineCapabilities ? (
            <small>Switch to AUTO or ONLINE to enhance with your ElevenLabs key.</small>
          ) : null}
        </div>
        {premiumReady && (premium.timeline?.beats.length ?? 0) > 0 ? (
          <div className={styles.transcript} aria-label="Enhanced synchronized transcript">
            {premium.timeline!.beats
              .filter(
                (beat) =>
                  beat.kind === "utterance" && beat.text.trim().length > 0,
              )
              .map((beat) => {
                const active =
                  currentTimeMs >= beat.startMs && currentTimeMs < beat.endMs;
                return (
                  <button
                    key={beat.id}
                    type="button"
                    data-active={active || undefined}
                    onClick={() => {
                      if (!enhancedAudioRef.current) return;
                      enhancedAudioRef.current.currentTime = beat.startMs / 1_000;
                      void enhancedAudioRef.current.play();
                    }}
                  >
                    <span>{formatDuration(beat.startMs)}</span>
                    <strong>{beat.speakerName ?? "Speaker"}</strong>
                    <p>{beat.text}</p>
                  </button>
                );
              })}
          </div>
        ) : null}
      </section>
    );
  }
  const currentCoffeeRenderContract =
    surface !== "coffee" ||
    recording.manifest?.visual.metadata?.renderContract ===
      COFFEE_REPLAY_RENDER_CONTRACT;
  const ready =
    (recording.status === "ready" || recording.status === "ready_with_warnings") &&
    recording.videoUrl &&
    currentCoffeeRenderContract;
  const legacyCoffeeVideo =
    surface === "coffee" &&
    Boolean(recording.videoUrl) &&
    !currentCoffeeRenderContract;
  const retry = async () => {
    setBusy(true);
    setActionError(null);
    try {
      setRecording(await retryReplayRecording(recording.id));
      window.dispatchEvent(new Event(REPLAY_RECORDING_CHANGED_EVENT));
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Video retry failed.",
      );
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
  const rebuild = async () => {
    if (!onRebuildVideo) return;
    setBusy(true);
    setActionError(null);
    try {
      await onRebuildVideo();
      await refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Coffee video rebuild failed.",
      );
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
          {legacyCoffeeVideo ? "Faithful rebuild available" : statusLabel(recording)}
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
            {actionError ??
              (legacyCoffeeVideo
                ? "This is the earlier abstract cut. Rebuild it to capture the saved Coffee table, avatars, movement, and synchronized dialogue."
                : null) ??
              recording.error ??
              recording.warning ??
              "PRISM is rendering the saved Coffee table in the background."}
          </p>
          {legacyCoffeeVideo && onRebuildVideo ? (
            <button type="button" disabled={busy} onClick={() => void rebuild()}>
              Rebuild faithful video
            </button>
          ) : (recording.status === "failed" ||
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

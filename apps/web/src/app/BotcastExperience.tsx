"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  botcastCameraShotAt,
  botcastGuestHasDepartedAt,
  botcastNextSpeakerRole,
  botcastReplayMessageIndexAt,
  botcastReplayTimeline,
  normalizeAccentForTheme,
  type BotcastCameraShot,
  type BotcastEpisode,
  type BotcastEpisodeAdvanceResponse,
  type BotcastEpisodeResponseMode,
  type BotcastEpisodeSummary,
  type BotcastMessage,
  type BotcastProducerCue,
  type BotcastShow,
} from "@localai/shared";
import { nextBotcastShowIdAfterDeletion } from "./botcastDeletion";
import {
  botcastSpeechRevealVisibleText,
  finishBotcastSpeechReveal,
  prepareBotcastSpeechReveal,
  startBotcastSpeechReveal,
  updateBotcastSpeechReveal,
  type BotcastSpeechRevealState,
} from "./botcastSpeechReveal";
import { PrismBlockingLoader } from "./PrismBlockingLoader";
import {
  SIGNAL_ARTWORK_JOB_EVENT,
  announceSignalArtworkJob,
  signalArtworkJobIsActive,
  type SignalArtworkJobSnapshot,
} from "./signalArtworkJob";
import type { VoicePlaybackLifecycle } from "./voiceEffects";
import {
  crtSpeechMouthShapeAtElapsedMs,
  type ZenLiveBotMouthShape,
} from "./zenLiveMouth";
import styles from "./botcast.module.css";

export interface BotcastBotSummary {
  id: string;
  name: string;
  color: string | null;
  glyph: string | null;
  online_enabled?: number | null;
}

export interface BotcastModelOption {
  id: string;
  label: string;
  provider: "local" | "openai" | "anthropic";
}

export interface BotcastApiRequest {
  <T>(path: string, options?: RequestInit): Promise<T>;
}

export interface BotcastExperienceProps {
  bots: BotcastBotSummary[];
  request: BotcastApiRequest;
  preferredProvider: "local" | "openai" | "anthropic";
  preferredImageProvider: "local" | "openai";
  modelOptions: BotcastModelOption[];
  accountDefaultModel: string | null;
  responseMode: BotcastEpisodeResponseMode;
  providerModeToggle?: ReactNode;
  theme?: "light" | "dark";
  renderAvatar?: (
    bot: BotcastBotSummary,
    state: {
      talking: boolean;
      thinking: boolean;
      role: "host" | "guest";
      mouthShape: ZenLiveBotMouthShape;
    },
  ) => ReactNode;
  renderMug?: (
    bot: BotcastBotSummary,
    state: { role: "host" | "guest" },
  ) => ReactNode;
  onUtterance?: (
    message: BotcastMessage,
    bot: BotcastBotSummary,
    lifecycle: VoicePlaybackLifecycle,
  ) => boolean | Promise<boolean>;
  onPrepareUtterance?: () => void;
  onStopUtterance?: () => void;
  sidebarHeader: ReactNode;
  navigationHeader: ReactNode;
}

type BotcastLiveSpeech = {
  messageId: string;
  reveal: BotcastSpeechRevealState;
};

type ImageGenerationResponse = {
  image: { id: string; displayUrl?: string; url?: string };
};

type SignalAssetSlot = "day-studio" | "night-studio" | "logo";
type SignalArtworkKind = SignalAssetSlot;

const SIGNAL_ASSET_ACCEPT = "image/png,image/jpeg,image/webp";
const SIGNAL_ASSET_UPLOAD_MAX_BYTES = 16 * 1024 * 1024;

const SIGNAL_ASSET_LABELS: Record<SignalAssetSlot, string> = {
  "day-studio": "Light studio",
  "night-studio": "Dark studio",
  logo: "logo",
};

type SignalBlockingOperation = {
  title: string;
  detail: string;
  stepLabel: string;
  progress: number | null;
  cancellable: boolean;
};

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function readSignalAssetFile(file: File): Promise<string> {
  if (!SIGNAL_ASSET_ACCEPT.split(",").includes(file.type)) {
    return Promise.reject(new Error("Choose a PNG, JPEG, or WebP image."));
  }
  if (file.size <= 0 || file.size > SIGNAL_ASSET_UPLOAD_MAX_BYTES) {
    return Promise.reject(new Error("Choose an image smaller than 16 MB."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Signal could not read that image."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Signal could not read that image."));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

type SignalDeleteTarget =
  | {
      kind: "show";
      id: string;
      name: string;
      episodeCount: number;
    }
  | {
      kind: "episode";
      id: string;
      showId: string;
      title: string;
      status: BotcastEpisodeSummary["status"];
    };

function deleteConfirmationCopy(target: SignalDeleteTarget): {
  title: string;
  body: string;
  action: string;
} {
  if (target.kind === "show") {
    const archiveCopy = target.episodeCount
      ? `, ${target.episodeCount} episode${target.episodeCount === 1 ? "" : "s"}, and every transcript and replay`
      : "";
    return {
      title: `Delete “${target.name}”?`,
      body: `This permanently removes the show${archiveCopy}. Saved studio and logo artwork stays in Images.`,
      action: "Delete show",
    };
  }
  if (target.status === "live") {
    return {
      title: `Discard “${target.title}”?`,
      body: "This stops the rundown and permanently removes the live episode, its transcript, and producer cues. The show stays.",
      action: "Discard episode",
    };
  }
  return {
    title: `Delete “${target.title}”?`,
    body: "This permanently removes the episode and replay. The show stays.",
    action: "Delete episode",
  };
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Signal request failed.";
  if (/database is locked|SQLITE_BUSY/iu.test(error.message)) {
    return "Signal is finishing another save. Try again in a moment.";
  }
  return error.message;
}

function runtimeLabel(runtimeMs: number | null): string {
  if (runtimeMs == null) return "Live";
  const totalSeconds = Math.max(0, Math.round(runtimeMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function providerLabel(provider: BotcastEpisodeSummary["provider"]): string {
  if (provider === "local") return "LOCAL";
  return provider === "anthropic" ? "Anthropic" : "OpenAI";
}

function episodeModeLabel(
  episode: Pick<BotcastEpisodeSummary, "provider" | "responseMode">,
): string {
  return episode.responseMode === "auto"
    ? "AUTO"
    : providerLabel(episode.provider);
}

function activeShowAtmosphere(
  show: BotcastShow,
  theme: "light" | "dark",
): BotcastShow["atmosphere"] {
  return theme === "light" ? show.dayAtmosphere : show.nightAtmosphere;
}

function showHasCustomArtwork(show: BotcastShow): boolean {
  return Boolean(
    show.dayAtmosphere.imageUrl ||
      show.nightAtmosphere.imageUrl ||
      show.logo.imageUrl,
  );
}

function episodeOutcomeLabel(episode: Pick<BotcastEpisodeSummary, "outcome">): string {
  return episode.outcome === "guest_departed" ? "Guest walked out" : "Completed";
}

function latestDirectedShot(episode: BotcastEpisode): "left" | "right" | "wide" {
  const latest = [...episode.events]
    .reverse()
    .find((event) => event.kind === "camera_suggestion");
  const shot = latest?.payload.shot;
  return shot === "left" || shot === "right" || shot === "wide" ? shot : "wide";
}

function guestHasDeparted(episode: BotcastEpisode): boolean {
  return episode.events.some((event) => event.kind === "departure");
}

function avatarFallback(bot: BotcastBotSummary): ReactNode {
  return (
    <span className={styles.avatarFallback} aria-hidden="true">
      <span>{bot.glyph?.trim() || bot.name.slice(0, 1).toUpperCase()}</span>
    </span>
  );
}

function SignalShowLogo({
  show,
  compact = false,
}: {
  show: BotcastShow;
  compact?: boolean;
}): React.JSX.Element {
  if (show.logo.imageUrl) {
    return (
      <span
        className={styles.showLogo}
        data-compact={compact ? "true" : undefined}
        data-generated="true"
      >
        {/* Authenticated generated artwork is already locally sized and cannot use Next's optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={show.logo.imageUrl} alt="" />
      </span>
    );
  }
  const glyph = show.logo.fallbackGlyph;
  return (
    <span
      className={styles.showLogo}
      data-compact={compact ? "true" : undefined}
      data-glyph={glyph}
      data-generated="false"
    >
      <svg viewBox="0 0 64 64" aria-hidden="true">
        {glyph === "frequency" ? (
          <>
            <path className={styles.spectrumP} d="M10 26c5-7 9-7 14 0s9 7 14 0 9-7 16 0" />
            <path className={styles.spectrumS} d="M10 38c5-7 9-7 14 0s9 7 14 0 9-7 16 0" />
          </>
        ) : glyph === "orbit" ? (
          <>
            <ellipse className={styles.spectrumM} cx="32" cy="32" rx="23" ry="10" />
            <ellipse className={styles.spectrumS} cx="32" cy="32" rx="10" ry="23" />
            <circle className={styles.spectrumRFill} cx="48" cy="24" r="4" />
          </>
        ) : glyph === "aperture" ? (
          <>
            <path className={styles.spectrumPFill} d="M32 8 45 16 32 31 18 23Z" />
            <path className={styles.spectrumRFill} d="m45 16 9 13-20 8-2-6Z" />
            <path className={styles.spectrumIFill} d="m54 29-3 16-21-6 4-2Z" />
            <path className={styles.spectrumSFill} d="m51 45-15 11-10-17h4Z" />
            <path className={styles.spectrumMFill} d="m36 56-18-5 8-12Z" />
          </>
        ) : glyph === "spark" ? (
          <>
            <path className={styles.spectrumRFill} d="m32 6 5 19 19 7-19 7-5 19-5-19-19-7 19-7Z" />
            <circle className={styles.spectrumSFill} cx="50" cy="14" r="4" />
            <circle className={styles.spectrumMFill} cx="14" cy="49" r="3" />
          </>
        ) : (
          <>
            <circle className={styles.spectrumM} cx="32" cy="32" r="23" />
            <text className={styles.spectrumMonogram} x="32" y="42">
              {show.name.trim().slice(0, 1).toUpperCase() || "S"}
            </text>
          </>
        )}
      </svg>
    </span>
  );
}

function SignalFallbackStudio({
  surface,
  accentVariant,
}: {
  surface: "dashboard" | "stage";
  accentVariant: BotcastShow["fallbackStudioAccentVariant"];
}): React.JSX.Element {
  return (
    <div
      className={styles.signalFallbackStudio}
      data-surface={surface}
      data-accent-variant={accentVariant}
      aria-hidden="true"
    >
      <span className={styles.signalFallbackStudioAccent} />
    </div>
  );
}

export function BotcastExperience({
  bots,
  request,
  preferredProvider,
  preferredImageProvider,
  modelOptions,
  accountDefaultModel,
  responseMode,
  providerModeToggle,
  theme = "dark",
  renderAvatar,
  renderMug,
  onUtterance,
  onPrepareUtterance,
  onStopUtterance,
  sidebarHeader,
  navigationHeader,
}: BotcastExperienceProps): React.JSX.Element {
  const eligibleBots = useMemo(
    () => [...bots].sort((a, b) => a.name.localeCompare(b.name)),
    [bots],
  );
  const botsById = useMemo(
    () => new Map(eligibleBots.map((bot) => [bot.id, bot])),
    [eligibleBots],
  );
  const modelLabels = useMemo(
    () => new Map(modelOptions.map((option) => [option.id, option.label])),
    [modelOptions],
  );
  const accountDefaultModelOption = useMemo(
    () =>
      accountDefaultModel
        ? modelOptions.find((option) => option.id === accountDefaultModel) ?? null
        : null,
    [accountDefaultModel, modelOptions],
  );
  const [shows, setShows] = useState<BotcastShow[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<BotcastEpisodeSummary[]>([]);
  const [episode, setEpisode] = useState<BotcastEpisode | null>(null);
  const [replayEpisode, setReplayEpisode] = useState<BotcastEpisode | null>(null);
  const [hostDraftId, setHostDraftId] = useState("");
  const [guestDraftId, setGuestDraftId] = useState("");
  const [topicDraft, setTopicDraft] = useState("");
  const [producerBriefDraft, setProducerBriefDraft] = useState("");
  const [episodeModelDraft, setEpisodeModelDraft] = useState("");
  const [askAboutDraft, setAskAboutDraft] = useState("");
  const [showNameDraft, setShowNameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoRun, setAutoRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [liveSpeech, setLiveSpeech] = useState<BotcastLiveSpeech | null>(null);
  const [replayCamera, setReplayCamera] = useState<BotcastCameraShot>("auto");
  const [replayElapsedMs, setReplayElapsedMs] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayVoicePending, setReplayVoicePending] = useState(false);
  const [replaySpeechActive, setReplaySpeechActive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SignalDeleteTarget | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [blockingOperation, setBlockingOperation] = useState<SignalBlockingOperation | null>(null);
  const [artworkJob, setArtworkJob] = useState<SignalArtworkJobSnapshot | null>(null);
  const blockingAbortRef = useRef<AbortController | null>(null);
  const handledArtworkJobIdsRef = useRef(new Set<string>());
  const advanceInFlightRef = useRef(false);
  const activeSpeechMessageIdRef = useRef<string | null>(null);
  const episodeOperationAbortRef = useRef<AbortController | null>(null);
  const episodeRunIdRef = useRef(0);
  const replayVoiceMessageIdRef = useRef<string | null>(null);
  const replayVoiceRunIdRef = useRef(0);
  const deleteCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteReturnFocusRef = useRef<HTMLElement | null>(null);
  const lightStudioUploadRef = useRef<HTMLInputElement | null>(null);
  const darkStudioUploadRef = useRef<HTMLInputElement | null>(null);
  const logoUploadRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => blockingAbortRef.current?.abort(), []);

  const stopUtterance = useCallback((): void => {
    activeSpeechMessageIdRef.current = null;
    setSpeakingMessageId(null);
    setLiveSpeech(null);
    onStopUtterance?.();
  }, [onStopUtterance]);

  const invalidateEpisodeOperation = useCallback((): void => {
    episodeRunIdRef.current += 1;
    episodeOperationAbortRef.current?.abort();
    episodeOperationAbortRef.current = null;
    advanceInFlightRef.current = false;
    setAutoRun(false);
    setBusy(false);
    stopUtterance();
  }, [stopUtterance]);

  const beginEpisodeOperation = useCallback((): {
    controller: AbortController;
    runId: number;
  } => {
    episodeOperationAbortRef.current?.abort();
    const controller = new AbortController();
    const runId = episodeRunIdRef.current + 1;
    episodeRunIdRef.current = runId;
    episodeOperationAbortRef.current = controller;
    return { controller, runId };
  }, []);

  const episodeOperationIsCurrent = useCallback(
    (controller: AbortController, runId: number): boolean =>
      !controller.signal.aborted &&
      episodeOperationAbortRef.current === controller &&
      episodeRunIdRef.current === runId,
    [],
  );

  useEffect(
    () => () => invalidateEpisodeOperation(),
    [invalidateEpisodeOperation],
  );

  const cancelBlockingOperation = (): void => {
    const controller = blockingAbortRef.current;
    if (!controller || controller.signal.aborted) return;
    controller.abort();
    setBlockingOperation(null);
    setBusy(false);
  };

  useEffect(() => {
    if (responseMode === "auto" && episodeModelDraft) {
      setEpisodeModelDraft("");
    }
  }, [episodeModelDraft, responseMode]);

  useEffect(() => {
    if (
      episodeModelDraft &&
      !modelOptions.some((option) => option.id === episodeModelDraft)
    ) {
      setEpisodeModelDraft("");
    }
  }, [episodeModelDraft, modelOptions]);

  const selectedShow = shows.find((show) => show.id === selectedShowId) ?? null;
  const selectedShowArtworkBusy = Boolean(
    selectedShow &&
      artworkJob?.showId === selectedShow.id &&
      signalArtworkJobIsActive(artworkJob),
  );
  const dashboardAtmosphere = selectedShow
    ? activeShowAtmosphere(selectedShow, theme)
    : null;
  const hostBot = selectedShow ? botsById.get(selectedShow.hostBotId) ?? null : null;
  const liveGuestBot = episode ? botsById.get(episode.guestBotId) ?? null : null;
  const replayHostBot = replayEpisode
    ? botsById.get(replayEpisode.hostBotId) ?? null
    : null;
  const replayGuestBot = replayEpisode
    ? botsById.get(replayEpisode.guestBotId) ?? null
    : null;

  const loadShows = useCallback(async (): Promise<BotcastShow[]> => {
    const response = await request<{ shows: BotcastShow[] }>("/api/botcast/shows");
    setShows(response.shows);
    return response.shows;
  }, [request]);

  const refreshArtworkJob = useCallback(async (): Promise<void> => {
    try {
      const response = await request<{ job: SignalArtworkJobSnapshot | null }>(
        "/api/botcast/artwork-jobs/active",
      );
      setArtworkJob(response.job);
    } catch {
      // Preserve the last state through temporary API disconnects.
    }
  }, [request]);

  useEffect(() => {
    void refreshArtworkJob();
    const onArtworkJob = (event: Event): void => {
      setArtworkJob((event as CustomEvent<SignalArtworkJobSnapshot>).detail);
    };
    window.addEventListener(SIGNAL_ARTWORK_JOB_EVENT, onArtworkJob);
    return () => window.removeEventListener(SIGNAL_ARTWORK_JOB_EVENT, onArtworkJob);
  }, [refreshArtworkJob]);

  useEffect(() => {
    if (!artworkJob || !signalArtworkJobIsActive(artworkJob)) return;
    const interval = window.setInterval(() => {
      void request<{ job: SignalArtworkJobSnapshot }>(
        `/api/botcast/artwork-jobs/${encodeURIComponent(artworkJob.id)}`,
      )
        .then((response) => setArtworkJob(response.job))
        .catch(() => undefined);
    }, 1_500);
    return () => window.clearInterval(interval);
  }, [artworkJob, request]);

  useEffect(() => {
    if (
      !artworkJob ||
      signalArtworkJobIsActive(artworkJob) ||
      handledArtworkJobIdsRef.current.has(artworkJob.id)
    ) {
      return;
    }
    handledArtworkJobIdsRef.current.add(artworkJob.id);
    void loadShows().then((nextShows) => {
      const refreshedShow = nextShows.find((show) => show.id === selectedShowId);
      if (refreshedShow) setShowNameDraft(refreshedShow.name);
    });
    if (artworkJob.status === "completed") {
      setNotice("The custom logo and matching Light and Dark studios are live.");
    } else if (artworkJob.status === "partial") {
      setNotice("Finished custom artwork is live; the PRISM set covers anything still missing.");
      setError(artworkJob.errors.at(-1)?.message ?? "Some Signal artwork could not be completed.");
    } else if (artworkJob.status === "failed") {
      setError(artworkJob.errors.at(-1)?.message ?? "Signal artwork could not be completed.");
    } else if (artworkJob.status === "cancelled") {
      setNotice("Artwork synthesis stopped. Finished visuals were kept.");
    }
  }, [artworkJob, loadShows, selectedShowId]);

  const loadEpisodes = useCallback(
    async (showId: string): Promise<BotcastEpisodeSummary[]> => {
      const response = await request<{ episodes: BotcastEpisodeSummary[] }>(
        `/api/botcast/shows/${encodeURIComponent(showId)}/episodes`,
      );
      setEpisodes(response.episodes);
      return response.episodes;
    },
    [request],
  );

  const loadEpisode = useCallback(
    async (episodeId: string): Promise<BotcastEpisode> => {
      const response = await request<{ episode: BotcastEpisode }>(
        `/api/botcast/episodes/${encodeURIComponent(episodeId)}`,
      );
      return response.episode;
    },
    [request],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const nextShows = await loadShows();
        if (!active) return;
        const first = nextShows[0] ?? null;
        if (first) {
          setSelectedShowId(first.id);
          setShowNameDraft(first.name);
          await loadEpisodes(first.id);
        }
      } catch (loadError) {
        if (active) setError(errorMessage(loadError));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadEpisodes, loadShows]);

  const selectShow = useCallback(
    async (show: BotcastShow): Promise<void> => {
      invalidateEpisodeOperation();
      replayVoiceRunIdRef.current += 1;
      replayVoiceMessageIdRef.current = null;
      setReplayPlaying(false);
      setReplayVoicePending(false);
      setReplaySpeechActive(false);
      setSelectedShowId(show.id);
      setShowNameDraft(show.name);
      setEpisode(null);
      setReplayEpisode(null);
      setError(null);
      setLoading(true);
      try {
        await loadEpisodes(show.id);
      } catch (loadError) {
        setError(errorMessage(loadError));
      } finally {
        setLoading(false);
      }
    },
    [invalidateEpisodeOperation, loadEpisodes],
  );

  const replaceShow = (nextShow: BotcastShow): void => {
    setShows((current) => {
      const exists = current.some((show) => show.id === nextShow.id);
      return exists
        ? current.map((show) => (show.id === nextShow.id ? nextShow : show))
        : [nextShow, ...current];
    });
    if (nextShow.id === selectedShowId) setShowNameDraft(nextShow.name);
  };

  const resetEpisodePlayback = (): void => {
    invalidateEpisodeOperation();
    replayVoiceRunIdRef.current += 1;
    setReplayPlaying(false);
    setReplayVoicePending(false);
    setReplaySpeechActive(false);
    setReplayElapsedMs(0);
    setReplayCamera("auto");
    replayVoiceMessageIdRef.current = null;
  };

  const openShowDeletion = (show: BotcastShow, opener: HTMLElement): void => {
    resetEpisodePlayback();
    deleteReturnFocusRef.current = opener;
    setDeleteError(null);
    setDeleteTarget({
      kind: "show",
      id: show.id,
      name: show.name,
      episodeCount: show.episodeCount,
    });
  };

  const openEpisodeDeletion = (
    item: Pick<BotcastEpisodeSummary, "id" | "showId" | "title" | "status">,
    opener: HTMLElement,
  ): void => {
    resetEpisodePlayback();
    deleteReturnFocusRef.current = opener;
    setDeleteError(null);
    setDeleteTarget({
      kind: "episode",
      id: item.id,
      showId: item.showId,
      title: item.title,
      status: item.status,
    });
  };

  const dismissDeletion = (): void => {
    if (busy) return;
    setDeleteError(null);
    setDeleteTarget(null);
  };

  useEffect(() => {
    if (!deleteTarget) {
      const focusTarget = deleteReturnFocusRef.current?.isConnected
        ? deleteReturnFocusRef.current
        : document.querySelector<HTMLElement>("[data-botcast-delete-focus-fallback='true']");
      deleteReturnFocusRef.current = null;
      focusTarget?.focus();
      return;
    }
    deleteCancelButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        setDeleteError(null);
        setDeleteTarget(null);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = deleteCancelButtonRef.current?.closest<HTMLElement>("[role='alertdialog']");
      const focusable = dialog
        ? Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
        : [];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, deleteTarget]);

  const deleteConfirmedTarget = async (): Promise<void> => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setBusy(true);
    setDeleteError(null);
    setError(null);
    try {
      if (target.kind === "show") {
        const nextShowId = nextBotcastShowIdAfterDeletion(shows, target.id);
        await request(`/api/botcast/shows/${encodeURIComponent(target.id)}`, {
          method: "DELETE",
        });
        resetEpisodePlayback();
        setEpisode(null);
        setReplayEpisode(null);
        setEpisodes([]);
        setGuestDraftId("");
        setTopicDraft("");
        setProducerBriefDraft("");
        setAskAboutDraft("");
        const nextShows = await loadShows();
        const nextShow = nextShows.find((show) => show.id === nextShowId) ?? nextShows[0] ?? null;
        setSelectedShowId(nextShow?.id ?? null);
        setShowNameDraft(nextShow?.name ?? "");
        if (nextShow) await loadEpisodes(nextShow.id);
        setNotice(
          target.episodeCount
            ? `${target.name} and ${target.episodeCount} episode${target.episodeCount === 1 ? "" : "s"} deleted.`
            : `${target.name} deleted.`,
        );
      } else {
        await request(`/api/botcast/episodes/${encodeURIComponent(target.id)}`, {
          method: "DELETE",
        });
        resetEpisodePlayback();
        setEpisode((current) => (current?.id === target.id ? null : current));
        setReplayEpisode((current) => (current?.id === target.id ? null : current));
        await Promise.all([loadShows(), loadEpisodes(target.showId)]);
        setNotice(
          target.status === "live"
            ? `“${target.title}” discarded.`
            : `“${target.title}” deleted from the archive.`,
        );
      }
      setDeleteTarget(null);
    } catch (deleteRequestError) {
      setDeleteError(errorMessage(deleteRequestError));
    } finally {
      setBusy(false);
    }
  };

  const generateShowArtwork = async (
    sourceShow: BotcastShow,
    regenerate: boolean,
    kinds: readonly SignalArtworkKind[] = ["night-studio", "day-studio", "logo"],
  ): Promise<{
    show: BotcastShow;
    generatedCount: number;
    failureMessage: string | null;
    cancelled: boolean;
  }> => {
    const includesNightStudio = kinds.includes("night-studio");
    const includesDayStudio = kinds.includes("day-studio");
    const includesStudios = includesNightStudio || includesDayStudio;
    const includesLogo = kinds.includes("logo");
    const controller = new AbortController();
    const studioTitle = includesNightStudio && includesDayStudio
      ? "Building the day and night studios"
      : includesDayStudio
        ? "Relighting the Light studio"
        : "Building a new Dark studio";
    const studioDetail = includesNightStudio && includesDayStudio
      ? "PRISM is preserving one persona-specific set while changing only its light."
      : includesDayStudio
        ? "PRISM is preserving the set while giving it natural daylight."
        : "PRISM is creating a fresh persona-shaped studio after dark.";
    blockingAbortRef.current = controller;
    setBlockingOperation({
      title: includesStudios && includesLogo
        ? `Giving ${sourceShow.name} a visual identity`
        : includesStudios
          ? studioTitle
          : "Designing a new show mark",
      detail: includesStudios && includesLogo
        ? "PRISM is rendering a matched studio pair and its companion logo."
        : includesStudios
          ? studioDetail
          : "PRISM is distilling the show’s personality into one memorable symbol.",
      stepLabel: regenerate ? "Preparing fresh art direction" : "Preparing the visual identity",
      progress: 0,
      cancellable: true,
    });
    let workingShow = sourceShow;
    let generatedCount = 0;
    let failureMessage: string | null = null;
    try {
      if (regenerate) {
        const reset = await request<{ show: BotcastShow }>(
          `/api/botcast/shows/${encodeURIComponent(sourceShow.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              ...(includesNightStudio && includesDayStudio
                ? { regenerateAtmosphere: true }
                : {}),
              ...(includesDayStudio && !includesNightStudio
                ? { regenerateDayAtmosphere: true }
                : {}),
              ...(includesNightStudio && !includesDayStudio
                ? { regenerateNightAtmosphere: true }
                : {}),
              ...(includesLogo ? { regenerateLogo: true } : {}),
            }),
            signal: controller.signal,
          },
        );
        workingShow = reset.show;
        replaceShow(workingShow);
      }
      let canonicalNightImageId = workingShow.nightAtmosphere.imageId;
      type PendingStudioAttachment = {
        imageId: string;
        imageUrl: string;
        errorMessage: string;
      };
      let pendingNightAttachment: PendingStudioAttachment | null = null;
      let pendingDayAttachment: PendingStudioAttachment | null = null;
      const artwork = ([
        {
          kind: "nighttime studio",
          artworkKind: "night-studio",
          prompt: workingShow.nightAtmosphere.prompt,
          size: "1536x1024",
          imageUrlKey: "nightAtmosphereImageUrl",
          imageIdKey: "nightAtmosphereImageId",
          source: null,
        },
        {
          kind: "daytime studio",
          artworkKind: "day-studio",
          prompt: workingShow.dayAtmosphere.prompt,
          size: "1536x1024",
          imageUrlKey: "dayAtmosphereImageUrl",
          imageIdKey: "dayAtmosphereImageId",
          source: "night",
        },
        {
          kind: "logo",
          artworkKind: "logo",
          prompt: workingShow.logo.prompt,
          size: "1024x1024",
          imageUrlKey: "logoImageUrl",
          imageIdKey: "logoImageId",
          source: null,
        },
      ] as const).filter((asset) => kinds.includes(asset.artworkKind));
      for (const [index, asset] of artwork.entries()) {
        if (controller.signal.aborted) {
          return { show: workingShow, generatedCount, failureMessage, cancelled: true };
        }
        setBlockingOperation((current) => current ? {
          ...current,
          stepLabel: `Rendering ${asset.kind} · ${index + 1} of ${artwork.length}`,
          progress: index / artwork.length,
        } : null);
        try {
          setNotice(`Synthesizing the ${asset.kind}…`);
          const sourceImageId = asset.source === "night"
            ? canonicalNightImageId
            : null;
          if (asset.source === "night" && !sourceImageId) {
            throw new Error("The nighttime studio must finish before its daytime edit.");
          }
          const generated = await request<ImageGenerationResponse>("/api/images/generate", {
            method: "POST",
            body: JSON.stringify({
              prompt: asset.prompt,
              size: asset.size,
              quality: preferredImageProvider === "openai" ? "high" : "standard",
              preferredProvider: preferredImageProvider,
              botId: workingShow.hostBotId,
              origin: "botcast",
              ...(sourceImageId ? {
                sourceImageId,
                sourceEditKind: "daylight-relight",
              } : {}),
            }),
            signal: controller.signal,
          });
          const imageUrl = generated.image.displayUrl ?? generated.image.url;
          if (!imageUrl) throw new Error(`${asset.kind} image has no usable local URL.`);
          if (asset.kind === "nighttime studio") {
            // Preserve the canonical source immediately. A transient show PATCH
            // must not make the daylight edit fall back to an older studio.
            canonicalNightImageId = generated.image.id;
          }
          const recoveringNightAttachment = asset.kind === "daytime studio"
            ? pendingNightAttachment
            : null;
          try {
            const saved = await request<{ show: BotcastShow }>(
              `/api/botcast/shows/${encodeURIComponent(sourceShow.id)}`,
              {
                method: "PATCH",
                body: JSON.stringify({
                  ...(recoveringNightAttachment ? {
                    nightAtmosphereImageUrl: recoveringNightAttachment.imageUrl,
                    nightAtmosphereImageId: recoveringNightAttachment.imageId,
                  } : {}),
                  [asset.imageUrlKey]: imageUrl,
                  [asset.imageIdKey]: generated.image.id,
                }),
                signal: controller.signal,
              },
            );
            workingShow = saved.show;
            generatedCount += recoveringNightAttachment ? 2 : 1;
            if (recoveringNightAttachment) pendingNightAttachment = null;
            replaceShow(workingShow);
          } catch (attachmentError) {
            if (isAbortError(attachmentError)) throw attachmentError;
            if (asset.kind === "nighttime studio") {
              pendingNightAttachment = {
                imageId: generated.image.id,
                imageUrl,
                errorMessage: errorMessage(attachmentError),
              };
              continue;
            }
            if (asset.kind === "daytime studio") {
              pendingDayAttachment = {
                imageId: generated.image.id,
                imageUrl,
                errorMessage: errorMessage(attachmentError),
              };
              continue;
            }
            throw attachmentError;
          }
        } catch (artworkError) {
          if (isAbortError(artworkError)) {
            return { show: workingShow, generatedCount, failureMessage, cancelled: true };
          }
          failureMessage ??= errorMessage(artworkError);
          // Each asset is isolated, so one failed synthesis never blocks the rest.
        } finally {
          setBlockingOperation((current) => current ? {
            ...current,
            progress: (index + 1) / artwork.length,
          } : null);
        }
      }
      if ((pendingNightAttachment || pendingDayAttachment) && !controller.signal.aborted) {
        const pendingNight = pendingNightAttachment;
        const pendingDay = pendingDayAttachment;
        try {
          const saved = await request<{ show: BotcastShow }>(
            `/api/botcast/shows/${encodeURIComponent(sourceShow.id)}`,
            {
              method: "PATCH",
              body: JSON.stringify({
                ...(pendingNight ? {
                  nightAtmosphereImageUrl: pendingNight.imageUrl,
                  nightAtmosphereImageId: pendingNight.imageId,
                } : {}),
                ...(pendingDay ? {
                  dayAtmosphereImageUrl: pendingDay.imageUrl,
                  dayAtmosphereImageId: pendingDay.imageId,
                } : {}),
              }),
              signal: controller.signal,
            },
          );
          workingShow = saved.show;
          generatedCount += Number(Boolean(pendingNight)) + Number(Boolean(pendingDay));
          pendingNightAttachment = null;
          pendingDayAttachment = null;
          replaceShow(workingShow);
        } catch (attachmentError) {
          if (isAbortError(attachmentError)) {
            return { show: workingShow, generatedCount, failureMessage, cancelled: true };
          }
          failureMessage ??=
            pendingNight?.errorMessage ||
            pendingDay?.errorMessage ||
            errorMessage(attachmentError);
        }
      }
      return {
        show: workingShow,
        generatedCount,
        failureMessage,
        cancelled: controller.signal.aborted,
      };
    } catch (artworkError) {
      if (isAbortError(artworkError)) {
        return { show: workingShow, generatedCount, failureMessage, cancelled: true };
      }
      throw artworkError;
    } finally {
      if (blockingAbortRef.current === controller) blockingAbortRef.current = null;
      setBlockingOperation(null);
    }
  };

  const createShow = async (): Promise<void> => {
    if (!hostDraftId) return;
    setBusy(true);
    setError(null);
    setNotice("Finding the show hidden inside this host…");
    try {
      const response = await request<{ show: BotcastShow }>("/api/botcast/shows", {
        method: "POST",
        body: JSON.stringify({ hostBotId: hostDraftId }),
      });
      await selectShow(response.show);
      replaceShow(response.show);
      setShowNameDraft(response.show.name);
      setNotice(
        `${response.show.name} is ready with its built-in PRISM set. Create its custom look whenever you want one.`,
      );
      setHostDraftId("");
      await loadShows();
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setBusy(false);
    }
  };

  const renameShow = async (nextName?: string): Promise<void> => {
    if (!selectedShow) return;
    const name = (nextName ?? showNameDraft).trim();
    if (!name || name === selectedShow.name) return;
    setShows((current) =>
      current.map((show) => (show.id === selectedShow.id ? { ...show, name } : show)),
    );
    try {
      const response = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}`,
        { method: "PATCH", body: JSON.stringify({ name }) },
      );
      setShows((current) =>
        current.map((show) => (show.id === response.show.id ? response.show : show)),
      );
    } catch (renameError) {
      setShowNameDraft(selectedShow.name);
      setError(errorMessage(renameError));
    }
  };

  const regenerateShowName = async (): Promise<void> => {
    if (!selectedShow) return;
    setBusy(true);
    setError(null);
    setBlockingOperation({
      title: "Finding another name",
      detail: `PRISM is listening for the idea at the heart of ${selectedShow.name}.`,
      stepLabel: "Drafting and rejecting the obvious titles",
      progress: null,
      cancellable: false,
    });
    try {
      const response = await request<{ show: BotcastShow; generated: boolean }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/name`,
        {
          method: "POST",
          body: JSON.stringify({ preferredProvider }),
        },
      );
      if (!response.generated) {
        setNotice("The current name still won. Try again whenever you want another pass.");
        return;
      }
      replaceShow(response.show);
      setShowNameDraft(response.show.name);
      setNotice(`“${response.show.name}” is now on the marquee. You can still edit it.`);
    } catch (nameError) {
      setError(errorMessage(nameError));
    } finally {
      setBlockingOperation(null);
      setBusy(false);
    }
  };

  const synthesizeShowLook = async (): Promise<void> => {
    if (!selectedShow) return;
    const controller = new AbortController();
    const identityStartedAt = performance.now();
    let identityFailure: string | null = null;
    setBusy(true);
    setError(null);
    setNotice("Finding this show’s identity…");
    blockingAbortRef.current = controller;
    setBlockingOperation({
      title: `Finding ${selectedShow.name}’s visual identity`,
      detail: "PRISM is finding the show’s name and persona-shaped art direction before the renderer continues in the background.",
      stepLabel: "Finding the name and visual identity",
      progress: null,
      cancellable: true,
    });
    try {
      try {
        const identity = await request<{ show: BotcastShow; generated: boolean }>(
          `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/brand`,
          {
            method: "POST",
            body: JSON.stringify({ preferredProvider }),
            signal: controller.signal,
          },
        );
        if (identity.generated) {
          replaceShow(identity.show);
          setShowNameDraft(identity.show.name);
        }
      } catch (identityError) {
        if (isAbortError(identityError)) throw identityError;
        identityFailure = errorMessage(identityError);
      }
      const identityMs = Math.max(0, Math.round(performance.now() - identityStartedAt));
      console.info("[signal-artwork] identity prepared", {
        showId: selectedShow.id,
        identityMs,
        fallbackUsed: Boolean(identityFailure),
      });
      setBlockingOperation((current) =>
        current
          ? {
              ...current,
              stepLabel: "Handing the artwork to the background renderer",
            }
          : current,
      );
      const response = await request<{ job: SignalArtworkJobSnapshot }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/artwork-job`,
        {
          method: "POST",
          body: JSON.stringify({
            preferredProvider: preferredImageProvider,
            identityMs,
          }),
          signal: controller.signal,
        },
      );
      setArtworkJob(response.job);
      announceSignalArtworkJob(response.job);
      if (identityFailure) setError(identityFailure);
      setNotice("The Dark studio is rendering in the background. You can keep using PRISM.");
    } catch (artworkError) {
      if (isAbortError(artworkError)) {
        setNotice("Show look setup cancelled. No artwork job was started.");
        return;
      }
      setError(errorMessage(artworkError));
    } finally {
      if (blockingAbortRef.current === controller) blockingAbortRef.current = null;
      setBlockingOperation(null);
      setBusy(false);
    }
  };

  const regenerateStudioVariant = async (
    lighting: "day" | "night",
  ): Promise<void> => {
    if (!selectedShow) return;
    const label = lighting === "day" ? "Light" : "Dark";
    const kind: SignalArtworkKind = lighting === "day" ? "day-studio" : "night-studio";
    setBusy(true);
    setError(null);
    setNotice(`Refreshing the show’s ${label} studio…`);
    try {
      const artwork = await generateShowArtwork(selectedShow, true, [kind]);
      if (artwork.cancelled) {
        setNotice(`${label} studio synthesis cancelled. The previous artwork remains in place.`);
        return;
      }
      if (artwork.failureMessage) setError(artwork.failureMessage);
      setNotice(
        artwork.generatedCount === 1
          ? `The refreshed ${label} studio is live.`
          : `Synthesis was unavailable, so the previous ${label} studio remains in place.`,
      );
    } catch {
      setNotice(`The procedural ${label} studio is active; no show setup was lost.`);
    } finally {
      setBusy(false);
    }
  };

  const regenerateLogo = async (): Promise<void> => {
    if (!selectedShow) return;
    setBusy(true);
    setError(null);
    setNotice("Refreshing the show’s logo…");
    try {
      const artwork = await generateShowArtwork(selectedShow, true, ["logo"]);
      if (artwork.cancelled) {
        setNotice("Logo synthesis cancelled. The previous logo remains in place.");
        return;
      }
      if (artwork.failureMessage) setError(artwork.failureMessage);
      setNotice(
        artwork.generatedCount === 1
          ? "The refreshed logo is live."
          : "Synthesis was unavailable, so the previous logo remains in place.",
      );
    } catch {
      setNotice("The procedural logo is active; no show setup was lost.");
    } finally {
      setBusy(false);
    }
  };

  const uploadShowAsset = async (
    slot: SignalAssetSlot,
    file: File,
  ): Promise<void> => {
    if (!selectedShow) return;
    const label = SIGNAL_ASSET_LABELS[slot];
    setBusy(true);
    setError(null);
    setBlockingOperation({
      title: `Replacing ${label}`,
      detail: `Saving ${file.name} to ${selectedShow.name}.`,
      stepLabel: "Reading image",
      progress: null,
      cancellable: false,
    });
    try {
      const dataUrl = await readSignalAssetFile(file);
      setBlockingOperation((current) => current
        ? { ...current, stepLabel: "Saving to Signal" }
        : null);
      const response = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/assets/${slot}/upload`,
        {
          method: "POST",
          body: JSON.stringify({ dataUrl }),
        },
      );
      replaceShow(response.show);
      setNotice(`The ${label} has been replaced. Its previous artwork remains in Images.`);
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setBlockingOperation(null);
      setBusy(false);
    }
  };

  const startEpisode = async (): Promise<void> => {
    if (!selectedShow || !guestDraftId || !topicDraft.trim()) return;
    onPrepareUtterance?.();
    const { controller, runId } = beginEpisodeOperation();
    const selectedModelOption = responseMode !== "auto" && episodeModelDraft
      ? modelOptions.find((option) => option.id === episodeModelDraft) ?? null
      : null;
    const episodeProvider =
      selectedModelOption?.provider ??
      accountDefaultModelOption?.provider ??
      preferredProvider;
    setBusy(true);
    setError(null);
    try {
      const response = await request<{ episode: BotcastEpisode }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/episodes`,
        {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({
            guestBotId: guestDraftId,
            topic: topicDraft,
            producerBrief: producerBriefDraft,
            preferredProvider: episodeProvider,
            responseMode,
            modelOverride: selectedModelOption?.id ?? accountDefaultModel,
          }),
        },
      );
      if (!episodeOperationIsCurrent(controller, runId)) return;
      setEpisode(response.episode);
      setReplayEpisode(null);
      setAutoRun(true);
      setTopicDraft("");
      setProducerBriefDraft("");
      setEpisodeModelDraft("");
      setAskAboutDraft("");
      void loadEpisodes(selectedShow.id).catch(() => undefined);
    } catch (startError) {
      if (episodeOperationIsCurrent(controller, runId)) {
        setError(errorMessage(startError));
      }
    } finally {
      if (episodeOperationIsCurrent(controller, runId)) {
        episodeOperationAbortRef.current = null;
        setBusy(false);
      }
    }
  };

  const revealUtteranceWithoutAudio = useCallback(
    async (message: BotcastMessage): Promise<void> => {
      const messageId = message.id;
      const tokenCount = Math.max(1, message.content.trim().split(/\s+/u).length);
      const durationMs = Math.min(6_500, Math.max(720, tokenCount * 175));
      setLiveSpeech({
        messageId,
        reveal: startBotcastSpeechReveal({
          text: message.content,
          durationMs,
        }),
      });
      const startedAt = performance.now();
      while (activeSpeechMessageIdRef.current === messageId) {
        const elapsedMs = Math.min(durationMs, performance.now() - startedAt);
        setLiveSpeech((current) => current?.messageId === messageId
          ? {
              ...current,
              reveal: updateBotcastSpeechReveal(current.reveal, elapsedMs),
            }
          : current);
        if (elapsedMs >= durationMs) break;
        await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
      }
      if (activeSpeechMessageIdRef.current !== messageId) return;
      setLiveSpeech((current) => current?.messageId === messageId
        ? { ...current, reveal: finishBotcastSpeechReveal(current.reveal) }
        : current);
    },
    [],
  );

  const advanceEpisode = useCallback(
    async (cue?: BotcastProducerCue): Promise<void> => {
      if (!episode || episode.status === "completed" || advanceInFlightRef.current) return;
      advanceInFlightRef.current = true;
      const { controller, runId } = beginEpisodeOperation();
      setBusy(true);
      setError(null);
      try {
        const response = await request<BotcastEpisodeAdvanceResponse>(
          `/api/botcast/episodes/${encodeURIComponent(episode.id)}/advance`,
          {
            method: "POST",
            signal: controller.signal,
            body: JSON.stringify({
              ...(cue ? { cue } : {}),
            }),
          },
        );
        if (!episodeOperationIsCurrent(controller, runId)) return;
        if (response.message) {
          const message = response.message;
          activeSpeechMessageIdRef.current = message.id;
          setLiveSpeech({
            messageId: message.id,
            reveal: prepareBotcastSpeechReveal(message.content),
          });
          setSpeakingMessageId(response.message.id);
          setEpisode(response.episode);
          const bot = botsById.get(message.botId);
          let playbackStarted = false;
          const lifecycle: VoicePlaybackLifecycle = {
            onStart: (durationMs, alignment) => {
              if (
                activeSpeechMessageIdRef.current !== message.id ||
                !episodeOperationIsCurrent(controller, runId)
              ) return;
              playbackStarted = true;
              setLiveSpeech({
                messageId: message.id,
                reveal: startBotcastSpeechReveal({
                  text: message.content,
                  durationMs: durationMs ?? Math.max(720, message.content.length * 34),
                  alignment,
                }),
              });
            },
            onProgress: (elapsedMs, durationMs) => {
              if (
                activeSpeechMessageIdRef.current !== message.id ||
                !episodeOperationIsCurrent(controller, runId)
              ) return;
              setLiveSpeech((current) => {
                if (!current || current.messageId !== message.id) return current;
                const reveal = current.reveal.phase === "preparing"
                  ? startBotcastSpeechReveal({
                      text: message.content,
                      durationMs,
                    })
                  : current.reveal;
                return {
                  ...current,
                  reveal: updateBotcastSpeechReveal(reveal, elapsedMs),
                };
              });
            },
            onEnd: () => {
              if (
                activeSpeechMessageIdRef.current !== message.id ||
                !episodeOperationIsCurrent(controller, runId)
              ) return;
              setLiveSpeech((current) => current?.messageId === message.id
                ? { ...current, reveal: finishBotcastSpeechReveal(current.reveal) }
                : current);
            },
          };
          const played = bot && onUtterance
            ? await onUtterance(message, bot, lifecycle)
            : false;
          if (
            activeSpeechMessageIdRef.current !== message.id ||
            !episodeOperationIsCurrent(controller, runId)
          ) return;
          if (!played && !playbackStarted) {
            await revealUtteranceWithoutAudio(message);
          } else {
            setLiveSpeech((current) => current?.messageId === message.id
              ? { ...current, reveal: finishBotcastSpeechReveal(current.reveal) }
              : current);
          }
          if (activeSpeechMessageIdRef.current === message.id) {
            activeSpeechMessageIdRef.current = null;
            setSpeakingMessageId(null);
            setLiveSpeech(null);
          }
        } else {
          setEpisode(response.episode);
        }
        if (response.episode.status === "completed") {
          setAutoRun(false);
          if (selectedShowId) void loadEpisodes(selectedShowId).catch(() => undefined);
        }
      } catch (advanceError) {
        if (episodeOperationIsCurrent(controller, runId)) {
          if (activeSpeechMessageIdRef.current !== null) stopUtterance();
          setAutoRun(false);
          setError(errorMessage(advanceError));
        }
      } finally {
        if (episodeOperationIsCurrent(controller, runId)) {
          episodeOperationAbortRef.current = null;
          setBusy(false);
          advanceInFlightRef.current = false;
        }
      }
    },
    [
      botsById,
      beginEpisodeOperation,
      episode,
      episodeOperationIsCurrent,
      loadEpisodes,
      onUtterance,
      revealUtteranceWithoutAudio,
      request,
      selectedShowId,
      stopUtterance,
    ],
  );

  useEffect(() => {
    if (
      !episode ||
      episode.status === "completed" ||
      !autoRun ||
      busy ||
      speakingMessageId !== null
    )
      return;
    const timer = window.setTimeout(
      () => void advanceEpisode(),
      episode.messages.length ? 360 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [advanceEpisode, autoRun, busy, episode, speakingMessageId]);

  const sendCue = (cue: BotcastProducerCue): void => {
    onPrepareUtterance?.();
    setAutoRun(true);
    void advanceEpisode(cue);
  };

  const openReplay = async (summary: BotcastEpisodeSummary): Promise<void> => {
    invalidateEpisodeOperation();
    const replayRunId = replayVoiceRunIdRef.current + 1;
    replayVoiceRunIdRef.current = replayRunId;
    replayVoiceMessageIdRef.current = null;
    setReplayVoicePending(false);
    setReplaySpeechActive(false);
    setLoading(true);
    setError(null);
    try {
      const detail = await loadEpisode(summary.id);
      if (replayVoiceRunIdRef.current !== replayRunId) return;
      if (detail.status === "live") {
        setEpisode(detail);
        setReplayEpisode(null);
        setAutoRun(false);
        return;
      }
      setReplayEpisode(detail);
      setEpisode(null);
      setReplayCamera("auto");
      setReplayElapsedMs(0);
      setReplayPlaying(false);
    } catch (replayError) {
      if (replayVoiceRunIdRef.current === replayRunId) {
        setError(errorMessage(replayError));
      }
    } finally {
      if (replayVoiceRunIdRef.current === replayRunId) setLoading(false);
    }
  };

  const replayTimeline = useMemo(
    () =>
      replayEpisode
        ? botcastReplayTimeline(replayEpisode.messages, replayEpisode.events)
        : { durationMs: 8_000, messageStartMs: [] },
    [replayEpisode],
  );
  const replayDurationMs = replayTimeline.durationMs;
  useEffect(() => {
    if (!replayEpisode || !replayPlaying || replayVoicePending) return;
    const timer = window.setInterval(() => {
      setReplayElapsedMs((current) => {
        const next = Math.min(replayDurationMs, current + 100);
        if (next >= replayDurationMs) setReplayPlaying(false);
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [replayDurationMs, replayEpisode, replayPlaying, replayVoicePending]);

  const replayShot = replayEpisode
    ? botcastCameraShotAt({
        events: replayEpisode.events,
        elapsedMs: replayElapsedMs,
        manualShot: replayCamera,
      })
    : "wide";
  const replayGuestDeparted = replayEpisode
    ? botcastGuestHasDepartedAt(replayEpisode.events, replayElapsedMs)
    : false;
  const replayMessageIndex = botcastReplayMessageIndexAt(
    replayTimeline.messageStartMs,
    replayElapsedMs,
  );
  const replayActiveMessage = replayEpisode?.messages[replayMessageIndex] ?? null;
  useEffect(() => {
    if (!replayPlaying || !replayActiveMessage) return;
    if (replayVoiceMessageIdRef.current === replayActiveMessage.id) return;
    replayVoiceMessageIdRef.current = replayActiveMessage.id;
    const bot = botsById.get(replayActiveMessage.botId);
    if (!bot || !onUtterance) return;
    const runId = replayVoiceRunIdRef.current + 1;
    replayVoiceRunIdRef.current = runId;
    const messageStartMs = replayTimeline.messageStartMs[replayMessageIndex] ?? 0;
    const messageEndMs =
      replayTimeline.messageStartMs[replayMessageIndex + 1] ?? replayDurationMs;
    setReplayVoicePending(true);
    setReplaySpeechActive(false);
    void (async () => {
      try {
        const played = await onUtterance(replayActiveMessage, bot, {
          onStart: () => {
            if (replayVoiceRunIdRef.current !== runId) return;
            setReplaySpeechActive(true);
          },
          onProgress: (elapsedMs, durationMs) => {
            if (replayVoiceRunIdRef.current !== runId) return;
            const progress = Math.max(0, Math.min(1, elapsedMs / Math.max(1, durationMs)));
            setReplayElapsedMs(
              messageStartMs + (messageEndMs - messageStartMs) * progress,
            );
          },
          onEnd: () => {
            if (replayVoiceRunIdRef.current !== runId) return;
            setReplaySpeechActive(false);
          },
        });
        if (replayVoiceRunIdRef.current !== runId) return;
        if (played) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 280));
          if (replayVoiceRunIdRef.current !== runId) return;
          setReplayElapsedMs(messageEndMs);
          if (messageEndMs >= replayDurationMs) setReplayPlaying(false);
        }
      } catch {
        // Replay falls back to its saved director clock when speech is unavailable.
      } finally {
        if (replayVoiceRunIdRef.current === runId) {
          setReplaySpeechActive(false);
          setReplayVoicePending(false);
        }
      }
    })();
  }, [
    botsById,
    onUtterance,
    replayActiveMessage,
    replayDurationMs,
    replayMessageIndex,
    replayPlaying,
    replayTimeline.messageStartMs,
  ]);
  useEffect(() => {
    if (replayEpisode) return;
    replayVoiceMessageIdRef.current = null;
  }, [replayEpisode]);

  const stopReplayPlayback = (): void => {
    replayVoiceRunIdRef.current += 1;
    replayVoiceMessageIdRef.current = null;
    setReplayPlaying(false);
    setReplayVoicePending(false);
    setReplaySpeechActive(false);
    onStopUtterance?.();
  };

  const renderStage = (args: {
    show: BotcastShow;
    currentEpisode: BotcastEpisode;
    host: BotcastBotSummary | null;
    guest: BotcastBotSummary | null;
    shot: "left" | "right" | "wide";
    activeMessage: BotcastMessage | null;
    replay: boolean;
    guestDeparted?: boolean;
  }): React.JSX.Element => {
    const departed = args.guestDeparted ?? guestHasDeparted(args.currentEpisode);
    const thinkingRole = botcastNextSpeakerRole({
      messages: args.currentEpisode.messages,
      segment: args.currentEpisode.segment,
      guestDeparted: departed,
    });
    const stageAtmosphere = activeShowAtmosphere(args.show, theme);
    const replayMessageStartMs = replayTimeline.messageStartMs[replayMessageIndex] ?? 0;
    const replayMessageEndMs =
      replayTimeline.messageStartMs[replayMessageIndex + 1] ?? replayDurationMs;
    const speechReveal =
      !args.replay && args.activeMessage && liveSpeech?.messageId === args.activeMessage.id
        ? liveSpeech.reveal
        : null;
    const speechElapsedMs = args.replay
      ? Math.max(0, replayElapsedMs - replayMessageStartMs)
      : speechReveal?.elapsedMs ?? 0;
    const speechDurationMs = args.replay
      ? Math.max(1, replayMessageEndMs - replayMessageStartMs)
      : speechReveal?.durationMs ?? 0;
    const speechIsPlaying = args.replay
      ? replayPlaying && replaySpeechActive
      : speechReveal?.phase === "playing";
    const roleIsThinking = (role: "host" | "guest"): boolean =>
      !args.replay && (
        (speechReveal?.phase === "preparing" && args.activeMessage?.speakerRole === role) ||
        (busy && speakingMessageId === null && thinkingRole === role)
      );
    const atmosphereStyle = {
      ["--botcast-accent" as string]: args.show.accentColor,
      ["--botcast-studio-accent" as string]: normalizeAccentForTheme(
        args.host?.color ?? args.show.accentColor,
        theme,
      ),
      ...(stageAtmosphere.imageUrl
        ? { ["--botcast-atmosphere" as string]: `url("${stageAtmosphere.imageUrl}")` }
        : {}),
    } as CSSProperties;
    const avatar = (
      bot: BotcastBotSummary,
      role: "host" | "guest",
      talking: boolean,
      thinking: boolean,
    ): ReactNode => {
      const mouthShape = talking && args.activeMessage
        ? crtSpeechMouthShapeAtElapsedMs({
            text: args.activeMessage.content,
            elapsedMs: speechElapsedMs,
            ...(speechDurationMs > 0 ? { durationMs: speechDurationMs } : {}),
          })
        : "closed";
      return renderAvatar?.(bot, { talking, thinking, role, mouthShape }) ?? avatarFallback(bot);
    };
    return (
      <section
        className={styles.stageViewport}
        data-shot={args.shot}
        data-replay={args.replay ? "true" : undefined}
        data-studio-source={stageAtmosphere.imageUrl ? "image" : "fallback"}
        style={atmosphereStyle}
        aria-label={`Signal studio, ${args.shot} camera`}
      >
        <div className={styles.stageScene}>
          <div className={styles.atmosphere} aria-hidden="true">
            {!stageAtmosphere.imageUrl ? (
              <SignalFallbackStudio
                surface="stage"
                accentVariant={args.show.fallbackStudioAccentVariant}
              />
            ) : null}
          </div>
          <div className={styles.wordmark}>
            <SignalShowLogo show={args.show} />
            <strong>{args.show.name}</strong>
          </div>
          <div className={styles.studioGlow} aria-hidden="true" />
          <div
            className={`${styles.seat} ${styles.hostSeat}`}
            data-role="host"
            aria-label={`Host ${args.host?.name ?? "Host"}`}
          >
            {args.host ? (
              <div
                className={styles.avatarRig}
                data-signal-presence="host"
                data-talking={
                  speechIsPlaying && args.activeMessage?.speakerRole === "host"
                    ? "true"
                    : undefined
                }
                data-thinking={
                  roleIsThinking("host") ? "true" : undefined
                }
              >
                {avatar(
                  args.host,
                  "host",
                  speechIsPlaying && args.activeMessage?.speakerRole === "host",
                  roleIsThinking("host"),
                )}
              </div>
            ) : null}
            {args.host && renderMug ? (
              <div className={`${styles.stageMug} ${styles.hostMug}`} aria-label="Host coffee mug">
                {renderMug(args.host, { role: "host" })}
              </div>
            ) : null}
            <strong className={styles.nameplate}>
              <span>Host</span>
              {args.host?.name ?? "Host"}
            </strong>
          </div>
          <div
            className={`${styles.seat} ${styles.guestSeat}`}
            data-role="guest"
            data-departed={departed ? "true" : undefined}
            aria-label={`Guest ${args.guest?.name ?? "Guest"}`}
          >
            {!departed && args.guest ? (
              <div
                className={styles.avatarRig}
                data-signal-presence="guest"
                data-talking={
                  speechIsPlaying && args.activeMessage?.speakerRole === "guest"
                    ? "true"
                    : undefined
                }
                data-thinking={
                  roleIsThinking("guest") ? "true" : undefined
                }
              >
                {avatar(
                  args.guest,
                  "guest",
                  speechIsPlaying && args.activeMessage?.speakerRole === "guest",
                  roleIsThinking("guest"),
                )}
              </div>
            ) : (
              <span className={styles.emptyChairLabel}>Guest has left the studio</span>
            )}
            {!departed && args.guest && renderMug ? (
              <div className={`${styles.stageMug} ${styles.guestMug}`} aria-label="Guest coffee mug">
                {renderMug(args.guest, { role: "guest" })}
              </div>
            ) : null}
            <strong className={styles.nameplate}>
              <span>Guest</span>
              {args.guest?.name ?? "Guest"}
            </strong>
          </div>
        </div>
      </section>
    );
  };

  const renderLibrary = (): React.JSX.Element => (
    <aside className={styles.library} aria-label="Signal shows">
      <div className={styles.libraryHeader}>
        <span>Your shows</span>
        <small>{shows.length}</small>
      </div>
      <div className={styles.showList} data-tutorial-target="botcast-shows">
        {shows.map((show) => {
          const host = botsById.get(show.hostBotId);
          return (
            <button
              key={show.id}
              type="button"
              className={styles.showRow}
              data-selected={show.id === selectedShowId ? "true" : undefined}
              onClick={() => void selectShow(show)}
              style={{ ["--show-accent" as string]: show.accentColor } as CSSProperties}
              data-botcast-show-id={show.id}
            >
              <SignalShowLogo show={show} compact />
              <span>
                <strong>{show.name}</strong>
                <small>{host?.name ?? "Unknown host"} · {show.episodeCount} episodes</small>
              </span>
            </button>
          );
        })}
        {!loading && shows.length === 0 ? (
          <p className={styles.emptyCopy}>Every great show starts with a host.</p>
        ) : null}
      </div>
      <div className={styles.createShowCard}>
        <label htmlFor="botcast-host-picker">Create a show</label>
        <select
          id="botcast-host-picker"
          value={hostDraftId}
          onChange={(event) => setHostDraftId(event.target.value)}
          data-botcast-delete-focus-fallback="true"
        >
          <option value="">Choose a host…</option>
          {eligibleBots
            .filter((bot) => !shows.some((show) => show.hostBotId === bot.id))
            .map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
        </select>
        <button type="button" onClick={() => void createShow()} disabled={!hostDraftId || busy}>
          Create show
        </button>
      </div>
    </aside>
  );

  const renderEpisodeSetup = (): React.JSX.Element | null => {
    if (!selectedShow || !hostBot) return null;
    const guestOptions = eligibleBots.filter((bot) => bot.id !== hostBot.id);
    const selectedEpisodeModelOption = episodeModelDraft
      ? modelOptions.find((option) => option.id === episodeModelDraft) ?? null
      : null;
    const episodeModelProvider =
      selectedEpisodeModelOption?.provider ??
      accountDefaultModelOption?.provider ??
      preferredProvider;
    return (
      <div className={styles.productionDesk} data-tutorial-target="botcast-setup">
        <div className={styles.productionHeading}>
          <div>
            <span className={styles.eyebrow}>Tonight’s production</span>
            <h2>Book the guest. Set the angle.</h2>
          </div>
        </div>
        <div className={styles.setupGrid}>
          <label>
            Guest
            <select value={guestDraftId} onChange={(event) => setGuestDraftId(event.target.value)}>
              <option value="">Choose one guest…</option>
              {guestOptions.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
            </select>
          </label>
          <label>
            Episode topic
            <input
              value={topicDraft}
              onChange={(event) => setTopicDraft(event.target.value)}
              placeholder="The question tonight’s episode has to answer"
            />
          </label>
          <label className={styles.producerBrief}>
            Private producer brief <span>optional</span>
            <textarea
              value={producerBriefDraft}
              onChange={(event) => setProducerBriefDraft(event.target.value)}
              placeholder="The angle, boundaries, and follow-ups the host should keep in mind. This stays off-mic."
            />
          </label>
        </div>
        <div className={styles.episodeLaunchRow}>
          {providerModeToggle ? (
            <div className={styles.episodeProviderControl}>
              <span>Episode mode</span>
              {providerModeToggle}
              <small>Choose the response lane for this recording.</small>
            </div>
          ) : null}
          <label className={styles.episodeModelControl}>
            <span>Episode model</span>
            <select
              value={episodeModelDraft}
              onChange={(event) => setEpisodeModelDraft(event.target.value)}
              aria-label="Signal episode model"
              disabled={responseMode === "auto"}
            >
              <option value="">
                {`Account default · ${accountDefaultModel ? modelLabels.get(accountDefaultModel) ?? accountDefaultModel : "Provider default"}`}
              </option>
              {modelOptions
                .filter((option) => option.id !== accountDefaultModel)
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
            </select>
            <small>
              {responseMode === "auto"
                ? "AUTO · primary may recover through your fallback chain"
                : `${providerLabel(episodeModelProvider)} · locked for this recording`}
            </small>
          </label>
          <button
            type="button"
            className={styles.goLiveButton}
            onClick={() => void startEpisode()}
            disabled={busy || !guestDraftId || !topicDraft.trim()}
          >
            Begin episode
          </button>
        </div>
      </div>
    );
  };

  const renderArchive = (): React.JSX.Element => (
    <section className={styles.archive} data-tutorial-target="botcast-replay">
      <div className={styles.archiveHeading}>
        <span className={styles.eyebrow}>Episode archive</span>
        <h2>{episodes.length ? `${episodes.length} recorded` : "The tape shelf is empty"}</h2>
      </div>
      <div className={styles.episodeGrid}>
        {episodes.map((item, index) => (
          <article key={item.id} className={styles.episodeCard}>
            <button
              type="button"
              className={styles.episodeOpenButton}
              onClick={() => void openReplay(item)}
            >
              <span className={styles.episodeNumber}>EP {String(episodes.length - index).padStart(2, "0")}</span>
              <strong>{item.title}</strong>
              <span>{botsById.get(item.guestBotId)?.name ?? "Guest"}</span>
              <small>
                {new Date(item.startedAt).toLocaleDateString()} · {runtimeLabel(item.runtimeMs)} · {episodeModeLabel(item)} · {item.model ? modelLabels.get(item.model) ?? item.model : "Provider default"} · {item.status === "live" ? "Resume episode" : episodeOutcomeLabel(item)}
              </small>
            </button>
            <button
              type="button"
              className={styles.episodeDeleteButton}
              onClick={(event) => openEpisodeDeletion(item, event.currentTarget)}
              disabled={busy}
              aria-label={`${item.status === "live" ? "Discard" : "Delete"} episode ${item.title}`}
            >
              {item.status === "live" ? "Discard" : "Delete"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );

  const liveActiveMessage =
    episode?.messages.find((message) => message.id === speakingMessageId) ?? null;
  const liveShot = episode ? latestDirectedShot(episode) : "wide";
  const producerCueReady =
    Boolean(episode) &&
    (episode!.messages.length === 0 ||
      episode!.messages.at(-1)?.speakerRole === "guest");

  return (
    <>
    <main className={styles.shell} data-botcast-mode="true" data-theme={theme}>
      <div className={styles.sidebarNavigation}>{sidebarHeader}</div>
      <div className={styles.mainNavigation}>{navigationHeader}</div>
      {renderLibrary()}
      <section className={styles.main}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>{episode ? "Live control room" : replayEpisode ? "Episode replay" : "Host-owned shows"}</span>
            {selectedShow ? (
              <div className={styles.showTitleRow}>
                <input
                  className={styles.showNameInput}
                  value={showNameDraft}
                  onChange={(event) => setShowNameDraft(event.target.value)}
                  onBlur={(event) => void renameShow(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void renameShow(event.currentTarget.value);
                      event.currentTarget.blur();
                    }
                  }}
                  aria-label="Show name"
                  data-botcast-delete-focus-fallback="true"
                />
                <div className={styles.showNameActions}>
                  <button
                    type="button"
                    className={styles.showDeleteButton}
                    onClick={(event) => openShowDeletion(selectedShow, event.currentTarget)}
                    disabled={busy || selectedShowArtworkBusy}
                    aria-label={`Delete show ${selectedShow.name}`}
                  >
                    Delete show
                  </button>
                </div>
              </div>
            ) : <h1>Signal</h1>}
            <p>{selectedShow?.premise ?? "A bot owns the show. You produce the episode."}</p>
          </div>
        </header>

        {error ? <div className={styles.error} role="alert">{error}</div> : null}
        {notice ? <div className={styles.notice} role="status">{notice}</div> : null}

        {episode && selectedShow ? (
          <div className={styles.liveLayout}>
            <div className={styles.liveTopline}>
              <span data-live={episode.status === "live" ? "true" : undefined}>
                {episode.status === "live" ? "● ON AIR" : episodeOutcomeLabel(episode)}
              </span>
              <strong>{episode.segment === "interview" ? "MAIN INTERVIEW" : episode.segment.toUpperCase()}</strong>
              <span className={styles.modelProvenance}>
                {episodeModeLabel(episode)} · {episode.model ? modelLabels.get(episode.model) ?? episode.model : "Provider default"}
              </span>
              <span>{episode.tensionStage === "calm" ? "Guest settled" : `Guest: ${episode.tensionStage}`}</span>
              <button
                type="button"
                onClick={() => {
                  if (!autoRun) onPrepareUtterance?.();
                  setAutoRun((value) => !value);
                }}
                disabled={episode.status === "completed"}
              >
                {autoRun ? "Pause rundown" : "Resume rundown"}
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={(event) => openEpisodeDeletion(episode, event.currentTarget)}
                disabled={busy}
              >
                {episode.status === "live" ? "Discard episode" : "Delete episode"}
              </button>
            </div>
            {renderStage({
              show: selectedShow,
              currentEpisode: episode,
              host: hostBot,
              guest: liveGuestBot,
              shot: liveShot,
              activeMessage: liveActiveMessage,
              replay: false,
            })}
            <div className={styles.controlRoom}>
              <div className={styles.transcript} aria-live="polite">
                {episode.messages.map((message) => (
                  <article key={message.id} data-role={message.speakerRole}>
                    <strong>{botsById.get(message.botId)?.name ?? message.speakerRole}</strong>
                    <p
                      data-revealing={
                        liveSpeech?.messageId === message.id ? "true" : undefined
                      }
                    >
                      {liveSpeech?.messageId === message.id
                        ? botcastSpeechRevealVisibleText(liveSpeech.reveal)
                        : message.content}
                    </p>
                  </article>
                ))}
                {liveSpeech?.reveal.phase === "preparing" ? (
                  <p className={styles.thinking}>Warming the mic…</p>
                ) : busy && speakingMessageId === null ? (
                  <p className={styles.thinking}>The studio is thinking…</p>
                ) : null}
              </div>
              <aside
                className={styles.producerControls}
                aria-label="Private producer controls"
                data-tutorial-target="botcast-cues"
              >
                <span className={styles.eyebrow}>Private line to host</span>
                <label>
                  Ask about…
                  <div>
                    <input value={askAboutDraft} onChange={(event) => setAskAboutDraft(event.target.value)} placeholder="a specific detail" />
                    <button
                      type="button"
                      disabled={busy || !producerCueReady || !askAboutDraft.trim()}
                      onClick={() => {
                        sendCue({ kind: "ask_about", detail: askAboutDraft.trim() });
                        setAskAboutDraft("");
                      }}
                    >Send</button>
                  </div>
                </label>
                <div className={styles.cueGrid}>
                  <button type="button" disabled={busy || !producerCueReady} onClick={() => sendCue({ kind: "press_harder" })}>Press harder</button>
                  <button type="button" disabled={busy || !producerCueReady} onClick={() => sendCue({ kind: "move_on" })}>Move on</button>
                  <button type="button" disabled={busy || !producerCueReady} onClick={() => sendCue({ kind: "lighten_up" })}>Lighten up</button>
                </div>
                <small>Control-room cues are persisted for replay but never spoken or attributed to you.</small>
              </aside>
            </div>
            {episode.status === "completed" ? (
              <button
                type="button"
                className={styles.returnButton}
                onClick={() => {
                  setEpisode(null);
                  if (selectedShowId) void loadEpisodes(selectedShowId);
                }}
              >Return to show</button>
            ) : null}
          </div>
        ) : replayEpisode && selectedShow ? (
          <div className={styles.replayLayout}>
            <div className={styles.replayHeader}>
              <div>
                <span className={styles.eyebrow}>From the archive</span>
                <h2>{replayEpisode.title}</h2>
                <p>{new Date(replayEpisode.startedAt).toLocaleString()} · {episodeModeLabel(replayEpisode)} · {replayEpisode.model ? modelLabels.get(replayEpisode.model) ?? replayEpisode.model : "Provider default"} · {episodeOutcomeLabel(replayEpisode)}</p>
              </div>
              <div className={styles.replayHeaderActions}>
                <button
                  type="button"
                  onClick={() => {
                    stopReplayPlayback();
                    setReplayEpisode(null);
                  }}
                >
                  Close replay
                </button>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={(event) => openEpisodeDeletion(replayEpisode, event.currentTarget)}
                  disabled={busy}
                >
                  Delete episode
                </button>
              </div>
            </div>
            {renderStage({
              show: selectedShow,
              currentEpisode: replayEpisode,
              host: replayHostBot,
              guest: replayGuestBot,
              shot: replayShot,
              activeMessage: replayActiveMessage,
              replay: true,
              guestDeparted: replayGuestDeparted,
            })}
            <div className={styles.replayControls} aria-label="Signal replay cameras">
              <button
                type="button"
                onClick={() => {
                  if (replayPlaying) {
                    stopReplayPlayback();
                  } else {
                    replayVoiceRunIdRef.current += 1;
                    onPrepareUtterance?.();
                    replayVoiceMessageIdRef.current = null;
                    setReplaySpeechActive(false);
                    if (replayElapsedMs >= replayDurationMs) setReplayElapsedMs(0);
                    setReplayPlaying(true);
                  }
                }}
              >
                {replayPlaying ? "Pause" : "Play"}
              </button>
              <input
                type="range"
                min={0}
                max={replayDurationMs}
                step={100}
                value={replayElapsedMs}
                onChange={(event) => {
                  stopReplayPlayback();
                  setReplayElapsedMs(Number(event.target.value));
                }}
                aria-label="Replay position"
              />
              <div className={styles.cameraButtons}>
                {(["auto", "left", "right", "wide"] as const).map((camera) => (
                  <button
                    key={camera}
                    type="button"
                    data-selected={replayCamera === camera ? "true" : undefined}
                    onClick={() => setReplayCamera(camera)}
                  >{camera[0]!.toUpperCase() + camera.slice(1)}</button>
                ))}
              </div>
            </div>
            <div className={styles.replayTranscript}>
              {replayEpisode.messages.map((message, index) => (
                <button
                  key={message.id}
                  type="button"
                  data-botcast-replay-row="true"
                  data-active={index === replayMessageIndex ? "true" : undefined}
                  onClick={() => {
                    stopReplayPlayback();
                    setReplayElapsedMs(replayTimeline.messageStartMs[index] ?? 0);
                  }}
                >
                  <strong>{botsById.get(message.botId)?.name ?? message.speakerRole}</strong>
                  <span>{message.content}</span>
                </button>
              ))}
            </div>
          </div>
        ) : selectedShow && dashboardAtmosphere ? (
          <div className={styles.showDashboard}>
            <section
              className={styles.showBrandPreview}
              data-studio-source={dashboardAtmosphere.imageUrl ? "image" : "fallback"}
              data-tutorial-target="botcast-brand-controls"
              style={
                {
                  "--botcast-accent": selectedShow.accentColor,
                  "--botcast-studio-accent": normalizeAccentForTheme(
                    hostBot?.color ?? selectedShow.accentColor,
                    theme,
                  ),
                  ...(dashboardAtmosphere.imageUrl
                    ? {
                        "--botcast-dashboard-atmosphere": `url("${dashboardAtmosphere.imageUrl}")`,
                      }
                    : {}),
                } as CSSProperties
              }
              aria-label={`${selectedShow.name} show identity`}
            >
              {dashboardAtmosphere.imageUrl ? (
                <div className={styles.showBrandAtmosphere} aria-hidden="true" />
              ) : (
                <SignalFallbackStudio
                  surface="dashboard"
                  accentVariant={selectedShow.fallbackStudioAccentVariant}
                />
              )}
              <div className={styles.showBrandContent}>
                <SignalShowLogo show={selectedShow} />
                <div>
                  <span className={styles.eyebrow}>Show identity</span>
                  <h2>{selectedShow.name}</h2>
                  <p>{hostBot?.name ?? "Host"}</p>
                </div>
                {!showHasCustomArtwork(selectedShow) ? (
                  <div
                    className={styles.showLookInvitation}
                    aria-label="Optional custom show artwork"
                  >
                    <strong>Make it unmistakably theirs.</strong>
                    <small>One clever name, one persona-shaped logo, and matching Light and Dark studios—in a single pass.</small>
                    <button
                      type="button"
                      data-signal-first-look-action="create"
                      onClick={() => void synthesizeShowLook()}
                      disabled={busy || selectedShowArtworkBusy}
                    >
                      Create this show’s look
                    </button>
                  </div>
                ) : (
                  <div
                    className={styles.showLookControls}
                    aria-label="Show identity controls"
                  >
                    <input
                      ref={lightStudioUploadRef}
                      className={styles.assetUploadInput}
                      type="file"
                      accept={SIGNAL_ASSET_ACCEPT}
                      disabled={busy || selectedShowArtworkBusy}
                      aria-label="Upload replacement Light studio"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) void uploadShowAsset("day-studio", file);
                      }}
                    />
                    <input
                      ref={darkStudioUploadRef}
                      className={styles.assetUploadInput}
                      type="file"
                      accept={SIGNAL_ASSET_ACCEPT}
                      disabled={busy || selectedShowArtworkBusy}
                      aria-label="Upload replacement Dark studio"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) void uploadShowAsset("night-studio", file);
                      }}
                    />
                    <input
                      ref={logoUploadRef}
                      className={styles.assetUploadInput}
                      type="file"
                      accept={SIGNAL_ASSET_ACCEPT}
                      disabled={busy || selectedShowArtworkBusy}
                      aria-label="Upload replacement show logo"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) void uploadShowAsset("logo", file);
                      }}
                    />
                    <strong>Tune the identity.</strong>
                    <small>Refresh or replace each piece without disturbing the others.</small>
                    <div className={styles.showLookControlGrid}>
                      <div className={styles.showLookControlGroup}>
                        <span>Name</span>
                        <button
                          type="button"
                          data-signal-artwork-action="name"
                          onClick={() => void regenerateShowName()}
                          disabled={busy}
                        >
                          Refresh name
                        </button>
                      </div>
                      <div className={styles.showLookControlGroup}>
                        <span>Light studio</span>
                        <button
                          type="button"
                          data-signal-artwork-action="day-studio"
                          title={selectedShow.nightAtmosphere.imageId
                            ? "Regenerate only the Light Mode studio"
                            : "Create or upload the Dark studio first"}
                          onClick={() => void regenerateStudioVariant("day")}
                          disabled={
                            busy ||
                            selectedShowArtworkBusy ||
                            !selectedShow.nightAtmosphere.imageId
                          }
                        >
                          Refresh Light
                        </button>
                        <button
                          type="button"
                          className={styles.assetUploadButton}
                          title="Upload a replacement for the Light Mode studio"
                          onClick={() => lightStudioUploadRef.current?.click()}
                          disabled={busy || selectedShowArtworkBusy}
                        >
                          Replace Light
                        </button>
                      </div>
                      <div className={styles.showLookControlGroup}>
                        <span>Dark studio</span>
                        <button
                          type="button"
                          data-signal-artwork-action="night-studio"
                          onClick={() => void regenerateStudioVariant("night")}
                          disabled={busy || selectedShowArtworkBusy}
                        >
                          Refresh Dark
                        </button>
                        <button
                          type="button"
                          className={styles.assetUploadButton}
                          title="Upload a replacement for the Dark Mode studio"
                          onClick={() => darkStudioUploadRef.current?.click()}
                          disabled={busy || selectedShowArtworkBusy}
                        >
                          Replace Dark
                        </button>
                      </div>
                      <div className={styles.showLookControlGroup}>
                        <span>Logo</span>
                        <button
                          type="button"
                          data-signal-artwork-action="logo"
                          onClick={() => void regenerateLogo()}
                          disabled={busy || selectedShowArtworkBusy}
                        >
                          Refresh logo
                        </button>
                        <button
                          type="button"
                          className={styles.assetUploadButton}
                          title="Upload a replacement show logo"
                          onClick={() => logoUploadRef.current?.click()}
                          disabled={busy || selectedShowArtworkBusy}
                        >
                          Replace logo
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
            {renderEpisodeSetup()}
            {renderArchive()}
          </div>
        ) : (
          <div className={styles.emptyStudio}>
            <span className={styles.logoMark} aria-hidden="true"><i /><i /><i /></span>
            <h1>Give a bot the keys to a studio.</h1>
            <p>Create a show from the producer desk on the left.</p>
          </div>
        )}
      </section>
      {deleteTarget ? (
        <div className={styles.deleteBackdrop}>
          <button
            type="button"
            className={styles.deleteBackdropDismiss}
            onClick={dismissDeletion}
            disabled={busy}
            tabIndex={-1}
            aria-label="Cancel deletion"
          />
          <section
            className={styles.deleteDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="signal-delete-title"
            aria-describedby="signal-delete-description"
          >
            <span className={styles.eyebrow}>Permanent edit</span>
            <h2 id="signal-delete-title">{deleteConfirmationCopy(deleteTarget).title}</h2>
            <p id="signal-delete-description">{deleteConfirmationCopy(deleteTarget).body}</p>
            {deleteError ? <p className={styles.deleteError} role="alert">{deleteError}</p> : null}
            <div className={styles.deleteDialogActions}>
              <button
                ref={deleteCancelButtonRef}
                type="button"
                onClick={dismissDeletion}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.deleteConfirmButton}
                onClick={() => void deleteConfirmedTarget()}
                disabled={busy}
              >
                {busy ? "Removing…" : deleteConfirmationCopy(deleteTarget).action}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
    <PrismBlockingLoader
      open={blockingOperation !== null}
      title={blockingOperation?.title ?? "PRISM is working"}
      detail={blockingOperation?.detail ?? "Preparing your workspace."}
      stepLabel={blockingOperation?.stepLabel ?? "Working"}
      progress={blockingOperation?.progress}
      theme={theme}
      onCancel={blockingOperation?.cancellable ? cancelBlockingOperation : undefined}
      cancelLabel="Cancel synthesis"
    />
    </>
  );
}

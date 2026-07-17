"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  BOTCAST_DEFAULT_STUDIO_LAYOUT,
  BOTCAST_DIRECTOR_MIN_SHOT_MS,
  BOTCAST_SESSION_DURATION_MINUTES_MAX,
  BOTCAST_SESSION_DURATION_MINUTES_MIN,
  DEFAULT_COFFEE_SESSION_DURATION_MINUTES,
  botcastCameraOffsetXPercent,
  botcastCameraOffsetYPercent,
  botcastCameraModeAt,
  botcastCameraShotAt,
  botcastGuestHasDepartedAt,
  botcastNextSpeakerRole,
  botcastReplayMessageIndexAt,
  botcastReplayTimeline,
  normalizeAccentForTheme,
  normalizeBotcastStudioLayout,
  type BotcastCameraShot,
  type BotcastEpisode,
  type BotcastEpisodeAdvanceResponse,
  type BotcastEpisodeResponseMode,
  type BotcastEpisodeSummary,
  type BotcastMessage,
  type BotcastProducerCue,
  type BotcastShow,
  type BotcastSessionDurationMinutes,
  type BotcastStudioLayout,
  type BotcastStudioLayoutItem,
  type SignalPersonaTemperament,
} from "@localai/shared";
import {
  buildCoffeeCupVisualState,
  type CoffeeCupVisualState,
} from "./coffee-cup-sprites";
import { nextBotcastShowIdAfterDeletion } from "./botcastDeletion";
import {
  botcastSpeechRevealIsVoicing,
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
  signalArtworkAssetLabel,
  signalArtworkJobIsActive,
  type SignalArtworkJobSnapshot,
} from "./signalArtworkJob";
import {
  SIGNAL_EPISODE_INTRO_LEAD_IN_MS,
  playSignalIntroAudio,
  playSignalOutroAudio,
  stopSignalIntroAudio,
} from "./signalIntroAudio";
import { randomSignalEpisodeBooking } from "./signalBookingRandomizer";
import {
  ModelWarmupIntermission,
  type ModelWarmupIntermissionPhase,
} from "./ModelWarmupIntermission";
import { waitForModelPreparation } from "./modelPreparation";
import {
  formatSignalAudienceViews,
  signalAudienceSnapshot,
} from "./signalAudiencePulse";
import {
  signalCupSipTargetFromMouth,
  signalStageLocalPointFromViewport,
} from "./signalCupSipGeometry";
import { fallbackSignalShowCardQuips } from "./signalShowCardQuips";
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
  personaTemperament: SignalPersonaTemperament;
}

export interface BotcastModelOption {
  id: string;
  label: string;
  provider: "local" | "openai" | "anthropic";
}

export interface BotcastApiRequest {
  <T>(path: string, options?: RequestInit): Promise<T>;
}

const SIGNAL_NATURAL_HANDOFF_MS = 240;
// ElevenLabs alignment responses are buffered before playback begins and can
// legitimately take several seconds for a full Signal line. Keep a bounded
// escape hatch for a genuinely stuck voice request without aborting healthy
// provider speech before it reaches the studio.
const SIGNAL_VOICE_START_TIMEOUT_MS = 30_000;
const SIGNAL_OPENING_ADVANCE_ATTEMPTS = 2;
const SIGNAL_SHOW_CARD_QUIP_INITIAL_DELAY_MS = 4_800;
const SIGNAL_SHOW_CARD_QUIP_VISIBLE_MS = 5_600;
const SIGNAL_SHOW_CARD_QUIP_GAP_MS = 14_000;

type PreparedBotcastAdvanceResult =
  | { ok: true; response: BotcastEpisodeAdvanceResponse }
  | { ok: false; error: unknown };

type PreparedBotcastAdvance = {
  episodeId: string;
  afterMessageId: string;
  controller: AbortController;
  result: Promise<PreparedBotcastAdvanceResult>;
  settled: boolean;
  warming: boolean;
  warmupModel: string | null;
  warmupStartedAt: string | null;
  warmupFailure: import("@localai/shared").ModelPreparationFailure | null;
};

type SignalModelWarmup = {
  phase: ModelWarmupIntermissionPhase;
  model: string | null;
  startedAt: string | null;
  failure: import("@localai/shared").ModelPreparationFailure | null;
  initial: boolean;
  episodeId: string | null;
};

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
      sipping: boolean;
      role: "host" | "guest";
      mouthShape: ZenLiveBotMouthShape;
    },
  ) => ReactNode;
  renderMug?: (
    bot: BotcastBotSummary,
    state: {
      role: "host" | "guest";
      visual: CoffeeCupVisualState;
    },
  ) => ReactNode;
  resolveCupRateMultiplier?: (bot: BotcastBotSummary) => number;
  onUtterance?: (
    message: BotcastMessage,
    bot: BotcastBotSummary,
    lifecycle: VoicePlaybackLifecycle,
  ) => boolean | Promise<boolean>;
  onPrepareUtterance?: () => void;
  onStopUtterance?: () => void;
  introAudioEnabled?: boolean;
  introAudioVolume?: number;
  sidebarHeader: ReactNode;
  navigationHeader:
    | ReactNode
    | ((state: { liveSessionActive: boolean }) => ReactNode);
}

type BotcastLiveSpeech = {
  messageId: string;
  reveal: BotcastSpeechRevealState;
};

type SignalEpisodePreRoll = {
  showId: string;
  showName: string;
  guestName: string;
  topic: string;
  phase: "preparing" | "landing";
  source: "local" | "elevenlabs";
};

type SignalEpisodeOutro = {
  episodeId: string;
  showName: string;
  phase: "holding" | "landing";
  forced: boolean;
};

type SignalAssetSlot = "day-studio" | "night-studio" | "logo";
type SignalArtworkKind = SignalAssetSlot;

const SIGNAL_ASSET_ACCEPT = "image/png,image/jpeg,image/webp";
const SIGNAL_ASSET_UPLOAD_MAX_BYTES = 16 * 1024 * 1024;

const SIGNAL_STUDIO_LAYOUT_LABELS: Record<BotcastStudioLayoutItem, string> = {
  hostBot: "host bot",
  guestBot: "guest bot",
  hostCup: "host cup",
  guestCup: "guest cup",
};

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

type SignalStudioLayoutDrag = {
  pointerId: number;
  showId: string;
  item: BotcastStudioLayoutItem;
  startClientX: number;
  startClientY: number;
  stageWidth: number;
  stageHeight: number;
  startLayout: BotcastStudioLayout;
  latestLayout: BotcastStudioLayout;
};

type SignalCupTravelState = {
  mode: "idle" | "sipping" | "returning";
  returnX: number | null;
  returnY: number | null;
};

type SignalCupTravelByRole = Record<"host" | "guest", SignalCupTravelState>;

function initialSignalCupTravelByRole(): SignalCupTravelByRole {
  return {
    host: { mode: "idle", returnX: null, returnY: null },
    guest: { mode: "idle", returnX: null, returnY: null },
  };
}

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

function signalIntroIdentityForShow(
  show: BotcastShow,
  hostBot: BotcastBotSummary | null,
) {
  return {
    temperament: hostBot?.personaTemperament ?? "neutral",
    seed: `${show.id}:${show.logo.seed}`,
  } as const;
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

function signalProducerCueLabel(cue: BotcastProducerCue): string {
  switch (cue.kind) {
    case "ask_about":
      return `Ask about ${cue.detail ?? "that detail"}`;
    case "press_harder":
      return "Press harder";
    case "move_on":
      return "Move on";
    case "lighten_up":
      return "Lighten up";
    case "wrap_up":
      return "Wrap it up";
  }
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

function SignalStudioSpotlight(): React.JSX.Element {
  return (
    <span
      className={styles.studioSpotlight}
      data-prism-decorative-motion="true"
      aria-hidden="true"
    >
      <span className={styles.studioSpotlightBeam} />
      <span className={styles.studioSpotlightPool} />
    </span>
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
  resolveCupRateMultiplier,
  onUtterance,
  onPrepareUtterance,
  onStopUtterance,
  introAudioEnabled = true,
  introAudioVolume = 1,
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
  const [episodeDurationDraft, setEpisodeDurationDraft] =
    useState<BotcastSessionDurationMinutes | null>(null);
  const [askAboutDraft, setAskAboutDraft] = useState("");
  const [queuedProducerCue, setQueuedProducerCue] =
    useState<BotcastProducerCue | null>(null);
  const [showNameDraft, setShowNameDraft] = useState("");
  const [showIdentityControlsShowId, setShowIdentityControlsShowId] =
    useState<string | null>(null);
  const [showCardQuipIndex, setShowCardQuipIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoRun, setAutoRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [liveSpeech, setLiveSpeech] = useState<BotcastLiveSpeech | null>(null);
  const [signalStageNowMs, setSignalStageNowMs] = useState(() => Date.now());
  const [episodePreRoll, setEpisodePreRoll] = useState<SignalEpisodePreRoll | null>(null);
  const [signalModelWarmup, setSignalModelWarmup] =
    useState<SignalModelWarmup | null>(null);
  const [episodeOutro, setEpisodeOutro] = useState<SignalEpisodeOutro | null>(null);
  const [introPreviewShowId, setIntroPreviewShowId] = useState<string | null>(null);
  const [cuttingShow, setCuttingShow] = useState(false);
  const [cameraSaving, setCameraSaving] = useState(false);
  const [replayElapsedMs, setReplayElapsedMs] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayVoicePending, setReplayVoicePending] = useState(false);
  const [replaySpeechActive, setReplaySpeechActive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SignalDeleteTarget | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [blockingOperation, setBlockingOperation] = useState<SignalBlockingOperation | null>(null);
  const [artworkJob, setArtworkJob] = useState<SignalArtworkJobSnapshot | null>(null);
  const [studioLayoutEditorOpen, setStudioLayoutEditorOpen] = useState(false);
  const [studioLayoutSaving, setStudioLayoutSaving] = useState(false);
  const [studioLayoutDraggingItem, setStudioLayoutDraggingItem] =
    useState<BotcastStudioLayoutItem | null>(null);
  const [signalCupTravelByRole, setSignalCupTravelByRole] =
    useState<SignalCupTravelByRole>(initialSignalCupTravelByRole);
  const blockingAbortRef = useRef<AbortController | null>(null);
  const handledArtworkJobIdsRef = useRef(new Set<string>());
  const advanceInFlightRef = useRef(false);
  const queuedProducerCueRef = useRef<BotcastProducerCue | null>(null);
  const preparedAdvanceRef = useRef<PreparedBotcastAdvance | null>(null);
  const activeSpeechMessageIdRef = useRef<string | null>(null);
  const episodeOperationAbortRef = useRef<AbortController | null>(null);
  const episodeRunIdRef = useRef(0);
  const preRollSkipRequestedRef = useRef(false);
  const preRollGateResolveRef = useRef<(() => void) | null>(null);
  const signalModelWarmupRef = useRef<SignalModelWarmup | null>(null);
  const signalModelWarmupVisibleRef = useRef(false);
  const introPreviewRunIdRef = useRef(0);
  const outroRunIdRef = useRef(0);
  const cuttingShowRef = useRef(false);
  const replayVoiceMessageIdRef = useRef<string | null>(null);
  const replayVoiceRunIdRef = useRef(0);
  const deleteCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteReturnFocusRef = useRef<HTMLElement | null>(null);
  const lightStudioUploadRef = useRef<HTMLInputElement | null>(null);
  const darkStudioUploadRef = useRef<HTMLInputElement | null>(null);
  const logoUploadRef = useRef<HTMLInputElement | null>(null);
  const studioLayoutDragRef = useRef<SignalStudioLayoutDrag | null>(null);
  const studioLayoutDraftRef = useRef<{
    showId: string;
    layout: BotcastStudioLayout;
  } | null>(null);
  const studioLayoutSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const studioLayoutSavePendingRef = useRef(0);
  const signalStageRef = useRef<HTMLElement | null>(null);
  const onStopUtteranceRef = useRef(onStopUtterance);

  useEffect(() => {
    onStopUtteranceRef.current = onStopUtterance;
  }, [onStopUtterance]);

  const assignQueuedProducerCue = useCallback(
    (cue: BotcastProducerCue | null): void => {
      queuedProducerCueRef.current = cue;
      setQueuedProducerCue(cue);
    },
    [],
  );

  const assignSignalModelWarmup = useCallback(
    (value: SignalModelWarmup | null): void => {
      signalModelWarmupRef.current = value;
      setSignalModelWarmup(value);
    },
    [],
  );

  useEffect(() => () => blockingAbortRef.current?.abort(), []);

  const activeEpisodeId = episode?.id ?? null;
  useEffect(() => {
    if (!activeEpisodeId) return;
    if (signalModelWarmup) return;
    const updateStageClock = (): void => setSignalStageNowMs(Date.now());
    updateStageClock();
    const timer = window.setInterval(updateStageClock, 1_000);
    return () => window.clearInterval(timer);
  }, [activeEpisodeId, signalModelWarmup]);

  const syncSignalSipMouthTargets = useCallback((): void => {
    const stage = signalStageRef.current;
    const scene = stage?.querySelector<HTMLElement>(
      '[data-signal-stage-scene="true"]',
    );
    if (!scene || scene.offsetWidth <= 0 || scene.offsetHeight <= 0) return;

    const sceneBounds = scene.getBoundingClientRect();
    for (const role of ["host", "guest"] as const) {
      const presence = scene.querySelector<HTMLElement>(
        `[data-signal-presence="${role}"]`,
      );
      const mouth =
        presence?.querySelector<HTMLElement>(
          '[data-coffee-plate-emoji-part="mouth"][data-coffee-plate-emoji-glyph="⁎"]',
        ) ??
        presence?.querySelector<HTMLElement>(
          '[data-coffee-plate-emoji-part="mouth"]',
        );
      const mug = scene.querySelector<HTMLElement>(
        `[data-signal-mug-role="${role}"]`,
      );
      if (!mouth || !mug) continue;

      const target = signalCupSipTargetFromMouth({
        role,
        sceneBounds,
        sceneLocalWidth: scene.offsetWidth,
        sceneLocalHeight: scene.offsetHeight,
        mouthBounds: mouth.getBoundingClientRect(),
        mugLocalHeight: mug.offsetHeight,
        viewportWidth: window.innerWidth,
      });
      if (!target) continue;
      mug.style.setProperty("--signal-cup-mouth-x", `${target.x}px`);
      mug.style.setProperty("--signal-cup-mouth-y", `${target.y}px`);
    }
  }, []);

  const syncSignalCupTravel = useCallback((): void => {
    const stage = signalStageRef.current;
    const scene = stage?.querySelector<HTMLElement>(
      '[data-signal-stage-scene="true"]',
    );
    if (!scene || scene.offsetWidth <= 0 || scene.offsetHeight <= 0) return;
    const sceneBounds = scene.getBoundingClientRect();

    setSignalCupTravelByRole((current) => {
      let next = current;
      for (const role of ["host", "guest"] as const) {
        const mug = scene.querySelector<HTMLElement>(
          `[data-signal-mug-role="${role}"]`,
        );
        if (!mug) continue;
        const requested = mug.dataset.sipRequested === "true";
        const travel = current[role];
        let nextTravel = travel;

        if (travel.mode === "idle" && requested) {
          nextTravel = { mode: "sipping", returnX: null, returnY: null };
        } else if (travel.mode === "sipping" && !requested) {
          const mugBounds = mug.getBoundingClientRect();
          const returnPoint = signalStageLocalPointFromViewport({
            sceneBounds,
            sceneLocalWidth: scene.offsetWidth,
            sceneLocalHeight: scene.offsetHeight,
            viewportX: mugBounds.left + mugBounds.width / 2,
            viewportY: mugBounds.top + mugBounds.height / 2,
          });
          nextTravel = returnPoint
            ? {
                mode: "returning",
                returnX: returnPoint.x,
                returnY: returnPoint.y,
              }
            : { mode: "idle", returnX: null, returnY: null };
        }

        if (nextTravel !== travel) {
          if (next === current) next = { ...current };
          next[role] = nextTravel;
        }
      }
      return next;
    });
  }, []);

  const finishSignalCupReturn = useCallback(
    (
      role: "host" | "guest",
      event: ReactAnimationEvent<HTMLDivElement>,
    ): void => {
      if (event.target !== event.currentTarget) return;
      setSignalCupTravelByRole((current) => {
        if (current[role].mode !== "returning") return current;
        return {
          ...current,
          [role]: { mode: "idle", returnX: null, returnY: null },
        };
      });
    },
    [],
  );

  // Animation events can be lost when a live stage is resized, hot-reloaded,
  // or swapped between shots. Never let a mug remain stranded in its return
  // state and miss every later sip.
  useEffect(() => {
    if (
      signalCupTravelByRole.host.mode !== "returning" &&
      signalCupTravelByRole.guest.mode !== "returning"
    ) return;
    const timer = window.setTimeout(() => {
      setSignalCupTravelByRole((current) => {
        let next = current;
        for (const role of ["host", "guest"] as const) {
          if (current[role].mode !== "returning") continue;
          if (next === current) next = { ...current };
          next[role] = { mode: "idle", returnX: null, returnY: null };
        }
        return next;
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [signalCupTravelByRole.guest.mode, signalCupTravelByRole.host.mode]);

  useLayoutEffect(() => {
    syncSignalSipMouthTargets();
    syncSignalCupTravel();
  });

  useEffect(() => {
    const stage = signalStageRef.current;
    if (!stage) return;
    const resizeObserver = new ResizeObserver(syncSignalSipMouthTargets);
    resizeObserver.observe(stage);
    window.addEventListener("resize", syncSignalSipMouthTargets);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncSignalSipMouthTargets);
    };
  }, [activeEpisodeId, replayEpisode?.id, syncSignalSipMouthTargets]);

  useEffect(() => {
    setSignalCupTravelByRole(initialSignalCupTravelByRole());
    assignQueuedProducerCue(null);
  }, [activeEpisodeId, assignQueuedProducerCue, replayEpisode?.id]);

  // Signal cleanup depends on this callback, so voice-setting changes must not
  // make React tear down the active episode as though the studio unmounted.
  const stopUtterance = useCallback((): void => {
    activeSpeechMessageIdRef.current = null;
    setSpeakingMessageId(null);
    setLiveSpeech(null);
    onStopUtteranceRef.current?.();
  }, []);

  const stopIntroPreview = useCallback((): void => {
    introPreviewRunIdRef.current += 1;
    setIntroPreviewShowId(null);
    stopSignalIntroAudio();
  }, []);

  const stopEpisodeOutro = useCallback((): void => {
    outroRunIdRef.current += 1;
    setEpisodeOutro(null);
    stopSignalIntroAudio();
  }, []);

  const playEpisodeOutro = useCallback(
    async (args: {
      episode: BotcastEpisode;
      show: BotcastShow;
      forced: boolean;
    }): Promise<void> => {
      const runId = outroRunIdRef.current + 1;
      outroRunIdRef.current = runId;
      setEpisodeOutro({
        episodeId: args.episode.id,
        showName: args.show.name,
        phase: "holding",
        forced: args.forced,
      });
      const playback = playSignalOutroAudio({
        seed: `${args.show.id}:${args.episode.id}:${args.show.logo.seed}`,
        enabled: introAudioEnabled,
        volume: introAudioVolume,
      });
      const reducedMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
      const visualMinimum = new Promise<void>((resolve) =>
        window.setTimeout(resolve, reducedMotion ? 620 : 1_800),
      );
      await Promise.all([playback.finished, visualMinimum]);
      if (outroRunIdRef.current !== runId) return;
      setEpisodeOutro((current) =>
        current?.episodeId === args.episode.id
          ? { ...current, phase: "landing" }
          : current,
      );
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, reducedMotion ? 80 : 360),
      );
      if (outroRunIdRef.current !== runId) return;
      setEpisodeOutro(null);
      stopSignalIntroAudio();
    },
    [introAudioEnabled, introAudioVolume],
  );

  useEffect(() => {
    if (!introAudioEnabled) stopIntroPreview();
  }, [introAudioEnabled, stopIntroPreview]);

  const invalidateEpisodeOperation = useCallback((): void => {
    episodeRunIdRef.current += 1;
    episodeOperationAbortRef.current?.abort();
    episodeOperationAbortRef.current = null;
    preparedAdvanceRef.current?.controller.abort();
    preparedAdvanceRef.current = null;
    advanceInFlightRef.current = false;
    setAutoRun(false);
    setBusy(false);
    setEpisodePreRoll(null);
    assignSignalModelWarmup(null);
    signalModelWarmupVisibleRef.current = false;
    stopEpisodeOutro();
    preRollSkipRequestedRef.current = false;
    preRollGateResolveRef.current?.();
    preRollGateResolveRef.current = null;
    stopIntroPreview();
    stopUtterance();
  }, [assignSignalModelWarmup, stopEpisodeOutro, stopIntroPreview, stopUtterance]);

  const setPersistedSignalModelWarmupHold = useCallback(
    async (episodeId: string, active: boolean): Promise<BotcastEpisode> => {
      const response = await request<{ episode: BotcastEpisode }>(
        `/api/botcast/episodes/${encodeURIComponent(episodeId)}/model-warmup-hold`,
        {
          method: "POST",
          body: JSON.stringify({ active }),
        },
      );
      setEpisode((current) =>
        current?.id === response.episode.id ? response.episode : current,
      );
      return response.episode;
    },
    [request],
  );

  const releaseSignalModelWarmup = useCallback(
    async (episodeId: string | null): Promise<void> => {
      if (episodeId) {
        await setPersistedSignalModelWarmupHold(episodeId, false).catch(
          () => undefined,
        );
      }
      const current = signalModelWarmupRef.current;
      if (!current) return;
      if (!signalModelWarmupVisibleRef.current) {
        assignSignalModelWarmup(null);
        return;
      }
      assignSignalModelWarmup({ ...current, phase: "releasing" });
      const reducedMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, reducedMotion ? 120 : 900),
      );
      signalModelWarmupVisibleRef.current = false;
      assignSignalModelWarmup(null);
    },
    [assignSignalModelWarmup, setPersistedSignalModelWarmupHold],
  );

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
  const showIdentityControlsExpanded = Boolean(
    selectedShow && showIdentityControlsShowId === selectedShow.id,
  );
  const selectedShowArtworkBusy = Boolean(
    selectedShow &&
      artworkJob?.showId === selectedShow.id &&
      signalArtworkJobIsActive(artworkJob),
  );
  const dashboardAtmosphere = selectedShow
    ? activeShowAtmosphere(selectedShow, theme)
    : null;
  const hostBot = selectedShow ? botsById.get(selectedShow.hostBotId) ?? null : null;
  const hostShowAccent = selectedShow
    ? normalizeAccentForTheme(
        hostBot?.color ?? selectedShow.accentColor,
        theme,
      )
    : null;
  const liveGuestBot = episode ? botsById.get(episode.guestBotId) ?? null : null;
  const replayHostBot = replayEpisode
    ? botsById.get(replayEpisode.hostBotId) ?? null
    : null;
  const replayGuestBot = replayEpisode
    ? botsById.get(replayEpisode.guestBotId) ?? null
    : null;
  const showCardQuips = selectedShow
    ? fallbackSignalShowCardQuips(selectedShow)
    : null;
  const showAudience = selectedShow
    ? signalAudienceSnapshot({ showId: selectedShow.id, episodes })
    : null;

  useEffect(() => {
    setShowCardQuipIndex(null);
    if (!selectedShowId || episode || replayEpisode) return;

    let nextIndex = 0;
    let timer: number | null = null;
    const queueQuip = (delayMs: number): void => {
      timer = window.setTimeout(() => {
        setShowCardQuipIndex(nextIndex);
        nextIndex = (nextIndex + 1) % 4;
        timer = window.setTimeout(() => {
          setShowCardQuipIndex(null);
          queueQuip(SIGNAL_SHOW_CARD_QUIP_GAP_MS);
        }, SIGNAL_SHOW_CARD_QUIP_VISIBLE_MS);
      }, delayMs);
    };

    queueQuip(SIGNAL_SHOW_CARD_QUIP_INITIAL_DELAY_MS);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [episode, replayEpisode, selectedShowId]);

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
      setNotice(
        artworkJob.totalCount === 1
          ? `The refreshed ${signalArtworkAssetLabel(artworkJob.assets[0]!.kind)} is live.`
          : "The custom logo and matching Light and Dark studios are live.",
      );
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

  const cutShow = useCallback(
    async (
      options: { waitForOutro?: boolean } = {},
    ): Promise<boolean> => {
      if (
        !episode ||
        episode.status === "completed" ||
        !selectedShow ||
        cuttingShowRef.current
      ) return false;
      const episodeId = episode.id;
      cuttingShowRef.current = true;
      invalidateEpisodeOperation();
      setCuttingShow(true);
      setBusy(true);
      setError(null);
      try {
        const response = await request<{ episode: BotcastEpisode }>(
          `/api/botcast/episodes/${encodeURIComponent(episodeId)}/end`,
          { method: "POST", body: JSON.stringify({}) },
        );
        setEpisode(response.episode);
        setAutoRun(false);
        const outro = playEpisodeOutro({
          episode: response.episode,
          show: selectedShow,
          forced: true,
        });
        if (selectedShowId) {
          void loadEpisodes(selectedShowId).catch(() => undefined);
        }
        if (options.waitForOutro) await outro;
        else void outro;
        return true;
      } catch (cutError) {
        setError(errorMessage(cutError));
        return false;
      } finally {
        cuttingShowRef.current = false;
        setCuttingShow(false);
        setBusy(false);
      }
    },
    [
      episode,
      invalidateEpisodeOperation,
      loadEpisodes,
      playEpisodeOutro,
      request,
      selectedShow,
      selectedShowId,
    ],
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
      if (episode?.status === "live") {
        const cutCompleted = await cutShow({ waitForOutro: true });
        if (!cutCompleted) return;
      }
      invalidateEpisodeOperation();
      replayVoiceRunIdRef.current += 1;
      replayVoiceMessageIdRef.current = null;
      setReplayPlaying(false);
      setReplayVoicePending(false);
      setReplaySpeechActive(false);
      setSelectedShowId(show.id);
      setShowIdentityControlsShowId(null);
      setShowNameDraft(show.name);
      setEpisode(null);
      setReplayEpisode(null);
      setStudioLayoutEditorOpen(false);
      setStudioLayoutDraggingItem(null);
      studioLayoutDragRef.current = null;
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
    [cutShow, episode?.status, invalidateEpisodeOperation, loadEpisodes],
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

  const updateStudioLayoutDraft = (
    showId: string,
    layout: BotcastStudioLayout,
  ): void => {
    studioLayoutDraftRef.current = { showId, layout };
    setShows((current) => current.map((show) =>
      show.id === showId ? { ...show, studioLayout: layout } : show
    ));
  };

  const queueStudioLayoutSave = (
    showId: string,
    layout: BotcastStudioLayout,
  ): void => {
    studioLayoutDraftRef.current = { showId, layout };
    studioLayoutSavePendingRef.current += 1;
    setStudioLayoutSaving(true);
    const queuedSave = studioLayoutSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const response = await request<{ show: BotcastShow }>(
          `/api/botcast/shows/${encodeURIComponent(showId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ studioLayout: layout }),
          },
        );
        const latestDraft = studioLayoutDraftRef.current;
        setShows((current) => current.map((show) => {
          if (show.id !== showId) return show;
          return latestDraft?.showId === showId
            ? { ...response.show, studioLayout: latestDraft.layout }
            : response.show;
        }));
      })
      .catch((saveError) => {
        setError(errorMessage(saveError));
      })
      .finally(() => {
        studioLayoutSavePendingRef.current = Math.max(
          0,
          studioLayoutSavePendingRef.current - 1,
        );
        if (studioLayoutSavePendingRef.current === 0) {
          setStudioLayoutSaving(false);
        }
      });
    studioLayoutSaveQueueRef.current = queuedSave;
  };

  const beginStudioLayoutDrag = (
    event: ReactPointerEvent<HTMLElement>,
    show: BotcastShow,
    item: BotcastStudioLayoutItem,
  ): void => {
    if (event.button !== 0) return;
    const stage = event.currentTarget.closest<HTMLElement>(
      '[data-signal-layout-stage="true"]',
    );
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const layout = normalizeBotcastStudioLayout(show.studioLayout);
    studioLayoutDragRef.current = {
      pointerId: event.pointerId,
      showId: show.id,
      item,
      startClientX: event.clientX,
      startClientY: event.clientY,
      stageWidth: bounds.width,
      stageHeight: bounds.height,
      startLayout: layout,
      latestLayout: layout,
    };
    setStudioLayoutDraggingItem(item);
  };

  const moveStudioLayoutDrag = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    const drag = studioLayoutDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const startPoint = drag.startLayout[drag.item];
    const layout = normalizeBotcastStudioLayout({
      ...drag.startLayout,
      [drag.item]: {
        x: startPoint.x + ((event.clientX - drag.startClientX) / drag.stageWidth) * 100,
        y: startPoint.y + ((event.clientY - drag.startClientY) / drag.stageHeight) * 100,
      },
    }, drag.startLayout);
    drag.latestLayout = layout;
    updateStudioLayoutDraft(drag.showId, layout);
  };

  const finishStudioLayoutDrag = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    const drag = studioLayoutDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    studioLayoutDragRef.current = null;
    setStudioLayoutDraggingItem(null);
    queueStudioLayoutSave(drag.showId, drag.latestLayout);
  };

  const nudgeStudioLayoutItem = (
    event: ReactKeyboardEvent<HTMLElement>,
    show: BotcastShow,
    item: BotcastStudioLayoutItem,
  ): void => {
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    if (event.repeat) return;
    const step = event.shiftKey ? 2 : 0.5;
    const layout = normalizeBotcastStudioLayout(show.studioLayout);
    const point = layout[item];
    const nextLayout = normalizeBotcastStudioLayout({
      ...layout,
      [item]: {
        x: point.x + direction[0]! * step,
        y: point.y + direction[1]! * step,
      },
    }, layout);
    updateStudioLayoutDraft(show.id, nextLayout);
    queueStudioLayoutSave(show.id, nextLayout);
  };

  const resetStudioLayout = (show: BotcastShow): void => {
    const layout = normalizeBotcastStudioLayout(BOTCAST_DEFAULT_STUDIO_LAYOUT);
    updateStudioLayoutDraft(show.id, layout);
    queueStudioLayoutSave(show.id, layout);
  };

  const resetEpisodePlayback = (): void => {
    invalidateEpisodeOperation();
    replayVoiceRunIdRef.current += 1;
    setReplayPlaying(false);
    setReplayVoicePending(false);
    setReplaySpeechActive(false);
    setReplayElapsedMs(0);
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
    if (!name || name === selectedShow.name) {
      setShowNameDraft(selectedShow.name);
      return;
    }
    setShowNameDraft(name);
    setShows((current) =>
      current.map((show) => (show.id === selectedShow.id ? { ...show, name } : show)),
    );
    try {
      const response = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}`,
        { method: "PATCH", body: JSON.stringify({ name }) },
      );
      replaceShow(response.show);
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
        setNotice("Signal couldn’t find a different name. Try again whenever you want another pass.");
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

  const startSignalArtworkJob = async (
    sourceShow: BotcastShow,
    kinds: readonly SignalArtworkKind[],
    identityMs: number | null = null,
  ): Promise<SignalArtworkJobSnapshot> => {
    const response = await request<{ job: SignalArtworkJobSnapshot }>(
      `/api/botcast/shows/${encodeURIComponent(sourceShow.id)}/artwork-job`,
      {
        method: "POST",
        body: JSON.stringify({
          preferredProvider: preferredImageProvider,
          kinds,
          ...(identityMs === null ? {} : { identityMs }),
        }),
      },
    );
    setArtworkJob(response.job);
    announceSignalArtworkJob(response.job);
    return response.job;
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
            kinds: ["night-studio", "day-studio", "logo"],
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

  const regenerateStudio = async (): Promise<void> => {
    if (!selectedShow) return;
    setBusy(true);
    setError(null);
    setNotice("Refreshing the show’s linked studio pair…");
    try {
      const reset = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ regenerateAtmosphere: true }),
        },
      );
      replaceShow(reset.show);
      await startSignalArtworkJob(reset.show, ["night-studio", "day-studio"]);
      setNotice(
        "The refreshed Dark studio and source-linked Light studio are rendering in the background. You can keep using PRISM.",
      );
    } catch (studioError) {
      setError(errorMessage(studioError));
      setNotice("The previous linked studio pair remains in place.");
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
      const reset = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ regenerateLogo: true }),
        },
      );
      replaceShow(reset.show);
      await startSignalArtworkJob(reset.show, ["logo"]);
      setNotice(
        "The refreshed logo is rendering in the background. You can keep using PRISM.",
      );
    } catch (logoError) {
      setError(errorMessage(logoError));
      setNotice("The previous logo remains in place.");
    } finally {
      setBusy(false);
    }
  };

  const generateShowIntroAudio = async (): Promise<void> => {
    if (!selectedShow) return;
    if (preferredProvider === "local") {
      setError("Switch to Online before creating an ElevenLabs Signal intro.");
      return;
    }
    stopIntroPreview();
    const controller = new AbortController();
    blockingAbortRef.current = controller;
    setBusy(true);
    setError(null);
    setNotice("Composing this show’s intro…");
    setBlockingOperation({
      title: `Composing ${selectedShow.name}’s intro`,
      detail: "ElevenLabs is creating one short instrumental ident. Signal will cache it for future episodes.",
      stepLabel: "Composing the show ident",
      progress: null,
      cancellable: true,
    });
    try {
      const response = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/intro-audio/generate`,
        {
          method: "POST",
          body: JSON.stringify({}),
          signal: controller.signal,
        },
      );
      replaceShow(response.show);
      setNotice("The ElevenLabs intro is ready and will play before each episode.");
    } catch (introError) {
      if (isAbortError(introError)) {
        setNotice("Intro composition cancelled. Signal Synth remains active.");
      } else {
        setError(errorMessage(introError));
      }
    } finally {
      if (blockingAbortRef.current === controller) blockingAbortRef.current = null;
      setBlockingOperation(null);
      setBusy(false);
    }
  };

  const selectLocalShowIntro = async (): Promise<void> => {
    if (!selectedShow || selectedShow.introAudio.source === "local") return;
    stopIntroPreview();
    setBusy(true);
    setError(null);
    try {
      const response = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/intro-audio`,
        { method: "DELETE" },
      );
      replaceShow(response.show);
      setNotice("Signal Synth is now this show’s intro.");
    } catch (introError) {
      setError(errorMessage(introError));
    } finally {
      setBusy(false);
    }
  };

  const toggleShowIntroPreview = (): void => {
    if (!selectedShow) return;
    if (introPreviewShowId === selectedShow.id) {
      stopIntroPreview();
      return;
    }
    if (!introAudioEnabled) {
      setNotice("Turn voice audio on to preview the Signal intro.");
      return;
    }
    const runId = introPreviewRunIdRef.current + 1;
    introPreviewRunIdRef.current = runId;
    setError(null);
    const playback = playSignalIntroAudio({
      ...signalIntroIdentityForShow(selectedShow, hostBot),
      introAudio: selectedShow.introAudio,
      enabled: true,
      volume: introAudioVolume,
    });
    setIntroPreviewShowId(selectedShow.id);
    void playback.finished.then(() => {
      if (introPreviewRunIdRef.current === runId) {
        setIntroPreviewShowId(null);
      }
    });
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
    const guest = eligibleBots.find((bot) => bot.id === guestDraftId);
    if (!guest) {
      setError("That guest is no longer available. Choose another bot before going live.");
      return;
    }
    stopIntroPreview();
    onPrepareUtterance?.();
    const { controller, runId } = beginEpisodeOperation();
    const selectedModelOption = responseMode !== "auto" && episodeModelDraft
      ? modelOptions.find((option) => option.id === episodeModelDraft) ?? null
      : null;
    const episodeProvider =
      selectedModelOption?.provider ??
      accountDefaultModelOption?.provider ??
      preferredProvider;
    let warmupWasNeeded = false;
    let preparationPending = true;
    const preparation = waitForModelPreparation({
      request,
      provider: episodeProvider,
      model: selectedModelOption?.id ?? accountDefaultModel,
      experience: "signal",
      signal: controller.signal,
      onStatus: (status) => {
        if (status.state === "warming") {
          warmupWasNeeded = true;
          const current = signalModelWarmupRef.current;
          assignSignalModelWarmup({
            phase: current?.phase === "held" ? "held" : "entering",
            model: status.model,
            startedAt: status.startedAt,
            failure: null,
            initial: true,
            episodeId: current?.episodeId ?? null,
          });
        } else if (status.state === "unavailable") {
          assignSignalModelWarmup({
            phase: "failed",
            model: status.model,
            startedAt: status.startedAt,
            failure: status.failure,
            initial: true,
            episodeId: signalModelWarmupRef.current?.episodeId ?? null,
          });
        }
      },
    });
    const preRoll: SignalEpisodePreRoll = {
      showId: selectedShow.id,
      showName: selectedShow.name,
      guestName: guest.name,
      topic: topicDraft.trim(),
      phase: "preparing",
      source: selectedShow.introAudio.source,
    };
    preRollSkipRequestedRef.current = false;
    setEpisodePreRoll(preRoll);
    const introPlayback = playSignalIntroAudio({
      ...signalIntroIdentityForShow(selectedShow, hostBot),
      introAudio: selectedShow.introAudio,
      enabled: introAudioEnabled,
      volume: introAudioVolume,
      startDelayMs: SIGNAL_EPISODE_INTRO_LEAD_IN_MS,
    });
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    const visualMinimum = new Promise<void>((resolve) => {
      let settled = false;
      const timer = window.setTimeout(finish, reducedMotion ? 900 : 2_800);
      function finish(): void {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (preRollGateResolveRef.current === finish) {
          preRollGateResolveRef.current = null;
        }
        resolve();
      }
      preRollGateResolveRef.current = finish;
    });
    void visualMinimum.then(() => {
      if (!episodeOperationIsCurrent(controller, runId)) return;
      if (!preparationPending) return;
      const current = signalModelWarmupRef.current;
      if (!current || current.phase === "releasing") return;
      signalModelWarmupVisibleRef.current = true;
      assignSignalModelWarmup({ ...current, phase: current.phase === "failed" ? "failed" : "held" });
      setEpisodePreRoll(null);
      stopSignalIntroAudio();
    });
    setBusy(true);
    setError(null);
    let unstartedEpisodeId: string | null = null;
    let openingMessageReceived = false;
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
            durationMinutes: episodeDurationDraft,
          }),
        },
      );
      if (!episodeOperationIsCurrent(controller, runId)) return;
      unstartedEpisodeId = response.episode.id;
      setEpisode(response.episode);
      setReplayEpisode(null);
      if (warmupWasNeeded || signalModelWarmupRef.current) {
        const current = signalModelWarmupRef.current;
        assignSignalModelWarmup(
          current
            ? { ...current, episodeId: response.episode.id }
            : current,
        );
        await setPersistedSignalModelWarmupHold(response.episode.id, true);
      }
      const preparationStatus = await preparation;
      preparationPending = false;
      if (!episodeOperationIsCurrent(controller, runId)) return;
      if (preparationStatus.state === "unavailable") {
        signalModelWarmupVisibleRef.current = true;
        assignSignalModelWarmup({
          phase: "failed",
          model: preparationStatus.model,
          startedAt: preparationStatus.startedAt,
          failure: preparationStatus.failure,
          initial: true,
          episodeId: response.episode.id,
        });
        setEpisodePreRoll(null);
        stopSignalIntroAudio();
        return;
      }
      if (!signalModelWarmupVisibleRef.current) {
        assignSignalModelWarmup(null);
      }
      let opening: BotcastEpisodeAdvanceResponse | null = null;
      for (
        let attempt = 0;
        attempt < SIGNAL_OPENING_ADVANCE_ATTEMPTS;
        attempt += 1
      ) {
        opening = await request<BotcastEpisodeAdvanceResponse>(
          `/api/botcast/episodes/${encodeURIComponent(response.episode.id)}/advance`,
          {
            method: "POST",
            signal: controller.signal,
            body: JSON.stringify({}),
          },
        );
        if (opening.message || opening.episode.status === "completed") break;
      }
      if (!episodeOperationIsCurrent(controller, runId)) return;
      if (!opening?.message) {
        throw new Error(
          "Signal could not get the opening line on mic. Try starting the episode again.",
        );
      }
      openingMessageReceived = true;
      setTopicDraft("");
      setProducerBriefDraft("");
      setEpisodeModelDraft("");
      setAskAboutDraft("");
      void loadEpisodes(selectedShow.id).catch(() => undefined);
      setEpisode(opening.episode);
      setAutoRun(true);
      prepareGuestResponse(opening.episode, opening.message);
      prepareEpisodeMessage(opening.message);
      await releaseSignalModelWarmup(opening.episode.id);
      await Promise.all([introPlayback.finished, visualMinimum]);
      if (!episodeOperationIsCurrent(controller, runId)) return;
      setEpisodePreRoll((current) => current?.showId === selectedShow.id
        ? { ...current, phase: "landing" }
        : current);
      await new Promise<void>((resolve) => window.setTimeout(
        resolve,
        preRollSkipRequestedRef.current || reducedMotion ? 90 : 460,
      ));
      if (!episodeOperationIsCurrent(controller, runId)) return;
      setEpisodePreRoll(null);
      stopSignalIntroAudio();
      await playPreparedEpisodeMessage(opening.message, controller, runId);
    } catch (startError) {
      if (episodeOperationIsCurrent(controller, runId)) {
        preRollGateResolveRef.current?.();
        preRollGateResolveRef.current = null;
        stopSignalIntroAudio();
        setEpisodePreRoll(null);
        setAutoRun(false);
        if (unstartedEpisodeId && signalModelWarmupRef.current) {
          await releaseSignalModelWarmup(unstartedEpisodeId);
        }
        if (unstartedEpisodeId && !openingMessageReceived) {
          try {
            await request(
              `/api/botcast/episodes/${encodeURIComponent(unstartedEpisodeId)}`,
              { method: "DELETE" },
            );
            setEpisode(null);
            void loadEpisodes(selectedShow.id).catch(() => undefined);
          } catch {
            // Keep the original startup error; the archive can still be discarded manually.
          }
        }
        setError(errorMessage(startError));
      }
    } finally {
      if (episodeOperationIsCurrent(controller, runId)) {
        preRollGateResolveRef.current = null;
        episodeOperationAbortRef.current = null;
        setBusy(false);
      }
    }
  };

  const skipEpisodePreRoll = (): void => {
    preRollSkipRequestedRef.current = true;
    preRollGateResolveRef.current?.();
    preRollGateResolveRef.current = null;
    stopSignalIntroAudio();
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

  const prepareEpisodeMessage = useCallback((message: BotcastMessage): void => {
    activeSpeechMessageIdRef.current = message.id;
    setLiveSpeech({
      messageId: message.id,
      reveal: prepareBotcastSpeechReveal(message.content),
    });
    setSpeakingMessageId(message.id);
  }, []);

  const playPreparedEpisodeMessage = useCallback(
    async (
      message: BotcastMessage,
      controller: AbortController,
      runId: number,
    ): Promise<void> => {
      const bot = botsById.get(message.botId);
      let playbackStarted = false;
      let voicePreparationTimer: number | null = null;
      const lifecycle: VoicePlaybackLifecycle = {
        onStart: (durationMs, alignment) => {
          if (
            activeSpeechMessageIdRef.current !== message.id ||
            !episodeOperationIsCurrent(controller, runId)
          ) return;
          if (voicePreparationTimer !== null) {
            window.clearTimeout(voicePreparationTimer);
            voicePreparationTimer = null;
          }
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
        ? await new Promise<boolean>((resolve) => {
            let settled = false;
            const settle = (value: boolean): void => {
              if (settled) return;
              settled = true;
              if (voicePreparationTimer !== null) {
                window.clearTimeout(voicePreparationTimer);
                voicePreparationTimer = null;
              }
              resolve(value);
            };
            voicePreparationTimer = window.setTimeout(() => {
              onStopUtterance?.();
              settle(false);
            }, SIGNAL_VOICE_START_TIMEOUT_MS);
            void Promise.resolve(onUtterance(message, bot, lifecycle)).then(
              settle,
              () => settle(false),
            );
          })
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
    },
    [
      botsById,
      episodeOperationIsCurrent,
      onStopUtterance,
      onUtterance,
      revealUtteranceWithoutAudio,
    ],
  );

  const prepareGuestResponse = useCallback(
    (currentEpisode: BotcastEpisode, hostMessage: BotcastMessage): void => {
      preparedAdvanceRef.current?.controller.abort();
      preparedAdvanceRef.current = null;
      if (
        currentEpisode.status === "completed" ||
        hostMessage.speakerRole !== "host"
      ) return;
      const controller = new AbortController();
      const prepared: PreparedBotcastAdvance = {
        episodeId: currentEpisode.id,
        afterMessageId: hostMessage.id,
        controller,
        settled: false,
        warming: false,
        warmupModel: currentEpisode.model,
        warmupStartedAt: null,
        warmupFailure: null,
        result: Promise.resolve({
          ok: false as const,
          error: new Error("Not started"),
        }),
      };
      prepared.result = waitForModelPreparation({
        request,
        provider: currentEpisode.provider,
        model: currentEpisode.model,
        experience: "signal",
        signal: controller.signal,
        onStatus: (status) => {
          prepared.warming ||= status.state === "warming";
          prepared.warmupModel = status.model;
          prepared.warmupStartedAt = status.startedAt;
          prepared.warmupFailure = status.failure;
        },
      }).then((status) => {
        if (status.state === "unavailable") {
          throw new Error("The local model could not get ready.");
        }
        return request<BotcastEpisodeAdvanceResponse>(
          `/api/botcast/episodes/${encodeURIComponent(currentEpisode.id)}/advance`,
          {
            method: "POST",
            signal: controller.signal,
            body: JSON.stringify({}),
          },
        );
      }).catch((error: unknown) => {
        if (
          !(error instanceof DOMException && error.name === "AbortError") &&
          !prepared.warmupFailure
        ) {
          prepared.warmupFailure = "request_failed";
        }
        throw error;
      }).then(
          (response) => ({ ok: true as const, response }),
          (error: unknown) => ({ ok: false as const, error }),
        ).finally(() => {
          prepared.settled = true;
        });
      preparedAdvanceRef.current = prepared;
    },
    [request],
  );

  const advanceEpisode = useCallback(
    async (cue?: BotcastProducerCue): Promise<void> => {
      if (!episode || episode.status === "completed" || advanceInFlightRef.current) return;
      const queuedCue =
        !cue &&
        botcastNextSpeakerRole({
          messages: episode.messages,
          segment: episode.segment,
          guestDeparted: guestHasDeparted(episode),
        }) === "host"
          ? queuedProducerCueRef.current
          : null;
      const requestedCue = cue ?? queuedCue ?? undefined;
      advanceInFlightRef.current = true;
      const { controller, runId } = beginEpisodeOperation();
      setBusy(true);
      setError(null);
      try {
        const lastVisibleMessageId = episode.messages.at(-1)?.id ?? null;
        const prepared = !requestedCue && preparedAdvanceRef.current?.episodeId === episode.id &&
            preparedAdvanceRef.current.afterMessageId === lastVisibleMessageId
          ? preparedAdvanceRef.current
          : null;
        let warmupHoldActive = false;
        if (prepared?.warming && !prepared.settled) {
          warmupHoldActive = true;
          signalModelWarmupVisibleRef.current = true;
          assignSignalModelWarmup({
            phase: "held",
            model: prepared.warmupModel,
            startedAt: prepared.warmupStartedAt,
            failure: prepared.warmupFailure,
            initial: false,
            episodeId: episode.id,
          });
          await setPersistedSignalModelWarmupHold(episode.id, true);
        }
        const preparedResult = prepared ? await prepared.result : null;
        if (preparedAdvanceRef.current === prepared) {
          preparedAdvanceRef.current = null;
        }
        if (preparedResult && !preparedResult.ok && prepared?.warmupFailure) {
          signalModelWarmupVisibleRef.current = true;
          assignSignalModelWarmup({
            phase: "failed",
            model: prepared.warmupModel,
            startedAt: prepared.warmupStartedAt,
            failure: prepared.warmupFailure,
            initial: false,
            episodeId: episode.id,
          });
          setAutoRun(false);
          return;
        }
        if (preparedResult && !preparedResult.ok) throw preparedResult.error;
        let directHoldStart: Promise<BotcastEpisode> | null = null;
        if (!preparedResult) {
          const preparationStatus = await waitForModelPreparation({
            request,
            provider: episode.provider,
            model: episode.model,
            experience: "signal",
            signal: controller.signal,
            onStatus: (status) => {
              if (status.state === "warming") {
                warmupHoldActive = true;
                signalModelWarmupVisibleRef.current = true;
                assignSignalModelWarmup({
                  phase: "held",
                  model: status.model,
                  startedAt: status.startedAt,
                  failure: null,
                  initial: false,
                  episodeId: episode.id,
                });
                directHoldStart ??= setPersistedSignalModelWarmupHold(
                  episode.id,
                  true,
                );
              } else if (status.state === "unavailable") {
                assignSignalModelWarmup({
                  phase: "failed",
                  model: status.model,
                  startedAt: status.startedAt,
                  failure: status.failure,
                  initial: false,
                  episodeId: episode.id,
                });
              }
            },
          });
          if (directHoldStart) await directHoldStart;
          if (preparationStatus.state === "unavailable") {
            signalModelWarmupVisibleRef.current = true;
            setAutoRun(false);
            return;
          }
        }
        const response = preparedResult?.response ??
          await request<BotcastEpisodeAdvanceResponse>(
            `/api/botcast/episodes/${encodeURIComponent(episode.id)}/advance`,
            {
              method: "POST",
              signal: controller.signal,
              body: JSON.stringify({
                ...(requestedCue ? { cue: requestedCue } : {}),
              }),
            },
          );
        if (!episodeOperationIsCurrent(controller, runId)) return;
        if (
          requestedCue &&
          queuedProducerCueRef.current === requestedCue
        ) {
          assignQueuedProducerCue(null);
        }
        if (response.message) {
          const message = response.message;
          setEpisode(response.episode);
          prepareGuestResponse(response.episode, message);
          prepareEpisodeMessage(message);
          if (warmupHoldActive || signalModelWarmupRef.current) {
            await releaseSignalModelWarmup(response.episode.id);
          }
          await playPreparedEpisodeMessage(message, controller, runId);
        } else {
          setEpisode(response.episode);
          if (warmupHoldActive || signalModelWarmupRef.current) {
            await releaseSignalModelWarmup(response.episode.id);
          }
        }
        if (response.episode.status === "completed") {
          assignQueuedProducerCue(null);
          setAutoRun(false);
          if (selectedShow) {
            void playEpisodeOutro({
              episode: response.episode,
              show: selectedShow,
              forced: false,
            });
          }
          if (selectedShowId) void loadEpisodes(selectedShowId).catch(() => undefined);
        }
      } catch (advanceError) {
        if (episodeOperationIsCurrent(controller, runId)) {
          if (signalModelWarmupRef.current) {
            await releaseSignalModelWarmup(episode.id);
          }
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
      beginEpisodeOperation,
      episode,
      assignQueuedProducerCue,
      assignSignalModelWarmup,
      episodeOperationIsCurrent,
      loadEpisodes,
      playEpisodeOutro,
      playPreparedEpisodeMessage,
      prepareEpisodeMessage,
      prepareGuestResponse,
      releaseSignalModelWarmup,
      request,
      selectedShow,
      selectedShowId,
      stopUtterance,
      setPersistedSignalModelWarmupHold,
    ],
  );

  const leaveInitialSignalWarmup = async (): Promise<void> => {
    const episodeId = signalModelWarmupRef.current?.episodeId ?? episode?.id ?? null;
    invalidateEpisodeOperation();
    if (episodeId) {
      await request(`/api/botcast/episodes/${encodeURIComponent(episodeId)}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    setEpisode(null);
    setAutoRun(false);
    setBusy(false);
    if (selectedShowId) void loadEpisodes(selectedShowId).catch(() => undefined);
  };

  const retrySignalModelWarmup = async (): Promise<void> => {
    const current = signalModelWarmupRef.current;
    if (!current) return;
    if (current.initial) {
      await leaveInitialSignalWarmup();
      await startEpisode();
      return;
    }
    const episodeId = current.episodeId ?? episode?.id ?? null;
    if (!episodeId || !episode) return;
    const controller = new AbortController();
    assignSignalModelWarmup({ ...current, phase: "held", failure: null });
    try {
      const status = await waitForModelPreparation({
        request,
        provider: episode.provider,
        model: episode.model,
        experience: "signal",
        retry: true,
        signal: controller.signal,
        onStatus: (next) => {
          if (next.state !== "warming") return;
          assignSignalModelWarmup({
            ...current,
            phase: "held",
            model: next.model,
            startedAt: next.startedAt,
            failure: null,
          });
        },
      });
      if (status.state === "unavailable") {
        assignSignalModelWarmup({
          ...current,
          phase: "failed",
          model: status.model,
          startedAt: status.startedAt,
          failure: status.failure,
        });
        return;
      }
      setAutoRun(true);
      window.setTimeout(() => void advanceEpisode(), 0);
    } catch (retryError) {
      if (retryError instanceof DOMException && retryError.name === "AbortError") return;
      assignSignalModelWarmup({
        ...current,
        phase: "failed",
        failure: "request_failed",
      });
    }
  };

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
      episode.messages.length ? SIGNAL_NATURAL_HANDOFF_MS : 0,
    );
    return () => window.clearTimeout(timer);
  }, [advanceEpisode, autoRun, busy, episode, speakingMessageId]);

  const sendCue = (cue: BotcastProducerCue): void => {
    if (!episode || episode.status !== "live" || episode.segment === "closing") return;
    assignQueuedProducerCue(cue);
    setAutoRun(true);
    const nextRole = botcastNextSpeakerRole({
      messages: episode.messages,
      segment: episode.segment,
      guestDeparted: guestHasDeparted(episode),
    });
    if (!busy && speakingMessageId === null && nextRole === "host") {
      onPrepareUtterance?.();
      void advanceEpisode(cue);
    }
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
        if (detail.modelWarmupHoldStartedAt) {
          signalModelWarmupVisibleRef.current = true;
          assignSignalModelWarmup({
            phase: "held",
            model: detail.model,
            startedAt: detail.modelWarmupHoldStartedAt,
            failure: null,
            initial: detail.messages.length === 0,
            episodeId: detail.id,
          });
          void waitForModelPreparation({
            request,
            provider: detail.provider,
            model: detail.model,
            experience: "signal",
          }).then(async (status) => {
            if (status.state === "unavailable") {
              assignSignalModelWarmup({
                phase: "failed",
                model: status.model,
                startedAt: status.startedAt ?? detail.modelWarmupHoldStartedAt,
                failure: status.failure,
                initial: detail.messages.length === 0,
                episodeId: detail.id,
              });
              return;
            }
            await releaseSignalModelWarmup(detail.id);
            setAutoRun(true);
          }).catch(() => undefined);
        } else {
          setAutoRun(false);
        }
        return;
      }
      setReplayEpisode(detail);
      setEpisode(null);
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
    const studioLayout = normalizeBotcastStudioLayout(args.show.studioLayout);
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
    const speechMouthActive = Boolean(
      speechIsPlaying &&
        (args.replay || botcastSpeechRevealIsVoicing(speechReveal) !== false),
    );
    const roleIsSpeaking = (role: "host" | "guest"): boolean =>
      Boolean(speechIsPlaying && args.activeMessage?.speakerRole === role);
    const roleIsThinking = (role: "host" | "guest"): boolean =>
      !args.replay && (
        (speechReveal?.phase === "preparing" && args.activeMessage?.speakerRole === role) ||
        (busy && speakingMessageId === null && thinkingRole === role)
      );
    const episodeStartedAtCandidate = Date.parse(args.currentEpisode.startedAt);
    const episodeStartedAtMs = Number.isFinite(episodeStartedAtCandidate)
      ? episodeStartedAtCandidate
      : null;
    const activeWarmupStartedAtMs = args.currentEpisode.modelWarmupHoldStartedAt
      ? Date.parse(args.currentEpisode.modelWarmupHoldStartedAt)
      : Number.NaN;
    const liveWarmupElapsedMs = Number.isFinite(activeWarmupStartedAtMs)
      ? Math.max(0, signalStageNowMs - activeWarmupStartedAtMs)
      : 0;
    const liveEffectiveNowMs = Math.max(
      episodeStartedAtMs ?? 0,
      signalStageNowMs -
        (args.currentEpisode.modelWarmupHoldDurationMs ?? 0) -
        liveWarmupElapsedMs,
    );
    const cupNowMs = args.replay && episodeStartedAtMs !== null
      ? episodeStartedAtMs + replayElapsedMs
      : liveEffectiveNowMs;
    const cupVisual = (
      bot: BotcastBotSummary,
      role: "host" | "guest",
    ): CoffeeCupVisualState => {
      return buildCoffeeCupVisualState({
        seed: `signal:${args.currentEpisode.id}:${bot.id}:${role}`,
        botColor: bot.color,
        theme,
        nowMs: cupNowMs,
        sessionStartedAtMs: episodeStartedAtMs,
        durationMinutes:
          args.currentEpisode.durationMinutes ??
          DEFAULT_COFFEE_SESSION_DURATION_MINUTES,
        powerRateMultiplier: resolveCupRateMultiplier?.(bot) ?? 1,
        speaking: roleIsSpeaking(role),
        thinking: roleIsThinking(role),
      });
    };
    const hostCupVisual = args.host ? cupVisual(args.host, "host") : null;
    const guestCupVisual = args.guest ? cupVisual(args.guest, "guest") : null;
    const hostSipping =
      hostCupVisual?.sipping === true && !roleIsSpeaking("host");
    const guestSipping =
      guestCupVisual?.sipping === true && !roleIsSpeaking("guest");
    const hostCupTravel = signalCupTravelByRole.host;
    const guestCupTravel = signalCupTravelByRole.guest;
    const atmosphereStyle = {
      ["--botcast-accent" as string]: args.show.accentColor,
      ["--botcast-studio-accent" as string]: normalizeAccentForTheme(
        args.host?.color ?? args.show.accentColor,
        theme,
      ),
      ["--botcast-camera-offset-x" as string]: `${botcastCameraOffsetXPercent(
        args.shot,
        studioLayout,
      )}%`,
      ["--botcast-camera-offset-y" as string]: `${botcastCameraOffsetYPercent(
        args.shot,
        studioLayout,
      )}%`,
      ...(stageAtmosphere.imageUrl
        ? { ["--botcast-atmosphere" as string]: `url("${stageAtmosphere.imageUrl}")` }
        : {}),
    } as CSSProperties;
    const avatar = (
      bot: BotcastBotSummary,
      role: "host" | "guest",
      talking: boolean,
      thinking: boolean,
      sipping: boolean,
    ): ReactNode => {
      const mouthShape = talking && args.activeMessage
        ? crtSpeechMouthShapeAtElapsedMs({
            text: args.activeMessage.content,
            elapsedMs: speechElapsedMs,
            ...(speechDurationMs > 0 ? { durationMs: speechDurationMs } : {}),
          })
        : "closed";
      return renderAvatar?.(bot, {
        talking,
        thinking,
        sipping,
        role,
        mouthShape,
      }) ?? avatarFallback(bot);
    };
    return (
      <section
        ref={signalStageRef}
        className={styles.stageViewport}
        data-shot={args.shot}
        data-replay={args.replay ? "true" : undefined}
        data-model-warmup={
          !args.replay && signalModelWarmup
            ? signalModelWarmup.phase
            : undefined
        }
        data-studio-source={stageAtmosphere.imageUrl ? "image" : "fallback"}
        style={atmosphereStyle}
        aria-label={`Signal studio, ${args.shot} camera`}
      >
        <div className={styles.stageScene} data-signal-stage-scene="true">
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
          <SignalStudioSpotlight />
          {args.host ? (
            <div
              className={styles.stagePlacement}
              style={{
                left: `${studioLayout.hostBot.x}%`,
                top: `${studioLayout.hostBot.y}%`,
              }}
              aria-label={`Host ${args.host.name}`}
            >
              <div
                className={styles.avatarRig}
                data-signal-presence="host"
                data-talking={
                  speechMouthActive && args.activeMessage?.speakerRole === "host"
                    ? "true"
                    : undefined
                }
                data-thinking={
                  roleIsThinking("host") ? "true" : undefined
                }
                data-sipping={hostSipping ? "true" : undefined}
              >
                {avatar(
                  args.host,
                  "host",
                  speechMouthActive && args.activeMessage?.speakerRole === "host",
                  roleIsThinking("host"),
                  hostSipping,
                )}
              </div>
            </div>
          ) : null}
          {args.host && renderMug && hostCupVisual ? (
            <div
              className={styles.stageMug}
              style={{
                left: `${studioLayout.hostCup.x}%`,
                top: `${studioLayout.hostCup.y}%`,
                ["--signal-cup-rest-x" as string]: `${studioLayout.hostCup.x}%`,
                ["--signal-cup-rest-y" as string]: `${studioLayout.hostCup.y}%`,
                ["--signal-cup-sip-duration-ms" as string]: `${hostCupVisual.sipAnimationMs}ms`,
                ...(hostCupTravel.returnX !== null &&
                hostCupTravel.returnY !== null
                  ? {
                      ["--signal-cup-return-x" as string]: `${hostCupTravel.returnX}px`,
                      ["--signal-cup-return-y" as string]: `${hostCupTravel.returnY}px`,
                    }
                  : {}),
              }}
              data-signal-mug-role="host"
              data-sip-requested={hostSipping ? "true" : undefined}
              data-sipping={
                hostCupTravel.mode === "sipping" ? "true" : undefined
              }
              data-returning={
                hostCupTravel.mode === "returning" ? "true" : undefined
              }
              onAnimationEnd={(event) =>
                finishSignalCupReturn("host", event)
              }
              aria-label="Host coffee mug"
            >
              {renderMug(args.host, { role: "host", visual: hostCupVisual })}
            </div>
          ) : null}
          {!departed && args.guest ? (
            <div
              className={styles.stagePlacement}
              style={{
                left: `${studioLayout.guestBot.x}%`,
                top: `${studioLayout.guestBot.y}%`,
              }}
              aria-label={`Guest ${args.guest.name}`}
            >
              <div
                className={styles.avatarRig}
                data-signal-presence="guest"
                data-talking={
                  speechMouthActive && args.activeMessage?.speakerRole === "guest"
                    ? "true"
                    : undefined
                }
                data-thinking={
                  roleIsThinking("guest") ? "true" : undefined
                }
                data-sipping={guestSipping ? "true" : undefined}
              >
                {avatar(
                  args.guest,
                  "guest",
                  speechMouthActive && args.activeMessage?.speakerRole === "guest",
                  roleIsThinking("guest"),
                  guestSipping,
                )}
              </div>
            </div>
          ) : null}
          {!departed && args.guest && renderMug && guestCupVisual ? (
            <div
              className={styles.stageMug}
              style={{
                left: `${studioLayout.guestCup.x}%`,
                top: `${studioLayout.guestCup.y}%`,
                ["--signal-cup-rest-x" as string]: `${studioLayout.guestCup.x}%`,
                ["--signal-cup-rest-y" as string]: `${studioLayout.guestCup.y}%`,
                ["--signal-cup-sip-duration-ms" as string]: `${guestCupVisual.sipAnimationMs}ms`,
                ...(guestCupTravel.returnX !== null &&
                guestCupTravel.returnY !== null
                  ? {
                      ["--signal-cup-return-x" as string]: `${guestCupTravel.returnX}px`,
                      ["--signal-cup-return-y" as string]: `${guestCupTravel.returnY}px`,
                    }
                  : {}),
              }}
              data-signal-mug-role="guest"
              data-sip-requested={guestSipping ? "true" : undefined}
              data-sipping={
                guestCupTravel.mode === "sipping" ? "true" : undefined
              }
              data-returning={
                guestCupTravel.mode === "returning" ? "true" : undefined
              }
              onAnimationEnd={(event) =>
                finishSignalCupReturn("guest", event)
              }
              aria-label="Guest coffee mug"
            >
              {renderMug(args.guest, { role: "guest", visual: guestCupVisual })}
            </div>
          ) : null}
          <div
            className={`${styles.seat} ${styles.hostSeat}`}
            data-role="host"
          >
            <strong className={styles.nameplate}>
              <span>Host</span>
              {args.host?.name ?? "Host"}
            </strong>
          </div>
          <div
            className={`${styles.seat} ${styles.guestSeat}`}
            data-role="guest"
            data-departed={departed ? "true" : undefined}
          >
            {departed ? (
              <span className={styles.emptyChairLabel}>Guest has left the studio</span>
            ) : null}
            <strong className={styles.nameplate}>
              <span>Guest</span>
              {args.guest?.name ?? "Guest"}
            </strong>
          </div>
        </div>
        {!args.replay && signalModelWarmup ? (
          <ModelWarmupIntermission
            phase={signalModelWarmup.phase}
            experience="signal"
            model={signalModelWarmup.model}
            startedAt={signalModelWarmup.startedAt}
            failure={signalModelWarmup.failure}
            initial={signalModelWarmup.initial}
            onRetry={
              signalModelWarmup.phase === "failed"
                ? () => void retrySignalModelWarmup()
                : undefined
            }
            onExit={
              signalModelWarmup.initial
                ? () => void leaveInitialSignalWarmup()
                : () => void cutShow()
            }
            exitLabel={signalModelWarmup.initial ? "Back to setup" : "Cut show"}
          />
        ) : null}
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
              aria-label={
                episode?.status === "live"
                  ? `Cut the live show and open ${show.name}`
                  : `Open ${show.name}`
              }
              style={
                {
                  ["--show-accent" as string]: normalizeAccentForTheme(
                    host?.color ?? show.accentColor,
                    theme,
                  ),
                } as CSSProperties
              }
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

  const renderStudioLayoutEditor = (
    show: BotcastShow,
    host: BotcastBotSummary,
    guest: BotcastBotSummary | null,
  ): React.JSX.Element => {
    const stageAtmosphere = activeShowAtmosphere(show, theme);
    const layout = normalizeBotcastStudioLayout(show.studioLayout);
    const stageStyle = {
      ["--botcast-accent" as string]: show.accentColor,
      ["--botcast-studio-accent" as string]: normalizeAccentForTheme(
        host.color ?? show.accentColor,
        theme,
      ),
      ...(stageAtmosphere.imageUrl
        ? { ["--botcast-atmosphere" as string]: `url("${stageAtmosphere.imageUrl}")` }
        : {}),
    } as CSSProperties;
    const layoutHandle = (
      item: BotcastStudioLayoutItem,
      child: ReactNode,
    ): React.JSX.Element => {
      const point = layout[item];
      const label = SIGNAL_STUDIO_LAYOUT_LABELS[item];
      return (
        <div
          key={item}
          className={styles.stageLayoutHandle}
          data-kind={item.endsWith("Bot") ? "bot" : "cup"}
          data-dragging={studioLayoutDraggingItem === item ? "true" : undefined}
          style={{ left: `${point.x}%`, top: `${point.y}%` }}
          role="button"
          tabIndex={0}
          aria-label={`Move ${label}. Use arrow keys to nudge.`}
          onPointerDown={(event) => beginStudioLayoutDrag(event, show, item)}
          onPointerMove={moveStudioLayoutDrag}
          onPointerUp={finishStudioLayoutDrag}
          onPointerCancel={finishStudioLayoutDrag}
          onKeyDown={(event) => nudgeStudioLayoutItem(event, show, item)}
        >
          {child}
          <span className={styles.stageLayoutHandleLabel}>{label}</span>
        </div>
      );
    };
    const avatarPreview = (
      bot: BotcastBotSummary,
      role: "host" | "guest",
    ): ReactNode => (
      <div className={styles.avatarRig} data-signal-presence={role}>
        {renderAvatar?.(bot, {
          talking: false,
          thinking: false,
          sipping: false,
          role,
          mouthShape: "closed",
        }) ?? avatarFallback(bot)}
      </div>
    );
    const cupPreview = (
      bot: BotcastBotSummary,
      role: "host" | "guest",
    ): ReactNode => renderMug?.(bot, {
      role,
      visual: buildCoffeeCupVisualState({
        seed: `signal:${bot.id}:${role}`,
        botColor: bot.color,
        theme,
        nowMs: 0,
        progressOverride: 0,
        sippingOverride: false,
      }),
    }) ?? (
      <span className={styles.mugFallback} aria-hidden="true">☕</span>
    );
    return (
      <div className={styles.stageLayoutEditor}>
        <div className={styles.stageLayoutEditorHeader}>
          <p>Drag each bot and cup onto this show’s furniture. Arrow keys make fine adjustments.</p>
          <div>
            <span aria-live="polite">
              {studioLayoutSaving ? "Saving alignment…" : "Saved for this show"}
            </span>
            <button type="button" onClick={() => resetStudioLayout(show)}>
              Reset positions
            </button>
          </div>
        </div>
        <section
          className={styles.stageViewport}
          data-shot="wide"
          data-layout-editor="true"
          data-signal-layout-stage="true"
          data-studio-source={stageAtmosphere.imageUrl ? "image" : "fallback"}
          style={stageStyle}
          aria-label={`Align the ${show.name} studio stage`}
        >
          <div className={styles.stageScene}>
            <div className={styles.atmosphere} aria-hidden="true">
              {!stageAtmosphere.imageUrl ? (
                <SignalFallbackStudio
                  surface="stage"
                  accentVariant={show.fallbackStudioAccentVariant}
                />
              ) : null}
            </div>
            <div className={styles.wordmark}>
              <SignalShowLogo show={show} />
              <strong>{show.name}</strong>
            </div>
            <div className={styles.studioGlow} aria-hidden="true" />
            <SignalStudioSpotlight />
            {layoutHandle("hostBot", avatarPreview(host, "host"))}
            {layoutHandle("hostCup", cupPreview(host, "host"))}
            {guest ? layoutHandle("guestBot", avatarPreview(guest, "guest")) : null}
            {guest ? layoutHandle("guestCup", cupPreview(guest, "guest")) : null}
          </div>
        </section>
      </div>
    );
  };

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
    const previewGuest = botsById.get(guestDraftId) ?? guestOptions[0] ?? null;
    const randomizeBooking = (): void => {
      const booking = randomSignalEpisodeBooking({
        candidateGuestIds: guestOptions.map((bot) => bot.id),
        hostBotId: hostBot.id,
        currentGuestId: guestDraftId,
        currentTopic: topicDraft,
        currentProducerBrief: producerBriefDraft,
      });
      if (!booking) return;
      setGuestDraftId(booking.guestId);
      setTopicDraft(booking.topic);
      setProducerBriefDraft(booking.producerBrief);
      setError(null);
      setNotice("Guest, topic, and private angle randomized. Everything remains editable.");
    };
    return (
      <div className={styles.productionDesk} data-tutorial-target="botcast-setup">
        <div className={styles.productionHeading}>
          <div>
            <span className={styles.eyebrow}>Tonight’s production</span>
            <h2>Book the guest. Set the angle.</h2>
          </div>
          <div className={styles.productionHeadingActions}>
            <button
              type="button"
              className={styles.randomizeBookingButton}
              onClick={randomizeBooking}
              disabled={busy || guestOptions.length === 0}
            >
              ↻ Randomize booking
            </button>
            <button
              type="button"
              data-tutorial-target="botcast-stage-layout"
              data-active={studioLayoutEditorOpen ? "true" : undefined}
              onClick={() => setStudioLayoutEditorOpen((open) => !open)}
            >
              {studioLayoutEditorOpen ? "Done aligning" : "Align stage"}
            </button>
          </div>
        </div>
        {studioLayoutEditorOpen
          ? renderStudioLayoutEditor(selectedShow, hostBot, previewGuest)
          : null}
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
          <label className={styles.episodeLengthControl}>
            <span>Episode length</span>
            <select
              value={episodeDurationDraft ?? "auto"}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setEpisodeDurationDraft(value === "auto" ? null : Number(value));
              }}
              aria-label="Signal episode length"
            >
              <option value="auto">Auto · natural ending</option>
              {Array.from(
                {
                  length:
                    BOTCAST_SESSION_DURATION_MINUTES_MAX -
                    BOTCAST_SESSION_DURATION_MINUTES_MIN +
                    1,
                },
                (_, index) => BOTCAST_SESSION_DURATION_MINUTES_MIN + index,
              ).map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </select>
            <small>
              {episodeDurationDraft === null
                ? "No countdown · closes at a natural resting point"
                : `Target · about ${episodeDurationDraft} minutes`}
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
  const liveCameraElapsedMs = (() => {
    if (!episode || episode.messages.length === 0) return 0;
    const timeline = botcastReplayTimeline(episode.messages, episode.events);
    const activeIndex = liveSpeech
      ? episode.messages.findIndex((message) => message.id === liveSpeech.messageId)
      : -1;
    if (activeIndex >= 0 && liveSpeech) {
      return Math.max(
        0,
        Math.round(
          (timeline.messageStartMs[activeIndex] ?? 0) + liveSpeech.reveal.elapsedMs,
        ),
      );
    }
    const lastIndex = episode.messages.length - 1;
    const lastMessage = episode.messages[lastIndex]!;
    const wordCount = lastMessage.content.split(/\s+/u).filter(Boolean).length;
    return Math.max(
      0,
      Math.round(
        (timeline.messageStartMs[lastIndex] ?? 0) +
          Math.max(BOTCAST_DIRECTOR_MIN_SHOT_MS, wordCount * 310),
      ),
    );
  })();
  const liveCameraMode = episode
    ? botcastCameraModeAt({
        events: episode.events,
        elapsedMs: Number.POSITIVE_INFINITY,
      })
    : "auto";
  const liveShot = episode
    ? liveCameraMode === "auto"
      ? botcastCameraShotAt({
          events: episode.events,
          elapsedMs: liveCameraElapsedMs,
        })
      : liveCameraMode
    : "wide";
  const selectLiveCameraMode = async (mode: BotcastCameraShot): Promise<void> => {
    if (
      !episode ||
      episode.status !== "live" ||
      cameraSaving ||
      mode === liveCameraMode
    ) return;
    setCameraSaving(true);
    setError(null);
    try {
      const response = await request<{ episode: BotcastEpisode }>(
        `/api/botcast/episodes/${encodeURIComponent(episode.id)}/camera`,
        {
          method: "POST",
          body: JSON.stringify({ mode, atMs: liveCameraElapsedMs }),
        },
      );
      setEpisode((current) =>
        current?.id === response.episode.id ? response.episode : current,
      );
    } catch (cameraError) {
      setError(errorMessage(cameraError));
    } finally {
      setCameraSaving(false);
    }
  };
  const producerCueAvailable =
    episode?.status === "live" && episode.segment !== "closing";
  const liveSessionActive = episode?.status === "live";
  const resolvedNavigationHeader =
    typeof navigationHeader === "function"
      ? navigationHeader({ liveSessionActive })
      : navigationHeader;

  return (
    <>
    <main
      className={styles.shell}
      data-botcast-mode="true"
      data-theme={theme}
      data-live-episode={liveSessionActive ? "true" : undefined}
    >
      <div className={styles.sidebarNavigation}>{sidebarHeader}</div>
      <div className={styles.mainNavigation}>{resolvedNavigationHeader}</div>
      {episodePreRoll && selectedShow ? (
        <section
          className={styles.episodePreRoll}
          data-phase={episodePreRoll.phase}
          data-source={episodePreRoll.source}
          style={{ "--botcast-accent": selectedShow.accentColor } as CSSProperties}
          aria-label={`${episodePreRoll.showName} episode introduction`}
          aria-live="polite"
        >
          <div className={styles.preRollSignalField} aria-hidden="true">
            <i /><i /><i /><i /><i />
          </div>
          <div className={styles.preRollLockup}>
            <span className={styles.preRollEyebrow}>Signal presents</span>
            <div className={styles.preRollLogo}>
              <SignalShowLogo show={selectedShow} />
              <span className={styles.preRollOrbit} aria-hidden="true" />
            </div>
            <h1>{episodePreRoll.showName}</h1>
            <p>With {episodePreRoll.guestName}</p>
            <strong>{episodePreRoll.topic}</strong>
            <div className={styles.preRollMeters} aria-hidden="true">
              {Array.from({ length: 11 }, (_, index) => <i key={index} />)}
            </div>
            <small>
              {episodePreRoll.source === "elevenlabs"
                ? "Original ElevenLabs show ident"
                : "Signal Synth · generated locally"}
            </small>
          </div>
          <button type="button" onClick={skipEpisodePreRoll}>Skip intro</button>
        </section>
      ) : null}
      {episodeOutro && selectedShow ? (
        <section
          className={`${styles.episodePreRoll} ${styles.episodeOutro}`}
          data-phase={episodeOutro.phase}
          data-kind="outro"
          style={{ "--botcast-accent": selectedShow.accentColor } as CSSProperties}
          aria-label={`${episodeOutro.showName} episode outro`}
          aria-live="polite"
        >
          <div className={styles.preRollSignalField} aria-hidden="true">
            <i /><i /><i />
          </div>
          <div className={styles.preRollLockup}>
            <span className={styles.preRollEyebrow}>
              {episodeOutro.forced
                ? "Signal transmission cut"
                : "Signal transmission complete"}
            </span>
            <div className={styles.preRollLogo}>
              <SignalShowLogo show={selectedShow} />
            </div>
            <h1>{episodeOutro.showName}</h1>
            <p>{episodeOutro.forced ? "Cut by producer" : "End of episode"}</p>
            <small>Signal</small>
          </div>
          <button type="button" onClick={stopEpisodeOutro}>Skip outro</button>
        </section>
      ) : null}
      {renderLibrary()}
      <section
        className={styles.main}
        style={hostShowAccent
          ? {
              "--botcast-accent": hostShowAccent,
              "--botcast-host-accent": hostShowAccent,
            } as CSSProperties
          : undefined}
      >
        {!episode ? (
          <header className={styles.header}>
            <div>
              <span className={styles.eyebrow}>{replayEpisode ? "Episode replay" : "Host-owned shows"}</span>
              {selectedShow ? (
                <div className={styles.showTitleRow}>
                    <input
                      className={styles.showNameInput}
                      value={showNameDraft}
                      onChange={(event) => setShowNameDraft(event.target.value)}
                      onBlur={(event) => void renameShow(event.currentTarget.value)}
                      maxLength={80}
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
        ) : null}

        {error ? <div className={styles.error} role="alert">{error}</div> : null}
        {notice && !episode ? <div className={styles.notice} role="status">{notice}</div> : null}

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
                className={styles.cutShowButton}
                onClick={() => void cutShow()}
                disabled={episode.status === "completed" || cuttingShow}
                aria-label="Cut the live show immediately"
              >
                {cuttingShow ? "Cutting…" : "■ Cut show"}
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
            {episode.status === "live" ? (
              <div
                className={styles.liveCameraControls}
                aria-label="Signal live cameras"
                data-tutorial-target="botcast-live-camera"
              >
                <span>Camera</span>
                {(["left", "right", "wide", "auto"] as const).map((camera) => (
                  <button
                    key={camera}
                    type="button"
                    data-selected={liveCameraMode === camera ? "true" : undefined}
                    onClick={() => void selectLiveCameraMode(camera)}
                    disabled={cameraSaving}
                    aria-pressed={liveCameraMode === camera}
                  >
                    {camera[0]!.toUpperCase() + camera.slice(1)}
                  </button>
                ))}
              </div>
            ) : null}
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
                <span className={styles.eyebrow}>Producer cue cards</span>
                <label>
                  Ask about…
                  <div>
                    <input value={askAboutDraft} onChange={(event) => setAskAboutDraft(event.target.value)} placeholder="a specific detail" />
                    <button
                      type="button"
                      disabled={!producerCueAvailable || !askAboutDraft.trim()}
                      onClick={() => {
                        sendCue({ kind: "ask_about", detail: askAboutDraft.trim() });
                        setAskAboutDraft("");
                      }}
                    >Send</button>
                  </div>
                </label>
                <div className={styles.cueGrid}>
                  <button type="button" data-queued={queuedProducerCue?.kind === "press_harder" ? "true" : undefined} disabled={!producerCueAvailable} onClick={() => sendCue({ kind: "press_harder" })}>Press harder</button>
                  <button type="button" data-queued={queuedProducerCue?.kind === "move_on" ? "true" : undefined} disabled={!producerCueAvailable} onClick={() => sendCue({ kind: "move_on" })}>Move on</button>
                  <button type="button" data-queued={queuedProducerCue?.kind === "lighten_up" ? "true" : undefined} disabled={!producerCueAvailable} onClick={() => sendCue({ kind: "lighten_up" })}>Lighten up</button>
                  <button type="button" data-queued={queuedProducerCue?.kind === "wrap_up" ? "true" : undefined} disabled={!producerCueAvailable} onClick={() => sendCue({ kind: "wrap_up" })}>Wrap it up</button>
                </div>
                {queuedProducerCue ? (
                  <p className={styles.queuedCueStatus} role="status">
                    Queued: {signalProducerCueLabel(queuedProducerCue)}. The host will use it on their next turn.
                  </p>
                ) : null}
                <small>Host-only cues queue for the host’s next turn and stay private. Episode cues such as Wrap it up guide both bots, but are never spoken or attributed to you.</small>
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
            <div className={styles.replayControls} aria-label="Signal replay playback">
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
              data-identity-settings-open={showIdentityControlsExpanded ? "true" : undefined}
              data-tutorial-target="botcast-brand-controls"
              style={
                {
                  "--botcast-accent": hostShowAccent ?? selectedShow.accentColor,
                  "--botcast-host-accent": hostShowAccent ?? selectedShow.accentColor,
                  "--botcast-show-accent": selectedShow.accentColor,
                  "--botcast-studio-accent": hostShowAccent ?? selectedShow.accentColor,
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
                <div className={styles.showBrandIdentity}>
                  <span className={styles.eyebrow}>Show identity</span>
                  <h2>{selectedShow.name}</h2>
                  <p>{hostBot?.name ?? "Host"}</p>
                  {showAudience ? (
                    <section
                      className={styles.showAudiencePulse}
                      data-tutorial-target="botcast-audience-pulse"
                      aria-label="Signal audience pulse"
                    >
                      <span className={styles.showAudienceTitle}>Audience pulse</span>
                      <div className={styles.showAudienceMetrics} role="list">
                        <span className={styles.showAudienceMetric} role="listitem">
                          <small>Views</small>
                          <strong>{formatSignalAudienceViews(showAudience.totalViews)}</strong>
                        </span>
                        <span className={styles.showAudienceMetric} role="listitem">
                          <small>Rating</small>
                          <strong
                            aria-label={showAudience.rating === null
                              ? "No audience rating yet"
                              : `${showAudience.rating.toFixed(1)} out of 5`}
                          >
                            {showAudience.rating === null ? (
                              "—"
                            ) : (
                              <>
                                {showAudience.rating.toFixed(1)}
                                <span className={styles.showAudienceRatingStar} aria-hidden="true">★</span>
                              </>
                            )}
                          </strong>
                        </span>
                        <span className={styles.showAudienceMetric} role="listitem">
                          <small>Reviews</small>
                          <strong>{showAudience.reviewCount.toLocaleString("en-US")}</strong>
                        </span>
                      </div>
                      {showAudience.featuredReview ? (
                        <blockquote className={styles.showAudienceQuote}>
                          <p>“{showAudience.featuredReview.quote}”</p>
                          <cite>{showAudience.featuredReview.listener}</cite>
                        </blockquote>
                      ) : (
                        <p className={styles.showAudienceEmpty}>
                          Release an episode to start building an audience.
                        </p>
                      )}
                    </section>
                  ) : null}
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
                    id={`signal-show-identity-controls-${selectedShow.id}`}
                    className={styles.showLookControls}
                    aria-label="Show identity controls"
                    hidden={!showIdentityControlsExpanded}
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
                    <small>Refresh the linked studio pair, tune the name and logo, or shape the opening ident.</small>
                    <div className={styles.showLookControlGrid}>
                      <div className={styles.showLookControlGroup}>
                        <label htmlFor={`signal-show-name-${selectedShow.id}`}>Name</label>
                        <input
                          id={`signal-show-name-${selectedShow.id}`}
                          className={styles.showLookNameInput}
                          value={showNameDraft}
                          maxLength={80}
                          disabled={busy}
                          aria-label="Edit show name"
                          onChange={(event) => setShowNameDraft(event.target.value)}
                          onBlur={(event) => void renameShow(event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              void renameShow(event.currentTarget.value);
                              event.currentTarget.blur();
                            } else if (event.key === "Escape") {
                              setShowNameDraft(selectedShow.name);
                              event.currentTarget.blur();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={() => void renameShow()}
                          disabled={
                            busy ||
                            !showNameDraft.trim() ||
                            showNameDraft.trim() === selectedShow.name
                          }
                        >
                          Save name
                        </button>
                        <button
                          type="button"
                          data-signal-artwork-action="name"
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={() => void regenerateShowName()}
                          disabled={busy}
                        >
                          Regenerate name
                        </button>
                      </div>
                      <div className={styles.showLookControlGroup}>
                        <span>Studio pair</span>
                        <button
                          type="button"
                          data-signal-artwork-action="studio"
                          title="Regenerate the Dark studio and its source-linked Light variant"
                          onClick={() => void regenerateStudio()}
                          disabled={busy || selectedShowArtworkBusy}
                        >
                          Refresh studio
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
                      <div className={styles.showLookControlGroup}>
                        <span>Opening ident</span>
                        <button
                          type="button"
                          onClick={() => void generateShowIntroAudio()}
                          disabled={busy || preferredProvider === "local"}
                          title={preferredProvider === "local"
                            ? "Switch to Online to create an ElevenLabs intro"
                            : undefined}
                        >
                          {selectedShow.introAudio.source === "elevenlabs"
                            ? "Refresh with ElevenLabs"
                            : "Create with ElevenLabs"}
                        </button>
                        {selectedShow.introAudio.source === "elevenlabs" ? (
                          <button
                            type="button"
                            className={styles.showIntroLocalButton}
                            onClick={() => void selectLocalShowIntro()}
                            disabled={busy}
                          >
                            Use Signal Synth
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {hostBot ? (
                <div
                  className={styles.showCardHostPresence}
                  aria-label={`${hostBot.name}, show host`}
                  data-identity-settings-open={
                    showIdentityControlsExpanded ? "true" : undefined
                  }
                >
                  <div className={styles.showCardHostFloat} aria-hidden="true">
                    {renderAvatar?.(hostBot, {
                      talking: false,
                      thinking: false,
                      sipping: false,
                      role: "host",
                      mouthShape: "closed",
                    }) ?? avatarFallback(hostBot)}
                  </div>
                </div>
              ) : null}
              {showCardQuipIndex !== null &&
              showCardQuips &&
              !showIdentityControlsExpanded ? (
                <p
                  key={`${selectedShow.id}:${showCardQuipIndex}`}
                  className={styles.showCardQuipBubble}
                  aria-live="polite"
                >
                  “{showCardQuips[showCardQuipIndex]}”
                </p>
              ) : null}
              {showHasCustomArtwork(selectedShow) ? (
                <button
                  type="button"
                  className={styles.showIdentityGearButton}
                  data-expanded={showIdentityControlsExpanded ? "true" : undefined}
                  aria-label={showIdentityControlsExpanded
                    ? "Hide show identity settings"
                    : "Open show identity settings"}
                  aria-expanded={showIdentityControlsExpanded}
                  aria-controls={`signal-show-identity-controls-${selectedShow.id}`}
                  title={showIdentityControlsExpanded
                    ? "Hide show identity settings"
                    : "Tune this show’s identity"}
                  onClick={() => setShowIdentityControlsShowId((current) =>
                    current === selectedShow.id ? null : selectedShow.id
                  )}
                >
                  <span aria-hidden="true">⚙</span>
                </button>
              ) : null}
            </section>
            <section
              className={styles.showIntroControl}
              data-tutorial-target="botcast-intro-audio"
              aria-label="Signal episode intro"
            >
              <div className={styles.showIntroPulse} aria-hidden="true">
                <i /><i /><i /><i /><i />
              </div>
              <div>
                <span className={styles.eyebrow}>Opening ident</span>
                <h3>
                  {selectedShow.introAudio.source === "elevenlabs"
                    ? "ElevenLabs intro"
                    : "Signal Synth"}
                </h3>
                <p>
                  {selectedShow.introAudio.source === "elevenlabs"
                    ? "A cached six-second instrumental made for this show. No generation happens when an episode begins."
                    : "A private, deterministic synth motif made locally from the host’s persona. No key or network needed."}
                </p>
              </div>
              <div className={styles.showIntroActions}>
                <button
                  type="button"
                  className={styles.showIntroPreviewButton}
                  data-active={introPreviewShowId === selectedShow.id ? "true" : "false"}
                  aria-pressed={introPreviewShowId === selectedShow.id}
                  onClick={toggleShowIntroPreview}
                  disabled={
                    !introAudioEnabled ||
                    (busy && introPreviewShowId !== selectedShow.id)
                  }
                  title={!introAudioEnabled
                    ? "Turn voice audio on to preview the intro"
                    : undefined}
                >
                  {introPreviewShowId === selectedShow.id
                    ? "■ Stop preview"
                    : "▶ Play intro"}
                </button>
                {!showHasCustomArtwork(selectedShow) ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void generateShowIntroAudio()}
                      disabled={busy || preferredProvider === "local"}
                      title={preferredProvider === "local"
                        ? "Switch to Online to create an ElevenLabs intro"
                        : undefined}
                    >
                      {selectedShow.introAudio.source === "elevenlabs"
                        ? "Refresh with ElevenLabs"
                        : "Create with ElevenLabs"}
                    </button>
                    {selectedShow.introAudio.source === "elevenlabs" ? (
                      <button
                        type="button"
                        className={styles.showIntroLocalButton}
                        onClick={() => void selectLocalShowIntro()}
                        disabled={busy}
                      >
                        Use Signal Synth
                      </button>
                    ) : null}
                  </>
                ) : null}
                {!introAudioEnabled ? (
                  <small>Turn voice audio on to hear the intro preview.</small>
                ) : preferredProvider === "local" ? (
                  <small>Switch to Online only when you want to compose or refresh.</small>
                ) : null}
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

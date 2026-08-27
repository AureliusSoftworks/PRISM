import {
  botPowerResponseIsSilentV1,
  botcastCameraModeAt,
  botcastCameraShotAt,
  botcastAutoCoverageShotAt,
  botcastGuestHasDepartedAt,
  botcastHostHasDepartedAt,
  botcastListenerReactionForMessage,
  botcastMessageIsAudibleToAudienceV1,
  botcastReplayTimeline,
  resolveListenerReactionAtMs,
  type BotcastEpisode,
  type BotcastMessage,
  type ReplayManifestV2,
  type ReplaySceneSnapshotV2,
  type ReplayTimelineV1,
} from "@localai/shared";
import {
  signalLiveAutoCameraShot,
  type SignalDirectedCameraShot,
} from "./signalCameraTransition.ts";

export interface SignalReplayVideoFrameState {
  videoElapsedMs: number;
  eventElapsedMs: number;
  messageIndex: number;
  activeMessageIndexes: number[];
  messageStartMs: number;
  messageEndMs: number;
  shot: "left" | "right" | "wide";
  guestDeparted: boolean;
  hostDeparted: boolean;
}

export interface SignalFaithfulReplayCameraState {
  eventElapsedMs: number;
  shot: SignalDirectedCameraShot;
}

export interface SignalReplayCameraClockFrame {
  fromShot: SignalDirectedCameraShot;
  toShot: SignalDirectedCameraShot;
  progress: number;
  transitionStartedAtMs: number;
}

const SIGNAL_REPLAY_FALLBACK_END_CARD_MS = 2_000;
/** Reveal the studio before speech so the wide establishing shot can land. */
const SIGNAL_REPLAY_INTRO_TO_STUDIO_LEAD_MS = 1_800;
const SIGNAL_REPLAY_INTRO_MIN_VISIBLE_MS = 1_000;
export const SIGNAL_REPLAY_DEFAULT_INTRO_DURATION_MS = 8_750;
/** Logo dissolves into the studio over this window when the pad is long enough. */
export const SIGNAL_REPLAY_INTRO_LANDING_FADE_MS = 650;
/** Must match the live Signal camera move in botcast.module.css. */
export const SIGNAL_REPLAY_CAMERA_TRANSITION_MS = 900;

/**
 * True when a media-clock sample passed a saved semantic boundary. The replay
 * owner uses this to render immediately for cuts and speaker handoffs while
 * avoiding a full React reconciliation on every animation frame.
 */
export function signalReplayClockCrossedBoundary(args: {
  previousElapsedMs: number;
  elapsedMs: number;
  boundaryTimesMs: readonly number[];
}): boolean {
  const previous = Math.max(0, Math.round(args.previousElapsedMs));
  const elapsed = Math.max(0, Math.round(args.elapsedMs));
  if (elapsed < previous) return true;
  return args.boundaryTimesMs.some(
    (boundary) => boundary > previous && boundary <= elapsed,
  );
}

function signalDirectedCameraShot(
  value: unknown,
): SignalDirectedCameraShot | null {
  return value === "left" || value === "right" || value === "wide"
    ? value
    : null;
}

function cubicBezierCoordinate(
  t: number,
  firstControl: number,
  secondControl: number,
): number {
  const inverse = 1 - t;
  return (
    3 * inverse * inverse * t * firstControl +
    3 * inverse * t * t * secondControl +
    t * t * t
  );
}

/** Matches stageScene's cubic-bezier(.22, .72, .2, 1) camera easing. */
function signalReplayCameraEasedProgress(linearProgress: number): number {
  const targetX = Math.max(0, Math.min(1, linearProgress));
  let low = 0;
  let high = 1;
  let parameter = targetX;
  for (let iteration = 0; iteration < 16; iteration += 1) {
    parameter = (low + high) / 2;
    const sampledX = cubicBezierCoordinate(parameter, 0.22, 0.2);
    if (sampledX < targetX) low = parameter;
    else high = parameter;
  }
  return cubicBezierCoordinate(parameter, 0.72, 1);
}

/**
 * Reconstructs an animated camera move from the saved director timestamp.
 * The result is a pure function of the master clock, so a delayed render jumps
 * to the correct point in the move instead of starting a fresh 900 ms CSS
 * transition and permanently trailing the audio.
 */
export function signalReplayCameraClockFrame(args: {
  manifest: ReplayManifestV2;
  replayElapsedMs: number;
  transitionDurationMs?: number;
}): SignalReplayCameraClockFrame | null {
  const targetMs = Math.max(
    0,
    Number.isFinite(args.replayElapsedMs) ? args.replayElapsedMs : 0,
  );
  let current: ReplayManifestV2["direction"][number] | null = null;
  let previous: ReplayManifestV2["direction"][number] | null = null;
  const isAfter = (
    candidate: ReplayManifestV2["direction"][number],
    reference: ReplayManifestV2["direction"][number],
  ): boolean =>
    candidate.atMs > reference.atMs ||
    (candidate.atMs === reference.atMs && candidate.sequence > reference.sequence);
  for (const event of args.manifest.direction) {
    if (event.kind !== "camera" || event.atMs > targetMs) continue;
    if (!current || isAfter(event, current)) {
      previous = current;
      current = event;
    } else if (!previous || isAfter(event, previous)) {
      previous = event;
    }
  }
  const toShot = signalDirectedCameraShot(current?.payload.shot);
  if (!current || !toShot) return null;
  const fromShot =
    signalDirectedCameraShot(previous?.payload.shot) ??
    signalDirectedCameraShot(args.manifest.initialScene.camera) ??
    toShot;
  const durationMs = Math.max(
    1,
    Math.round(args.transitionDurationMs ?? SIGNAL_REPLAY_CAMERA_TRANSITION_MS),
  );
  const linearProgress =
    current.payload.transitionMode === "instant" || fromShot === toShot
      ? 1
      : Math.max(0, Math.min(1, (targetMs - current.atMs) / durationMs));
  return {
    fromShot,
    toShot,
    progress:
      linearProgress === 1
        ? 1
        : signalReplayCameraEasedProgress(linearProgress),
    transitionStartedAtMs: current.atMs,
  };
}

export type SignalReplayBookendState =
  | { kind: "intro"; startMs: number; endMs: number }
  | { kind: "outro"; startMs: number; endMs: number }
  | null;

function signalReplayFirstUtteranceStartMs(
  timeline: ReplayTimelineV1,
): number | null {
  const firstUtterance = timeline.beats
    .filter((beat) => beat.kind === "utterance")
    .sort((left, right) => left.startMs - right.startMs)[0];
  return firstUtterance ? firstUtterance.startMs : null;
}

/** Measured pre-speech span reserved for the replay's branded intro. */
export function signalReplayIntroDurationMs(
  timeline: ReplayTimelineV1 | null | undefined,
): number {
  if (!timeline) return 0;
  return Math.max(0, signalReplayFirstUtteranceStartMs(timeline) ?? 0);
}

/** Default card duration, bounded so short recordings remain seekable. */
export function signalReplayDefaultIntroDurationMs(
  timeline: ReplayTimelineV1 | null | undefined,
): number {
  if (!timeline) return SIGNAL_REPLAY_DEFAULT_INTRO_DURATION_MS;
  return Math.max(
    0,
    Math.min(
      timeline.durationMs,
      SIGNAL_REPLAY_DEFAULT_INTRO_DURATION_MS,
    ),
  );
}

/** Pull the branded card off early without wiping very short intros. */
export function signalReplayIntroVisualEndMs(
  startMs: number,
  endMs: number,
): number {
  if (endMs <= startMs) return endMs;
  const padMs = endMs - startMs;
  let leadMs = SIGNAL_REPLAY_INTRO_TO_STUDIO_LEAD_MS;
  let minVisibleMs = SIGNAL_REPLAY_INTRO_MIN_VISIBLE_MS;
  if (padMs < leadMs + minVisibleMs) {
    // Short pad: keep ~45% as quiet studio, the rest as the card.
    const studioMs = Math.max(0, Math.floor(padMs * 0.45));
    leadMs = studioMs;
    minVisibleMs = Math.max(1, padMs - studioMs);
  }
  const earlyEndMs = endMs - leadMs;
  const minEndMs = startMs + minVisibleMs;
  return Math.max(startMs + 1, Math.min(endMs, Math.max(minEndMs, earlyEndMs)));
}

/** Landing fade length clamped to the visible intro card. */
export function signalReplayIntroLandingFadeMs(
  bookend: {
    startMs: number;
    endMs: number;
  },
  fadeMs?: number,
): number {
  const visibleMs = Math.max(0, bookend.endMs - bookend.startMs);
  if (visibleMs <= 0) return 0;
  if (fadeMs !== undefined && Number.isFinite(fadeMs)) {
    return Math.min(visibleMs, Math.max(120, Math.round(fadeMs)));
  }
  return Math.min(
    SIGNAL_REPLAY_INTRO_LANDING_FADE_MS,
    Math.max(120, Math.floor(visibleMs * 0.4)),
  );
}

/** True while the intro card should dissolve into the wide studio. */
export function signalReplayIntroIsLanding(args: {
  bookend: SignalReplayBookendState;
  elapsedMs: number;
  fadeMs?: number;
}): boolean {
  if (!args.bookend || args.bookend.kind !== "intro") return false;
  const fadeMs = signalReplayIntroLandingFadeMs(args.bookend, args.fadeMs);
  if (fadeMs <= 0) return false;
  return (
    args.elapsedMs >= args.bookend.endMs - fadeMs &&
    args.elapsedMs < args.bookend.endMs
  );
}

/** Milliseconds remaining in the landing dissolve, or 0 outside that window. */
export function signalReplayIntroLandingRemainingMs(args: {
  bookend: SignalReplayBookendState;
  elapsedMs: number;
  fadeMs?: number;
}): number {
  if (!args.bookend || args.bookend.kind !== "intro") return 0;
  const fadeMs = signalReplayIntroLandingFadeMs(args.bookend, args.fadeMs);
  if (fadeMs <= 0) return 0;
  const landingStartMs = args.bookend.endMs - fadeMs;
  if (args.elapsedMs < landingStartMs || args.elapsedMs >= args.bookend.endMs) {
    return 0;
  }
  return Math.max(0, Math.round(args.bookend.endMs - args.elapsedMs));
}

function signalReplaySavedIntroDurationMs(
  timeline: ReplayTimelineV1,
  manifest: ReplayManifestV2 | null,
): number | null {
  const savedDurationMs = Number(
    manifest?.visual.metadata?.introPresentationDurationMs,
  );
  if (!Number.isFinite(savedDurationMs) || savedDurationMs <= 0) return null;
  return Math.min(timeline.durationMs, savedDurationMs);
}

/** Picture-only offset for an intro whose saved audio clock was compacted. */
export function signalReplayIntroVisualOffsetMs(args: {
  timeline: ReplayTimelineV1;
  manifest: ReplayManifestV2 | null;
}): number {
  const savedIntroDurationMs = signalReplaySavedIntroDurationMs(
    args.timeline,
    args.manifest,
  );
  const firstUtteranceStartMs = signalReplayFirstUtteranceStartMs(args.timeline);
  if (savedIntroDurationMs === null || firstUtteranceStartMs === null) {
    return 0;
  }
  const visualEndMs = signalReplayIntroVisualEndMs(0, savedIntroDurationMs);
  if (firstUtteranceStartMs >= visualEndMs) return 0;

  const landingFadeMs = signalReplayIntroLandingFadeMs({
    startMs: 0,
    endMs: visualEndMs,
  });
  const desiredVisualEndAtAudioMs = Math.max(
    landingFadeMs,
    firstUtteranceStartMs - SIGNAL_REPLAY_INTRO_TO_STUDIO_LEAD_MS,
  );
  return Math.max(0, visualEndMs - desiredVisualEndAtAudioMs);
}

/**
 * Advance only a replay's intro picture. An explicit calibration offset lets
 * the developer line it up while the audio, event, and seek clocks stay exact.
 */
export function signalReplayIntroVisualElapsedMs(args: {
  timeline: ReplayTimelineV1;
  manifest: ReplayManifestV2 | null;
  replayElapsedMs: number;
  visualOffsetMs?: number;
}): number {
  const boundedElapsedMs = Math.max(
    0,
    Math.min(args.timeline.durationMs, args.replayElapsedMs),
  );
  const visualClockOffsetMs =
    args.visualOffsetMs === undefined
      ? signalReplayIntroVisualOffsetMs(args)
      : Math.max(0, Math.round(args.visualOffsetMs));
  return Math.min(
    args.timeline.durationMs,
    boundedElapsedMs + visualClockOffsetMs,
  );
}

/**
 * Faithful speech, captured speaker state, and baked mouth cues share the
 * recorded audio-master clock. The intro card may animate independently as an
 * overlay, but it must never translate the captured performance underneath.
 */
export function signalReplayCapturedPresentationElapsedMs(args: {
  timeline: ReplayTimelineV1;
  replayElapsedMs: number;
}): number {
  return Math.max(
    0,
    Math.min(args.timeline.durationMs, args.replayElapsedMs),
  );
}

/** Default branded-card window on the picture clock. */
export function signalReplayIntroBounds(
  timeline: ReplayTimelineV1,
  manifest: ReplayManifestV2 | null,
): { startMs: number; endMs: number } | null {
  const title = timeline.beats.find(
    (beat) => beat.kind === "title" && beat.endMs > beat.startMs,
  );
  if (title) {
    const savedIntroDurationMs = signalReplaySavedIntroDurationMs(
      timeline,
      manifest,
    );
    return {
      startMs: title.startMs,
      endMs: signalReplayIntroVisualEndMs(
        title.startMs,
        Math.max(title.endMs, savedIntroDurationMs ?? 0),
      ),
    };
  }

  const savedIntroDurationMs = signalReplaySavedIntroDurationMs(
    timeline,
    manifest,
  );
  if (savedIntroDurationMs !== null) {
    return {
      startMs: 0,
      endMs: signalReplayIntroVisualEndMs(0, savedIntroDurationMs),
    };
  }

  const firstUtteranceStartMs = signalReplayFirstUtteranceStartMs(timeline);
  if (firstUtteranceStartMs !== null && firstUtteranceStartMs > 0) {
    return {
      startMs: 0,
      endMs: signalReplayIntroVisualEndMs(0, firstUtteranceStartMs),
    };
  }
  return null;
}

function signalReplayOutroBounds(
  timeline: ReplayTimelineV1,
  manifest: ReplayManifestV2 | null,
): { startMs: number; endMs: number } | null {
  const end = timeline.beats.find(
    (beat) => beat.kind === "end" && beat.endMs > beat.startMs,
  );
  if (end) return { startMs: end.startMs, endMs: end.endMs };

  const savedOutro = manifest?.direction
    .filter(
      (event) => event.kind === "outro" && event.payload.active !== false,
    )
    .sort((left, right) => left.atMs - right.atMs)[0];
  if (savedOutro && savedOutro.atMs < timeline.durationMs) {
    return {
      startMs: savedOutro.atMs,
      endMs: Math.max(
        savedOutro.atMs + 1,
        Math.min(timeline.durationMs, savedOutro.endMs ?? timeline.durationMs),
      ),
    };
  }

  const lastUtteranceEndMs = Math.max(
    0,
    ...timeline.beats
      .filter((beat) => beat.kind === "utterance")
      .map((beat) => beat.endMs),
  );
  const fallbackStartMs = Math.max(
    lastUtteranceEndMs,
    timeline.durationMs - SIGNAL_REPLAY_FALLBACK_END_CARD_MS,
  );
  return fallbackStartMs < timeline.durationMs
    ? { startMs: fallbackStartMs, endMs: timeline.durationMs }
    : null;
}

/** Solid card time before the dissolve into wide begins. */
export function signalReplayIntroCardHoldMs(
  bookend: {
    startMs: number;
    endMs: number;
  },
  fadeMs?: number,
): number {
  const landingFadeMs = signalReplayIntroLandingFadeMs(bookend, fadeMs);
  return Math.max(0, bookend.endMs - bookend.startMs - landingFadeMs);
}

export function signalReplayBookendAt(
  timeline: ReplayTimelineV1,
  elapsedMs: number,
  manifest: ReplayManifestV2 | null = null,
  options: { introEndMs?: number } = {},
): SignalReplayBookendState {
  const boundedElapsedMs = Math.max(
    0,
    Math.min(timeline.durationMs, elapsedMs),
  );
  const defaultIntro = signalReplayIntroBounds(timeline, manifest);
  const intro = defaultIntro
    ? {
        ...defaultIntro,
        endMs:
          options.introEndMs === undefined
            ? defaultIntro.endMs
            : Math.max(
                defaultIntro.startMs + 1,
                Math.min(timeline.durationMs, Math.round(options.introEndMs)),
              ),
      }
    : null;
  if (
    intro &&
    boundedElapsedMs >= intro.startMs &&
    boundedElapsedMs < intro.endMs
  ) {
    return { kind: "intro", ...intro };
  }
  const outro = signalReplayOutroBounds(timeline, manifest);
  if (
    outro &&
    boundedElapsedMs >= outro.startMs &&
    boundedElapsedMs <= outro.endMs
  ) {
    return { kind: "outro", ...outro };
  }
  return null;
}

function videoContentBounds(timeline: ReplayTimelineV1): {
  startMs: number;
  endMs: number;
} {
  const utterances = timeline.beats.filter((beat) => beat.kind === "utterance");
  const endBeat = timeline.beats.find((beat) => beat.kind === "end");
  return {
    startMs: utterances.at(0)?.startMs ?? 0,
    endMs: endBeat?.startMs ?? timeline.durationMs,
  };
}

/** Maps faithful replay time back onto Signal's persisted event clock. */
export function signalReplayEventElapsedMs(args: {
  episode: BotcastEpisode;
  timeline: ReplayTimelineV1;
  replayElapsedMs: number;
}): number {
  const bounds = videoContentBounds(args.timeline);
  const directorTimeline = botcastReplayTimeline(
    args.episode.messages,
    args.episode.events,
  );
  const persistedRuntimeMs =
    args.episode.runtimeMs ??
    Date.parse(args.episode.completedAt ?? args.episode.updatedAt) -
      Date.parse(args.episode.startedAt);
  const runtimeMs = Math.max(
    1,
    Number.isFinite(persistedRuntimeMs)
      ? persistedRuntimeMs
      : directorTimeline.durationMs,
  );
  if (args.replayElapsedMs <= bounds.startMs) return 0;
  if (args.replayElapsedMs >= bounds.endMs) return runtimeMs;
  const utterances = args.timeline.beats.filter(
    (beat) => beat.kind === "utterance",
  );
  const activeBeat = utterances.find(
    (beat) =>
      args.replayElapsedMs >= beat.startMs &&
      args.replayElapsedMs < beat.endMs,
  );
  if (activeBeat?.sourceMessageId) {
    const messageIndex = args.episode.messages.findIndex(
      (message) => message.id === activeBeat.sourceMessageId,
    );
    if (messageIndex >= 0) {
      const originalStartMs =
        directorTimeline.messageStartMs[messageIndex] ?? 0;
      const originalEndMs =
        directorTimeline.messageEndMs[messageIndex] ?? originalStartMs;
      const progress =
        (args.replayElapsedMs - activeBeat.startMs) /
        Math.max(1, activeBeat.endMs - activeBeat.startMs);
      return Math.max(
        0,
        Math.min(
          runtimeMs,
          originalStartMs + (originalEndMs - originalStartMs) * progress,
        ),
      );
    }
  }
  let previousBeat: (typeof utterances)[number] | undefined;
  for (const beat of utterances) {
    if (beat.endMs <= args.replayElapsedMs) previousBeat = beat;
  }
  const nextBeat = utterances.find(
    (beat) => beat.startMs > args.replayElapsedMs,
  );
  const originalBoundary = (
    beat: (typeof utterances)[number] | undefined,
    edge: "start" | "end",
  ): number | null => {
    if (!beat?.sourceMessageId) return null;
    const index = args.episode.messages.findIndex(
      (message) => message.id === beat.sourceMessageId,
    );
    if (index < 0) return null;
    return edge === "start"
      ? (directorTimeline.messageStartMs[index] ?? null)
      : (directorTimeline.messageEndMs[index] ?? null);
  };
  const originalStartMs = originalBoundary(previousBeat, "end") ?? 0;
  const originalEndMs = originalBoundary(nextBeat, "start") ?? runtimeMs;
  const videoStartMs = previousBeat?.endMs ?? bounds.startMs;
  const videoEndMs = nextBeat?.startMs ?? bounds.endMs;
  const progress =
    (args.replayElapsedMs - videoStartMs) /
    Math.max(1, videoEndMs - videoStartMs);
  return Math.max(
    0,
    Math.min(
      runtimeMs,
      originalStartMs + (originalEndMs - originalStartMs) * progress,
    ),
  );
}

/** Backwards-compatible video-renderer wrapper for the shared replay mapper. */
export function signalReplayVideoEventElapsedMs(args: {
  episode: BotcastEpisode;
  timeline: ReplayTimelineV1;
  videoElapsedMs: number;
}): number {
  return signalReplayEventElapsedMs({
    episode: args.episode,
    timeline: args.timeline,
    replayElapsedMs: args.videoElapsedMs,
  });
}

function replayParticipantIdForRole(
  episode: BotcastEpisode,
  role: "host" | "guest",
): string {
  if (role === "host") return episode.hostBotId;
  return episode.guestKind === "producer"
    ? "prism-player"
    : episode.guestBotId;
}

/**
 * Rebuilds faithful Auto framing from the remapped production clock and the
 * audio-clock speech/thinking state. Fixed camera modes remain untouched.
 */
export function signalFaithfulReplayCameraState(args: {
  episode: BotcastEpisode;
  timeline: ReplayTimelineV1;
  replayElapsedMs: number;
  scene: ReplaySceneSnapshotV2 | null;
  activeMessage: BotcastMessage | null;
  preferDirectedCamera?: boolean;
}): SignalFaithfulReplayCameraState {
  const eventElapsedMs = signalReplayEventElapsedMs(args);
  const directedCamera = args.scene?.camera;
  if (
    args.preferDirectedCamera &&
    (directedCamera === "left" ||
      directedCamera === "right" ||
      directedCamera === "wide")
  ) {
    return { eventElapsedMs, shot: directedCamera };
  }
  const baseShot = botcastCameraShotAt({
    events: args.episode.events,
    elapsedMs: eventElapsedMs,
  });
  const cameraMode = botcastCameraModeAt({
    events: args.episode.events,
    elapsedMs: eventElapsedMs,
  });
  if (cameraMode !== "auto") {
    return { eventElapsedMs, shot: baseShot };
  }

  // Establishing look: stay wide through the intro pad until speech begins.
  const firstUtteranceStartMs = signalReplayFirstUtteranceStartMs(args.timeline);
  if (
    firstUtteranceStartMs !== null &&
    args.replayElapsedMs < firstUtteranceStartMs
  ) {
    return { eventElapsedMs, shot: "wide" };
  }

  const activeMessage = args.activeMessage;
  const speakerParticipant = activeMessage
    ? args.scene?.participants[
        replayParticipantIdForRole(args.episode, activeMessage.speakerRole)
      ]
    : null;
  const hostParticipant = args.scene?.participants[args.episode.hostBotId];
  const guestParticipant =
    args.scene?.participants[
      replayParticipantIdForRole(args.episode, "guest")
    ];
  // Match live direction: only simultaneous active audible playback is
  // crosstalk. Plans and inactive scene state cannot manufacture a Wide.
  const audibleVoiceOverlap = Boolean(
    hostParticipant?.speaking === true &&
      hostParticipant.audible !== false &&
      guestParticipant?.speaking === true &&
      guestParticipant.audible !== false,
  );
  const speakingShot =
    activeMessage &&
    speakerParticipant?.speaking === true &&
    speakerParticipant.audible !== false &&
    botcastMessageIsAudibleToAudienceV1(activeMessage) &&
    !botPowerResponseIsSilentV1(activeMessage.content)
      ? activeMessage.speakerRole === "host"
        ? "left"
        : "right"
      : null;
  const hostThinking =
    args.scene?.participants[args.episode.hostBotId]?.thinking === true;
  const guestThinking =
    args.scene?.participants[
      replayParticipantIdForRole(args.episode, "guest")
    ]?.thinking === true;

  return {
    eventElapsedMs,
    shot: signalLiveAutoCameraShot({
      baseShot,
      audibleVoiceOverlap,
      speakingShot,
      coverageShot: speakingShot
        ? botcastAutoCoverageShotAt({
            events: args.episode.events,
            elapsedMs: eventElapsedMs,
          })
        : null,
      botThinking:
        hostThinking ||
        (args.episode.guestKind !== "producer" && guestThinking),
      producerGuestThinking:
        args.episode.guestKind === "producer" && guestThinking,
    }),
  };
}

/**
 * Produces the exact stage state needed by the hidden faithful-video renderer.
 * Speech follows the frozen replay-audio timeline while cameras and departures
 * follow the persisted Signal production clock.
 */
export function signalReplayVideoFrameState(args: {
  episode: BotcastEpisode;
  timeline: ReplayTimelineV1;
  videoElapsedMs: number;
}): SignalReplayVideoFrameState {
  const videoElapsedMs = Math.max(
    0,
    Math.min(args.timeline.durationMs, args.videoElapsedMs),
  );
  const eventElapsedMs = signalReplayVideoEventElapsedMs({
    ...args,
    videoElapsedMs,
  });
  const activeBeats = args.timeline.beats.filter(
    (beat) =>
      beat.kind === "utterance" &&
      videoElapsedMs >= beat.startMs &&
      videoElapsedMs < beat.endMs,
  );
  const activeMessageIndexes = args.episode.messages.flatMap((message, index) =>
    activeBeats.some((beat) => beat.sourceMessageId === message.id) ? [index] : [],
  );
  const primaryBeat =
    activeBeats.find((beat) => beat.channel !== "crosstalk") ??
    activeBeats.at(-1) ??
    null;
  const messageIndex = primaryBeat?.sourceMessageId
    ? args.episode.messages.findIndex(
        (message) => message.id === primaryBeat.sourceMessageId,
      )
    : -1;
  const activeMessage =
    messageIndex >= 0 ? (args.episode.messages[messageIndex] ?? null) : null;
  const messageStartMs = primaryBeat?.startMs ?? videoElapsedMs;
  const messageEndMs = primaryBeat?.endMs ?? videoElapsedMs + 1;
  const baseShot = botcastCameraShotAt({
    events: args.episode.events,
    elapsedMs: eventElapsedMs,
  });
  const listenerReactionPlan = activeMessage
    ? botcastListenerReactionForMessage(args.episode.events, activeMessage.id)
    : null;
  const reactionAtMs =
    activeMessage && listenerReactionPlan
      ? resolveListenerReactionAtMs({
          text: activeMessage.content,
          durationMs: Math.max(1, messageEndMs - messageStartMs),
          targetProgress: listenerReactionPlan.targetProgress,
        })
      : null;
  const reactionCameraActive = Boolean(
    activeMessage &&
      listenerReactionPlan?.cameraCutEligible &&
      reactionAtMs !== null &&
      botcastCameraModeAt({
        events: args.episode.events,
        elapsedMs: eventElapsedMs,
      }) === "auto" &&
      videoElapsedMs - messageStartMs >= reactionAtMs &&
      videoElapsedMs - messageStartMs <= reactionAtMs + 1_200,
  );
  const shot = reactionCameraActive
    ? listenerReactionPlan?.listenerBotId === args.episode.hostBotId
      ? "left"
      : "right"
    : baseShot;
  return {
    videoElapsedMs,
    eventElapsedMs,
    messageIndex,
    activeMessageIndexes,
    messageStartMs,
    messageEndMs,
    shot,
    guestDeparted: botcastGuestHasDepartedAt(
      args.episode.events,
      eventElapsedMs,
    ),
    hostDeparted: botcastHostHasDepartedAt(
      args.episode.events,
      eventElapsedMs,
    ),
  };
}

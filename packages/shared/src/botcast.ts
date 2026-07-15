export type BotcastEpisodeSegment = "opening" | "interview" | "closing";
export type BotcastEpisodeStatus = "live" | "completed";
export type BotcastEpisodeOutcome = "completed" | "guest_departed";
export type BotcastSpeakerRole = "host" | "guest";
export type BotcastProducerCueKind =
  | "ask_about"
  | "press_harder"
  | "move_on"
  | "lighten_up";
export type BotcastTensionStage = "calm" | "resistance" | "warning" | "departed";
export type BotcastCameraShot = "auto" | "left" | "right" | "wide";
export type BotcastDirectedCameraShot = Exclude<BotcastCameraShot, "auto">;

export interface BotcastAtmosphereState {
  seed: string;
  prompt: string;
  imageUrl: string | null;
  imageId: string | null;
  revision: number;
  status: "fallback" | "ready" | "failed";
}

export type BotcastLogoGlyph =
  | "frequency"
  | "orbit"
  | "aperture"
  | "spark"
  | "monogram";

export interface BotcastLogoState {
  seed: string;
  prompt: string;
  imageUrl: string | null;
  imageId: string | null;
  revision: number;
  status: "fallback" | "ready" | "failed";
  fallbackGlyph: BotcastLogoGlyph;
}

export interface BotcastShow {
  id: string;
  hostBotId: string;
  name: string;
  premise: string;
  hostingStyle: string;
  accentColor: string;
  atmosphere: BotcastAtmosphereState;
  logo: BotcastLogoState;
  createdAt: string;
  updatedAt: string;
  episodeCount: number;
}

export interface BotcastMessage {
  id: string;
  episodeId: string;
  speakerRole: BotcastSpeakerRole;
  botId: string;
  content: string;
  createdAt: string;
}

export interface BotcastSegmentRecord {
  id: string;
  episodeId: string;
  segment: BotcastEpisodeSegment;
  ordinal: number;
  startedAt: string;
  endedAt: string | null;
}

export interface BotcastProducerCue {
  kind: BotcastProducerCueKind;
  detail?: string;
}

export type BotcastReplayEventKind =
  | "segment"
  | "producer_cue"
  | "utterance"
  | "tension"
  | "warning"
  | "departure"
  | "camera_suggestion"
  | "episode_completed";

export interface BotcastReplayEvent {
  id: string;
  episodeId: string;
  sequence: number;
  kind: BotcastReplayEventKind;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface BotcastCameraSuggestion {
  shot: BotcastDirectedCameraShot;
  reason:
    | "opening"
    | "speaker"
    | "listener_reaction"
    | "transition"
    | "tension"
    | "departure"
    | "empty_chair"
    | "closing";
  atMs: number;
  minimumHoldMs: number;
}

export interface BotcastEpisodeSummary {
  id: string;
  showId: string;
  showName: string;
  title: string;
  hostBotId: string;
  guestBotId: string;
  topic: string;
  status: BotcastEpisodeStatus;
  segment: BotcastEpisodeSegment;
  outcome: BotcastEpisodeOutcome | null;
  tensionStage: BotcastTensionStage;
  warningCount: number;
  startedAt: string;
  completedAt: string | null;
  runtimeMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BotcastEpisode extends BotcastEpisodeSummary {
  producerBrief: string;
  messages: BotcastMessage[];
  segments: BotcastSegmentRecord[];
  events: BotcastReplayEvent[];
}

export interface BotcastShowCreateRequest {
  hostBotId: string;
  name?: string;
  premise?: string;
  hostingStyle?: string;
}

export interface BotcastShowPatchRequest {
  name?: string;
  premise?: string;
  hostingStyle?: string;
  atmosphereImageUrl?: string | null;
  atmosphereImageId?: string | null;
  regenerateAtmosphere?: boolean;
  logoImageUrl?: string | null;
  logoImageId?: string | null;
  regenerateLogo?: boolean;
}

export interface BotcastEpisodeCreateRequest {
  guestBotId: string;
  topic: string;
  producerBrief?: string;
}

export interface BotcastEpisodeAdvanceRequest {
  cue?: BotcastProducerCue;
}

export interface BotcastEpisodeAdvanceResponse {
  episode: BotcastEpisode;
  message: BotcastMessage | null;
}

export interface BotcastTensionState {
  level: 0 | 1 | 2 | 3;
  warningCount: number;
  stage: BotcastTensionStage;
}

export const BOTCAST_DIRECTOR_MIN_SHOT_MS = 3_200;
export const BOTCAST_DIRECTOR_HYSTERESIS_MS = 1_100;

export function botcastTensionStageForLevel(level: number): BotcastTensionStage {
  if (level >= 3) return "departed";
  if (level >= 2) return "warning";
  if (level >= 1) return "resistance";
  return "calm";
}

export function applyBotcastProducerCueToTension(
  current: BotcastTensionState,
  cue: BotcastProducerCue,
): BotcastTensionState {
  const boundaryLanguage =
    cue.kind === "ask_about" &&
    /\b(trauma|abuse|crime|death|family|secret|scandal|failure|fear|regret)\b/iu.test(
      cue.detail ?? "",
    );
  const delta =
    cue.kind === "press_harder" || boundaryLanguage
      ? 1
      : cue.kind === "move_on" || cue.kind === "lighten_up"
        ? -1
        : 0;
  const level = Math.max(0, Math.min(3, current.level + delta)) as 0 | 1 | 2 | 3;
  const enteredWarning = current.level < 2 && level >= 2;
  return {
    level,
    warningCount: current.warningCount + (enteredWarning ? 1 : 0),
    stage: botcastTensionStageForLevel(level),
  };
}

export function botcastGuestDepartureEligible(state: BotcastTensionState): boolean {
  return state.level >= 3 && state.warningCount >= 1;
}

export function botcastSegmentForTurn(args: {
  current: BotcastEpisodeSegment;
  utteranceCount: number;
  guestDeparted: boolean;
}): BotcastEpisodeSegment {
  if (args.guestDeparted) return "closing";
  if (args.current === "opening" && args.utteranceCount >= 2) return "interview";
  if (args.current === "interview" && args.utteranceCount >= 10) return "closing";
  return args.current;
}

export function botcastNextSpeakerRole(args: {
  messages: readonly Pick<BotcastMessage, "speakerRole">[];
  segment: BotcastEpisodeSegment;
  guestDeparted: boolean;
}): BotcastSpeakerRole | null {
  if (args.guestDeparted) {
    return args.messages.at(-1)?.speakerRole === "host" ? null : "host";
  }
  if (args.messages.length === 0) return "host";
  if (args.segment === "closing" && args.messages.at(-1)?.speakerRole === "host") {
    return null;
  }
  return args.messages.at(-1)?.speakerRole === "host" ? "guest" : "host";
}

export function botcastDirectorSuggestion(args: {
  previous?: BotcastCameraSuggestion | null;
  atMs: number;
  speakerRole?: BotcastSpeakerRole | null;
  utteranceDurationMs?: number;
  segment: BotcastEpisodeSegment;
  event?: "utterance" | "transition" | "tension" | "departure" | "empty_chair";
}): BotcastCameraSuggestion {
  const event = args.event ?? "utterance";
  let shot: BotcastDirectedCameraShot;
  let reason: BotcastCameraSuggestion["reason"];
  if (event === "departure") {
    shot = "wide";
    reason = "departure";
  } else if (event === "empty_chair") {
    shot = "wide";
    reason = "empty_chair";
  } else if (event === "transition") {
    shot = "wide";
    reason = "transition";
  } else if (event === "tension") {
    shot = "wide";
    reason = "tension";
  } else if (args.segment === "opening") {
    shot = "wide";
    reason = "opening";
  } else if (args.segment === "closing" && args.speakerRole === "host") {
    shot = "left";
    reason = "closing";
  } else {
    shot = args.speakerRole === "guest" ? "right" : "left";
    reason = "speaker";
  }

  const previous = args.previous;
  const heldMs = previous ? args.atMs - previous.atMs : Number.POSITIVE_INFINITY;
  const shortUtterance = (args.utteranceDurationMs ?? 0) < BOTCAST_DIRECTOR_HYSTERESIS_MS;
  if (
    previous &&
    shot !== previous.shot &&
    event === "utterance" &&
    (heldMs < previous.minimumHoldMs || shortUtterance)
  ) {
    return previous;
  }
  return {
    shot,
    reason,
    atMs: Math.max(0, Math.round(args.atMs)),
    minimumHoldMs: BOTCAST_DIRECTOR_MIN_SHOT_MS,
  };
}

export function botcastCameraShotAt(args: {
  events: readonly BotcastReplayEvent[];
  elapsedMs: number;
  manualShot: BotcastCameraShot;
}): BotcastDirectedCameraShot {
  if (args.manualShot !== "auto") return args.manualShot;
  let shot: BotcastDirectedCameraShot = "wide";
  for (const event of args.events) {
    if (event.kind !== "camera_suggestion") continue;
    const atMs = Number(event.payload.atMs);
    const candidate = event.payload.shot;
    if (Number.isFinite(atMs) && atMs <= args.elapsedMs) {
      if (candidate === "left" || candidate === "right" || candidate === "wide") {
        shot = candidate;
      }
    }
  }
  return shot;
}

export function botcastGuestHasDepartedAt(
  events: readonly BotcastReplayEvent[],
  elapsedMs: number,
): boolean {
  if (!events.some((event) => event.kind === "departure")) return false;
  const departureShot = events.find(
    (event) =>
      event.kind === "camera_suggestion" && event.payload.reason === "departure",
  );
  const departureAtMs = Number(departureShot?.payload.atMs);
  return Number.isFinite(departureAtMs) && elapsedMs >= departureAtMs;
}

export function botcastReplayTimeline(
  messages: readonly Pick<BotcastMessage, "content">[],
  events: readonly BotcastReplayEvent[],
): { durationMs: number; messageStartMs: number[] } {
  let cursorMs = 0;
  const messageStartMs = messages.map((message) => {
    const startMs = cursorMs;
    const wordCount = message.content.split(/\s+/u).filter(Boolean).length;
    cursorMs += Math.max(BOTCAST_DIRECTOR_MIN_SHOT_MS, wordCount * 310);
    return startMs;
  });
  const directorEndMs = events.reduce((latest, event) => {
    if (event.kind !== "camera_suggestion") return latest;
    const atMs = Number(event.payload.atMs);
    const minimumHoldMs = Number(event.payload.minimumHoldMs);
    if (!Number.isFinite(atMs)) return latest;
    return Math.max(
      latest,
      atMs + (Number.isFinite(minimumHoldMs) ? minimumHoldMs : BOTCAST_DIRECTOR_MIN_SHOT_MS),
    );
  }, 0);
  return {
    durationMs: Math.max(8_000, cursorMs + 3_500, directorEndMs),
    messageStartMs,
  };
}

export function botcastReplayMessageIndexAt(
  messageStartMs: readonly number[],
  elapsedMs: number,
): number {
  if (messageStartMs.length === 0) return -1;
  let activeIndex = 0;
  for (let index = 1; index < messageStartMs.length; index += 1) {
    if (messageStartMs[index]! > elapsedMs) break;
    activeIndex = index;
  }
  return activeIndex;
}

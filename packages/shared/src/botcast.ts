import type { VoiceDeliveryMood } from "./audioVoice.js";
import type { ListenerReactionPlanV1 } from "./listenerReaction.js";

export type BotcastEpisodeSegment = "opening" | "interview" | "closing";
export type BotcastEpisodeStatus = "live" | "completed";
export type BotcastEpisodeOutcome = "completed" | "guest_departed";
export type BotcastEpisodeProvider = "local" | "openai" | "anthropic";
export type BotcastEpisodeResponseMode = "local" | "auto" | "online";
export type BotcastSpeakerRole = "host" | "guest";
export type BotcastGuestPresenceMode = "present" | "audience_only";
export type BotcastSessionDurationMinutes = number;
export const BOTCAST_SESSION_DURATION_MINUTES_MIN = 3;
export const BOTCAST_SESSION_DURATION_MINUTES_MAX = 30;
export const BOTCAST_SESSION_DURATION_MINUTES_STEP = 1;
export const BOTCAST_AUTO_MIN_EXCHANGES = 3;
export const BOTCAST_AUTO_MAX_EXCHANGES = 60;
export const BOTCAST_TIMED_MAX_UTTERANCES = 120;
export const BOTCAST_LOCAL_INTRO_DURATION_MS = 5_600;
export const BOTCAST_ELEVENLABS_INTRO_DURATION_MS = 6_000;
export const BOTCAST_DASHBOARD_BLURB_FALLBACKS = [
  "Episode 4: Now with 12% more dramatic pause.",
  "Guest chair's open. Bring me someone interesting",
] as const;
export const BOTCAST_IMMERSIVE_VOICE_TAGS = [
  "sighs",
  "exhales",
  "laughs",
  "chuckles",
  "coughs",
  "clears throat",
  "gasps",
  "gulps",
  "breathes deeply",
  "growls",
] as const;
export type BotcastImmersiveVoiceTag =
  (typeof BOTCAST_IMMERSIVE_VOICE_TAGS)[number];
export const BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS = [0, 1, 2] as const;
export type BotcastFallbackStudioAccentVariant =
  (typeof BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS)[number];

export function isBotcastFallbackStudioAccentVariant(
  value: unknown,
): value is BotcastFallbackStudioAccentVariant {
  return (
    typeof value === "number" &&
    BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS.includes(
      value as BotcastFallbackStudioAccentVariant,
    )
  );
}

export function botcastFallbackStudioAccentVariantForSeed(
  seed: string,
): BotcastFallbackStudioAccentVariant {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS[
    (hash >>> 0) % BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS.length
  ]!;
}

export type BotcastProducerCueKind =
  "ask_about" | "press_harder" | "move_on" | "lighten_up" | "wrap_up";
export type BotcastTensionStage =
  "calm" | "resistance" | "warning" | "departed";
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

export interface BotcastStudioPoint {
  x: number;
  y: number;
}

export type BotcastStudioLayoutItem =
  "hostBot" | "guestBot" | "hostCup" | "guestCup";

export type BotcastStudioLayout = Record<
  BotcastStudioLayoutItem,
  BotcastStudioPoint
>;

export type BotcastVoiceLevelsByBotId = Record<string, number>;

export interface BotcastStudioAtmosphereMix {
  background: number;
  grain: number;
  foley: number;
}

export const BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX: Readonly<BotcastStudioAtmosphereMix> = {
  background: 0.16,
  grain: 0.005,
  foley: 1,
};
export const BOTCAST_STUDIO_ATMOSPHERE_MIX_RELATIVE_MAX = 2;

function normalizeBotcastStudioAtmosphereMixLevel(
  value: unknown,
  fallback: number,
  maximum: number,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Number(
    Math.max(
      0,
      Math.min(maximum, safe),
    ).toFixed(6),
  );
}

export function normalizeBotcastStudioAtmosphereMix(
  value: unknown,
  fallback: Readonly<BotcastStudioAtmosphereMix> =
    BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX,
): BotcastStudioAtmosphereMix {
  const container =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<BotcastStudioAtmosphereMix>)
      : {};
  return {
    background: normalizeBotcastStudioAtmosphereMixLevel(
      container.background,
      fallback.background,
      BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX.background *
        BOTCAST_STUDIO_ATMOSPHERE_MIX_RELATIVE_MAX,
    ),
    grain: normalizeBotcastStudioAtmosphereMixLevel(
      container.grain,
      fallback.grain,
      BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX.grain *
        BOTCAST_STUDIO_ATMOSPHERE_MIX_RELATIVE_MAX,
    ),
    foley: normalizeBotcastStudioAtmosphereMixLevel(
      container.foley,
      fallback.foley,
      BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX.foley *
        BOTCAST_STUDIO_ATMOSPHERE_MIX_RELATIVE_MAX,
    ),
  };
}

export const BOTCAST_VOICE_LEVEL_DEFAULT = 1;
export const BOTCAST_VOICE_LEVEL_MAX = 1.25;
export const BOTCAST_VOICE_LEVEL_STEP = 0.05;

export function normalizeBotcastVoiceLevel(
  value: unknown,
  fallback = BOTCAST_VOICE_LEVEL_DEFAULT,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Number(Math.max(0, Math.min(BOTCAST_VOICE_LEVEL_MAX, safe)).toFixed(2));
}

export function normalizeBotcastVoiceLevelsByBotId(
  value: unknown,
  fallback: Readonly<BotcastVoiceLevelsByBotId> = {},
): BotcastVoiceLevelsByBotId {
  const normalized = Object.fromEntries(
    Object.entries(fallback)
      .filter(([botId]) => botId.trim().length > 0)
      .slice(0, 100)
      .map(([botId, level]) => [botId, normalizeBotcastVoiceLevel(level)]),
  );
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return normalized;
  }
  for (const [rawBotId, rawLevel] of Object.entries(value).slice(0, 100)) {
    const botId = rawBotId.trim().slice(0, 128);
    if (!botId) continue;
    const parsed =
      typeof rawLevel === "number"
        ? rawLevel
        : typeof rawLevel === "string"
          ? Number(rawLevel)
          : Number.NaN;
    if (!Number.isFinite(parsed)) continue;
    normalized[botId] = normalizeBotcastVoiceLevel(parsed);
  }
  return normalized;
}

export function botcastVoiceLevelForBot(
  levels: Readonly<BotcastVoiceLevelsByBotId> | null | undefined,
  botId: string,
): number {
  return normalizeBotcastVoiceLevel(levels?.[botId]);
}

export const BOTCAST_DEFAULT_STUDIO_LAYOUT: BotcastStudioLayout = {
  hostBot: { x: 22.5, y: 71.25 },
  guestBot: { x: 77.5, y: 71.25 },
  hostCup: { x: 36.25, y: 90 },
  guestCup: { x: 63.75, y: 90 },
};

const BOTCAST_LEGACY_DEFAULT_STUDIO_LAYOUT: BotcastStudioLayout = {
  hostBot: { x: 22.5, y: 64 },
  guestBot: { x: 77.5, y: 64 },
  hostCup: { x: 36.25, y: 80 },
  guestCup: { x: 63.75, y: 80 },
};

export const BOTCAST_CLOSEUP_CAMERA_SCALE = 1.42;

function botcastCameraOffsetPercent(args: {
  focusPercent: number;
  focalLinePercent: number;
  transformOriginPercent: number;
}): number {
  const desiredOffset =
    (args.focalLinePercent - args.focusPercent) * BOTCAST_CLOSEUP_CAMERA_SCALE;
  const zoomOverflow = BOTCAST_CLOSEUP_CAMERA_SCALE - 1;
  const minimumOffset = -(100 - args.transformOriginPercent) * zoomOverflow;
  const maximumOffset = args.transformOriginPercent * zoomOverflow;
  const safeOffset = Math.max(
    minimumOffset,
    Math.min(maximumOffset, desiredOffset),
  );
  return Math.round(safeOffset * 100) / 100;
}

/** Centers the saved bot when possible without panning beyond the TV frame. */
export function botcastCameraOffsetXPercent(
  shot: BotcastDirectedCameraShot,
  layout: BotcastStudioLayout,
): number {
  if (shot === "wide") return 0;
  const focusX = shot === "left" ? layout.hostBot.x : layout.guestBot.x;
  return botcastCameraOffsetPercent({
    focusPercent: focusX,
    focalLinePercent: 50,
    transformOriginPercent: 50,
  });
}

/** Follows the saved height while keeping the zoomed scene inside the TV frame. */
export function botcastCameraOffsetYPercent(
  shot: BotcastDirectedCameraShot,
  layout: BotcastStudioLayout,
): number {
  if (shot === "wide") return 0;
  const focusY = shot === "left" ? layout.hostBot.y : layout.guestBot.y;
  return botcastCameraOffsetPercent({
    focusPercent: focusY,
    focalLinePercent: 55,
    transformOriginPercent: 55,
  });
}

const BOTCAST_STUDIO_LAYOUT_BOUNDS: Record<
  BotcastStudioLayoutItem,
  { minX: number; maxX: number; minY: number; maxY: number }
> = {
  hostBot: { minX: 10, maxX: 90, minY: 19, maxY: 82 },
  guestBot: { minX: 10, maxX: 90, minY: 19, maxY: 82 },
  hostCup: { minX: 4, maxX: 96, minY: 12, maxY: 94 },
  guestCup: { minX: 4, maxX: 96, minY: 12, maxY: 94 },
};

function botcastStudioCoordinate(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.round(Math.max(min, Math.min(max, numeric)) * 100) / 100;
}

export function normalizeBotcastStudioLayout(
  value: unknown,
  fallback: BotcastStudioLayout = BOTCAST_DEFAULT_STUDIO_LAYOUT,
): BotcastStudioLayout {
  const rawContainer =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<Record<BotcastStudioLayoutItem, unknown>>)
    : {};
  const isLegacyDefault = (
    Object.keys(
      BOTCAST_LEGACY_DEFAULT_STUDIO_LAYOUT,
    ) as BotcastStudioLayoutItem[]
  ).every((item) => {
        const point = rawContainer[item];
        return Boolean(
          point &&
          typeof point === "object" &&
          !Array.isArray(point) &&
          (point as Partial<BotcastStudioPoint>).x ===
            BOTCAST_LEGACY_DEFAULT_STUDIO_LAYOUT[item].x &&
          (point as Partial<BotcastStudioPoint>).y ===
            BOTCAST_LEGACY_DEFAULT_STUDIO_LAYOUT[item].y,
        );
      });
  const container = isLegacyDefault ? {} : rawContainer;
  return (
    Object.keys(BOTCAST_DEFAULT_STUDIO_LAYOUT) as BotcastStudioLayoutItem[]
  ).reduce<BotcastStudioLayout>((layout, item) => {
      const rawPoint = container[item];
    const point =
      rawPoint && typeof rawPoint === "object" && !Array.isArray(rawPoint)
        ? (rawPoint as Partial<BotcastStudioPoint>)
        : {};
      const bounds = BOTCAST_STUDIO_LAYOUT_BOUNDS[item];
      layout[item] = {
        x: botcastStudioCoordinate(
          point.x,
          fallback[item].x,
          bounds.minX,
          bounds.maxX,
        ),
        y: botcastStudioCoordinate(
          point.y,
          fallback[item].y,
          bounds.minY,
          bounds.maxY,
        ),
      };
      return layout;
    }, {} as BotcastStudioLayout);
}

/** Exchanges the host and guest seats while keeping each bot with its cup. */
export function swapBotcastStudioLayoutSeats(
  value: unknown,
): BotcastStudioLayout {
  const layout = normalizeBotcastStudioLayout(value);
  return {
    hostBot: { ...layout.guestBot },
    guestBot: { ...layout.hostBot },
    hostCup: { ...layout.guestCup },
    guestCup: { ...layout.hostCup },
  };
}

/**
 * Source-edit instruction for the online Signal daylight render. The canonical
 * night image already carries the persona and set design, so this deliberately
 * excludes descriptive identity prose that could make an image model rebuild
 * the room instead of relighting it.
 */
export const BOTCAST_DAYLIGHT_RELIGHT_EDIT_PROMPT = [
  "The attached image is the sole canonical source frame.",
  "Produce one finished replacement image of that exact studio in natural daytime lighting.",
  "Preserve the identical camera position, lens, crop, perspective, room geometry, windows and view, furniture, microphones, props, artwork, materials, object placement, scale, and negative space.",
  "Do not redesign, restage, add, remove, substitute, duplicate, relocate, crop, zoom, or recompose anything.",
  "Change only the illumination and exterior sky: daylight through the existing windows, open-sky fill, subtle sunlit bounce, practical lamps off, clean midtones, and restrained shadows.",
  "Output only the single daytime replacement frame. The source is a reference, not content to display. Do not show a nighttime state, source image, before-and-after, diptych, split screen, comparison, grid, collage, inset, border, divider, caption, or multiple panels.",
].join(" ");

export type BotcastLogoGlyph =
  "frequency" | "orbit" | "aperture" | "spark" | "monogram";

export interface BotcastLogoState {
  seed: string;
  prompt: string;
  imageUrl: string | null;
  imageId: string | null;
  revision: number;
  status: "fallback" | "ready" | "failed";
  fallbackGlyph: BotcastLogoGlyph;
}

export interface BotcastIntroAudioState {
  source: "local" | "elevenlabs";
  audioUrl: string | null;
  durationMs: number;
  revision: number;
  model: string | null;
}

export interface BotcastAtmosphereAudioState {
  source: "bundled" | "elevenlabs";
  audioUrl: string;
  durationMs: number;
  revision: number;
  model: string | null;
}

export interface BotcastShow {
  id: string;
  hostBotId: string;
  name: string;
  premise: string;
  hostingStyle: string;
  accentColor: string;
  fallbackStudioAccentVariant: BotcastFallbackStudioAccentVariant;
  /** Compatibility alias for the original single-studio contract. Mirrors nightAtmosphere. */
  atmosphere: BotcastAtmosphereState;
  studioIdentity: string;
  dashboardBlurbs: string[];
  dayAtmosphere: BotcastAtmosphereState;
  nightAtmosphere: BotcastAtmosphereState;
  studioLayout: BotcastStudioLayout;
  voiceLevelsByBotId: BotcastVoiceLevelsByBotId;
  atmosphereMix: BotcastStudioAtmosphereMix;
  logo: BotcastLogoState;
  introAudio: BotcastIntroAudioState;
  atmosphereAudio: BotcastAtmosphereAudioState;
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
  /** Clean transcript plus optional Eleven v3 vocal-reaction tags. */
  voicePerformanceText: string | null;
  /** Delivery mood captured when this line was recorded. */
  moodKey: VoiceDeliveryMood;
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
  | "guest_presence"
  | "power_effect"
  | "producer_cue"
  | "utterance"
  | "tension"
  | "warning"
  | "departure"
  | "cut_away"
  | "camera_mode"
  | "camera_suggestion"
  | "listener_reaction"
  | "episode_completed";

export interface BotcastReplayEvent {
  id: string;
  episodeId: string;
  sequence: number;
  kind: BotcastReplayEventKind;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface BotcastSocialInfluenceEventV1 {
  v: 1;
  effect: "social_influence";
  powerId: string;
  powerName: string;
  sourceBotId: string;
  targetBotId: string;
  sourceRole: BotcastSpeakerRole;
  targetRole: BotcastSpeakerRole;
  trigger: "session_start" | "after_speech";
  polarity: "positive" | "negative";
  strength: "small" | "medium" | "large";
  atMs: number;
  sourceMessageId?: string;
}

export interface BotcastCameraSuggestion {
  shot: BotcastDirectedCameraShot;
  reason:
    | "opening"
    | "speaker"
    | "power_effect"
    | "listener_reaction"
    | "transition"
    | "tension"
    | "departure"
    | "empty_chair"
    | "closing";
  atMs: number;
  minimumHoldMs: number;
}

function normalizeSavedBotcastListenerReactionPlan(
  value: unknown,
): ListenerReactionPlanV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = (candidate: unknown): string | null =>
    typeof candidate === "string" &&
    candidate.trim() &&
    candidate.trim().length <= 160
      ? candidate.trim()
      : null;
  const speakerBotId = id(row.speakerBotId);
  const listenerBotId = id(row.listenerBotId);
  const messageId = id(row.messageId);
  const seed = id(row.seed);
  const targetSource =
    row.targetSource === "role" ||
    row.targetSource === "direct" ||
    row.targetSource === "inferred"
    ? row.targetSource
    : null;
  const visualAction =
    row.visualAction === "nod" ||
    row.visualAction === "lean_in" ||
    row.visualAction === "head_tilt" ||
    row.visualAction === "soft_smile" ||
    row.visualAction === "thoughtful_hmm"
    ? row.visualAction
    : null;
  const spokenCue =
    row.spokenCue === "mm-hm" ||
    row.spokenCue === "I see" ||
    row.spokenCue === "hmm" ||
    row.spokenCue === "right" ||
    row.spokenCue === "oh" ||
    row.spokenCue === "go on"
    ? row.spokenCue
    : undefined;
  if (
    row.v !== 1 ||
    row.name !== "listenerReaction" ||
    !speakerBotId ||
    !listenerBotId ||
    speakerBotId === listenerBotId ||
    !messageId ||
    !seed ||
    !targetSource ||
    !visualAction ||
    typeof row.targetProgress !== "number" ||
    !Number.isFinite(row.targetProgress) ||
    row.targetProgress < 0.3 ||
    row.targetProgress > 0.75 ||
    typeof row.cameraCutEligible !== "boolean"
  )
    return null;
  return {
    v: 1,
    name: "listenerReaction",
    speakerBotId,
    listenerBotId,
    messageId,
    targetSource,
    visualAction,
    ...(spokenCue ? { spokenCue } : {}),
    targetProgress: row.targetProgress,
    seed,
    cameraCutEligible: row.cameraCutEligible,
  };
}

export function botcastListenerReactionForMessage(
  events: readonly BotcastReplayEvent[],
  messageId: string,
): ListenerReactionPlanV1 | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.kind !== "listener_reaction") continue;
    const plan = normalizeSavedBotcastListenerReactionPlan(event.payload.plan);
    if (plan?.messageId === messageId) return plan;
  }
  return null;
}

function normalizeBotcastSocialInfluenceEvent(
  value: unknown,
): BotcastSocialInfluenceEventV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const boundedId = (candidate: unknown, limit = 160): string | null =>
    typeof candidate === "string" && candidate.trim()
      ? candidate.trim().slice(0, limit)
      : null;
  const powerId = boundedId(row.powerId);
  const powerName = boundedId(row.powerName, 80);
  const sourceBotId = boundedId(row.sourceBotId);
  const targetBotId = boundedId(row.targetBotId);
  const sourceMessageId = boundedId(row.sourceMessageId);
  const atMs = Number(row.atMs);
  if (
    row.v !== 1 ||
    row.effect !== "social_influence" ||
    !powerId ||
    !powerName ||
    !sourceBotId ||
    !targetBotId ||
    sourceBotId === targetBotId ||
    (row.sourceRole !== "host" && row.sourceRole !== "guest") ||
    (row.targetRole !== "host" && row.targetRole !== "guest") ||
    row.sourceRole === row.targetRole ||
    (row.trigger !== "session_start" && row.trigger !== "after_speech") ||
    (row.polarity !== "positive" && row.polarity !== "negative") ||
    (row.strength !== "small" &&
      row.strength !== "medium" &&
      row.strength !== "large") ||
    !Number.isFinite(atMs) ||
    atMs < 0
  ) {
    return null;
  }
  return {
    v: 1,
    effect: "social_influence",
    powerId,
    powerName,
    sourceBotId,
    targetBotId,
    sourceRole: row.sourceRole,
    targetRole: row.targetRole,
    trigger: row.trigger,
    polarity: row.polarity,
    strength: row.strength,
    atMs: Math.round(atMs),
    ...(sourceMessageId ? { sourceMessageId } : {}),
  };
}

export function botcastSocialInfluenceEventsAt(args: {
  events: readonly BotcastReplayEvent[];
  elapsedMs: number;
  targetBotId?: string;
}): BotcastSocialInfluenceEventV1[] {
  return args.events.flatMap((event) => {
    if (event.kind !== "power_effect") return [];
    const influence = normalizeBotcastSocialInfluenceEvent(event.payload);
    if (!influence || influence.atMs > args.elapsedMs) return [];
    if (args.targetBotId && influence.targetBotId !== args.targetBotId) {
      return [];
    }
    return [influence];
  });
}

export function botcastStrongestNegativeSocialInfluenceAt(args: {
  events: readonly BotcastReplayEvent[];
  elapsedMs: number;
  targetBotId?: string;
}): BotcastSocialInfluenceEventV1 | null {
  const rank = { small: 1, medium: 2, large: 3 } as const;
  let strongest: BotcastSocialInfluenceEventV1 | null = null;
  for (const influence of botcastSocialInfluenceEventsAt(args)) {
    if (influence.polarity !== "negative") continue;
    if (!strongest || rank[influence.strength] > rank[strongest.strength]) {
      strongest = influence;
    }
  }
  return strongest;
}

function botcastTimedCameraEvents(
  events: readonly BotcastReplayEvent[],
  elapsedMs: number,
): BotcastReplayEvent[] {
  return events
    .filter(
      (event) =>
        (event.kind === "camera_mode" || event.kind === "camera_suggestion") &&
        Number.isFinite(Number(event.payload.atMs)) &&
        Number(event.payload.atMs) <= elapsedMs,
    )
    .sort((left, right) => {
      const byTime = Number(left.payload.atMs) - Number(right.payload.atMs);
      return byTime === 0 ? left.sequence - right.sequence : byTime;
    });
}

/** Resolves the saved live camera mode, defaulting legacy episodes to Auto. */
export function botcastCameraModeAt(args: {
  events: readonly BotcastReplayEvent[];
  elapsedMs: number;
}): BotcastCameraShot {
  let mode: BotcastCameraShot = "auto";
  for (const event of botcastTimedCameraEvents(args.events, args.elapsedMs)) {
    if (event.kind !== "camera_mode") continue;
    const candidate = event.payload.mode;
    if (
      candidate === "auto" ||
      candidate === "left" ||
      candidate === "right" ||
      candidate === "wide"
    ) {
      mode = candidate;
    }
  }
  return mode;
}

export interface BotcastEpisodeSummary {
  id: string;
  showId: string;
  showName: string;
  title: string;
  hostBotId: string;
  guestBotId: string;
  topic: string;
  provider: BotcastEpisodeProvider;
  model: string | null;
  responseMode: BotcastEpisodeResponseMode;
  /** Null means Auto: conversation-shaped length with no displayed time limit. */
  durationMinutes: BotcastSessionDurationMinutes | null;
  status: BotcastEpisodeStatus;
  segment: BotcastEpisodeSegment;
  outcome: BotcastEpisodeOutcome | null;
  tensionStage: BotcastTensionStage;
  warningCount: number;
  startedAt: string;
  completedAt: string | null;
  runtimeMs: number | null;
  /** Completed local-model warmup holds excluded from the live session clock. */
  modelWarmupHoldDurationMs: number;
  /** Active hold start, persisted so a live episode can resume honestly after reload. */
  modelWarmupHoldStartedAt: string | null;
  /** One candid Library-persona response generated after the episode completes. */
  personaReview: BotcastPersonaReview | null;
  createdAt: string;
  updatedAt: string;
}

export interface BotcastPersonaReview {
  reviewerBotId: string;
  reviewerName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface BotcastEpisode extends BotcastEpisodeSummary {
  producerBrief: string;
  /** Audience-only guests are recorded, but remain imperceptible to the host. */
  guestPresenceMode: BotcastGuestPresenceMode;
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
  studioIdentity?: string;
  dashboardBlurbs?: string[];
  atmosphereImageUrl?: string | null;
  atmosphereImageId?: string | null;
  dayAtmosphereImageUrl?: string | null;
  dayAtmosphereImageId?: string | null;
  nightAtmosphereImageUrl?: string | null;
  nightAtmosphereImageId?: string | null;
  studioLayout?: BotcastStudioLayout;
  voiceLevelsByBotId?: BotcastVoiceLevelsByBotId;
  atmosphereMix?: BotcastStudioAtmosphereMix;
  regenerateAtmosphere?: boolean;
  regenerateDayAtmosphere?: boolean;
  regenerateNightAtmosphere?: boolean;
  logoImageUrl?: string | null;
  logoImageId?: string | null;
  regenerateLogo?: boolean;
}

export interface BotcastEpisodeCreateRequest {
  guestBotId: string;
  topic: string;
  producerBrief?: string;
  preferredProvider?: BotcastEpisodeProvider;
  modelOverride?: string | null;
  responseMode?: BotcastEpisodeResponseMode;
  /** Null or omitted selects Auto. */
  durationMinutes?: BotcastSessionDurationMinutes | null;
}

export interface BotcastEpisodeAdvanceRequest {
  cue?: BotcastProducerCue;
}

export interface BotcastEpisodeAdvanceResponse {
  episode: BotcastEpisode;
  message: BotcastMessage | null;
}

export interface BotcastModelWarmupHoldRequest {
  active: boolean;
}

export interface BotcastTensionState {
  level: 0 | 1 | 2 | 3;
  warningCount: number;
  stage: BotcastTensionStage;
}

export function botcastVoiceMoodForTension(
  tension: Pick<BotcastTensionState, "level">,
): VoiceDeliveryMood {
  if (tension.level >= 2) return "strained";
  if (tension.level >= 1) return "guarded";
  return "neutral";
}

export const BOTCAST_DIRECTOR_MIN_SHOT_MS = 3_200;
export const BOTCAST_DIRECTOR_HYSTERESIS_MS = 1_100;

export function botcastTensionStageForLevel(
  level: number,
): BotcastTensionStage {
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
  const level = Math.max(0, Math.min(3, current.level + delta)) as
    0 | 1 | 2 | 3;
  const enteredWarning = current.level < 2 && level >= 2;
  return {
    level,
    warningCount: current.warningCount + (enteredWarning ? 1 : 0),
    stage: botcastTensionStageForLevel(level),
  };
}

export function botcastGuestDepartureEligible(
  state: BotcastTensionState,
): boolean {
  return state.level >= 3 && state.warningCount >= 1;
}

export function botcastSegmentForTurn(args: {
  current: BotcastEpisodeSegment;
  utteranceCount: number;
  guestDeparted: boolean;
}): BotcastEpisodeSegment {
  if (args.guestDeparted) return "closing";
  if (args.current === "opening" && args.utteranceCount >= 2)
    return "interview";
  return args.current;
}

function botcastSpokenWordCount(content: string): number {
  return content.trim().split(/\s+/u).filter(Boolean).length;
}

function botcastAverageWordCount(
  messages: readonly Pick<BotcastMessage, "content">[],
): number {
  if (messages.length === 0) return 0;
  return (
    messages.reduce(
      (total, message) => total + botcastSpokenWordCount(message.content),
      0,
    ) / messages.length
  );
}

const BOTCAST_NATURAL_REST_PATTERN =
  /\b(?:ultimately|in the end|at the end of the day|that(?:'s| is) the point|that(?:'s| is) what matters|I think we(?:'ve| have) covered|there(?:'s| is) not much more|I(?:'ll| will) leave it there|final thought)\b/iu;

/**
 * Chooses the next host turn as the close only at a natural handoff. Auto has
 * no wall-clock target: it follows the shape and tempo of the transcript.
 */
export function botcastSessionShouldClose(args: {
  messages: readonly Pick<BotcastMessage, "speakerRole" | "content">[];
  durationMinutes: BotcastSessionDurationMinutes | null;
  startedAtMs: number;
  nowMs: number;
  modelWarmupHoldDurationMs?: number;
  modelWarmupHoldStartedAtMs?: number | null;
}): boolean {
  const utteranceCount = args.messages.length;
  if (
    utteranceCount < BOTCAST_AUTO_MIN_EXCHANGES * 2 ||
    args.messages.at(-1)?.speakerRole !== "guest"
  ) {
    return false;
  }
  if (args.durationMinutes !== null) {
    const completedHoldMs = Number.isFinite(args.modelWarmupHoldDurationMs)
      ? Math.max(0, args.modelWarmupHoldDurationMs ?? 0)
      : 0;
    const activeHoldMs =
      typeof args.modelWarmupHoldStartedAtMs === "number" &&
      Number.isFinite(args.modelWarmupHoldStartedAtMs)
        ? Math.max(0, args.nowMs - args.modelWarmupHoldStartedAtMs)
        : 0;
    return (
      utteranceCount >= BOTCAST_TIMED_MAX_UTTERANCES ||
      args.nowMs - args.startedAtMs - completedHoldMs - activeHoldMs >=
        args.durationMinutes * 60_000
    );
  }
  if (
    utteranceCount >= BOTCAST_AUTO_MAX_EXCHANGES * 2 ||
    args.nowMs - args.startedAtMs >=
      BOTCAST_SESSION_DURATION_MINUTES_MAX * 60_000
  ) {
    return true;
  }

  const latestGuestLine = args.messages.at(-1)?.content ?? "";
  if (BOTCAST_NATURAL_REST_PATTERN.test(latestGuestLine)) return true;

  const recent = args.messages.slice(-4);
  const prior = args.messages.slice(-8, -4);
  const recentAverage = botcastAverageWordCount(recent);
  const priorAverage = botcastAverageWordCount(prior);
  const conversationHasSettled =
    utteranceCount >= 10 &&
    recentAverage <= 28 &&
    (prior.length < 4 || recentAverage <= priorAverage * 0.82);
  const matureConversationIsTapering =
    utteranceCount >= 18 && recentAverage <= 38;
  return conversationHasSettled || matureConversationIsTapering;
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
  if (
    args.segment === "closing" &&
    args.messages.at(-1)?.speakerRole === "host"
  ) {
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
    shot = args.speakerRole === "guest" ? "right" : "left";
    reason = "opening";
  } else if (args.segment === "closing" && args.speakerRole === "host") {
    shot = "wide";
    reason = "closing";
  } else {
    shot = args.speakerRole === "guest" ? "right" : "left";
    reason = "speaker";
  }

  const previous = args.previous;
  const heldMs = previous
    ? args.atMs - previous.atMs
    : Number.POSITIVE_INFINITY;
  const shortUtterance =
    (args.utteranceDurationMs ?? 0) < BOTCAST_DIRECTOR_HYSTERESIS_MS;
  if (
    previous &&
    shot !== previous.shot &&
    event === "utterance" &&
    !(args.segment === "closing" && args.speakerRole === "host") &&
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
}): BotcastDirectedCameraShot {
  let mode: BotcastCameraShot = "auto";
  let automaticShot: BotcastDirectedCameraShot = "wide";
  let shot: BotcastDirectedCameraShot = "wide";
  for (const event of botcastTimedCameraEvents(args.events, args.elapsedMs)) {
    if (event.kind === "camera_mode") {
      const candidate = event.payload.mode;
      if (
        candidate === "auto" ||
        candidate === "left" ||
        candidate === "right" ||
        candidate === "wide"
      ) {
        mode = candidate;
        const recordedShot = event.payload.shot;
        if (
          mode === "auto" &&
          (recordedShot === "left" ||
            recordedShot === "right" ||
            recordedShot === "wide")
        ) {
          automaticShot = recordedShot;
        }
        shot = mode === "auto" ? automaticShot : mode;
      }
      continue;
    }
    if (event.kind === "camera_suggestion") {
      const candidate = event.payload.shot;
      if (
        candidate === "left" ||
        candidate === "right" ||
        candidate === "wide"
      ) {
        automaticShot = candidate;
        if (mode === "auto") shot = automaticShot;
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
      event.kind === "camera_suggestion" &&
      event.payload.reason === "departure",
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
      atMs +
        (Number.isFinite(minimumHoldMs)
          ? minimumHoldMs
          : BOTCAST_DIRECTOR_MIN_SHOT_MS),
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

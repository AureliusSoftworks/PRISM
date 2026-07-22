import type { VoiceDeliveryMood } from "./audioVoice.js";
import {
  normalizeBotIdentityMirrorStateV1,
  type BotIdentityMirrorStateV1,
} from "./botIdentityMirror.ts";
import {
  normalizeListenerReactionPlanV1,
  type BotCrosstalkInterruptedSpeakerCue,
  type ListenerReactionPlanV1,
} from "./listenerReaction.ts";
import {
  botPowerAvatarVisibilityModeV1,
  botPowerResponseIsSilentV1,
  type BotPowerAvatarVisibilityModeV1,
  type BotPowerObserverPerspectiveV1,
  type BotPowerObserverVisibilityV1,
} from "./botPower.ts";

export type BotcastEpisodeSegment = "opening" | "interview" | "closing";
export type BotcastEpisodeStatus = "live" | "completed";
export type BotcastEpisodeOutcome =
  | "completed"
  | "guest_departed"
  | "host_departed";
export type BotcastEpisodeProvider = "local" | "openai" | "anthropic";
export type BotcastEpisodeResponseMode = "local" | "auto" | "online";
export type BotcastSpeakerRole = "host" | "guest";
export type BotcastGuestKind = "bot" | "producer";
export const BOTCAST_PRODUCER_GUEST_ID = "__signal_producer_guest__";
export const BOTCAST_PRODUCER_GUEST_NAME = "the Producer";
export const BOTCAST_PRODUCER_GUEST_THINKING_TIME_SCALE = 0.5;
export const BOTCAST_PERSONA_REVIEW_VISIBILITY_DELAY_MS = 4 * 60 * 60 * 1_000;
/** `audience_only` is the legacy internal name for a guest isolated from the host. */
export type BotcastGuestPresenceMode = "present" | "audience_only";
export type BotcastSessionDurationMinutes = number;
export const BOTCAST_SESSION_DURATION_MINUTES_MIN = 3;
export const BOTCAST_SESSION_DURATION_MINUTES_MAX = 30;
export const BOTCAST_SESSION_DURATION_MINUTES_STEP = 1;
export const BOTCAST_AUTO_MIN_EXCHANGES = 3;
export const BOTCAST_AUTO_MAX_EXCHANGES = 60;
export const BOTCAST_AUTO_MIN_SUBSTANTIVE_GUEST_ANSWERS = 3;
export const BOTCAST_TIMED_MAX_UTTERANCES = 120;
export const BOTCAST_LOCAL_INTRO_DURATION_MS = 7_800;
export const BOTCAST_ELEVENLABS_INTRO_DURATION_MS = 8_000;
export const BOTCAST_LOCAL_OUTDENT_DURATION_MS = 3_200;
export const BOTCAST_ELEVENLABS_OUTDENT_DURATION_MS = 4_000;
export const BOTCAST_DASHBOARD_BLURB_FALLBACKS = [
  "Episode 4: Now with 12% more dramatic pause.",
  "Guest chair's open. Bring me someone interesting",
] as const;
export const BOTCAST_ECHO_DASHBOARD_BLURB_FALLBACK =
  "I always have an original thing to say.";

/** Keeps the unrelated Copycat dashboard joke recognizable across persona rewrites. */
export function isBotcastEchoDashboardBlurb(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    /\boriginal(?:ity|ly)?\b/iu.test(value)
  );
}
export const BOTCAST_HOST_INTERRUPTION_LINE_TARGET = 6;
export const BOTCAST_HOST_INTERRUPTION_LINE_MAX_LENGTH = 64;
export const BOTCAST_HOST_INTERRUPTION_LINE_FALLBACKS = [
  "Wait—",
  "Hang on—",
  "One second—",
  "Let me stop you there—",
  "Before you go further—",
  "I want to catch that—",
  "Sorry, one moment—",
  "Hold that thought—",
] as const;
export const BOTCAST_EPHEMERAL_INTERRUPTION_BRIDGE_ID_PREFIX =
  "signal-interruption-bridge:";

export function normalizeBotcastHostInterruptionLines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const line = value
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, BOTCAST_HOST_INTERRUPTION_LINE_MAX_LENGTH);
    const key = line.toLocaleLowerCase();
    if (!line || seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
    if (lines.length >= BOTCAST_HOST_INTERRUPTION_LINE_TARGET) break;
  }
  return lines;
}

export function botcastHostInterruptionLinesForSeed(seed: string): string[] {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const start =
    (hash >>> 0) % BOTCAST_HOST_INTERRUPTION_LINE_FALLBACKS.length;
  return Array.from(
    { length: BOTCAST_HOST_INTERRUPTION_LINE_TARGET },
    (_, index) =>
      BOTCAST_HOST_INTERRUPTION_LINE_FALLBACKS[
        (start + index) % BOTCAST_HOST_INTERRUPTION_LINE_FALLBACKS.length
      ]!,
  );
}

export function botcastHostInterruptionLineAt(
  lines: readonly string[],
  ordinal: number,
): string {
  const normalized = normalizeBotcastHostInterruptionLines(lines);
  const available = normalized.length
    ? normalized
    : [...BOTCAST_HOST_INTERRUPTION_LINE_FALLBACKS];
  const safeOrdinal = Number.isFinite(ordinal) ? Math.max(0, ordinal) : 0;
  return available[Math.floor(safeOrdinal) % available.length]!;
}

export function botcastInterruptionBridgeMessageId(
  episodeId: string,
  ordinal: number,
): string {
  return `${BOTCAST_EPHEMERAL_INTERRUPTION_BRIDGE_ID_PREFIX}${episodeId}:${Math.max(0, Math.floor(ordinal))}`;
}

export function botcastMessageIsEphemeralInterruptionBridge(
  message: Pick<BotcastMessage, "id">,
): boolean {
  return message.id.startsWith(
    BOTCAST_EPHEMERAL_INTERRUPTION_BRIDGE_ID_PREFIX,
  );
}

export function botcastInterruptedGuestContent(
  fullContent: string,
  spokenContent: string,
): string | null {
  const prefix = spokenContent.trimEnd();
  if (!prefix.trim() || !fullContent.startsWith(prefix)) return null;
  if (prefix === fullContent || /[—–-]$/u.test(prefix)) return prefix;
  return `${prefix}—`;
}
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
  | "ask_about"
  | "refocus"
  | "press_harder"
  | "move_on"
  | "lighten_up"
  | "wrap_up";
export type BotcastTensionStage =
  "calm" | "resistance" | "warning" | "departed";
export type BotcastCameraShot = "auto" | "left" | "right" | "wide";
export type BotcastDirectedCameraShot = Exclude<BotcastCameraShot, "auto">;
export const BOTCAST_AUTO_CAMERA_LEAD_IN_MIN_MS = 240;
export const BOTCAST_AUTO_CAMERA_LEAD_IN_MAX_MS = 420;

/** Lets a speaker land on mic before Auto changes the saved camera cut. */
export function botcastAutoCameraLeadInMs(utteranceDurationMs: number): number {
  const duration = Number.isFinite(utteranceDurationMs)
    ? Math.max(1, utteranceDurationMs)
    : 1;
  return Math.round(
    Math.max(
      BOTCAST_AUTO_CAMERA_LEAD_IN_MIN_MS,
      Math.min(BOTCAST_AUTO_CAMERA_LEAD_IN_MAX_MS, duration * 0.12),
    ),
  );
}

export interface BotcastAtmosphereState {
  seed: string;
  prompt: string;
  imageUrl: string | null;
  imageId: string | null;
  revision: number;
  status: "fallback" | "ready" | "failed";
}

/** Neutral receiver response derived from the installed Light/Dark studio pair. */
export interface BotcastStudioLightingState {
  imageUrl: string | null;
  imageId: string | null;
  sourceDayImageId: string | null;
  sourceNightImageId: string | null;
  revision: number;
  status: "missing" | "ready" | "stale" | "failed";
}

export interface BotcastStudioPoint {
  x: number;
  y: number;
}

export type BotcastStudioLayoutItem =
  | "hostBot"
  | "guestBot"
  | "hostCup"
  | "guestCup";

export type BotcastStudioLayout = Record<
  BotcastStudioLayoutItem,
  BotcastStudioPoint
>;

export type BotcastVoiceLevelsByBotId = Record<string, number>;

export interface BotcastStudioAtmosphereMix {
  background: number;
  grain: number;
  foley: number;
  /** Visual film grain over the composited studio screen; never an audio bus. */
  filmGrain: number;
}

export const BOTCAST_DEFAULT_STUDIO_FILM_GRAIN = 1;
export const BOTCAST_STUDIO_FILM_GRAIN_MAX = 1;
export const BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX: Readonly<BotcastStudioAtmosphereMix> = {
  background: 0.16,
  // Retained in the persisted shape for compatibility, but Signal no longer
  // layers a separate static/grain bed over its studio atmosphere.
  grain: 0,
  foley: 1,
  filmGrain: BOTCAST_DEFAULT_STUDIO_FILM_GRAIN,
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
    filmGrain: normalizeBotcastStudioAtmosphereMixLevel(
      container.filmGrain,
      fallback.filmGrain,
      BOTCAST_STUDIO_FILM_GRAIN_MAX,
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
  hostBot: { x: 18.5, y: 66 },
  guestBot: { x: 81.5, y: 66 },
  hostCup: { x: 36.25, y: 86 },
  guestCup: { x: 63.75, y: 86 },
};

const BOTCAST_PREVIOUS_DEFAULT_STUDIO_LAYOUTS = [
  {
    hostBot: { x: 22.5, y: 71.25 },
    guestBot: { x: 77.5, y: 71.25 },
    hostCup: { x: 36.25, y: 90 },
    guestCup: { x: 63.75, y: 90 },
  },
  {
    hostBot: { x: 22.5, y: 64 },
    guestBot: { x: 77.5, y: 64 },
    hostCup: { x: 36.25, y: 80 },
    guestCup: { x: 63.75, y: 80 },
  },
] as const satisfies readonly BotcastStudioLayout[];

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
  const isPreviousDefault = BOTCAST_PREVIOUS_DEFAULT_STUDIO_LAYOUTS.some(
    (previousDefault) =>
      (
        Object.keys(previousDefault) as Array<keyof typeof previousDefault>
      ).every((item) => {
        const point = rawContainer[item];
        return Boolean(
          point &&
          typeof point === "object" &&
          !Array.isArray(point) &&
          (point as Partial<BotcastStudioPoint>).x ===
            previousDefault[item].x &&
          (point as Partial<BotcastStudioPoint>).y === previousDefault[item].y,
        );
      }),
  );
  const container = isPreviousDefault ? {} : rawContainer;
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
  "Do not add coffee cups, mugs, tumblers, drinking glasses, or other drinkware.",
  "Do not redesign, restage, add, remove, substitute, duplicate, relocate, crop, zoom, or recompose anything.",
  "Change only the illumination and exterior sky: daylight through the existing windows, open-sky fill, subtle sunlit bounce, practical lamps off, clean midtones, and restrained shadows.",
  "Output only the single daytime replacement frame. The source is a reference, not content to display. Do not show a nighttime state, source image, before-and-after, diptych, split screen, comparison, grid, collage, inset, border, divider, caption, or multiple panels.",
].join(" ");

export type BotcastLogoGlyph =
  "frequency" | "orbit" | "aperture" | "spark" | "monogram";

/**
 * Provider-safe structural art direction for one Signal show mark. Keeping the
 * genes explicit lets the API reject near-duplicate briefs before spending an
 * image generation.
 */
export interface BotcastLogoDesignV1 {
  version: 1;
  signature: string;
  /** Original concrete visual metaphor that makes the mark legible and show-specific. */
  showThesis: string;
  personaMotif: string;
  broadcastArchetype: string;
  fusionMechanic: string;
  composition: string;
  silhouette: string;
  negativeSpace: string;
  lineLanguage: string;
}

export interface BotcastLogoState {
  seed: string;
  prompt: string;
  imageUrl: string | null;
  imageId: string | null;
  revision: number;
  status: "fallback" | "ready" | "failed";
  fallbackGlyph: BotcastLogoGlyph;
  design: BotcastLogoDesignV1;
  /** Previous accepted genomes prevent Refresh logo from cycling backward. */
  retiredDesigns: BotcastLogoDesignV1[];
}

export interface BotcastIntroAudioState {
  source: "local" | "elevenlabs";
  audioUrl: string | null;
  durationMs: number;
  /** Paired closing signature created with the ident; null for local synthesis. */
  outdentAudioUrl: string | null;
  outdentDurationMs: number;
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
  /** Prewritten host bridges available before a live redirect model returns. */
  hostInterruptionLines: string[];
  dayAtmosphere: BotcastAtmosphereState;
  nightAtmosphere: BotcastAtmosphereState;
  studioLighting: BotcastStudioLightingState;
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

export type BotcastShowHostChatRole = "user" | "assistant";

/** A short-lived off-air exchange. Signal never persists these messages. */
export interface BotcastShowHostChatMessage {
  id: string;
  role: BotcastShowHostChatRole;
  content: string;
  provider: BotcastEpisodeProvider | null;
  model: string | null;
  createdAt: string;
}

export interface BotcastShowHostChatRequest {
  content: string;
  /** Only the most recent three messages are accepted as ephemeral continuity. */
  messages?: Array<Pick<BotcastShowHostChatMessage, "role" | "content">>;
  preferredProvider?: BotcastEpisodeProvider;
}

export interface BotcastShowHostChatResponse {
  ok: true;
  message: BotcastShowHostChatMessage;
}

export interface BotcastMessage {
  id: string;
  episodeId: string;
  speakerRole: BotcastSpeakerRole;
  botId: string;
  content: string;
  /** Saved physical action shown over the speaker, never folded into captions. */
  stageActionText: string | null;
  /** Clean transcript plus optional Eleven v3 vocal-reaction tags. */
  voicePerformanceText: string | null;
  /** Delivery mood captured when this line was recorded. */
  moodKey: VoiceDeliveryMood;
  /**
   * Public Signal projection. Missing means legacy/full delivery. An inaudible
   * public copy keeps its turn identity but redacts speech to canonical silence.
   */
  audienceDelivery?: BotcastMessageAudienceDeliveryV1;
  createdAt: string;
}

export interface BotcastMessageAudienceDeliveryV1 {
  v: 1;
  audible: boolean;
  speakerVisible: boolean;
  /** New observer projections distinguish a spectral body from ordinary presence. */
  visibility?: BotPowerObserverVisibilityV1;
  spectral?: boolean;
}

export interface BotcastAudienceExperienceV1 {
  v: 1;
  perspective: "audience";
  participants: {
    host: { visible: boolean; audible: boolean };
    guest: { visible: boolean; audible: boolean };
  };
  redactedMessageCount: number;
}

export interface BotcastObserverProjectionV2 {
  v: 2;
  perspective: BotPowerObserverPerspectiveV1;
  participants: {
    host: {
      visibility: BotPowerObserverVisibilityV1;
      visible: boolean;
      audible: boolean;
      spectral: boolean;
    };
    guest: {
      visibility: BotPowerObserverVisibilityV1;
      visible: boolean;
      audible: boolean;
      spectral: boolean;
    };
  };
  redactedMessageCount: number;
}

export function botcastMessageIsAudibleToAudienceV1(
  message: Pick<BotcastMessage, "audienceDelivery">,
): boolean {
  return message.audienceDelivery?.audible !== false;
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

export const BOTCAST_SOUNDBOARD_CUE_KINDS = [
  "applause",
  "laughter",
  "gasp",
  "rimshot",
] as const;

export type BotcastSoundboardCueKind =
  (typeof BOTCAST_SOUNDBOARD_CUE_KINDS)[number];

export interface BotcastSoundboardCue {
  kind: BotcastSoundboardCueKind;
  atMs: number;
}

export function isBotcastSoundboardCueKind(
  value: unknown,
): value is BotcastSoundboardCueKind {
  return BOTCAST_SOUNDBOARD_CUE_KINDS.some((kind) => kind === value);
}

export function botcastSoundboardCueLabel(
  kind: BotcastSoundboardCueKind,
): string {
  if (kind === "applause") return "Applause";
  if (kind === "laughter") return "Laughter";
  if (kind === "gasp") return "Gasp";
  return "Rimshot";
}

export function botcastSoundboardCueFromEvent(
  event: Pick<BotcastReplayEvent, "kind" | "payload">,
): BotcastSoundboardCue | null {
  if (event.kind !== "soundboard_cue") return null;
  const kind = event.payload.kind;
  const atMs = Number(event.payload.atMs);
  if (!isBotcastSoundboardCueKind(kind) || !Number.isFinite(atMs) || atMs < 0) {
    return null;
  }
  return { kind, atMs: Math.round(atMs) };
}

export type BotcastReplayEventKind =
  | "segment"
  | "guest_presence"
  | "power_effect"
  | "producer_cue"
  | "provider_generation"
  | "utterance"
  | "tension"
  | "warning"
  | "departure"
  | "cut_away"
  | "camera_mode"
  | "camera_suggestion"
  | "listener_reaction"
  | "soundboard_cue"
  | "guest_thinking"
  | "episode_completed";

export interface BotcastReplayEvent {
  id: string;
  episodeId: string;
  sequence: number;
  kind: BotcastReplayEventKind;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface BotcastPerceptionOverlapV1 {
  v: 1;
  effect: "perception_overlap";
  precedingMessageId: string;
  overlappingMessageId: string;
  precedingBotId: string;
  overlappingBotId: string;
  startRatio: number;
  maxSimultaneousVoices: 2;
}

export function normalizeBotcastPerceptionOverlapV1(
  value: unknown,
): BotcastPerceptionOverlapV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const boundedId = (candidate: unknown): string | null =>
    typeof candidate === "string" && candidate.trim()
      ? candidate.trim().slice(0, 160)
      : null;
  const precedingMessageId = boundedId(row.precedingMessageId);
  const overlappingMessageId = boundedId(row.overlappingMessageId);
  const precedingBotId = boundedId(row.precedingBotId);
  const overlappingBotId = boundedId(row.overlappingBotId);
  const startRatio = Number(row.startRatio);
  if (
    row.v !== 1 ||
    row.effect !== "perception_overlap" ||
    !precedingMessageId ||
    !overlappingMessageId ||
    precedingMessageId === overlappingMessageId ||
    !precedingBotId ||
    !overlappingBotId ||
    precedingBotId === overlappingBotId ||
    !Number.isFinite(startRatio) ||
    startRatio < 0.58 ||
    startRatio > 0.72 ||
    row.maxSimultaneousVoices !== 2
  ) {
    return null;
  }
  return {
    v: 1,
    effect: "perception_overlap",
    precedingMessageId,
    overlappingMessageId,
    precedingBotId,
    overlappingBotId,
    startRatio: Number(startRatio.toFixed(4)),
    maxSimultaneousVoices: 2,
  };
}

export function botcastPerceptionOverlapEventsV1(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload">[],
): BotcastPerceptionOverlapV1[] {
  return events.flatMap((event) => {
    if (event.kind !== "power_effect") return [];
    const overlap = normalizeBotcastPerceptionOverlapV1(event.payload);
    return overlap ? [overlap] : [];
  });
}

export interface BotcastIdentityMirrorResetV1 {
  v: 1;
  effect: "identity_mirror_reset";
  holderBotId: string;
  reason: "signal_host_closing";
}

export function normalizeBotcastIdentityMirrorResetV1(
  value: unknown,
): BotcastIdentityMirrorResetV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const holderBotId =
    typeof row.holderBotId === "string"
      ? row.holderBotId.trim().slice(0, 160)
      : "";
  if (
    row.v !== 1 ||
    row.effect !== "identity_mirror_reset" ||
    !holderBotId ||
    row.reason !== "signal_host_closing"
  ) {
    return null;
  }
  return {
    v: 1,
    effect: "identity_mirror_reset",
    holderBotId,
    reason: "signal_host_closing",
  };
}

/** Rehydrates the last persisted identity theft for each holder at a live/replay cutoff. */
export function botcastIdentityMirrorStatesAtV1(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload" | "occurredAt">[],
  cutoffOccurredAtMs = Number.POSITIVE_INFINITY,
): ReadonlyMap<string, BotIdentityMirrorStateV1> {
  const states = new Map<string, BotIdentityMirrorStateV1>();
  for (const event of events) {
    if (event.kind !== "power_effect") continue;
    const eventAtMs = Date.parse(event.occurredAt);
    if (Number.isFinite(eventAtMs) && eventAtMs > cutoffOccurredAtMs) continue;
    const reset = normalizeBotcastIdentityMirrorResetV1(event.payload);
    if (reset) {
      states.delete(reset.holderBotId);
      continue;
    }
    const state = normalizeBotIdentityMirrorStateV1(event.payload.state);
    if (!state || state.surface !== "signal") continue;
    states.set(state.holderBotId, state);
  }
  return states;
}

/** Uses event sequence/message order so equal timestamps still replay deterministically. */
export function botcastIdentityMirrorStateBeforeMessageV1(
  episode: Pick<BotcastEpisode, "events" | "messages">,
  holderBotId: string,
  messageId: string,
): BotIdentityMirrorStateV1 | null {
  const messageIndex = episode.messages.findIndex(
    (message) => message.id === messageId,
  );
  if (messageIndex < 0) return null;
  const targetUtteranceSequence = episode.events.find(
    (event) =>
      event.kind === "utterance" && event.payload.messageId === messageId,
  )?.sequence;
  let state: BotIdentityMirrorStateV1 | null = null;
  if (targetUtteranceSequence !== undefined) {
    for (const event of episode.events) {
      if (event.sequence >= targetUtteranceSequence) break;
      if (event.kind !== "power_effect") continue;
      const reset = normalizeBotcastIdentityMirrorResetV1(event.payload);
      if (reset?.holderBotId === holderBotId) {
        state = null;
        continue;
      }
      const candidate = normalizeBotIdentityMirrorStateV1(event.payload.state);
      if (
        candidate?.surface === "signal" &&
        candidate.holderBotId === holderBotId
      ) {
        state = candidate;
      }
    }
    return state;
  }
  for (const event of episode.events) {
    if (event.kind !== "power_effect") continue;
    const candidate = normalizeBotIdentityMirrorStateV1(event.payload.state);
    if (
      !candidate ||
      candidate.surface !== "signal" ||
      candidate.holderBotId !== holderBotId
    ) {
      continue;
    }
    const sourceIndex = episode.messages.findIndex(
      (message) => message.id === candidate.sourceMessageId,
    );
    if (sourceIndex >= 0 && sourceIndex < messageIndex) state = candidate;
  }
  return state;
}

/** Legacy departure events predate speakerRole and always represented guests. */
export function botcastDepartureSpeakerRole(
  event: Pick<BotcastReplayEvent, "kind" | "payload">,
): BotcastSpeakerRole | null {
  if (event.kind !== "departure") return null;
  return event.payload.speakerRole === "host" ? "host" : "guest";
}

export function botcastEpisodeDepartureOutcome(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload">[],
): Extract<BotcastEpisodeOutcome, "guest_departed" | "host_departed"> | null {
  const departure = [...events]
    .reverse()
    .find((event) => event.kind === "departure");
  const role = departure ? botcastDepartureSpeakerRole(departure) : null;
  return role === "host"
    ? "host_departed"
    : role === "guest"
      ? "guest_departed"
      : null;
}

/** Reads one role's immutable episode-start Powers for live use and replay. */
export function botcastSnapshotPowersForRoleV1(
  episode: Pick<BotcastEpisode, "events" | "hostBotId" | "guestBotId">,
  role: BotcastSpeakerRole,
): unknown[] | null {
  const snapshot = episode.events.find(
    (event) =>
      event.kind === "segment" &&
      event.payload.segment === "opening" &&
      event.payload.ordinal === 0,
  )?.payload.powerSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  const value = snapshot as Record<string, unknown>;
  if (
    value.v !== 1 ||
    value.hostBotId !== episode.hostBotId ||
    value.guestBotId !== episode.guestBotId
  ) {
    return null;
  }
  const powers = role === "host" ? value.hostPowers : value.guestPowers;
  return Array.isArray(powers) ? powers : null;
}

/** Reads the episode-start Power snapshot so a Signal replay keeps its visibility. */
export function botcastSnapshotAvatarVisibilityModeV1(
  episode: Pick<BotcastEpisode, "events" | "hostBotId" | "guestBotId">,
  role: BotcastSpeakerRole,
): BotPowerAvatarVisibilityModeV1 | null {
  const powers = botcastSnapshotPowersForRoleV1(episode, role);
  return powers ? botPowerAvatarVisibilityModeV1(powers) : null;
}

/** Compatibility helper for the ghost speaking-only treatment. */
export function botcastSnapshotHasSpeakingOnlyAvatarVisibility(
  episode: Pick<BotcastEpisode, "events" | "hostBotId" | "guestBotId">,
  role: BotcastSpeakerRole,
): boolean {
  return botcastSnapshotAvatarVisibilityModeV1(episode, role) === "speaking_only";
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

export interface BotcastMoodBoostEventV1 {
  v: 1;
  effect: "mood_boost";
  powerId: string;
  powerName: string;
  sourceBotId: string;
  targetBotId: string;
  sourceRole: BotcastSpeakerRole;
  targetRole: BotcastSpeakerRole;
  trigger: "after_spoken_turn";
  recipients: "addressed";
  strength: "small" | "medium" | "large";
  /** Resolved theme that selected a conditional branch, when applicable. */
  theme?: "light" | "dark";
  moodBefore: VoiceDeliveryMood;
  moodAfter: VoiceDeliveryMood;
  atMs: number;
  sourceMessageId: string;
}

export interface BotcastMoodDrainEventV1 {
  v: 1;
  effect: "mood_drain";
  powerId: string;
  powerName: string;
  /** Power holder that was directly addressed. */
  sourceBotId: string;
  /** Bot addresser whose mood was reduced. */
  targetBotId: string;
  sourceRole: BotcastSpeakerRole;
  targetRole: BotcastSpeakerRole;
  trigger: "after_direct_address";
  recipient: "addresser";
  strength: "small" | "medium" | "large";
  /** Resolved theme that selected a conditional branch, when applicable. */
  theme?: "light" | "dark";
  moodBefore: VoiceDeliveryMood;
  moodAfter: VoiceDeliveryMood;
  atMs: number;
  /** Completed spoken turn authored by targetBotId. */
  sourceMessageId: string;
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
  return normalizeListenerReactionPlanV1(value);
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

export function normalizeBotcastMoodBoostEventV1(
  value: unknown,
): BotcastMoodBoostEventV1 | null {
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
  const theme = row.theme === "light" || row.theme === "dark"
    ? row.theme
    : undefined;
  const moodBefore =
    row.moodBefore === "joyful" ||
    row.moodBefore === "warm" ||
    row.moodBefore === "guarded" ||
    row.moodBefore === "strained"
      ? row.moodBefore
      : row.moodBefore === "neutral"
        ? "neutral"
        : null;
  const moodAfter =
    row.moodAfter === "joyful" ||
    row.moodAfter === "warm" ||
    row.moodAfter === "guarded" ||
    row.moodAfter === "strained"
      ? row.moodAfter
      : row.moodAfter === "neutral"
        ? "neutral"
        : null;
  if (
    row.v !== 1 ||
    row.effect !== "mood_boost" ||
    !powerId ||
    !powerName ||
    !sourceBotId ||
    !targetBotId ||
    sourceBotId === targetBotId ||
    !sourceMessageId ||
    (row.sourceRole !== "host" && row.sourceRole !== "guest") ||
    (row.targetRole !== "host" && row.targetRole !== "guest") ||
    row.sourceRole === row.targetRole ||
    row.trigger !== "after_spoken_turn" ||
    row.recipients !== "addressed" ||
    (row.strength !== "small" && row.strength !== "medium" && row.strength !== "large") ||
    !moodBefore ||
    !moodAfter ||
    !Number.isFinite(atMs) ||
    atMs < 0
  ) {
    return null;
  }
  return {
    v: 1,
    effect: "mood_boost",
    powerId,
    powerName,
    sourceBotId,
    targetBotId,
    sourceRole: row.sourceRole,
    targetRole: row.targetRole,
    trigger: "after_spoken_turn",
    recipients: "addressed",
    strength: row.strength,
    ...(theme ? { theme } : {}),
    moodBefore,
    moodAfter,
    atMs: Math.round(atMs),
    sourceMessageId,
  };
}

export function botcastMoodBoostEventsAt(args: {
  events: readonly BotcastReplayEvent[];
  elapsedMs: number;
  targetBotId?: string;
}): BotcastMoodBoostEventV1[] {
  const seen = new Set<string>();
  return args.events.flatMap((event) => {
    if (event.kind !== "power_effect") return [];
    const boost = normalizeBotcastMoodBoostEventV1(event.payload);
    if (!boost || boost.atMs > args.elapsedMs) return [];
    if (args.targetBotId && boost.targetBotId !== args.targetBotId) return [];
    const key = `${boost.sourceMessageId}\n${boost.targetBotId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [boost];
  });
}

export function normalizeBotcastMoodDrainEventV1(
  value: unknown,
): BotcastMoodDrainEventV1 | null {
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
  const theme = row.theme === "light" || row.theme === "dark"
    ? row.theme
    : undefined;
  const mood = (candidate: unknown): VoiceDeliveryMood | null =>
    candidate === "joyful" ||
    candidate === "warm" ||
    candidate === "neutral" ||
    candidate === "guarded" ||
    candidate === "strained"
      ? candidate
      : null;
  const moodBefore = mood(row.moodBefore);
  const moodAfter = mood(row.moodAfter);
  if (
    row.v !== 1 ||
    row.effect !== "mood_drain" ||
    !powerId ||
    !powerName ||
    !sourceBotId ||
    !targetBotId ||
    sourceBotId === targetBotId ||
    !sourceMessageId ||
    (row.sourceRole !== "host" && row.sourceRole !== "guest") ||
    (row.targetRole !== "host" && row.targetRole !== "guest") ||
    row.sourceRole === row.targetRole ||
    row.trigger !== "after_direct_address" ||
    row.recipient !== "addresser" ||
    (row.strength !== "small" && row.strength !== "medium" && row.strength !== "large") ||
    !moodBefore ||
    !moodAfter ||
    !Number.isFinite(atMs) ||
    atMs < 0
  ) {
    return null;
  }
  return {
    v: 1,
    effect: "mood_drain",
    powerId,
    powerName,
    sourceBotId,
    targetBotId,
    sourceRole: row.sourceRole,
    targetRole: row.targetRole,
    trigger: "after_direct_address",
    recipient: "addresser",
    strength: row.strength,
    ...(theme ? { theme } : {}),
    moodBefore,
    moodAfter,
    atMs: Math.round(atMs),
    sourceMessageId,
  };
}

export function botcastMoodDrainEventsAt(args: {
  events: readonly BotcastReplayEvent[];
  elapsedMs: number;
  targetBotId?: string;
}): BotcastMoodDrainEventV1[] {
  const seen = new Set<string>();
  return args.events.flatMap((event) => {
    if (event.kind !== "power_effect") return [];
    const drain = normalizeBotcastMoodDrainEventV1(event.payload);
    if (!drain || drain.atMs > args.elapsedMs) return [];
    if (args.targetBotId && drain.targetBotId !== args.targetBotId) return [];
    const key = `${drain.sourceMessageId}\n${drain.sourceBotId}\n${drain.targetBotId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [drain];
  });
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
  /** Bot interview by default; producer means the signed-in person is on mic. */
  guestKind?: BotcastGuestKind;
  /** Saved display label so Producer-guest replays remain intelligible. */
  guestName?: string;
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
  /** Optional user-authored direction used by AI to synthesize this interview. */
  guestContext?: string;
  /** Legacy internal interaction mode; audience truth lives in audienceExperience. */
  guestPresenceMode: BotcastGuestPresenceMode;
  /** Present on audience-facing API copies; absent from internal/legacy records. */
  audienceExperience?: BotcastAudienceExperienceV1;
  /** Participant-neutral human projection; live is default, replay is explicit. */
  observerProjection?: BotcastObserverProjectionV2;
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
  hostInterruptionLines?: string[];
  atmosphereImageUrl?: string | null;
  atmosphereImageId?: string | null;
  dayAtmosphereImageUrl?: string | null;
  dayAtmosphereImageId?: string | null;
  nightAtmosphereImageUrl?: string | null;
  nightAtmosphereImageId?: string | null;
  /** Server-owned derived state; omitted by the public show PATCH route. */
  studioLighting?: BotcastStudioLightingState;
  studioLayout?: BotcastStudioLayout;
  voiceLevelsByBotId?: BotcastVoiceLevelsByBotId;
  atmosphereMix?: BotcastStudioAtmosphereMix;
  regenerateAtmosphere?: boolean;
  regenerateDayAtmosphere?: boolean;
  regenerateNightAtmosphere?: boolean;
  logoImageUrl?: string | null;
  logoImageId?: string | null;
  /** Internal persona-first thesis supplied by Signal's identity pass. */
  logoThesis?: string;
  regenerateLogo?: boolean;
}

export interface BotcastEpisodeCreateRequest {
  guestBotId?: string;
  guestKind?: BotcastGuestKind;
  guestName?: string;
  guestContext?: string;
  topic?: string;
  producerBrief?: string;
  preferredProvider?: BotcastEpisodeProvider;
  modelOverride?: string | null;
  responseMode?: BotcastEpisodeResponseMode;
  /** Null or omitted selects Auto. */
  durationMinutes?: BotcastSessionDurationMinutes | null;
}

/** How a live producer cue reaches the host. */
export type BotcastProducerCueDelivery =
  | "next_host_turn"
  | "interrupt_guest"
  | "redirect_host";

export interface BotcastHostRedirectContext {
  /** The host line currently on mic. */
  messageId: string;
  /** Exact prefix the audience heard before the host changed direction. */
  spokenContent: string;
}

export interface BotcastGuestInterruptionContext {
  /** Present only when a generated guest line had already reached the mic. */
  messageId?: string;
  /** Exact audience-heard prefix; empty means the guest was stopped pre-speech. */
  spokenContent?: string;
  /** Prewritten host bridge played immediately while the redirect generates. */
  bridgeLine: string;
  /** Canned annoyed tail spoken by the interrupted guest over the host bridge. */
  interruptedSpeakerCue?: BotCrosstalkInterruptedSpeakerCue;
}

export interface BotcastEpisodeAdvanceRequest {
  /** Resolved rendered app theme for theme-conditional Powers this turn. */
  theme?: "light" | "dark";
  /** On-air human answer. Valid only when the Producer is the episode guest. */
  guestMessage?: string;
  /** Wall-clock pause after the host yielded; replay preserves it as thinking. */
  guestThinkingMs?: number;
  /**
   * Producer-guest only: truncate the active host line to the exact prefix
   * heard by the audience before yielding the mic to the human guest.
   */
  producerGuestHostInterruption?: BotcastHostRedirectContext;
  cue?: BotcastProducerCue;
  /**
   * Omit for the normal, non-disruptive queue: the host receives the cue on
   * their next turn. `interrupt_guest` gives the host the next turn instead;
   * `redirect_host` lets an early cue reshape a host line already on mic.
   */
  cueDelivery?: BotcastProducerCueDelivery;
  hostRedirect?: BotcastHostRedirectContext;
  guestInterruption?: BotcastGuestInterruptionContext;
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
const BOTCAST_SIGNAL_STANDARD_WORD_DURATION_MS = 350;
const BOTCAST_SIGNAL_STANDARD_STRONG_PAUSE_MS = 160;
const BOTCAST_SIGNAL_STANDARD_SOFT_PAUSE_MS = 70;
const BOTCAST_SIGNAL_STANDARD_MIN_UTTERANCE_MS = 720;
const BOTCAST_SIGNAL_STANDARD_MAX_UTTERANCE_MS = 24_000;

/**
 * Premium-calibrated Signal cadence shared by procedural speech, silent live
 * reveal, and replay. A Power-silenced turn deliberately holds one complete
 * studio shot so removing its audio never accelerates the episode.
 */
export function botcastSignalStandardCadenceDurationMs(text: unknown): number {
  const spokenText = typeof text === "string" ? text.trim() : "";
  if (botPowerResponseIsSilentV1(spokenText)) {
    return BOTCAST_DIRECTOR_MIN_SHOT_MS;
  }
  const wordCount = Math.max(
    1,
    spokenText.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0,
  );
  const strongPauseCount = spokenText.match(/[.!?]+/gu)?.length ?? 0;
  const softPauseCount = spokenText.match(/[,;:]+/gu)?.length ?? 0;
  return Math.min(
    BOTCAST_SIGNAL_STANDARD_MAX_UTTERANCE_MS,
    Math.max(
      BOTCAST_SIGNAL_STANDARD_MIN_UTTERANCE_MS,
      Math.round(
        wordCount * BOTCAST_SIGNAL_STANDARD_WORD_DURATION_MS +
          strongPauseCount * BOTCAST_SIGNAL_STANDARD_STRONG_PAUSE_MS +
          softPauseCount * BOTCAST_SIGNAL_STANDARD_SOFT_PAUSE_MS,
      ),
    ),
  );
}

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
  const explicitPressureDirection =
    cue.kind === "ask_about" &&
    /\b(?:(?:be|get|grow)\s+(?:mean(?:er)?|cruel(?:er)?|harsher|nastier)|(?:annoy|offend|insult|humiliate|antagonize|provoke|enrage|needle|taunt)\s+(?:him|her|them|(?:(?:a|the|your|this|that)\s+)?guest)|(?:try\s+to\s+)?(?:make|force|get)\s+(?:him|her|them|(?:(?:a|the|your|this|that)\s+)?guest)\s+(?:to\s+)?(?:leave|walk\s*out|quit|rage[-\s]?quit)|(?:drive|run)\s+(?:him|her|them|(?:(?:a|the|your|this|that)\s+)?guest)\s+(?:off|out\s+of)\s+(?:the\s+)?(?:show|episode|studio)|rage[-\s]?quit|walkout)\b/iu.test(
      cue.detail ?? "",
    );
  const delta =
    cue.kind === "press_harder" ||
    boundaryLanguage ||
    explicitPressureDirection
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

const BOTCAST_MATURE_FAREWELL_PATTERN =
  /\b(?:good luck(?:\s+with\b[^.!?]*)?|take care(?:\s+of\s+(?:yourself|each other))?|I(?:'m| am) not sure there(?:'s| is) much more I can add|you(?:'ve| have) got (?:everything|all) you need|that(?:'s| is) all that matters now)\b/iu;

const BOTCAST_GUEST_REASK_PATTERN =
  /\b(?:what (?:was|is) that(?: you said)?|what did you (?:just )?(?:say|ask)|say (?:that|it) again|repeat (?:that|it|the question)|once more|come again|pardon(?: me)?|I (?:did not|didn't|could not|couldn't) (?:hear|catch) (?:that|it)|could you (?:repeat|restate|say|ask)\b)/iu;

/** A narrow progress signal used only to keep Auto from mistaking stalls for tapering. */
export function botcastGuestAnswerAdvancesInterview(content: string): boolean {
  if (botPowerResponseIsSilentV1(content)) return false;
  if (botcastSpokenWordCount(content) < 3) return false;
  return !BOTCAST_GUEST_REASK_PATTERN.test(content);
}

const BOTCAST_VOLUNTARY_DEPARTURE_BASE_ACTION = String.raw`(?:leave(?=\s*(?:$|now\b|soon\b|here\b|the\s+(?:show|studio|interview)\b|you\s+(?:to|two)\b))|go(?=\s*(?:$|now\b|home\b|outside\b))|get\s+going\b|head\s+(?:back\s+)?out\b|step\s+outside\b|take\s+off(?=\s*(?:$|now\b|soon\b)))`;
const BOTCAST_VOLUNTARY_DEPARTURE_CONTINUOUS_ACTION = String.raw`(?:leaving(?=\s*(?:$|now\b|soon\b|here\b|the\s+(?:show|studio|interview)\b|you\s+(?:to|two)\b))|heading\s+(?:back\s+)?out\b|stepping\s+outside\b|going\s+(?:home|outside|back\s+(?:home|outside|out))\b)`;
const BOTCAST_VOLUNTARY_DEPARTURE_PATTERNS = [
  new RegExp(
    String.raw`\bI(?:'m| am)\s+(?:(?:really|actually)\s+)?${BOTCAST_VOLUNTARY_DEPARTURE_CONTINUOUS_ACTION}`,
    "iu",
  ),
  new RegExp(
    String.raw`\bI(?:'m| am)\s+(?:(?:really|actually)\s+)?(?:going|gonna)\s+to\s+${BOTCAST_VOLUNTARY_DEPARTURE_BASE_ACTION}`,
    "iu",
  ),
  new RegExp(
    String.raw`\bI\s+(?:need|have|ought)\s+to\s+(?:(?:really|actually|probably)\s+)?${BOTCAST_VOLUNTARY_DEPARTURE_BASE_ACTION}`,
    "iu",
  ),
  new RegExp(
    String.raw`\bI\s+(?:should|must)\s+(?:(?:really|actually|probably)\s+)?${BOTCAST_VOLUNTARY_DEPARTURE_BASE_ACTION}`,
    "iu",
  ),
  new RegExp(
    String.raw`\bI(?:'ve| have)\s+got\s+to\s+${BOTCAST_VOLUNTARY_DEPARTURE_BASE_ACTION}`,
    "iu",
  ),
  new RegExp(
    String.raw`\b(?:this|that)(?:'s| is)\s+my\s+cue\s+to\s+${BOTCAST_VOLUNTARY_DEPARTURE_BASE_ACTION}`,
    "iu",
  ),
] as const;

/**
 * Recognizes a guest's immediate, self-directed exit after the interview has
 * had enough real exchange to earn one. Conditional threats stay in the
 * tension system; this path is for a guest who is actually leaving now.
 */
export function botcastGuestVoluntaryDepartureIntent(args: {
  content: string;
  segment: BotcastEpisodeSegment;
  priorUtteranceCount: number;
}): boolean {
  if (
    args.segment !== "interview" ||
    args.priorUtteranceCount < BOTCAST_AUTO_MIN_EXCHANGES * 2 - 1
  ) {
    return false;
  }
  const clauses = args.content.split(/[.!?;—]+/u);
  return clauses.some((clause) =>
    BOTCAST_VOLUNTARY_DEPARTURE_PATTERNS.some((pattern) => {
      const match = pattern.exec(clause);
      if (!match) return false;
      const prefix = clause.slice(0, match.index);
      return !/\b(?:if|unless)\b/iu.test(prefix);
    }),
  );
}

const BOTCAST_HOST_RAGE_QUIT_PATTERNS = [
  /\bI(?:'m| am)\s+(?:done|finished)\s+(?:here|with\s+(?:this|the)\s+(?:show|interview|episode))\b/iu,
  /\b(?:we(?:'re| are)|(?:this|the)\s+(?:show|interview|episode)\s+is)\s+(?:done|over|finished)(?:\s+(?:here|now))?\b/iu,
  /\bI(?:'m| am)\s+(?:ending|stopping)\s+(?:this|the)\s+(?:show|interview|episode)(?:\s+(?:here|now))?\b/iu,
  /\bI\s+(?:quit|refuse\s+to\s+continue)\b/iu,
  /\b(?:end|stop|cut)\s+(?:this|the)\s+(?:show|interview|episode)\s+(?:here|now)\b/iu,
] as const;

/**
 * Recognizes a host's unmistakable, present-tense decision to terminate an
 * interview after enough real exchange to make the rupture earned.
 */
export function botcastHostRageQuitIntent(args: {
  content: string;
  segment: BotcastEpisodeSegment;
  priorUtteranceCount: number;
}): boolean {
  if (
    args.segment !== "interview" ||
    args.priorUtteranceCount < BOTCAST_AUTO_MIN_EXCHANGES * 2 - 1
  ) {
    return false;
  }
  const clauses = args.content.split(/[.!?;—]+/u);
  return clauses.some((clause) =>
    [
      ...BOTCAST_HOST_RAGE_QUIT_PATTERNS,
      ...BOTCAST_VOLUNTARY_DEPARTURE_PATTERNS,
    ].some((pattern) => {
      const match = pattern.exec(clause);
      if (!match) return false;
      const prefix = clause.slice(0, match.index);
      return !/\b(?:if|unless)\b/iu.test(prefix);
    }),
  );
}

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
  producerGuestThinkingDiscountMs?: number;
}): boolean {
  const utteranceCount = args.messages.length;
  if (
    utteranceCount < BOTCAST_AUTO_MIN_EXCHANGES * 2 ||
    args.messages.at(-1)?.speakerRole !== "guest"
  ) {
    return false;
  }
  const completedHoldMs = Number.isFinite(args.modelWarmupHoldDurationMs)
    ? Math.max(0, args.modelWarmupHoldDurationMs ?? 0)
    : 0;
  const activeHoldMs =
    typeof args.modelWarmupHoldStartedAtMs === "number" &&
    Number.isFinite(args.modelWarmupHoldStartedAtMs)
      ? Math.max(0, args.nowMs - args.modelWarmupHoldStartedAtMs)
      : 0;
  const producerGuestThinkingDiscountMs = Number.isFinite(
    args.producerGuestThinkingDiscountMs,
  )
    ? Math.max(0, args.producerGuestThinkingDiscountMs ?? 0)
    : 0;
  const effectiveElapsedMs = Math.max(
    0,
    args.nowMs -
      args.startedAtMs -
      completedHoldMs -
      activeHoldMs -
      producerGuestThinkingDiscountMs,
  );
  if (args.durationMinutes !== null) {
    return (
      utteranceCount >= BOTCAST_TIMED_MAX_UTTERANCES ||
      effectiveElapsedMs >= args.durationMinutes * 60_000
    );
  }
  if (
    utteranceCount >= BOTCAST_AUTO_MAX_EXCHANGES * 2 ||
    effectiveElapsedMs >= BOTCAST_SESSION_DURATION_MINUTES_MAX * 60_000
  ) {
    return true;
  }

  const latestGuestLine = args.messages.at(-1)?.content ?? "";
  if (BOTCAST_NATURAL_REST_PATTERN.test(latestGuestLine)) return true;
  if (
    utteranceCount >= 10 &&
    BOTCAST_MATURE_FAREWELL_PATTERN.test(latestGuestLine)
  ) {
    return true;
  }

  const substantiveGuestAnswerCount = args.messages.reduce(
    (count, message) =>
      count +
      (message.speakerRole === "guest" &&
      botcastGuestAnswerAdvancesInterview(message.content)
        ? 1
        : 0),
    0,
  );
  if (
    substantiveGuestAnswerCount <
    BOTCAST_AUTO_MIN_SUBSTANTIVE_GUEST_ANSWERS
  ) {
    return false;
  }

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

function botcastParticipantHasDepartedAt(
  events: readonly BotcastReplayEvent[],
  elapsedMs: number,
  role: BotcastSpeakerRole,
): boolean {
  const departure = events.find(
    (event) => botcastDepartureSpeakerRole(event) === role,
  );
  if (!departure) return false;
  const departureShot = events.find(
    (event) =>
      event.sequence > departure.sequence &&
      event.kind === "camera_suggestion" &&
      event.payload.reason === "departure" &&
      (event.payload.speakerRole === role ||
        (role === "guest" && event.payload.speakerRole === undefined)),
  );
  const departureAtMs = Number(departureShot?.payload.atMs);
  return Number.isFinite(departureAtMs) && elapsedMs >= departureAtMs;
}

export function botcastGuestHasDepartedAt(
  events: readonly BotcastReplayEvent[],
  elapsedMs: number,
): boolean {
  return botcastParticipantHasDepartedAt(events, elapsedMs, "guest");
}

export function botcastHostHasDepartedAt(
  events: readonly BotcastReplayEvent[],
  elapsedMs: number,
): boolean {
  return botcastParticipantHasDepartedAt(events, elapsedMs, "host");
}

export interface BotcastReplayThinkingRange {
  messageId: string;
  startMs: number;
  endMs: number;
}

export function botcastProducerGuestThinkingTimelineDurationMs(
  wallDurationMs: number,
): number {
  if (!Number.isFinite(wallDurationMs) || wallDurationMs <= 0) return 0;
  return Math.max(
    0,
    Math.round(
      wallDurationMs * BOTCAST_PRODUCER_GUEST_THINKING_TIME_SCALE,
    ),
  );
}

function botcastProducerGuestThinkingTimelineDurationForEventMs(
  event: BotcastReplayEvent,
): number {
  if (event.kind !== "guest_thinking") return 0;
  const wallDurationMs = Number(event.payload.wallDurationMs);
  if (!Number.isFinite(wallDurationMs) || wallDurationMs <= 0) return 0;
  const scaledTimelineDurationMs =
    botcastProducerGuestThinkingTimelineDurationMs(wallDurationMs);
  const recordedTimelineDurationMs = Number(event.payload.timelineDurationMs);
  const timelineDurationMs =
    Number.isFinite(recordedTimelineDurationMs) &&
    recordedTimelineDurationMs !== wallDurationMs
      ? recordedTimelineDurationMs
      : scaledTimelineDurationMs;
  return Math.max(0, Math.min(wallDurationMs, Math.round(timelineDurationMs)));
}

export function botcastProducerGuestThinkingDiscountMs(
  events: readonly BotcastReplayEvent[],
): number {
  return events.reduce((total, event) => {
    if (event.kind !== "guest_thinking") return total;
    const wallDurationMs = Number(event.payload.wallDurationMs);
    if (!Number.isFinite(wallDurationMs) || wallDurationMs <= 0) return total;
    return (
      total +
      Math.max(
        0,
        Math.round(
          wallDurationMs *
            (1 - BOTCAST_PRODUCER_GUEST_THINKING_TIME_SCALE),
        ),
      )
    );
  }, 0);
}

export function botcastReplayTimeline(
  messages: readonly (Pick<BotcastMessage, "content"> &
    Partial<Pick<BotcastMessage, "id">>)[],
  events: readonly BotcastReplayEvent[],
): {
  durationMs: number;
  messageStartMs: number[];
  messageEndMs: number[];
  thinkingRanges: BotcastReplayThinkingRange[];
} {
  const thinkingDurationByMessageId = new Map<string, number>();
  const perceptionOverlapByMessageId = new Map(
    botcastPerceptionOverlapEventsV1(events).map((overlap) => [
      overlap.overlappingMessageId,
      overlap,
    ] as const),
  );
  for (const event of events) {
    if (event.kind !== "guest_thinking") continue;
    const messageId = event.payload.messageId;
    if (typeof messageId !== "string" || !messageId) continue;
    thinkingDurationByMessageId.set(
      messageId,
      botcastProducerGuestThinkingTimelineDurationForEventMs(event),
    );
  }
  let cursorMs = 0;
  const messageEndMs: number[] = [];
  const messageStartMs: number[] = [];
  const messageIndexById = new Map<string, number>();
  const thinkingRanges: BotcastReplayThinkingRange[] = [];
  messages.forEach((message, index) => {
    const messageId = message.id ?? "";
    const thinkingDurationMs =
      thinkingDurationByMessageId.get(messageId) ?? 0;
    if (thinkingDurationMs > 0) {
      thinkingRanges.push({
        messageId,
        startMs: cursorMs,
        endMs: cursorMs + thinkingDurationMs,
      });
      cursorMs += thinkingDurationMs;
    }
    const durationMs = Math.max(
      BOTCAST_DIRECTOR_MIN_SHOT_MS,
      botcastSignalStandardCadenceDurationMs(message.content),
    );
    const overlap = perceptionOverlapByMessageId.get(messageId);
    const precedingIndex = overlap
      ? messageIndexById.get(overlap.precedingMessageId)
      : undefined;
    const overlapStartMs = overlap && precedingIndex !== undefined
      ? (messageStartMs[precedingIndex] ?? 0) +
        ((messageEndMs[precedingIndex] ?? 0) -
          (messageStartMs[precedingIndex] ?? 0)) * overlap.startRatio
      : cursorMs;
    const twoVoiceFloorMs = index >= 2 ? messageEndMs[index - 2] ?? 0 : 0;
    const startMs = overlap && precedingIndex === index - 1
      ? Math.max(overlapStartMs, twoVoiceFloorMs)
      : cursorMs;
    const endMs = startMs + durationMs;
    messageStartMs.push(Math.round(startMs));
    messageEndMs.push(Math.round(endMs));
    cursorMs = Math.max(cursorMs, endMs);
    if (messageId) messageIndexById.set(messageId, index);
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
    messageEndMs,
    thinkingRanges,
  };
}

export function botcastReplayMessageIndexAt(
  messageStartMs: readonly number[],
  elapsedMs: number,
  messageEndMs?: readonly number[],
): number {
  if (messageStartMs.length === 0) return -1;
  let activeIndex = -1;
  for (let index = 0; index < messageStartMs.length; index += 1) {
    if (messageStartMs[index]! > elapsedMs) break;
    activeIndex =
      messageEndMs && elapsedMs >= (messageEndMs[index] ?? 0) ? -1 : index;
  }
  return activeIndex;
}

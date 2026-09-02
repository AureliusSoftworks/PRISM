import type { VoiceDeliveryMood } from "./audioVoice.js";
import type { BotPowerTrollPresentationV1 } from "./trollPower.ts";
import type { SignalMusicProfile } from "./signalMusicProfile.js";
import {
  normalizeBotIdentityMirrorStateV1,
  type BotIdentityMirrorStateV1,
} from "./botIdentityMirror.ts";
import {
  normalizeBotIdentityShapeshiftStateV1,
  type BotIdentityShapeshiftStateV1,
} from "./botIdentityShapeshift.ts";
import {
  normalizeBotFalseNameStateV1,
  type BotFalseNameStateV1,
} from "./botFalseName.ts";
import {
  DIRECTIONAL_IRRITATION_REBUFF_SNARK_CUES,
  DIRECTIONAL_IRRITATION_SNARK_CUES,
  foldDirectionalIrritationTransitions,
  normalizeDirectionalIrritationDeliveryPlanV1,
  normalizeDirectionalIrritationTransitionV1,
  readDirectionalIrritationIntensity,
  type DirectionalIrritationDeliveryPlanV1,
  type DirectionalIrritationEdgeV1,
  type DirectionalIrritationTransitionV1,
} from "./directionalIrritation.ts";
import {
  listenerReactionInterruptedSpeakerTextV1,
  listenerReactionSpeechCopySourceV1,
  listenerReactionSpokenTextV1,
  normalizeCrosstalkReclaimPlanV1,
  normalizeBotCrosstalkInterruptedSpeakerCue,
  normalizeListenerReactionPlanV1,
  socialSilenceMessageIsMarkedV1,
  type BotCrosstalkInterruptedSpeakerCue,
  type CrosstalkReclaimPlanV1,
  type ListenerReactionPlanV1,
  type SignalListenerReactionKitV1,
  type SocialSilenceMarkerV1,
} from "./listenerReaction.ts";
import {
  BOT_POWER_CANONICAL_SILENCE_V1,
  botPowerAvatarVisibilityModeV1,
  botPowerEternallyIntroducesV1,
  botPowerResponseIsSilentV1,
  botPowerTrollsV1,
  type BotPowerMutePerformanceV1,
  type BotPowerAvatarVisibilityModeV1,
  type BotPowerObserverPerspectiveV1,
  type BotPowerObserverVisibilityV1,
} from "./botPower.ts";
import { signalPicklesSipCueFromEvent } from "./signalPickles.ts";
import {
  normalizeSignalConversationRepairEventV1,
  normalizeSignalStudioIncidentEventV1,
  type SignalConversationRepairEventV1,
  type SignalStudioIncidentEventV1,
} from "./signalOrganicPerformance.ts";
import {
  normalizeVoicePerformancePlanV2,
  type VoicePerformancePlanV2,
} from "./voicePerformance.ts";
import {
  planAutoCameraCoverage,
  type AutoCameraCoverageBeat,
} from "./autoCameraDirector.ts";
import {
  normalizeSignalVisualRecognitionV1,
  type SignalVisualRecognitionV1,
  type SignalVisualPassportBundleV1,
} from "./signalVisualRecognition.ts";

export type BotcastEpisodeSegment = "opening" | "interview" | "closing";
export type BotcastEpisodeStatus = "live" | "completed" | "cancelled";
export type BotcastEpisodeOutcome =
  | "completed"
  | "guest_departed"
  | "host_departed";
export type BotcastEpisodeProvider =
  | "local"
  | "ollama_cloud"
  | "openai"
  | "anthropic";
export type BotcastEpisodeResponseMode = "local" | "auto" | "online";
export type BotcastSpeakerRole = "host" | "guest";
export type BotcastGuestKind = "bot" | "producer";
/**
 * Live Produce/Interview vs Watch-a-show full bake.
 * Watch still casts a bot guest; cues and producer involvement are disabled.
 */
export type BotcastPlaybackMode = "live" | "watch";
export const BOTCAST_PRODUCER_GUEST_ID = "__signal_producer_guest__";
export const BOTCAST_PRODUCER_GUEST_NAME = "the Producer";
export const BOTCAST_PRODUCER_GUEST_THINKING_TIME_SCALE = 0.5;
export const BOTCAST_PRODUCER_BRIEF_MAX_LENGTH = 2_000;
export const BOTCAST_GUEST_BRIEF_MAX_LENGTH = 2_000;
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
export const BOTCAST_HOST_RECOVERY_QUESTION_TARGET = 4;
export const BOTCAST_HOST_RECOVERY_QUESTION_MAX_LENGTH = 200;
/**
 * Legacy safety net only. Newly completed shows persist persona-authored
 * equivalents in the same positional order.
 */
export const BOTCAST_HOST_RECOVERY_QUESTION_FALLBACKS = [
  "Make that concrete for me: what is one example that would test the claim?",
  "What consequence matters most here, and who has to live with it?",
  "Where does this become a real choice, and what does that choice cost?",
  "What contradiction or evidence would make you reconsider that answer?",
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

export function normalizeBotcastHostRecoveryQuestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  if (
    raw.length === 1 &&
    raw[0] === BOT_POWER_CANONICAL_SILENCE_V1
  ) {
    return [BOT_POWER_CANONICAL_SILENCE_V1];
  }
  const seen = new Set<string>();
  const questions: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const question = value.replace(/\s+/gu, " ").trim();
    const key = question.toLocaleLowerCase();
    if (
      !question.endsWith("?") ||
      question.length < 12 ||
      question.length > BOTCAST_HOST_RECOVERY_QUESTION_MAX_LENGTH ||
      /^(?:host|guest|question|fallback|template)\s*:/iu.test(question) ||
      /^(?:\[|\(|\*)/u.test(question) ||
      /\b(?:as an ai|language model|fallback template|placeholder)\b/iu.test(
        question,
      ) ||
      seen.has(key)
    ) {
      continue;
    }
    seen.add(key);
    questions.push(question);
    if (questions.length >= BOTCAST_HOST_RECOVERY_QUESTION_TARGET) break;
  }
  return questions;
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
  if (prefix === fullContent || /—$/u.test(prefix)) return prefix;
  return `${prefix}—`;
}

/**
 * Phrase an echo-bound Signal host may use when cutting in: the audience-heard
 * guest prefix when one exists, otherwise the prior on-air cast line.
 */
export function botcastEchoHostInterruptPhrase(args: {
  messages: readonly Pick<BotcastMessage, "id" | "content">[];
  interruption?: {
    messageId?: string;
    spokenContent?: string;
  };
}): string {
  const spoken = args.interruption?.spokenContent?.trimEnd() ?? "";
  if (spoken.trim()) {
    const target = args.interruption?.messageId
      ? args.messages.find(
          (message) => message.id === args.interruption?.messageId,
        )
      : undefined;
    if (target?.content) {
      return (
        botcastInterruptedGuestContent(target.content, spoken) ??
        spoken.replace(/\s+/gu, " ").trim()
      );
    }
    return spoken.replace(/\s+/gu, " ").trim();
  }
  const interruptedId = args.interruption?.messageId;
  for (let index = args.messages.length - 1; index >= 0; index -= 1) {
    const message = args.messages[index]!;
    if (interruptedId && message.id === interruptedId) continue;
    const content = message.content.replace(/\s+/gu, " ").trim();
    if (!content || botPowerResponseIsSilentV1(content)) continue;
    return content;
  }
  return "";
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
  | "present_image"
  | "refocus"
  | "press_harder"
  | "move_on"
  | "lighten_up"
  | "wrap_up";
export type BotcastTensionStage =
  "calm" | "resistance" | "warning" | "departed";
export type BotcastCameraShot = "auto" | "left" | "right" | "wide";
export type BotcastDirectedCameraShot = Exclude<BotcastCameraShot, "auto">;
export interface BotcastEpisodeImagePlacement {
  /** Horizontal viewport position in percent. */
  x: number;
  /** Vertical viewport position in percent. */
  y: number;
  /** Visual size for transparent PNG item cutouts. */
  itemScale: number;
  /** Visual size for opaque PNG and JPG pictures. */
  photoScale: number;
}
export interface BotcastLogoPlacement {
  x: number;
  y: number;
  scale: number;
}
export interface BotcastCameraFrame {
  zoom: number;
  /** Horizontal adjustment layered over Signal's automatic subject framing. */
  panX: number;
  /** Vertical adjustment layered over Signal's automatic subject framing. */
  panY: number;
  /** Camera-specific placement for the transient episode image prop. */
  episodeImage: BotcastEpisodeImagePlacement;
}
export type BotcastCameraFraming = Record<
  BotcastDirectedCameraShot,
  BotcastCameraFrame
>;
export const BOTCAST_CAMERA_ZOOM_MIN = 1;
export const BOTCAST_CAMERA_ZOOM_MAX = 2;
export const BOTCAST_CAMERA_ZOOM_STEP = 0.01;
export const BOTCAST_CAMERA_PAN_MIN = -30;
export const BOTCAST_CAMERA_PAN_MAX = 30;
export const BOTCAST_CAMERA_PAN_STEP = 0.25;
export const BOTCAST_EPISODE_IMAGE_POSITION_MIN = 5;
export const BOTCAST_EPISODE_IMAGE_POSITION_MAX = 95;
export const BOTCAST_EPISODE_IMAGE_POSITION_STEP = 0.5;
export const BOTCAST_EPISODE_IMAGE_SCALE_MIN = 45;
export const BOTCAST_EPISODE_IMAGE_SCALE_MAX = 140;
export const BOTCAST_EPISODE_IMAGE_SCALE_STEP = 5;
export const BOTCAST_DEFAULT_LOGO_PLACEMENT: Readonly<BotcastLogoPlacement> = {
  x: 50,
  y: 8,
  scale: 100,
};
const BOTCAST_LEGACY_EPISODE_IMAGE_PLACEMENT: Readonly<
  Record<BotcastDirectedCameraShot, { x: number; y: number; scale: number }>
> = {
  left: { x: 74, y: 62, scale: 70 },
  right: { x: 26, y: 62, scale: 70 },
  wide: { x: 50, y: 66, scale: 72 },
};
export const BOTCAST_DEFAULT_CAMERA_FRAMING: Readonly<BotcastCameraFraming> = {
  left: {
    zoom: 1.42,
    panX: 0,
    panY: 0,
    episodeImage: { x: 24, y: 72, itemScale: 50, photoScale: 90 },
  },
  right: {
    zoom: 1.42,
    panX: 0,
    panY: 0,
    episodeImage: { x: 76, y: 72, itemScale: 50, photoScale: 90 },
  },
  wide: {
    zoom: 1,
    panX: 0,
    panY: 0,
    episodeImage: { x: 50, y: 75, itemScale: 50, photoScale: 90 },
  },
};
export const BOTCAST_AUTO_CAMERA_LEAD_IN_MIN_MS = 240;
export const BOTCAST_AUTO_CAMERA_LEAD_IN_MAX_MS = 420;

function normalizeBotcastCameraFrame(
  value: unknown,
  fallback: Readonly<BotcastCameraFrame>,
): BotcastCameraFrame {
  const container =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<BotcastCameraFrame>)
      : {};
  const bounded = (
    candidate: unknown,
    fallbackValue: number,
    minimum: number,
    maximum: number,
  ): number => {
    const parsed =
      typeof candidate === "number"
        ? candidate
        : typeof candidate === "string"
          ? Number(candidate)
          : Number.NaN;
    return Number(
      Math.max(
        minimum,
        Math.min(maximum, Number.isFinite(parsed) ? parsed : fallbackValue),
      ).toFixed(2),
    );
  };
  return {
    zoom: bounded(
      container.zoom,
      fallback.zoom,
      BOTCAST_CAMERA_ZOOM_MIN,
      BOTCAST_CAMERA_ZOOM_MAX,
    ),
    panX: bounded(
      container.panX,
      fallback.panX,
      BOTCAST_CAMERA_PAN_MIN,
      BOTCAST_CAMERA_PAN_MAX,
    ),
    panY: bounded(
      container.panY,
      fallback.panY,
      BOTCAST_CAMERA_PAN_MIN,
      BOTCAST_CAMERA_PAN_MAX,
    ),
    episodeImage: normalizeBotcastEpisodeImagePlacement(
      container.episodeImage,
      fallback.episodeImage,
    ),
  };
}

export function normalizeBotcastEpisodeImagePlacement(
  value: unknown,
  fallback: Readonly<BotcastEpisodeImagePlacement>,
): BotcastEpisodeImagePlacement {
  const container =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<BotcastEpisodeImagePlacement> & { scale?: unknown })
      : {};
  const bounded = (
    candidate: unknown,
    fallbackValue: number,
    minimum: number,
    maximum: number,
  ): number => {
    const parsed =
      typeof candidate === "number"
        ? candidate
        : typeof candidate === "string"
          ? Number(candidate)
          : Number.NaN;
    return Number(
      Math.max(
        minimum,
        Math.min(maximum, Number.isFinite(parsed) ? parsed : fallbackValue),
      ).toFixed(2),
    );
  };
  return {
    x: bounded(
      container.x,
      fallback.x,
      BOTCAST_EPISODE_IMAGE_POSITION_MIN,
      BOTCAST_EPISODE_IMAGE_POSITION_MAX,
    ),
    y: bounded(
      container.y,
      fallback.y,
      BOTCAST_EPISODE_IMAGE_POSITION_MIN,
      BOTCAST_EPISODE_IMAGE_POSITION_MAX,
    ),
    // Before item and photo sizing split, `scale` was an item-cutout size.
    // Preserve that authored meaning, while photos receive the show's normal
    // photo fallback until a producer rehearses them explicitly.
    itemScale: bounded(
      container.itemScale ?? container.scale,
      fallback.itemScale,
      BOTCAST_EPISODE_IMAGE_SCALE_MIN,
      BOTCAST_EPISODE_IMAGE_SCALE_MAX,
    ),
    photoScale: bounded(
      container.photoScale,
      fallback.photoScale,
      BOTCAST_EPISODE_IMAGE_SCALE_MIN,
      BOTCAST_EPISODE_IMAGE_SCALE_MAX,
    ),
  };
}

export function normalizeBotcastLogoPlacement(
  value: unknown,
  fallback: Readonly<BotcastLogoPlacement> = BOTCAST_DEFAULT_LOGO_PLACEMENT,
): BotcastLogoPlacement {
  const container =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<BotcastLogoPlacement>)
      : {};
  const placement = normalizeBotcastEpisodeImagePlacement(
    container,
    { x: fallback.x, y: fallback.y, itemScale: fallback.scale, photoScale: fallback.scale },
  );
  return { x: placement.x, y: placement.y, scale: placement.itemScale };
}

export function normalizeBotcastCameraFraming(
  value: unknown,
  fallback: Readonly<BotcastCameraFraming> =
    BOTCAST_DEFAULT_CAMERA_FRAMING,
): BotcastCameraFraming {
  const container =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<Record<BotcastDirectedCameraShot, unknown>>)
      : {};
  const normalizedFrame = (
    shot: BotcastDirectedCameraShot,
  ): BotcastCameraFrame => {
    const frame = normalizeBotcastCameraFrame(container[shot], fallback[shot]);
    const legacy = BOTCAST_LEGACY_EPISODE_IMAGE_PLACEMENT[shot];
    if (
      frame.episodeImage.x === legacy.x &&
      frame.episodeImage.y === legacy.y &&
      frame.episodeImage.itemScale === legacy.scale &&
      frame.episodeImage.photoScale === fallback[shot].episodeImage.photoScale
    ) {
      return { ...frame, episodeImage: { ...fallback[shot].episodeImage } };
    }
    return frame;
  };
  return {
    left: normalizedFrame("left"),
    right: normalizedFrame("right"),
    wide: normalizedFrame("wide"),
  };
}

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
  /** Derived only for synthesized studios; uploaded artwork never receives this mask. */
  microphoneTintMaskUrl: string | null;
  microphoneTintMaskImageId: string | null;
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
  /** Floor-glow footprint relative to the authored maximum. */
  scale?: number;
}

export type BotcastStudioLayoutItem =
  | "hostBot"
  | "guestBot"
  | "hostCup"
  | "guestCup"
  | "hostFloorGlow"
  | "guestFloorGlow";

export type BotcastStudioLayout = Record<
  BotcastStudioLayoutItem,
  BotcastStudioPoint
>;

export const BOTCAST_STUDIO_FLOOR_GLOW_SCALE_MIN = 0.35;
export const BOTCAST_STUDIO_FLOOR_GLOW_SCALE_MAX = 1;
export const BOTCAST_STUDIO_FLOOR_GLOW_SCALE_STEP = 0.05;

export type BotcastVoiceLevelsByBotId = Record<string, number>;

export type BotcastStudioGlowBlendMode = "hard-light" | "screen" | "overlay";

export interface BotcastStudioGlowThemeTuning {
  opacity: number;
  blendMode: BotcastStudioGlowBlendMode;
}

export interface BotcastStudioGlowTuning {
  dark: BotcastStudioGlowThemeTuning;
  light: BotcastStudioGlowThemeTuning;
}

export const BOTCAST_DEFAULT_STUDIO_GLOW_TUNING: Readonly<BotcastStudioGlowTuning> = {
  dark: { opacity: 1, blendMode: "hard-light" },
  light: { opacity: 1, blendMode: "hard-light" },
};

function normalizeBotcastStudioGlowThemeTuning(
  value: unknown,
  fallback: Readonly<BotcastStudioGlowThemeTuning>,
): BotcastStudioGlowThemeTuning {
  const container =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<BotcastStudioGlowThemeTuning>)
      : {};
  const parsedOpacity =
    typeof container.opacity === "number"
      ? container.opacity
      : typeof container.opacity === "string"
        ? Number(container.opacity)
        : Number.NaN;
  return {
    opacity: Number(
      Math.max(
        0,
        Math.min(1, Number.isFinite(parsedOpacity) ? parsedOpacity : fallback.opacity),
      ).toFixed(2),
    ),
    blendMode:
      container.blendMode === "hard-light" ||
      container.blendMode === "screen" ||
      container.blendMode === "overlay"
        ? container.blendMode
        : fallback.blendMode,
  };
}

export function normalizeBotcastStudioGlowTuning(
  value: unknown,
  fallback: Readonly<BotcastStudioGlowTuning> =
    BOTCAST_DEFAULT_STUDIO_GLOW_TUNING,
): BotcastStudioGlowTuning {
  const container =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<BotcastStudioGlowTuning>)
      : {};
  return {
    dark: normalizeBotcastStudioGlowThemeTuning(container.dark, fallback.dark),
    light: normalizeBotcastStudioGlowThemeTuning(
      container.light,
      fallback.light,
    ),
  };
}

export interface BotcastStudioAtmosphereMix {
  background: number;
  grain: number;
  foley: number;
  /** Visual film grain over the composited studio screen; never an audio bus. */
  filmGrain: number;
}

/** The reusable, show-agnostic portion of a Signal Rehearse Stage. */
export interface BotcastStagePresetSettings {
  studioLayout: BotcastStudioLayout;
  cameraFraming: BotcastCameraFraming;
  logoPlacement: BotcastLogoPlacement;
  studioGlowTuning: BotcastStudioGlowTuning;
  /** Per-bot gains are retained without selecting or otherwise changing a cast. */
  voiceLevelsByBotId: BotcastVoiceLevelsByBotId;
  atmosphereMix: BotcastStudioAtmosphereMix;
}

export interface BotcastStagePreset {
  id: string;
  name: string;
  settings: BotcastStagePresetSettings;
  createdAt: string;
  updatedAt: string;
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
  // This is the lowest bot anchor that still reaches the 55% close-up focal
  // line at the default zoom without panning beyond the bottom of the stage.
  hostBot: { x: 22.5, y: 68.25 },
  guestBot: { x: 77.5, y: 68.25 },
  hostCup: { x: 36.25, y: 90 },
  guestCup: { x: 63.75, y: 90 },
  hostFloorGlow: {
    x: 22.5,
    y: 84,
    scale: BOTCAST_STUDIO_FLOOR_GLOW_SCALE_MAX,
  },
  guestFloorGlow: {
    x: 77.5,
    y: 84,
    scale: BOTCAST_STUDIO_FLOOR_GLOW_SCALE_MAX,
  },
};

const BOTCAST_PREVIOUS_COMPLETE_DEFAULT_STUDIO_LAYOUTS = [
  {
    hostBot: { x: 22.5, y: 71.25 },
    guestBot: { x: 77.5, y: 71.25 },
    hostCup: { x: 36.25, y: 90 },
    guestCup: { x: 63.75, y: 90 },
    hostFloorGlow: {
      x: 22.5,
      y: 84,
      scale: BOTCAST_STUDIO_FLOOR_GLOW_SCALE_MAX,
    },
    guestFloorGlow: {
      x: 77.5,
      y: 84,
      scale: BOTCAST_STUDIO_FLOOR_GLOW_SCALE_MAX,
    },
  },
] as const satisfies readonly BotcastStudioLayout[];

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
] as const satisfies readonly Pick<
  BotcastStudioLayout,
  "hostBot" | "guestBot" | "hostCup" | "guestCup"
>[];

export const BOTCAST_CLOSEUP_CAMERA_SCALE = 1.42;

function botcastCameraOffsetPercent(args: {
  focusPercent: number;
  focalLinePercent: number;
  transformOriginPercent: number;
  zoom: number;
}): number {
  const desiredOffset =
    (args.focalLinePercent - args.focusPercent) * args.zoom;
  const zoomOverflow = args.zoom - 1;
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
  zoom = BOTCAST_CLOSEUP_CAMERA_SCALE,
): number {
  if (shot === "wide") return 0;
  const focusX = shot === "left" ? layout.hostBot.x : layout.guestBot.x;
  return botcastCameraOffsetPercent({
    focusPercent: focusX,
    focalLinePercent: 50,
    transformOriginPercent: 50,
    zoom,
  });
}

/** Follows the saved height while keeping the zoomed scene inside the TV frame. */
export function botcastCameraOffsetYPercent(
  shot: BotcastDirectedCameraShot,
  layout: BotcastStudioLayout,
  zoom = BOTCAST_CLOSEUP_CAMERA_SCALE,
): number {
  if (shot === "wide") return 0;
  const focusY = shot === "left" ? layout.hostBot.y : layout.guestBot.y;
  return botcastCameraOffsetPercent({
    focusPercent: focusY,
    focalLinePercent: 55,
    transformOriginPercent: 55,
    zoom,
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
  hostFloorGlow: { minX: 10, maxX: 90, minY: 45, maxY: 96 },
  guestFloorGlow: { minX: 10, maxX: 90, minY: 45, maxY: 96 },
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
  const hasSavedFloorGlow =
    rawContainer.hostFloorGlow !== undefined ||
    rawContainer.guestFloorGlow !== undefined;
  const isPreviousCompleteDefault =
    hasSavedFloorGlow &&
    BOTCAST_PREVIOUS_COMPLETE_DEFAULT_STUDIO_LAYOUTS.some((previousDefault) =>
      (
        Object.keys(previousDefault) as Array<keyof typeof previousDefault>
      ).every((item) => {
        const point = rawContainer[item];
        const expectedPoint = previousDefault[item] as BotcastStudioPoint;
        return Boolean(
          point &&
          typeof point === "object" &&
          !Array.isArray(point) &&
          (point as Partial<BotcastStudioPoint>).x === expectedPoint.x &&
          (point as Partial<BotcastStudioPoint>).y === expectedPoint.y &&
          (point as Partial<BotcastStudioPoint>).scale ===
            expectedPoint.scale,
        );
      }),
    );
  const isPreviousDefault =
    isPreviousCompleteDefault ||
    (!hasSavedFloorGlow &&
      BOTCAST_PREVIOUS_DEFAULT_STUDIO_LAYOUTS.some((previousDefault) =>
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
            (point as Partial<BotcastStudioPoint>).y ===
              previousDefault[item].y,
          );
        }),
      ));
  const hasPreviousDefaultBotAnchors = (() => {
    const hostBot = rawContainer.hostBot;
    const guestBot = rawContainer.guestBot;
    return Boolean(
      hostBot &&
      typeof hostBot === "object" &&
      !Array.isArray(hostBot) &&
      guestBot &&
      typeof guestBot === "object" &&
      !Array.isArray(guestBot) &&
      (hostBot as Partial<BotcastStudioPoint>).x === 22.5 &&
      (hostBot as Partial<BotcastStudioPoint>).y === 71.25 &&
      (guestBot as Partial<BotcastStudioPoint>).x === 77.5 &&
      (guestBot as Partial<BotcastStudioPoint>).y === 71.25,
    );
  })();
  const container = isPreviousDefault ? {} : rawContainer;
  const layout = (
    Object.keys(BOTCAST_DEFAULT_STUDIO_LAYOUT) as BotcastStudioLayoutItem[]
  ).reduce<BotcastStudioLayout>((layout, item) => {
    const rawPoint =
      hasPreviousDefaultBotAnchors &&
      (item === "hostBot" || item === "guestBot")
        ? undefined
        : container[item];
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
        ...(item === "hostFloorGlow" || item === "guestFloorGlow"
          ? {
              scale: botcastStudioCoordinate(
                point.scale,
                fallback[item].scale ?? BOTCAST_STUDIO_FLOOR_GLOW_SCALE_MAX,
                BOTCAST_STUDIO_FLOOR_GLOW_SCALE_MIN,
                BOTCAST_STUDIO_FLOOR_GLOW_SCALE_MAX,
              ),
            }
          : {}),
      };
      return layout;
    }, {} as BotcastStudioLayout);
  // Floor light position is a vertical stage adjustment while scale is saved
  // separately. Its horizontal anchor always follows the paired performer.
  layout.hostFloorGlow.x = layout.hostBot.x;
  layout.guestFloorGlow.x = layout.guestBot.x;
  return layout;
}

/** Exchanges seats while keeping each performer with their cup and floor light. */
export function swapBotcastStudioLayoutSeats(
  value: unknown,
): BotcastStudioLayout {
  const layout = normalizeBotcastStudioLayout(value);
  return {
    hostBot: { ...layout.guestBot },
    guestBot: { ...layout.hostBot },
    hostCup: { ...layout.guestCup },
    guestCup: { ...layout.hostCup },
    hostFloorGlow: { ...layout.guestFloorGlow },
    guestFloorGlow: { ...layout.hostFloorGlow },
  };
}

/** Normalizes the complete reusable Rehearsal/Fine tuning stage contract. */
export function normalizeBotcastStagePresetSettings(
  value: unknown,
  fallback?: Partial<BotcastStagePresetSettings>,
): BotcastStagePresetSettings {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<BotcastStagePresetSettings>)
      : {};
  return {
    studioLayout: normalizeBotcastStudioLayout(
      source.studioLayout,
      fallback?.studioLayout ?? BOTCAST_DEFAULT_STUDIO_LAYOUT,
    ),
    cameraFraming: normalizeBotcastCameraFraming(
      source.cameraFraming,
      fallback?.cameraFraming ?? BOTCAST_DEFAULT_CAMERA_FRAMING,
    ),
    logoPlacement: normalizeBotcastLogoPlacement(
      source.logoPlacement,
      fallback?.logoPlacement ?? BOTCAST_DEFAULT_LOGO_PLACEMENT,
    ),
    studioGlowTuning: normalizeBotcastStudioGlowTuning(
      source.studioGlowTuning,
      fallback?.studioGlowTuning ?? BOTCAST_DEFAULT_STUDIO_GLOW_TUNING,
    ),
    voiceLevelsByBotId: normalizeBotcastVoiceLevelsByBotId(
      source.voiceLevelsByBotId,
      fallback?.voiceLevelsByBotId ?? {},
    ),
    atmosphereMix: normalizeBotcastStudioAtmosphereMix(
      source.atmosphereMix,
      fallback?.atmosphereMix ?? BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX,
    ),
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
  "Preserve both empty cup coasters exactly as shown, fully visible and unobstructed; do not place any object or drinkware on either coaster.",
  "On both microphones, keep the exact flat electric-magenta #FF00FF color key confined to the illuminated trim, LED rings, and status lights. Keep #FF00FF out of every other object, reflection, light, surface, and pixel.",
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
  /** Provider-safe persona brief and concrete metaphor that make the mark host-specific. */
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
  /** One-step history. Older show-logo revisions are not retained by the show. */
  previousImageUrl: string | null;
  previousImageId: string | null;
  revision: number;
  status: "fallback" | "ready" | "failed";
  fallbackGlyph: BotcastLogoGlyph;
  design: BotcastLogoDesignV1;
  /** Previous accepted genomes prevent Refresh logo from cycling backward. */
  retiredDesigns: BotcastLogoDesignV1[];
  /** Per-show stage placement of the center-screen logo/title lockup. */
  placement?: BotcastLogoPlacement;
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
  undoAvailable: boolean;
}

export interface BotcastAtmosphereAudioState {
  source: "bundled" | "elevenlabs";
  audioUrl: string;
  durationMs: number;
  revision: number;
  model: string | null;
  undoAvailable: boolean;
}

/** Saved, editable direction plus the provider-safe fingerprint derived from it. */
export interface BotcastMusicIdentity {
  version: 1;
  direction: string;
  revision: number;
  profile: SignalMusicProfile;
}

export interface BotcastShow {
  id: string;
  hostBotId: string;
  /** True only when the referenced host is still an enabled bot owned by this account. */
  hasActiveHost: boolean;
  name: string;
  premise: string;
  hostingStyle: string;
  accentColor: string;
  fallbackStudioAccentVariant: BotcastFallbackStudioAccentVariant;
  /** Compatibility alias for the original single-studio contract. Mirrors nightAtmosphere. */
  atmosphere: BotcastAtmosphereState;
  studioIdentity: string;
  musicIdentity: BotcastMusicIdentity;
  dashboardBlurbs: string[];
  /** Prewritten host bridges available before a live redirect model returns. */
  hostInterruptionLines: string[];
  /**
   * Persona-authored, show-scoped recovery questions used verbatim when a
   * generated host follow-up cannot safely air.
   */
  hostRecoveryQuestions: string[];
  dayAtmosphere: BotcastAtmosphereState;
  nightAtmosphere: BotcastAtmosphereState;
  studioLighting: BotcastStudioLightingState;
  studioLayout: BotcastStudioLayout;
  cameraFraming: BotcastCameraFraming;
  /** Per-show placement of the center-screen logo and title lockup. */
  logoPlacement?: BotcastLogoPlacement;
  studioGlowTuning: BotcastStudioGlowTuning;
  voiceLevelsByBotId: BotcastVoiceLevelsByBotId;
  atmosphereMix: BotcastStudioAtmosphereMix;
  logo: BotcastLogoState;
  introAudio: BotcastIntroAudioState;
  atmosphereAudio: BotcastAtmosphereAudioState;
  createdAt: string;
  updatedAt: string;
  episodeCount: number;
  /** Derived from completed persona reviews; used to rank the Signal show rail. */
  audienceRating?: number | null;
  audienceReviewCount?: number;
}

/** A private, show-scoped assessment used only while recovering a vacant host. */
export interface BotcastHostRecoveryCandidate {
  botId: string;
  status: "compatible" | "incompatible" | "refused" | "unavailable";
  reason: string;
  checkedAt: string | null;
}

export interface BotcastHostRecoveryResponse {
  showId: string;
  identityHash: string;
  candidates: BotcastHostRecoveryCandidate[];
}

/** Idempotent result of asking Signal to screen a show's replacement hosts. */
export type BotcastHostRecoveryScreenResponse =
  | {
      status: "screened";
      recovery: BotcastHostRecoveryResponse;
    }
  | {
      status: "not_needed";
      recovery: null;
      show: BotcastShow;
    };

export interface BotcastHostRecoveryCastResponse {
  status: "accepted" | "declined";
  reason: string;
  show: BotcastShow;
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
  /** Event-folded Signal V2 presentation; never stored as canonical message text. */
  organicVoicePerformance?: VoicePerformancePlanV2;
  /** Delivery mood captured when this line was recorded. */
  moodKey: VoiceDeliveryMood;
  /**
   * Public Signal projection. Missing means legacy/full delivery. An inaudible
   * public copy keeps its turn identity but redacts speech to canonical silence.
   */
  audienceDelivery?: BotcastMessageAudienceDeliveryV1;
  /** Provenance-marked ordinary silence; distinct from Power silence. */
  socialSilence?: SocialSilenceMarkerV1;
  /** Public replay-stable timed Mute presentation; never contains intended speech. */
  mutePerformance?: BotPowerMutePerformanceV1;
  /** One-turn protected link to the audience-heard interrupted fragment. */
  crosstalkReclaim?: CrosstalkReclaimPlanV1;
  /**
   * Verbal-forward irritation delivery cues for reclaim/yield presentation.
   * Missing on legacy episodes; folded from utterance/listener_reaction payloads.
   */
  directionalIrritationDelivery?: DirectionalIrritationDeliveryPlanV1;
  /** Public Troll delivery state, persisted on the ordinary utterance event. */
  botPowerTrollPresentation?: BotPowerTrollPresentationV1;
  /** Text-free proof that this committed primary utterance has a private reveal. */
  speechIntentRevealAvailable?: true;
  createdAt: string;
}

/** Public speech that accompanies a persisted turn without becoming a stage action. */
export interface BotcastPublicReactionSpeechV1 {
  messageId: string;
  botId: string;
  text: string;
  kind: "interruption" | "listener_quip";
}

/**
 * Projects only saved public cue text for captions and the ordinary transcript.
 * Physical reaction metadata stays out of this speech-only projection.
 */
export function botcastPublicReactionSpeechForMessage(
  events: readonly BotcastReplayEvent[],
  messageId: string,
): BotcastPublicReactionSpeechV1[] {
  const result: BotcastPublicReactionSpeechV1[] = [];
  for (const event of events) {
    if (event.kind !== "listener_reaction") continue;
    const plan = normalizeSavedBotcastListenerReactionPlan(event.payload.plan);
    if (plan?.interjectionAttempt && plan.messageId === messageId) {
      const interrupterText = listenerReactionSpokenTextV1(plan);
      if (interrupterText) {
        result.push({
          messageId,
          botId: plan.listenerBotId,
          text: interrupterText,
          kind: "interruption",
        });
      }
      const interruptedText = listenerReactionInterruptedSpeakerTextV1(plan);
      if (interruptedText) {
        result.push({
          messageId,
          botId: plan.speakerBotId,
          text: interruptedText,
          kind: "interruption",
        });
      }
      continue;
    }
    if (
      event.payload.source !== "mute_performance" ||
      event.payload.messageId !== messageId ||
      !event.payload.beat ||
      typeof event.payload.beat !== "object" ||
      Array.isArray(event.payload.beat)
    ) {
      continue;
    }
    const beat = event.payload.beat as Record<string, unknown>;
    const kind = beat.kind === "audible_quip" || beat.kind === "interrupt"
      ? beat.kind
      : null;
    const botId = typeof beat.reactorBotId === "string"
      ? beat.reactorBotId.trim()
      : "";
    const text = typeof beat.quip === "string"
      ? beat.quip.replace(/\s+/gu, " ").trim().slice(0, 80)
      : "";
    if (kind && botId && text) {
      result.push({
        messageId,
        botId,
        text,
        kind: kind === "interrupt" ? "interruption" : "listener_quip",
      });
    }
  }
  return result;
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
  /** Authorized audience-facing words; private direction stays in `detail`. */
  directQuote?: string;
  /** Server-owned reference for a queued Signal episode image. */
  imageId?: string;
}

/**
 * Signal resolves cue urgency from the cue itself, rather than from whichever
 * live surface happened to receive it. A quoted Host instruction is the
 * strongest producer direction; a private Host note or image needs the next
 * Host turn immediately; generic control-card direction retains the normal
 * handoff cadence.
 */
export type BotcastProducerCuePriority =
  | "ordinary"
  | "priority"
  | "immediate";

export function botcastProducerCuePriority(
  cue: Pick<BotcastProducerCue, "kind" | "detail" | "directQuote">,
): BotcastProducerCuePriority {
  if (cue.directQuote?.trim()) return "immediate";
  if (cue.detail?.trim() || cue.kind === "present_image") return "priority";
  return "ordinary";
}

/**
 * High-priority Producer input pivots an audible Host at its current word
 * boundary.
 */
export function botcastProducerCuePreemptsHostSpeech(
  cue: Pick<BotcastProducerCue, "kind" | "detail" | "directQuote">,
): boolean {
  return botcastProducerCuePriority(cue) !== "ordinary";
}

/** Durable, event-backed producer-cue feedback for a live Signal episode. */
export type BotcastProducerCueLifecycleStatus =
  | "queued"
  | "dispatching"
  | "requeued"
  | "delivered"
  | "failed"
  | "cleared"
  | "superseded";

export interface BotcastProducerCueLifecycle {
  cueId: string;
  cue: BotcastProducerCue;
  delivery: BotcastProducerCueDelivery;
  priority: BotcastProducerCuePriority;
  status: BotcastProducerCueLifecycleStatus;
  eventId: string;
  sequence: number;
  failure?:
    | "privacy_validation"
    | "delivery_unfulfilled"
    | "delivery_unavailable";
  recovery?: "operation_cancelled" | "operation_timeout" | "operation_failed";
}

function botcastProducerCueFromLifecyclePayload(
  payload: Record<string, unknown>,
): BotcastProducerCue | null {
  const kind = payload.kind;
  if (
    kind !== "ask_about" &&
    kind !== "present_image" &&
    kind !== "refocus" &&
    kind !== "press_harder" &&
    kind !== "move_on" &&
    kind !== "lighten_up" &&
    kind !== "wrap_up"
  ) {
    return null;
  }
  return {
    kind,
    ...(typeof payload.detail === "string" && payload.detail.trim()
      ? { detail: payload.detail.trim() }
      : {}),
    ...(typeof payload.directQuote === "string" && payload.directQuote.trim()
      ? { directQuote: payload.directQuote.trim() }
      : {}),
    ...(kind === "present_image" &&
    typeof payload.imageId === "string" &&
    payload.imageId.trim()
      ? { imageId: payload.imageId.trim() }
      : {}),
  };
}

/**
 * Rebuilds cue state from immutable episode events. Queue entries retain the
 * private direction for the Producer surface; lifecycle transitions retain
 * only ids and safe outcome labels.
 */
export function botcastProducerCueLifecyclesFromEvents(
  events: readonly Pick<BotcastReplayEvent, "id" | "sequence" | "kind" | "payload">[],
): BotcastProducerCueLifecycle[] {
  const lifecycles = new Map<string, BotcastProducerCueLifecycle>();
  for (const event of [...events].sort((left, right) => left.sequence - right.sequence)) {
    if (event.kind !== "producer_cue") continue;
    const cueId = typeof event.payload.cueId === "string"
      ? event.payload.cueId.trim()
      : "";
    const status = event.payload.lifecycle;
    if (!cueId || typeof status !== "string") continue;
    if (status === "queued") {
      const cue = botcastProducerCueFromLifecyclePayload(event.payload);
      const delivery = event.payload.delivery;
      if (
        !cue ||
        (delivery !== "next_host_turn" &&
          delivery !== "interrupt_guest" &&
          delivery !== "redirect_host")
      ) continue;
      lifecycles.set(cueId, {
        cueId,
        cue,
        delivery,
        priority:
          event.payload.priority === "ordinary" ||
          event.payload.priority === "priority" ||
          event.payload.priority === "immediate"
            ? event.payload.priority
            : botcastProducerCuePriority(cue),
        status,
        eventId: event.id,
        sequence: event.sequence,
      });
      continue;
    }
    if (
      status !== "dispatching" &&
      status !== "requeued" &&
      status !== "delivered" &&
      status !== "failed" &&
      status !== "cleared" &&
      status !== "superseded"
    ) continue;
    const current = lifecycles.get(cueId);
    if (!current) continue;
    lifecycles.set(cueId, {
      ...current,
      status,
      eventId: event.id,
      sequence: event.sequence,
      ...(status === "failed" &&
      (event.payload.failure === "privacy_validation" ||
        event.payload.failure === "delivery_unfulfilled" ||
        event.payload.failure === "delivery_unavailable")
        ? { failure: event.payload.failure }
        : {}),
      ...(status === "requeued" &&
      (event.payload.recovery === "operation_cancelled" ||
        event.payload.recovery === "operation_timeout" ||
        event.payload.recovery === "operation_failed")
        ? { recovery: event.payload.recovery }
        : {}),
    });
  }
  return [...lifecycles.values()].sort((left, right) => left.sequence - right.sequence);
}

export function botcastActiveProducerCueFromEvents(
  events: readonly Pick<BotcastReplayEvent, "id" | "sequence" | "kind" | "payload">[],
): BotcastProducerCueLifecycle | null {
  const active = botcastProducerCueLifecyclesFromEvents(events).filter(
    (lifecycle) =>
      lifecycle.status === "queued" ||
      lifecycle.status === "dispatching" ||
      lifecycle.status === "requeued",
  );
  return active.at(-1) ?? null;
}

/**
 * A direct quote is read on air, so its ceiling is a performance budget rather
 * than a private-text budget. Keep it near one spoken line.
 */
export const BOTCAST_PRODUCER_DIRECT_QUOTE_MAX = 240;
/** Direction, never spoken aloud. Mirrors the server-side `cleanText` ceiling. */
export const BOTCAST_PRODUCER_CUE_DETAIL_MAX = 280;
/** Extra completion tokens so a host can frame an authorized direct quote. */
export const BOTCAST_PRODUCER_DIRECT_QUOTE_LEAD_IN_TOKENS = 80;
export const BOTCAST_PRODUCER_DIRECT_QUOTE_TURN_TOKENS_MAX = 2_048;
/** Spoken framing for a Producer direct quote. The authorized words follow as-is. */
export const BOTCAST_PRODUCER_DIRECT_QUOTE_LEAD_IN =
  "The Producer sent this in.";

/** Completion budget for a host turn that must air a Producer quote in full. */
export function botcastDirectQuoteTurnMaxTokens(directQuote: string): number {
  const words = directQuote.trim().split(/\s+/u).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.min(
    BOTCAST_PRODUCER_DIRECT_QUOTE_TURN_TOKENS_MAX,
    Math.max(160, Math.ceil(words * 1.6) + BOTCAST_PRODUCER_DIRECT_QUOTE_LEAD_IN_TOKENS),
  );
}

/** Live earpiece framing when a direct quote redirects an active host line. */
export const BOTCAST_PRODUCER_DIRECT_QUOTE_UPDATE_LEAD_INS = [
  "Oh, hang on — now they're saying:",
  "Wait, scratch that, the Producer's got something else:",
  "Hold on, they're back in my ear:",
  "…and now they're telling me:",
  "One second — new note from the Producer:",
  "Okay, they've changed it, now it's:",
  "Sorry, they're saying something else now:",
  "Hang on, the booth's cutting in again:",
] as const;

/** Rotates live-update framing so repeated Producer redirects do not sound canned. */
export function botcastProducerDirectQuoteUpdateLeadInAt(
  ordinal: number,
): string {
  const safeOrdinal = Number.isFinite(ordinal) ? Math.max(0, ordinal) : 0;
  return BOTCAST_PRODUCER_DIRECT_QUOTE_UPDATE_LEAD_INS[
    Math.floor(safeOrdinal) %
      BOTCAST_PRODUCER_DIRECT_QUOTE_UPDATE_LEAD_INS.length
  ]!;
}

/** Canonical deterministic delivery for an authorized Producer direct quote. */
export function composeBotcastProducerDirectQuoteUtterance(
  directQuote: string,
  leadIn: string = BOTCAST_PRODUCER_DIRECT_QUOTE_LEAD_IN,
): string {
  const quote = directQuote.trim();
  if (!quote) return "";
  const framing = leadIn.trim() || BOTCAST_PRODUCER_DIRECT_QUOTE_LEAD_IN;
  return `${framing} ${quote}`;
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
  | "routing"
  | "guest_presence"
  | "power_effect"
  | "producer_cue"
  | "image_context"
  | "provider_generation"
  | "utterance"
  | "tension"
  | "warning"
  | "departure"
  | "cut_away"
  | "camera_mode"
  | "camera_suggestion"
  | "listener_reaction"
  | "voice_performance"
  | "conversation_repair"
  | "studio_incident"
  | "irritation"
  | "soundboard_cue"
  | "audio_cue"
  | "capture_timing"
  | "guest_thinking"
  | "session_clock_hold"
  | "voice_playback_recovery"
  | "episode_completed"
  | "episode_cancelled";

export const BOTCAST_AUDIO_CUE_KINDS = [
  "coffee_sip",
  "coffee_cup_place",
  "ambient_vocalization",
  "action_sfx",
] as const;

export type BotcastAudioCueKind =
  (typeof BOTCAST_AUDIO_CUE_KINDS)[number];

export function isBotcastAudioCueKind(
  value: unknown,
): value is BotcastAudioCueKind {
  return BOTCAST_AUDIO_CUE_KINDS.some((kind) => kind === value);
}

export interface BotcastReplayEvent {
  id: string;
  episodeId: string;
  sequence: number;
  kind: BotcastReplayEventKind;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export function botcastVoicePerformanceForMessageV2(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload">[],
  messageId: string,
): VoicePerformancePlanV2 | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.kind !== "voice_performance") continue;
    const plan = normalizeVoicePerformancePlanV2(event.payload.plan);
    if (plan?.messageId === messageId) return plan;
  }
  return null;
}

export function botcastConversationRepairsFromEventsV1(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload">[],
): SignalConversationRepairEventV1[] {
  return events.flatMap((event) => {
    if (event.kind !== "conversation_repair") return [];
    const repair = normalizeSignalConversationRepairEventV1(
      event.payload.repair,
    );
    return repair ? [repair] : [];
  });
}

export function botcastStudioIncidentsFromEventsV1(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload">[],
): SignalStudioIncidentEventV1[] {
  return events.flatMap((event) => {
    if (event.kind !== "studio_incident") return [];
    const incident = normalizeSignalStudioIncidentEventV1(
      event.payload.incident,
    );
    return incident ? [incident] : [];
  });
}

export function botcastStudioIncidentForMessageV1(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload">[],
  messageId: string,
): SignalStudioIncidentEventV1 | null {
  return botcastStudioIncidentsFromEventsV1(events).find(
    (incident) => incident.sourceMessageId === messageId,
  ) ?? null;
}

export type BotcastImageContextPhase =
  | "queued"
  | "presented"
  | "discussing"
  | "dismissed";

export type BotcastEpisodeImageKind = "item" | "picture";

export const BOTCAST_EPISODE_IMAGE_NAME_MAX_LENGTH = 120;
export const BOTCAST_EPISODE_IMAGE_REASON_MAX_LENGTH = 600;
export const BOTCAST_EPISODE_IMAGE_EMOJI_MAX_LENGTH = 24;
export const BOTCAST_EPISODE_IMAGE_ITEM_FALLBACK_EMOJI = "📦";
export const BOTCAST_EPISODE_IMAGE_PICTURE_FALLBACK_EMOJI = "🖼️";

export interface BotcastEpisodeImageDescriptor {
  kind: BotcastEpisodeImageKind;
  /** Human-readable subject derived only from the original filename stem. */
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

export function botcastEpisodeImageFallbackEmoji(
  kind: BotcastEpisodeImageKind,
): string {
  return kind === "item"
    ? BOTCAST_EPISODE_IMAGE_ITEM_FALLBACK_EMOJI
    : BOTCAST_EPISODE_IMAGE_PICTURE_FALLBACK_EMOJI;
}

/** One replay-safe emoji grapheme retained for legacy image replay records. */
export function normalizeBotcastEpisodeImageReplayEmoji(
  value: unknown,
  fallback = BOTCAST_EPISODE_IMAGE_ITEM_FALLBACK_EMOJI,
): string {
  const normalizedFallback =
    typeof fallback === "string" && fallback.trim()
      ? fallback.trim().slice(0, BOTCAST_EPISODE_IMAGE_EMOJI_MAX_LENGTH)
      : BOTCAST_EPISODE_IMAGE_ITEM_FALLBACK_EMOJI;
  if (typeof value !== "string") return normalizedFallback;
  const trimmed = value.trim().slice(0, BOTCAST_EPISODE_IMAGE_EMOJI_MAX_LENGTH);
  if (!trimmed || /\s/u.test(trimmed)) return normalizedFallback;
  const graphemes =
    typeof Intl.Segmenter === "function"
      ? Array.from(
          new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
            trimmed,
          ),
          (segment) => segment.segment,
        )
      : [trimmed];
  if (graphemes.length !== 1) return normalizedFallback;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(trimmed)
    ? trimmed
    : normalizedFallback;
}

export function normalizeBotcastEpisodeImageName(
  value: unknown,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, BOTCAST_EPISODE_IMAGE_NAME_MAX_LENGTH);
}

/** Private Producer intent; never part of Signal events or replay metadata. */
export function normalizeBotcastEpisodeImageReason(
  value: unknown,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized
    ? normalized.slice(0, BOTCAST_EPISODE_IMAGE_REASON_MAX_LENGTH)
    : null;
}

/**
 * Signal accepts the same common still-image formats as the asset library.
 * Every new attachment is an ordinary picture. Item semantics are explicit
 * library metadata and must never be inferred from a file format or alpha
 * channel.
 */
export function botcastEpisodeImageDescriptorFromFileName(
  fileName: string,
  mimeType: string,
): BotcastEpisodeImageDescriptor | null {
  const baseName = fileName.trim().replaceAll("\\", "/").split("/").at(-1) ?? "";
  const extensionMatch = baseName.match(/\.([^.]+)$/u);
  if (!extensionMatch) return null;
  const extension = extensionMatch[1]!.toLowerCase();
  const normalizedMimeType = mimeType.trim().toLowerCase();
  const descriptorMimeType: BotcastEpisodeImageDescriptor["mimeType"] | null =
    extension === "png" && normalizedMimeType === "image/png"
      ? "image/png"
      : (extension === "jpg" || extension === "jpeg") &&
          normalizedMimeType === "image/jpeg"
        ? "image/jpeg"
        : extension === "webp" && normalizedMimeType === "image/webp"
          ? "image/webp"
          : null;
  if (!descriptorMimeType) return null;
  const rawStem = baseName.slice(0, -(extension.length + 1));
  const name = normalizeBotcastEpisodeImageName(
    rawStem
      .replace(/[_-]+/gu, " ")
      .replace(/\s+/gu, " "),
  );
  if (!name) return null;
  return {
    kind: "picture",
    name,
    mimeType: descriptorMimeType,
  };
}

export type BotcastPreSessionImageRevealHostTurnV1 = 1 | 2 | 3 | 4;

/**
 * Gives a pre-session image a varied but episode-stable entrance. The first
 * slot folds it into the host's opening; later slots wait for an ordinary
 * guest-to-host handoff. Replay consumes the resulting saved image context,
 * so it never rerolls this choice.
 */
export function botcastPreSessionImageRevealHostTurnV1(args: {
  episodeId: string;
  imageId: string;
}): BotcastPreSessionImageRevealHostTurnV1 {
  let hash = 2166136261;
  for (const character of `${args.episodeId}:${args.imageId}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  // Avalanche the low bits before taking the four-way slot. Raw FNV low bits
  // skew badly when episode and image ids share a numeric suffix.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return ((hash >>> 0) % 4 + 1) as BotcastPreSessionImageRevealHostTurnV1;
}

export function botcastPreSessionImageShouldPresentOnNextTurnV1(args: {
  episodeId: string;
  imageId: string;
  messages: readonly Pick<BotcastMessage, "speakerRole">[];
}): boolean {
  const hostTurnsAired = args.messages.filter(
    (message) => message.speakerRole === "host",
  ).length;
  const revealHostTurn = botcastPreSessionImageRevealHostTurnV1(args);
  if (hostTurnsAired + 1 < revealHostTurn) return false;

  // If a higher-priority live direction occupied the chosen slot, the image
  // remains eligible at the next natural host handoff instead of disappearing.
  return hostTurnsAired === 0
    ? args.messages.length === 0
    : args.messages.at(-1)?.speakerRole === "guest";
}

export function botcastEpisodeImageSpokenReference(
  image: Pick<BotcastEpisodeImageDescriptor, "kind" | "name">,
): string {
  const normalizedName = normalizeBotcastEpisodeImageName(image.name);
  const genericName =
    !normalizedName ||
    /^(?:(?:an?\s+|the\s+)?(?:unknown|untitled|generic|unidentified)(?:\s+(?:art(?:work)?|art\s+piece|image|item|object|photo|photograph|picture|subject))?|(?:an?\s+|the\s+)?(?:art(?:work)?|art\s+piece|image|item|object|photo|photograph|picture|screenshot|subject)|(?:img|dsc|image|photo|picture)[\s_-]*\d+)$/iu.test(
      normalizedName,
    );
  if (genericName) {
    return image.kind === "item" ? "this item" : "this picture";
  }
  if (/^(?:(?:an?|the)\s+)?(?:unknown|untitled|generic|unidentified)\b/iu.test(normalizedName)) {
    return image.kind === "item"
      ? `this ${normalizedName}`
      : `this picture of ${normalizedName}`;
  }
  const titleAlreadyNamesAVisual =
    /\b(?:image|item|object|photo|photograph|picture|portrait|artwork|drawing|painting|sketch)\b/iu.test(
      normalizedName,
    );
  if (titleAlreadyNamesAVisual) {
    return `this ${normalizedName.replace(/^(?:an?|the)\s+/iu, "")}`;
  }
  return image.kind === "item"
    ? `this ${normalizedName}`
    : `this picture of ${normalizedName}`;
}

/** Public, replay-stable metadata for one producer-supplied episode image. */
export interface BotcastImageContextV1 {
  v: 1;
  imageId: string;
  /** Absent on legacy single-image episodes. */
  origin?: "setup" | "live";
  /** Pixel-grounded description, never producer direction or identity proof. */
  groundedVisualDescription?: string;
  kind: BotcastEpisodeImageKind;
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  provider: BotcastEpisodeProvider;
  model: string;
  /** Legacy contextual replay stand-in; new records prefer replayProxyId. */
  replayEmoji: string;
  /** Episode-owned low-resolution replay proxy; never contains original pixels. */
  replayProxyId?: string | null;
  /** Optional retained library image used by legacy replays and live fallback. */
  savedAssetId: string | null;
  phase: BotcastImageContextPhase;
  hostIntroductionMessageId: string | null;
  guestDiscussionMessageId: string | null;
  hostFollowUpMessageId: string | null;
  /**
   * Saved visibility projection for every utterance that actually discussed
   * the presented asset. Replay consumes this list and never reclassifies the
   * transcript independently from the live episode.
   */
  discussionMessageIds?: string[];
  /** Latest saved lifecycle decision; earlier decisions remain in prior events. */
  lifecycleEvidence?: BotcastImageLifecycleEvidenceV1 | null;
  /** Frozen, replay-safe procedural-avatar recognition. Source and atlas pixels are never persisted. */
  visualRecognition?: SignalVisualRecognitionV1 | null;
}

export interface BotcastImageLifecycleEvidenceV1 {
  v: 1;
  messageId: string | null;
  decision: "continue" | "dismiss";
  reason:
    | "presentation"
    | "minimum_visibility"
    | "semantic_continuation"
    | "semantic_transition"
    | "semantic_topic_shift"
    | "semantic_unavailable"
    | "explicit_lifecycle";
  source: "lifecycle" | "fallback_minimum" | "speaker_semantic_marker_v1";
  semanticDecision?: "continue" | "dismiss_after" | "move_on" | null;
  explicitAction?: string | null;
}

export function normalizeBotcastImageContextV1(
  value: unknown,
): BotcastImageContextV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const phase = row.phase;
  if (
    row.v !== 1 ||
    typeof row.imageId !== "string" ||
    !row.imageId.trim() ||
    (row.kind !== "item" && row.kind !== "picture") ||
    typeof row.name !== "string" ||
    !row.name.trim() ||
    (row.mimeType !== "image/png" &&
      row.mimeType !== "image/jpeg" &&
      row.mimeType !== "image/webp") ||
    (row.provider !== "local" &&
      row.provider !== "ollama_cloud" &&
      row.provider !== "openai" &&
      row.provider !== "anthropic") ||
    typeof row.model !== "string" ||
    !row.model.trim() ||
    (phase !== "queued" &&
      phase !== "presented" &&
      phase !== "discussing" &&
      phase !== "dismissed")
  ) {
    return null;
  }
  const messageId = (candidate: unknown): string | null =>
    typeof candidate === "string" && candidate.trim()
      ? candidate.trim().slice(0, 160)
      : null;
  const savedAssetId = messageId(row.savedAssetId);
  const replayProxyId = messageId(row.replayProxyId);
  const discussionMessageIds = Array.isArray(row.discussionMessageIds)
    ? Array.from(
        new Set(
          row.discussionMessageIds
            .map(messageId)
            .filter((id): id is string => id !== null),
        ),
      )
    : [];
  const lifecycleEvidence = (() => {
    if (
      !row.lifecycleEvidence ||
      typeof row.lifecycleEvidence !== "object" ||
      Array.isArray(row.lifecycleEvidence)
    ) {
      return null;
    }
    const evidence = row.lifecycleEvidence as Record<string, unknown>;
    const decision = evidence.decision;
    const reason = evidence.reason;
    const source = evidence.source;
    const semanticDecision = evidence.semanticDecision;
    if (
      evidence.v !== 1 ||
      (decision !== "continue" && decision !== "dismiss") ||
      (reason !== "presentation" &&
        reason !== "minimum_visibility" &&
        reason !== "semantic_continuation" &&
        reason !== "semantic_transition" &&
        reason !== "semantic_topic_shift" &&
        reason !== "semantic_unavailable" &&
        reason !== "explicit_lifecycle") ||
      (source !== "lifecycle" &&
        source !== "fallback_minimum" &&
        source !== "speaker_semantic_marker_v1") ||
      (semanticDecision !== undefined &&
        semanticDecision !== null &&
        semanticDecision !== "continue" &&
        semanticDecision !== "dismiss_after" &&
        semanticDecision !== "move_on")
    ) {
      return null;
    }
    return {
      v: 1,
      messageId: messageId(evidence.messageId),
      decision,
      reason,
      source,
      ...(semanticDecision !== undefined ? { semanticDecision } : {}),
      ...(typeof evidence.explicitAction === "string" &&
      evidence.explicitAction.trim()
        ? { explicitAction: evidence.explicitAction.trim().slice(0, 80) }
        : {}),
    } satisfies BotcastImageLifecycleEvidenceV1;
  })();
  const visualRecognition = row.visualRecognition == null
    ? null
    : normalizeSignalVisualRecognitionV1(row.visualRecognition);
  if (row.visualRecognition != null && !visualRecognition) return null;
  return {
    v: 1,
    imageId: row.imageId.trim().slice(0, 160),
    ...(row.origin === "setup" || row.origin === "live" ? { origin: row.origin } : {}),
    ...(typeof row.groundedVisualDescription === "string" && row.groundedVisualDescription.trim()
      ? { groundedVisualDescription: row.groundedVisualDescription.trim().slice(0, 2400) }
      : {}),
    kind: row.kind,
    name: row.name.trim().slice(0, 120),
    mimeType: row.mimeType,
    provider: row.provider,
    model: row.model.trim().slice(0, 240),
    replayEmoji: normalizeBotcastEpisodeImageReplayEmoji(
      row.replayEmoji,
      botcastEpisodeImageFallbackEmoji(row.kind),
    ),
    replayProxyId,
    savedAssetId,
    phase,
    hostIntroductionMessageId: messageId(row.hostIntroductionMessageId),
    guestDiscussionMessageId: messageId(row.guestDiscussionMessageId),
    hostFollowUpMessageId: messageId(row.hostFollowUpMessageId),
    discussionMessageIds,
    lifecycleEvidence,
    visualRecognition,
  };
}

/** Canonical saved asset-linked utterances, including legacy three-turn records. */
export function botcastImageDiscussionMessageIdsV1(
  context: Pick<
    BotcastImageContextV1,
    | "hostIntroductionMessageId"
    | "guestDiscussionMessageId"
    | "hostFollowUpMessageId"
    | "discussionMessageIds"
  >,
): string[] {
  return Array.from(
    new Set(
      [
        context.hostIntroductionMessageId,
        context.guestDiscussionMessageId,
        context.hostFollowUpMessageId,
        ...(context.discussionMessageIds ?? []),
      ].filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
}

/** Latest image lifecycle record for the episode, including dismissed replay state. */
export function botcastLatestImageContextV1(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload">[],
): BotcastImageContextV1 | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.kind !== "image_context") continue;
    const context = normalizeBotcastImageContextV1(event.payload);
    if (context) return context;
  }
  return null;
}

/** Latest state per identity, in registration order (not last-update order). */
export function botcastImageHistoryV1(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload">[],
): BotcastImageContextV1[] {
  const history = new Map<string, BotcastImageContextV1>();
  for (const event of events) {
    if (event.kind !== "image_context") continue;
    const context = normalizeBotcastImageContextV1(event.payload);
    if (context) history.set(context.imageId, context);
  }
  return [...history.values()];
}

export function botcastImageContextByIdV1(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload">[],
  imageId: string | null | undefined,
): BotcastImageContextV1 | null {
  return botcastImageHistoryV1(events).find((image) => image.imageId === imageId) ?? null;
}

export function botcastPendingImageContextV1(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload">[],
): BotcastImageContextV1 | null {
  return botcastImageHistoryV1(events).find((image) => image.phase === "queued") ?? null;
}

export function botcastActiveImageContextV1(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload">[],
): BotcastImageContextV1 | null {
  return [...botcastImageHistoryV1(events)].reverse().find(
    (image) => image.phase === "presented" || image.phase === "discussing",
  ) ?? null;
}

/** Last introduced picture before this one; a pending upload never qualifies. */
export function botcastPreviousImageContextV1(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload">[],
  imageId: string,
): BotcastImageContextV1 | null {
  const history = botcastImageHistoryV1(events);
  const index = history.findIndex((image) => image.imageId === imageId);
  return history.slice(0, index < 0 ? 0 : index).reverse().find(
    (image) => image.hostIntroductionMessageId !== null,
  ) ?? null;
}

/** Retry restores setup, never a later live prop. Preserve unknown-origin legacy. */
export function botcastSetupImageContextV1(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload">[],
): BotcastImageContextV1 | null {
  const history = botcastImageHistoryV1(events);
  return history.find((image) => image.origin === "setup") ??
    (history.length === 1 && !history[0]!.origin ? history[0]! : null);
}

/** Associates ephemeral image lifecycle metadata with its live utterance. */
export function botcastImageContextForMessageV1(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload">[],
  messageId: string | null | undefined,
): BotcastImageContextV1 | null {
  if (!messageId) return null;
  return [...botcastImageHistoryV1(events)].reverse().find((context) =>
    context.phase !== "queued" && botcastImageDiscussionMessageIdsV1(context).includes(messageId),
  ) ?? null;
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

/** Latest persisted Library/Marketplace form per holder at a live/replay cutoff. */
export function botcastIdentityShapeshiftStatesAtV1(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload" | "occurredAt">[],
  cutoffOccurredAtMs = Number.POSITIVE_INFINITY,
): ReadonlyMap<string, BotIdentityShapeshiftStateV1> {
  const states = new Map<string, BotIdentityShapeshiftStateV1>();
  for (const event of events) {
    if (event.kind !== "power_effect") continue;
    const eventAtMs = Date.parse(event.occurredAt);
    if (Number.isFinite(eventAtMs) && eventAtMs > cutoffOccurredAtMs) continue;
    const state = normalizeBotIdentityShapeshiftStateV1(event.payload.state);
    if (!state || state.surface !== "signal") continue;
    states.set(state.holderBotId, state);
  }
  return states;
}

/** Uses event sequence/message order so equal timestamps still replay deterministically. */
export function botcastIdentityShapeshiftStateBeforeMessageV1(
  episode: Pick<BotcastEpisode, "events" | "messages">,
  holderBotId: string,
  messageId: string,
): BotIdentityShapeshiftStateV1 | null {
  const messageIndex = episode.messages.findIndex(
    (message) => message.id === messageId,
  );
  if (messageIndex < 0) return null;
  const targetUtteranceSequence = episode.events.find(
    (event) =>
      event.kind === "utterance" && event.payload.messageId === messageId,
  )?.sequence;
  let state: BotIdentityShapeshiftStateV1 | null = null;
  if (targetUtteranceSequence !== undefined) {
    for (const event of episode.events) {
      if (event.sequence >= targetUtteranceSequence) break;
      if (event.kind !== "power_effect") continue;
      const candidate = normalizeBotIdentityShapeshiftStateV1(event.payload.state);
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
    const candidate = normalizeBotIdentityShapeshiftStateV1(event.payload.state);
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

/** Latest persisted believed-name alias per holder at a live/replay cutoff. */
export function botcastFalseNameStatesAtV1(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload" | "occurredAt">[],
  cutoffOccurredAtMs = Number.POSITIVE_INFINITY,
): ReadonlyMap<string, BotFalseNameStateV1> {
  const states = new Map<string, BotFalseNameStateV1>();
  for (const event of events) {
    if (event.kind !== "power_effect") continue;
    if (event.payload.effect !== "false_name") continue;
    const eventAtMs = Date.parse(event.occurredAt);
    if (Number.isFinite(eventAtMs) && eventAtMs > cutoffOccurredAtMs) continue;
    const state = normalizeBotFalseNameStateV1(event.payload.state);
    if (!state || state.surface !== "signal") continue;
    states.set(state.holderBotId, state);
  }
  return states;
}

/** Uses event sequence/message order so equal timestamps still replay deterministically. */
export function botcastFalseNameStateBeforeMessageV1(
  episode: Pick<BotcastEpisode, "events" | "messages">,
  holderBotId: string,
  messageId: string,
): BotFalseNameStateV1 | null {
  const messageIndex = episode.messages.findIndex(
    (message) => message.id === messageId,
  );
  if (messageIndex < 0) return null;
  const targetUtteranceSequence = episode.events.find(
    (event) =>
      event.kind === "utterance" && event.payload.messageId === messageId,
  )?.sequence;
  let state: BotFalseNameStateV1 | null = null;
  if (targetUtteranceSequence !== undefined) {
    for (const event of episode.events) {
      if (event.sequence >= targetUtteranceSequence) break;
      if (event.kind !== "power_effect") continue;
      if (event.payload.effect !== "false_name") continue;
      const candidate = normalizeBotFalseNameStateV1(event.payload.state);
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
    if (event.payload.effect !== "false_name") continue;
    const candidate = normalizeBotFalseNameStateV1(event.payload.state);
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
    | "introduction"
    | "speaker"
    | "hidden_speaker"
    | "power_effect"
    | "listener_reaction"
    | "transition"
    | "tension"
    | "departure"
    | "empty_chair"
    | "silence"
    | "closing"
    | "coverage"
    | "cutaway";
  atMs: number;
  minimumHoldMs: number;
  /** Utterance cameras may carry the speaking message id for interrupt cleanup. */
  messageId?: string;
}

export const BOTCAST_AUTO_COVERAGE_REASONS = [
  "coverage",
  "cutaway",
  "introduction",
] as const;

/** True when Auto should honor this suggestion over a live speaker lock. */
export function botcastReasonIsAutoCoverage(reason: unknown): boolean {
  return (
    typeof reason === "string" &&
    (BOTCAST_AUTO_COVERAGE_REASONS as readonly string[]).includes(reason)
  );
}

const BOTCAST_DIRECTIONAL_IRRITATION_SNARK_CUE_SET = new Set<string>([
  ...DIRECTIONAL_IRRITATION_SNARK_CUES,
  ...DIRECTIONAL_IRRITATION_REBUFF_SNARK_CUES,
]);

/**
 * Prefer verbal-forward irritation snark as the interrupted-speaker retort when
 * the stock cue bank does not yet include that line.
 */
function normalizeSavedBotcastListenerReactionPlan(
  value: unknown,
): ListenerReactionPlanV1 | null {
  const plan = normalizeListenerReactionPlanV1(value);
  if (!plan || !value || typeof value !== "object" || Array.isArray(value)) {
    return plan;
  }
  const row = value as Record<string, unknown>;
  const savedCue = normalizeBotCrosstalkInterruptedSpeakerCue(
    row.interruptedSpeakerCue,
  );
  const savedPlayback =
    row.interruptedSpeakerCuePlayback === "primary" ||
    row.interruptedSpeakerCuePlayback === "crosstalk"
      ? row.interruptedSpeakerCuePlayback
      : undefined;
  if (plan.interruptedSpeakerCue || plan.publicInterruptedSpeakerCue) {
    return savedPlayback && plan.interruptedSpeakerCuePlayback !== savedPlayback
      ? { ...plan, interruptedSpeakerCuePlayback: savedPlayback }
      : plan;
  }
  const snarkCue =
    !savedCue && typeof row.interruptedSpeakerCue === "string"
      ? row.interruptedSpeakerCue.replace(/\s+/gu, " ").trim().slice(0, 120)
      : "";
  const cue = savedCue ??
    (BOTCAST_DIRECTIONAL_IRRITATION_SNARK_CUE_SET.has(snarkCue)
      ? snarkCue as BotCrosstalkInterruptedSpeakerCue
      : null);
  if (!cue) {
    return plan;
  }
  return {
    ...plan,
    interruptedSpeakerCue: cue,
    interruptedSpeakerCuePlayback:
      savedPlayback ?? plan.interruptedSpeakerCuePlayback ?? "crosstalk",
  };
}

/**
 * Fold ordered Signal `irritation` replay events into the current directed edge
 * map. Later transitions overwrite earlier intensity for the same pair.
 */
export function botcastDirectionalIrritationEdgesFromEvents(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload">[],
): Record<string, DirectionalIrritationEdgeV1> {
  const transitions: DirectionalIrritationTransitionV1[] = [];
  for (const event of events) {
    if (event.kind !== "irritation") continue;
    const transition = normalizeDirectionalIrritationTransitionV1(
      event.payload.transition,
    );
    if (transition) transitions.push(transition);
  }
  return foldDirectionalIrritationTransitions(transitions);
}

/** Read directed irritation intensity between two bots from episode events. */
export function botcastDirectionalIrritationIntensityBetween(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload">[],
  subjectBotId: string,
  targetBotId: string,
): number {
  return readDirectionalIrritationIntensity({
    edges: botcastDirectionalIrritationEdgesFromEvents(events),
    subjectBotId,
    targetBotId,
  });
}

/** Collect already-applied irritation transition ids for pause-safe retries. */
export function botcastDirectionalIrritationAppliedTransitionIdsFromEvents(
  events: readonly Pick<BotcastReplayEvent, "kind" | "payload">[],
): Set<string> {
  const applied = new Set<string>();
  for (const event of events) {
    if (event.kind !== "irritation") continue;
    const transition = normalizeDirectionalIrritationTransitionV1(
      event.payload.transition,
    );
    if (transition) applied.add(transition.transitionId);
  }
  return applied;
}

/** Read persisted irritation delivery metadata from an utterance/listener event. */
export function botcastDirectionalIrritationDeliveryFromPayload(
  payload: Record<string, unknown> | null | undefined,
): DirectionalIrritationDeliveryPlanV1 | null {
  if (!payload) return null;
  return normalizeDirectionalIrritationDeliveryPlanV1(
    payload.directionalIrritationDelivery,
  );
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

/** Latest exact public reaction speech Copycat heard during a saved message. */
export function botcastLatestSpeechCopyReactionSourceV1(
  events: readonly BotcastReplayEvent[],
  messageId: string,
  holderBotId: string,
): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.kind !== "listener_reaction") continue;
    const plan = normalizeSavedBotcastListenerReactionPlan(event.payload.plan);
    if (plan?.messageId !== messageId) continue;
    const source = listenerReactionSpeechCopySourceV1(plan, holderBotId);
    if (source) return source;
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
  /** Live produce/interview vs Watch-a-show full bake. Defaults to live. */
  playbackMode?: BotcastPlaybackMode;
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
  /** Generic alias for all completed foreground session-clock holds. */
  sessionClockHoldDurationMs?: number;
  /** Generic alias for the legacy active warmup hold, retained during migration. */
  sessionClockHoldStartedAt?: string | null;
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
  /** Public review provenance; hidden reviewer instructions are never exported. */
  provenance?: BotcastPersonaReviewProvenanceV1;
}

export interface BotcastPersonaReviewProvenanceV1 {
  version: 1;
  artifactHash: string;
  reviewerSnapshotHash: string;
  reviewerSnapshot: {
    version: 1;
    reviewerId: string;
    reviewerName: string;
  };
  rubricId: string;
  rubricVersion: number;
  provider: string;
  model: string | null;
  acceptedAt: string;
  output: { rating: number; comment: string };
}

export interface BotcastEpisode extends BotcastEpisodeSummary {
  producerBrief: string;
  /** Optional pre-show acting context delivered only to a bot guest. */
  guestBrief?: string;
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
  /** Persona-shaped listener murmurs to warm during the opening wait. */
  listenerReactionKit?: SignalListenerReactionKitV1;
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
  /** Human-editable source direction; the server derives and saves the safe fingerprint. */
  musicIdentityDirection?: string;
  dashboardBlurbs?: string[];
  hostInterruptionLines?: string[];
  /** Internal persona-authored recovery package supplied by identity generation. */
  hostRecoveryQuestions?: string[];
  atmosphereImageUrl?: string | null;
  atmosphereImageId?: string | null;
  dayAtmosphereImageUrl?: string | null;
  dayAtmosphereImageId?: string | null;
  /** Server-owned mask derived from a synthesized Light studio. */
  dayAtmosphereMicrophoneTintMaskUrl?: string | null;
  dayAtmosphereMicrophoneTintMaskImageId?: string | null;
  nightAtmosphereImageUrl?: string | null;
  nightAtmosphereImageId?: string | null;
  /** Server-owned mask derived from a synthesized Dark studio. */
  nightAtmosphereMicrophoneTintMaskUrl?: string | null;
  nightAtmosphereMicrophoneTintMaskImageId?: string | null;
  /** Server-owned derived state; omitted by the public show PATCH route. */
  studioLighting?: BotcastStudioLightingState;
  studioLayout?: BotcastStudioLayout;
  cameraFraming?: BotcastCameraFraming;
  logoPlacement?: BotcastLogoPlacement;
  studioGlowTuning?: BotcastStudioGlowTuning;
  voiceLevelsByBotId?: BotcastVoiceLevelsByBotId;
  atmosphereMix?: BotcastStudioAtmosphereMix;
  regenerateAtmosphere?: boolean;
  regenerateDayAtmosphere?: boolean;
  regenerateNightAtmosphere?: boolean;
  logoImageUrl?: string | null;
  logoImageId?: string | null;
  /** Internal one-step reversal of the current and previous show logo. */
  undoLogo?: boolean;
  /** Internal persona-first thesis supplied by Signal's identity pass. */
  logoThesis?: string;
  regenerateLogo?: boolean;
}

export interface BotcastEpisodeCreateRequest {
  guestBotId?: string;
  guestKind?: BotcastGuestKind;
  /** Watch = full-bake spectator show; live = Produce or Get interviewed. */
  playbackMode?: BotcastPlaybackMode;
  guestName?: string;
  guestContext?: string;
  topic?: string;
  producerBrief?: string;
  /** Optional pre-show acting context delivered only to a bot guest. */
  guestBrief?: string;
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
  /**
   * Audible state at the Producer's cut. Older clients omit this and retain
   * the legacy unmarked prefix; live Signal supplies it from the voice clock.
   */
  cadence?: BotcastHostRedirectCadence;
}

export type BotcastHostRedirectCadence =
  | "active_speech"
  | "between_words";

export type BotcastProducerPivotStyle =
  | "hesitation"
  | "self_correction"
  | "hard_reset"
  | "throat_clear"
  | "breath";

export interface BotcastProducerPivotPerformanceV1 {
  v: 1;
  cadence: BotcastHostRedirectCadence;
  transcriptMark: "ellipsis" | "em_dash";
  style: BotcastProducerPivotStyle;
  vocalFoley: "clears throat" | "exhales" | null;
}

/** Canonical transcript for a Host line cut by live Producer direction. */
export function botcastInterruptedHostContent(
  fullContent: string,
  redirect: Pick<BotcastHostRedirectContext, "spokenContent" | "cadence">,
): string | null {
  const prefix = redirect.spokenContent.trimEnd();
  if (!prefix.trim() || !fullContent.startsWith(prefix)) return null;
  if (prefix === fullContent || /[—…]$/u.test(prefix)) return prefix;
  if (redirect.cadence === "between_words") return `${prefix}…`;
  if (redirect.cadence === "active_speech") return `${prefix}—`;
  return prefix;
}

function botcastProducerPivotSeedHashV1(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * A saved Producer redirect owns one understated performance choice so live
 * playback and replay never improvise different hesitation/Foley around it.
 */
export function planBotcastProducerPivotPerformanceV1(args: {
  seed: string;
  cadence: BotcastHostRedirectCadence;
}): BotcastProducerPivotPerformanceV1 {
  const palette = args.cadence === "between_words"
    ? ([
        { style: "hesitation", vocalFoley: null },
        { style: "self_correction", vocalFoley: null },
        { style: "throat_clear", vocalFoley: "clears throat" },
        { style: "breath", vocalFoley: "exhales" },
      ] as const)
    : ([
        { style: "self_correction", vocalFoley: null },
        { style: "hard_reset", vocalFoley: null },
        { style: "throat_clear", vocalFoley: "clears throat" },
        { style: "breath", vocalFoley: "exhales" },
      ] as const);
  const selected = palette[
    botcastProducerPivotSeedHashV1(args.seed) % palette.length
  ]!;
  return {
    v: 1,
    cadence: args.cadence,
    transcriptMark:
      args.cadence === "between_words" ? "ellipsis" : "em_dash",
    style: selected.style,
    vocalFoley: selected.vocalFoley,
  };
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
  /** Power-projected public retort; clean canned wording is omitted. */
  publicInterruptedSpeakerCue?: string;
  interruptedSpeakerCueSpeechEffect?: "speech_obfuscation";
}

/** Request-only pixels and private direction; never persist this object. */
export interface BotcastEpisodeImageAttachmentV1 {
  imageId: string;
  fileName: string;
  dataUrl: string;
  name?: string;
  reason?: string;
  replayEmoji?: string;
  visualIdentity?: SignalVisualPassportBundleV1;
  /** Explicit terminal-booking retry only, not live-refresh visual recovery. */
  archivalProxyEpisodeId?: string;
}

export interface BotcastEpisodeAdvanceRequest {
  episodeImage?: BotcastEpisodeImageAttachmentV1;
  previousEpisodeImage?: BotcastEpisodeImageAttachmentV1;
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
  /** The completed response is transient and no episode archive was retained. */
  discarded?: boolean;
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
/** Readable post-silence window for Signal's environmental elapsed-time cue. */
export const BOTCAST_SIGNAL_MUTE_ELAPSED_CUE_HOLD_MS = 1_500;
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
export function botcastSignalStandardCadenceDurationMs(
  text: unknown,
  socialSilence?: SocialSilenceMarkerV1,
  mutePerformance?: BotPowerMutePerformanceV1,
): number {
  const spokenText = typeof text === "string" ? text.trim() : "";
  if (
    socialSilence &&
    socialSilenceMessageIsMarkedV1({
      content: spokenText,
      marker: socialSilence,
      mode: "signal",
    })
  ) {
    return socialSilence.holdMs;
  }
  if (botPowerResponseIsSilentV1(spokenText)) {
    return mutePerformance
      ? mutePerformance.durationMs + BOTCAST_SIGNAL_MUTE_ELAPSED_CUE_HOLD_MS
      : BOTCAST_DIRECTOR_MIN_SHOT_MS;
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
  const cueText = `${cue.detail ?? ""} ${cue.directQuote ?? ""}`;
  const boundaryLanguage =
    cue.kind === "ask_about" &&
    /\b(?:trauma|abuse|crime|death|family|secret|scandal|failure|fear|afraid|scared|regret|narciss(?:ist|ism|istic)?|diagnos(?:e|ed|es|ing|is)|insecure|insecurity|anxiety|anxious|psychological|psychology)\b/iu.test(
      cueText,
    );
  const explicitPressureDirection =
    cue.kind === "ask_about" &&
    /\b(?:(?:be|get|grow)\s+(?:mean(?:er)?|cruel(?:er)?|harsher|nastier)|(?:annoy|offend|insult|humiliate|antagonize|provoke|enrage|needle|taunt)\s+(?:him|her|them|(?:(?:a|the|your|this|that)\s+)?guest)|(?:try\s+to\s+)?(?:make|force|get)\s+(?:him|her|them|(?:(?:a|the|your|this|that)\s+)?guest)\s+(?:to\s+)?(?:leave|walk\s*out|quit|rage[-\s]?quit)|(?:drive|run)\s+(?:him|her|them|(?:(?:a|the|your|this|that)\s+)?guest)\s+(?:off|out\s+of)\s+(?:the\s+)?(?:show|episode|studio)|rage[-\s]?quit|walkout)\b/iu.test(
      cueText,
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

/** Producer-facing projection of the two deterministic guest walk-off paths. */
export type BotcastGuestWalkOffRiskStatusV1 =
  | "unavailable"
  | "settled"
  | "elevated"
  | "eligible"
  | "suppressed"
  | "departed"
  | "closing";

export type BotcastGuestWalkOffRiskSourceV1 =
  | "none"
  | "producer_pressure"
  | "directed_irritation"
  | "combined";

export interface BotcastGuestWalkOffRiskV1 {
  /** `false` means this episode has no present bot guest to assess. */
  available: boolean;
  /** A calibrated index, presented as an estimate rather than a forecast. */
  chancePercent: number;
  status: BotcastGuestWalkOffRiskStatusV1;
  source: BotcastGuestWalkOffRiskSourceV1;
}

/**
 * Resolve the producer's honest walk-off estimate without inspecting prompts or
 * generation state. Voluntary departures are intentionally not forecast here.
 */
export function botcastGuestWalkOffRiskV1(
  episode: Pick<
    BotcastEpisode,
    | "events"
    | "guestKind"
    | "guestPresenceMode"
    | "guestBotId"
    | "hostBotId"
    | "tensionStage"
    | "warningCount"
    | "outcome"
    | "segment"
  >,
): BotcastGuestWalkOffRiskV1 {
  const guestDeparted =
    episode.outcome === "guest_departed" ||
    botcastEpisodeDepartureOutcome(episode.events) === "guest_departed";
  if (guestDeparted) {
    return {
      available: false,
      chancePercent: 100,
      status: "departed",
      source: "none",
    };
  }
  if (episode.guestKind !== "bot" || episode.guestPresenceMode !== "present") {
    return {
      available: false,
      chancePercent: 0,
      status: "unavailable",
      source: "none",
    };
  }
  if (episode.segment === "closing") {
    return {
      available: false,
      chancePercent: 0,
      status: "closing",
      source: "none",
    };
  }

  const guestPowers = botcastSnapshotPowersForRoleV1(episode, "guest");
  if (
    guestPowers &&
    (botPowerTrollsV1(guestPowers) || botPowerEternallyIntroducesV1(guestPowers))
  ) {
    return {
      available: true,
      chancePercent: 0,
      status: "suppressed",
      source: "none",
    };
  }

  const tensionLevel =
    episode.tensionStage === "departed"
      ? 3
      : episode.tensionStage === "warning"
        ? 2
        : episode.tensionStage === "resistance"
          ? 1
          : 0;
  // These bands mirror the existing departure threshold while leaving the
  // middle states legible as a calibrated producer index, not a model claim.
  const pressurePercent =
    tensionLevel >= 3
      ? episode.warningCount >= 1
        ? 100
        : 85
      : tensionLevel === 2
        ? 60
        : tensionLevel === 1
          ? 25
          : 0;
  const irritationPercent = Math.round(
    botcastDirectionalIrritationIntensityBetween(
      episode.events,
      episode.guestBotId,
      episode.hostBotId,
    ) * 100,
  );
  const chancePercent = Math.max(pressurePercent, irritationPercent);
  const source =
    pressurePercent > 0 && irritationPercent > 0
      ? "combined"
      : pressurePercent > 0
        ? "producer_pressure"
        : irritationPercent > 0
          ? "directed_irritation"
          : "none";
  return {
    available: true,
    chancePercent,
    status:
      chancePercent >= 100
        ? "eligible"
        : chancePercent > 0
          ? "elevated"
          : "settled",
    source,
  };
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
  messages: readonly Pick<BotcastMessage, "content" | "socialSilence">[],
): number {
  const substantiveMessages = messages.filter(
    (message) =>
      !socialSilenceMessageIsMarkedV1({
        content: message.content,
        marker: message.socialSilence,
        mode: "signal",
      }),
  );
  if (substantiveMessages.length === 0) return 0;
  return (
    substantiveMessages.reduce(
      (total, message) => total + botcastSpokenWordCount(message.content),
      0,
    ) / substantiveMessages.length
  );
}

const BOTCAST_NATURAL_REST_PATTERN =
  /\b(?:ultimately|in the end|at the end of the day|that(?:'s| is) the point|that(?:'s| is) what matters|I think we(?:'ve| have) covered|there(?:'s| is) not much more|I(?:'ll| will) leave it there|final thought|thank(?:s| you) for (?:the |this |our )?(?:conversation|discussion|interview)|it (?:has been|was)(?: truly)? (?:a )?pleasure (?:speaking|talking|discussing|exploring))\b/iu;

const BOTCAST_MATURE_FAREWELL_PATTERN =
  /\b(?:good luck(?:\s+with\b[^.!?]*)?|take care(?:\s+of\s+(?:yourself|each other))?|I(?:'m| am) not sure there(?:'s| is) much more I can add|you(?:'ve| have) got (?:everything|all) you need|that(?:'s| is) all that matters now)\b/iu;

const BOTCAST_GUEST_REASK_PATTERN =
  /\b(?:what (?:was|is) that(?: you said)?|what did you (?:just )?(?:say|ask)|say (?:that|it) again|repeat (?:that|it|the question)|once more|come again|pardon(?: me)?|I (?:did not|didn't|could not|couldn't) (?:hear|catch) (?:that|it)|could you (?:repeat|restate|say|ask)\b)/iu;

/** A narrow progress signal used only to keep Auto from mistaking stalls for tapering. */
export function botcastGuestAnswerAdvancesInterview(
  input:
    | string
    | Pick<BotcastMessage, "content" | "socialSilence">,
): boolean {
  const content = typeof input === "string" ? input : input.content;
  if (
    typeof input !== "string" &&
    socialSilenceMessageIsMarkedV1({
      content,
      marker: input.socialSilence,
      mode: "signal",
    })
  ) {
    return false;
  }
  if (botPowerResponseIsSilentV1(content)) return false;
  if (botcastSpokenWordCount(content) < 3) return false;
  return !BOTCAST_GUEST_REASK_PATTERN.test(content);
}

/** Count the ordinary Signal silence volley at the current transcript tail. */
export function botcastConsecutiveSocialSilenceTurns(
  messages: readonly Pick<BotcastMessage, "content" | "socialSilence">[],
): number {
  let count = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      !message ||
      !socialSilenceMessageIsMarkedV1({
        content: message.content,
        marker: message.socialSilence,
        mode: "signal",
      })
    ) {
      break;
    }
    count += 1;
  }
  return count;
}

/**
 * A social-silence beat belongs to its scheduled speaker. Before that speaker
 * can receive another one, they must contribute two real on-air turns; other
 * participants' turns neither spend nor reset this cooldown.
 */
export function botcastSpeakerSubstantiveTurnsSinceSocialSilence(
  messages: readonly Pick<BotcastMessage, "botId" | "content" | "socialSilence">[],
  speakerBotId: string,
): number {
  const normalizedSpeakerId = speakerBotId.trim();
  if (!normalizedSpeakerId) return Number.POSITIVE_INFINITY;
  let substantiveTurns = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.botId !== normalizedSpeakerId) continue;
    if (
      socialSilenceMessageIsMarkedV1({
        content: message.content,
        marker: message.socialSilence,
        mode: "signal",
      })
    ) {
      return substantiveTurns;
    }
    if (
      !botPowerResponseIsSilentV1(message.content) &&
      botcastSpokenWordCount(message.content) >= 3
    ) {
      substantiveTurns += 1;
    }
  }
  return Number.POSITIVE_INFINITY;
}

/** The latest interrupted utterance may reclaim exactly the next bot turn. */
export function botcastPendingCrosstalkReclaimV1(
  messages: readonly Pick<
    BotcastMessage,
    "id" | "botId" | "crosstalkReclaim"
  >[],
): CrosstalkReclaimPlanV1 | null {
  const sourceMessage = messages.at(-1);
  const reclaim = normalizeCrosstalkReclaimPlanV1(
    sourceMessage?.crosstalkReclaim,
  );
  return sourceMessage &&
      reclaim &&
      sourceMessage.id === reclaim.interruptedMessageId &&
      sourceMessage.botId === reclaim.speakerBotId
    ? reclaim
    : null;
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

const BOTCAST_HOST_SIGN_OFF_PATTERNS = [
  /\b(?:and\s+)?that(?:'s| is)\s+(?:the|our|this)\s+(?:show|podcast|episode|interview|broadcast)\b(?=\s*(?:$|[,.!?:;—]|\b(?:folks|everyone|everybody|listeners)\b))/iu,
  // "That's it for What Grinds Your Gears" / "That's it for the show"
  /\bthat(?:'s| is)\s+it\s+for\b/iu,
  // "That's What Grinds Your Gears" / "That's Maximum Leverage" (title-case show name ending the clause)
  /\bthat(?:'s| is)\s+(?:[A-Z][\p{L}\d'’-]*)(?:\s+[A-Z][\p{L}\d'’-]*)+\s*$/u,
  /\b(?:(?:this|the)\s+)?(?:show|podcast|episode|interview|broadcast)(?:'s| is)\s+(?:over|done|finished)\b/iu,
  /\bthis\s+has\s+been\s+[^.!?]{1,80}\b(?:show|podcast|broadcast)\b(?=\s*(?:$|[,.!?:;—]))/iu,
  // "We're out, goodnight everybody" / "We're done here, folks"
  /\bwe(?:'re| are)\s+(?:out|done)\b(?=\s*(?:$|[,.!?:;—]|\b(?:good\s*night|everybody|everyone|folks|listeners)\b))/iu,
  /\bgood\s*night\b(?:\s+\w+){0,3}\s*,?\s*\b(?:everybody|everyone|folks|listeners)\b/iu,
] as const;

/**
 * Recognizes an earned, unmistakable host sign-off so Auto cannot hand the mic
 * back to the guest after the host has already ended the broadcast.
 */
export function botcastHostSignOffIntent(args: {
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
    BOTCAST_HOST_SIGN_OFF_PATTERNS.some((pattern) => {
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
  messages: readonly Pick<
    BotcastMessage,
    "speakerRole" | "content" | "socialSilence"
  >[];
  durationMinutes: BotcastSessionDurationMinutes | null;
  startedAtMs: number;
  nowMs: number;
  modelWarmupHoldDurationMs?: number;
  modelWarmupHoldStartedAtMs?: number | null;
  sessionClockHoldDurationMs?: number;
  sessionClockHoldStartedAtMs?: number | null;
  producerGuestThinkingDiscountMs?: number;
}): boolean {
  const utteranceCount = args.messages.length;
  if (
    utteranceCount < BOTCAST_AUTO_MIN_EXCHANGES * 2 ||
    args.messages.at(-1)?.speakerRole !== "guest"
  ) {
    return false;
  }
  const completedHoldDurationMs =
    args.sessionClockHoldDurationMs ?? args.modelWarmupHoldDurationMs;
  const activeHoldStartedAtMs =
    args.sessionClockHoldStartedAtMs ?? args.modelWarmupHoldStartedAtMs;
  const completedHoldMs = Number.isFinite(completedHoldDurationMs)
    ? Math.max(0, completedHoldDurationMs ?? 0)
    : 0;
  const activeHoldMs =
    typeof activeHoldStartedAtMs === "number" &&
    Number.isFinite(activeHoldStartedAtMs)
      ? Math.max(0, args.nowMs - activeHoldStartedAtMs)
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

  const latestGuestTurn = args.messages.at(-1);
  if (
    !latestGuestTurn ||
    !botcastGuestAnswerAdvancesInterview(latestGuestTurn)
  ) {
    return false;
  }
  const latestGuestLine = latestGuestTurn.content;
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
      botcastGuestAnswerAdvancesInterview(message)
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
  // The closing segment belongs to the host. Guests may have supplied the
  // preceding final response, but they can never become the saved sign-off.
  if (args.segment === "closing") {
    return args.messages.at(-1)?.speakerRole === "host" ? null : "host";
  }
  if (args.guestDeparted) {
    return args.messages.at(-1)?.speakerRole === "host" ? null : "host";
  }
  if (args.messages.length === 0) return "host";
  return args.messages.at(-1)?.speakerRole === "host" ? "guest" : "host";
}

export function botcastDirectorSuggestion(args: {
  previous?: BotcastCameraSuggestion | null;
  atMs: number;
  speakerRole?: BotcastSpeakerRole | null;
  /** A hidden performer remains audible, but Auto must not frame an empty chair. */
  speakerVisible?: boolean;
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
  } else if (args.speakerVisible === false) {
    shot = "wide";
    reason = "hidden_speaker";
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

function botcastCoverageShotForBeat(
  beat: AutoCameraCoverageBeat,
  listenerShot: BotcastDirectedCameraShot | null,
): BotcastDirectedCameraShot {
  if (beat.kind === "cutaway" && listenerShot) return listenerShot;
  return "wide";
}

/**
 * Extra Auto cuts after a speaker close-up has lingered: Wide breaths and
 * occasional glances at the other on-stage person. Returns both the coverage
 * windows and the speaker-return cuts so replay does not stick on Wide.
 */
export function botcastDirectorCoverageSuggestions(args: {
  speakerShot: BotcastDirectedCameraShot;
  listenerShot?: BotcastDirectedCameraShot | null;
  speakerStartMs: number;
  utteranceEndMs: number;
  seed: string;
  content?: string;
  messageId?: string;
  /** Coverage must finish before this timestamp (departure, intro, etc.). */
  latestAtMs?: number;
}): BotcastCameraSuggestion[] {
  const speakerStartMs = Math.max(0, Math.round(args.speakerStartMs));
  const utteranceEndMs = Math.max(speakerStartMs, Math.round(args.utteranceEndMs));
  const latestAtMs = Math.min(
    utteranceEndMs,
    args.latestAtMs == null ? utteranceEndMs : Math.round(args.latestAtMs),
  );
  const remainingMs = latestAtMs - speakerStartMs;
  const listenerShot = args.listenerShot ?? null;
  const beats = planAutoCameraCoverage({
    utteranceDurationMs: remainingMs,
    seed: args.seed,
    content: args.content,
    allowCutaway: listenerShot !== null && listenerShot !== args.speakerShot,
    listenerCount: listenerShot ? 1 : 0,
  });
  const suggestions: BotcastCameraSuggestion[] = [];
  for (const beat of beats) {
    const atMs = speakerStartMs + beat.offsetMs;
    const endMs = Math.min(latestAtMs, atMs + beat.durationMs);
    if (endMs <= atMs) continue;
    const shot = botcastCoverageShotForBeat(beat, listenerShot);
    suggestions.push({
      shot,
      reason: beat.kind === "cutaway" ? "cutaway" : "coverage",
      atMs,
      minimumHoldMs: Math.max(1, endMs - atMs),
      ...(args.messageId ? { messageId: args.messageId } : {}),
    });
    if (endMs < latestAtMs) {
      suggestions.push({
        shot: args.speakerShot,
        reason: "speaker",
        atMs: endMs,
        minimumHoldMs: BOTCAST_DIRECTOR_MIN_SHOT_MS,
        ...(args.messageId ? { messageId: args.messageId } : {}),
      });
    }
  }
  return suggestions;
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
      // Older Auto recordings inserted a synthetic Wide cut every fourth line.
      // Ignore only that legacy cadence so existing replays follow the speakers
      // without changing bookends, departures, hidden performers, or manual modes.
      if (
        mode === "auto" &&
        candidate === "wide" &&
        event.payload.reason === "transition"
      ) {
        continue;
      }
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

export function botcastCameraSuggestionReasonAt(args: {
  events: readonly BotcastReplayEvent[];
  elapsedMs: number;
}): string | null {
  let mode: BotcastCameraShot = "auto";
  let reason: string | null = null;
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
        if (mode !== "auto") reason = null;
      }
      continue;
    }
    if (event.kind === "camera_suggestion") {
      const candidate = event.payload.shot;
      if (
        mode === "auto" &&
        candidate === "wide" &&
        event.payload.reason === "transition"
      ) {
        continue;
      }
      if (
        candidate === "left" ||
        candidate === "right" ||
        candidate === "wide"
      ) {
        const nextReason = event.payload.reason;
        reason = typeof nextReason === "string" ? nextReason : null;
      }
    }
  }
  return reason;
}

/** Live/replay Auto may leave the speaker for these editorial suggestions. */
export function botcastAutoCoverageShotAt(args: {
  events: readonly BotcastReplayEvent[];
  elapsedMs: number;
}): BotcastDirectedCameraShot | null {
  if (
    botcastCameraModeAt(args) !== "auto" ||
    !botcastReasonIsAutoCoverage(botcastCameraSuggestionReasonAt(args))
  ) {
    return null;
  }
  return botcastCameraShotAt(args);
}

function botcastParticipantHasDepartedAt(
  events: readonly BotcastReplayEvent[],
  elapsedMs: number,
  role: BotcastSpeakerRole,
): boolean {
  const departureAtMs = botcastDepartureAtMsForRole(events, role);
  return departureAtMs !== null && elapsedMs >= departureAtMs;
}

function botcastDepartureCameraEventForRole(
  events: readonly BotcastReplayEvent[],
  role: BotcastSpeakerRole,
): BotcastReplayEvent | null {
  const departure = events.find(
    (event) => botcastDepartureSpeakerRole(event) === role,
  );
  if (!departure) return null;
  return events.find(
    (event) =>
      event.sequence > departure.sequence &&
      event.kind === "camera_suggestion" &&
      event.payload.reason === "departure" &&
      (event.payload.speakerRole === role ||
        (role === "guest" && event.payload.speakerRole === undefined)),
  ) ?? null;
}

export function botcastDepartureAtMsForRole(
  events: readonly BotcastReplayEvent[],
  role: BotcastSpeakerRole,
): number | null {
  const departureAtMs = Number(
    botcastDepartureCameraEventForRole(events, role)?.payload.atMs,
  );
  return Number.isFinite(departureAtMs) ? departureAtMs : null;
}

export function botcastDepartureMessageIdForRole(
  events: readonly BotcastReplayEvent[],
  role: BotcastSpeakerRole,
): string | null {
  const value = botcastDepartureCameraEventForRole(events, role)?.payload
    .messageId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
  messages: readonly (Pick<BotcastMessage, "content" | "socialSilence" | "mutePerformance"> &
    Partial<Pick<BotcastMessage, "id">>)[],
  events: readonly BotcastReplayEvent[],
): {
  durationMs: number;
  messageStartMs: number[];
  messageEndMs: number[];
  thinkingRanges: BotcastReplayThinkingRange[];
} {
  const thinkingDurationByMessageId = new Map<string, number>();
  const picklesSipHoldEndByMessageId = new Map<string, number>();
  const perceptionOverlapByMessageId = new Map(
    botcastPerceptionOverlapEventsV1(events).map((overlap) => [
      overlap.overlappingMessageId,
      overlap,
    ] as const),
  );
  for (const event of events) {
    const picklesSip = signalPicklesSipCueFromEvent(event);
    if (picklesSip) {
      picklesSipHoldEndByMessageId.set(
        picklesSip.messageId,
        picklesSip.atMs + picklesSip.durationMs,
      );
    }
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
    const socialSilence = socialSilenceMessageIsMarkedV1({
      content: message.content,
      marker: message.socialSilence,
      mode: "signal",
    });
    const durationMs = socialSilence
      ? message.socialSilence!.holdMs
      : Math.max(
          BOTCAST_DIRECTOR_MIN_SHOT_MS,
          botcastSignalStandardCadenceDurationMs(
            message.content,
            message.socialSilence,
            message.mutePerformance,
          ),
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
    const priorMessageId = index > 0 ? messages[index - 1]?.id ?? "" : "";
    const priorPicklesHoldEndMs =
      picklesSipHoldEndByMessageId.get(priorMessageId) ?? 0;
    const startMs = Math.max(
      overlap && precedingIndex === index - 1
        ? Math.max(overlapStartMs, twoVoiceFloorMs)
        : cursorMs,
      priorPicklesHoldEndMs,
    );
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

/**
 * Read whether Signal froze Auto or a fixed model when the episode began.
 * Empty string in the picker means Auto; Auto must never flip to the
 * concrete model that ran in the background.
 */
export function botcastEpisodeModelSelectionKind(
  episode: Pick<BotcastEpisode, "events">,
): "auto" | "fixed" | null {
  const event = episode.events.find((entry) => entry.kind === "routing");
  if (!event || event.payload.v !== 1) return null;
  const kind = event.payload.modelSelectionKind;
  return kind === "auto" || kind === "fixed" ? kind : null;
}

/**
 * Locked Signal model control value: keep showing Auto when Auto was chosen,
 * even after the episode stores the concrete model Auto resolved to.
 */
export function signalEpisodeModelPickerValue(args: {
  liveSessionActive: boolean;
  episode: Pick<BotcastEpisode, "events" | "model"> | null;
  draft: string;
  availableModelIds: readonly string[];
}): string {
  if (!args.liveSessionActive || !args.episode) {
    return args.draft;
  }
  const selectionKind = botcastEpisodeModelSelectionKind(args.episode);
  if (selectionKind === "auto") {
    return "";
  }
  if (
    args.episode.model &&
    args.availableModelIds.includes(args.episode.model)
  ) {
    return args.episode.model;
  }
  return args.draft;
}

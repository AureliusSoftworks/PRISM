import type { DatabaseSync } from "node:sqlite";
import type {
  BotcastAtmosphereState,
  BotcastCameraShot,
  BotcastCameraSuggestion,
  BotcastEpisode,
  BotcastEpisodeAdvanceRequest,
  BotcastEpisodeAdvanceResponse,
  BotcastEpisodeCreateRequest,
  BotcastEpisodeOutcome,
  BotcastEpisodeProvider,
  BotcastPersonaReview,
  BotcastEpisodeResponseMode,
  BotcastEpisodeSegment,
  BotcastEpisodeSummary,
  BotcastFallbackStudioAccentVariant,
  BotcastGuestPresenceMode,
  BotcastMessage,
  BotcastProducerCue,
  BotcastProducerCueDelivery,
  BotcastReplayEvent,
  BotcastReplayEventKind,
  BotcastSocialInfluenceEventV1,
  BotcastSegmentRecord,
  BotcastShow,
  BotcastShowCreateRequest,
  BotcastShowPatchRequest,
  BotcastStudioLayout,
  BotcastStudioAtmosphereMix,
  BotcastVoiceLevelsByBotId,
  BotcastLogoGlyph,
  BotcastLogoState,
  BotcastSpeakerRole,
  BotcastTensionState,
  AutoFallbackChainV1,
  BotPowerV1,
  BotPowerTargetV1,
} from "@localai/shared";
import {
  BOTCAST_DASHBOARD_BLURB_FALLBACKS,
  BOTCAST_DIRECTOR_MIN_SHOT_MS,
  BOTCAST_LOCAL_INTRO_DURATION_MS,
  BOTCAST_IMMERSIVE_VOICE_TAGS,
  BOTCAST_SESSION_DURATION_MINUTES_MAX,
  BOTCAST_SESSION_DURATION_MINUTES_MIN,
  BOTCAST_DEFAULT_STUDIO_LAYOUT,
  BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX,
  BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS,
  applyBotcastProducerCueToTension,
  applyBotPowerEchoResponseV1,
  applyBotPowerMuteResponseV1,
  activeBotPowersV1,
  botPowerCandorResponseRuleV1,
  botPowerCandorTriggerV1,
  botPowerEchoesAddressedSpeechV1,
  botPowerIsMutedV1,
  botPowerObserverCueLinesV1,
  botPowerSelfCueLinesV1,
  strongestBotPowerCandorEffectV1,
  botcastFallbackStudioAccentVariantForSeed,
  botcastDirectorSuggestion,
  botcastGuestDepartureEligible,
  botcastNextSpeakerRole,
  buildSignalListenerReactionPlanV1,
  botcastReplayTimeline,
  botcastSocialInfluenceEventsAt,
  botcastSegmentForTurn,
  botcastSessionShouldClose,
  botcastTensionStageForLevel,
  botcastVoiceMoodForTension,
  buildBotPowersPromptBlock,
  isBotcastFallbackStudioAccentVariant,
  normalizeVoiceDeliveryMood,
  normalizeBotcastStudioLayout,
  normalizeBotcastStudioAtmosphereMix,
  normalizeBotcastVoiceLevelsByBotId,
  parseStoredBotPowersV1,
  rankSignalPersonaTemperaments,
  autoFallbackResolvedChain,
} from "@localai/shared";
import { buildCloneFamilyIdentityPrompt } from "./bots.ts";
import {
  defaultModelIdForProvider,
  openAiModelUsesMaxCompletionTokens,
  selectProvider,
  type LlmProvider,
  type ProviderMessage,
  type ProviderName,
} from "./providers.ts";
import { runAutoFallbackChain } from "./auto-fallback.ts";
import {
  botPowerTextRequestsRepeat,
  hearingRepeatEffectFromPowers,
  lowerVoiceMoodForHearingRepeat,
} from "./bot-power-hearing-repeat.ts";
import { randomId } from "./security.ts";

const BOTCAST_SHOW_NAME_MAX = 80;
const BOTCAST_TEXT_MAX = 2_000;
const BOTCAST_TOPIC_MAX = 280;
const BOTCAST_GENERATED_TOPIC_MAX = 60;
const BOTCAST_GENERATED_TOPIC_WORDS_MIN = 3;
const BOTCAST_GENERATED_TOPIC_WORDS_MAX = 8;
const BOTCAST_STUDIO_IDENTITY_MAX = 2_400;
const BOTCAST_DASHBOARD_BLURB_TARGET = 24;
const BOTCAST_DASHBOARD_BLURB_MIN = 12;
const BOTCAST_DASHBOARD_BLURB_MAX_LENGTH = 140;
const BOTCAST_SPEAKER_MAX_TOKENS = 160;
const BOTCAST_OPENAI_REASONING_MIN_COMPLETION_TOKENS = 384;

export function nextBotcastFallbackStudioAccentVariant(
  previous: unknown,
  random: () => number = Math.random,
): BotcastFallbackStudioAccentVariant {
  const candidates = isBotcastFallbackStudioAccentVariant(previous)
    ? BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS.filter(
        (variant) => variant !== previous,
      )
    : [...BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS];
  const randomValue = random();
  const unit = Number.isFinite(randomValue)
    ? Math.max(0, Math.min(0.999999999999, randomValue))
    : 0;
  return candidates[Math.floor(unit * candidates.length)]!;
}

type BotcastShowRow = {
  id: string;
  host_bot_id: string;
  name: string;
  premise: string;
  hosting_style: string;
  accent_color: string;
  fallback_studio_accent_variant: number;
  atmosphere_json: string;
  created_at: string;
  updated_at: string;
  episode_count?: number;
  intro_audio_provider?: string | null;
  intro_audio_model?: string | null;
  intro_audio_duration_ms?: number | null;
  intro_audio_revision?: number | null;
  atmosphere_audio_provider?: string | null;
  atmosphere_audio_model?: string | null;
  atmosphere_audio_duration_ms?: number | null;
  atmosphere_audio_revision?: number | null;
};

export type StoredBotcastShowIntroAudio = {
  provider: "elevenlabs";
  model: string;
  prompt: string;
  contentType: string;
  audioBytes: Buffer;
  durationMs: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type StoredBotcastShowAtmosphereAudio = StoredBotcastShowIntroAudio;

type BotcastEpisodeRow = {
  id: string;
  show_id: string;
  show_name?: string;
  host_bot_id: string;
  guest_bot_id: string;
  title: string;
  topic: string;
  producer_brief: string;
  provider: BotcastEpisodeProvider;
  model: string | null;
  response_mode: BotcastEpisodeResponseMode;
  duration_minutes: number | null;
  status: "live" | "completed";
  segment: BotcastEpisodeSegment;
  outcome: BotcastEpisodeOutcome | null;
  tension_level: number;
  warning_count: number;
  started_at: string;
  completed_at: string | null;
  runtime_ms: number | null;
  model_warmup_hold_duration_ms: number;
  model_warmup_hold_started_at: string | null;
  persona_reviewer_bot_id: string | null;
  persona_reviewer_name: string | null;
  persona_rating: number | null;
  persona_comment: string | null;
  persona_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type BotcastMessageRow = {
  id: string;
  episode_id: string;
  speaker_role: BotcastSpeakerRole;
  bot_id: string;
  content: string;
  voice_performance_text: string | null;
  created_at: string;
};

type BotcastSegmentRow = {
  id: string;
  episode_id: string;
  segment: BotcastEpisodeSegment;
  ordinal: number;
  started_at: string;
  ended_at: string | null;
};

type BotcastEventRow = {
  id: string;
  episode_id: string;
  sequence: number;
  kind: BotcastReplayEventKind;
  payload_json: string;
  occurred_at: string;
};

type BotcastBotProfile = {
  id: string;
  name: string;
  systemPrompt: string;
  cloneFamilyId?: string | null;
  powers?: BotPowerV1[];
  color: string | null;
  temperature: number;
  maxTokens: number;
  topP: number | null;
  topK: number | null;
  repetitionPenalty: number | null;
};

export interface BotcastGenerationOptions {
  preferredProvider: ProviderName;
  openAiApiKey?: string;
  anthropicApiKey?: string;
  secondaryOllamaHost?: string | null;
  preferredLocalModel?: string | null;
  preferredOnlineModel?: string | null;
  autoFallbackChain?: AutoFallbackChainV1 | null;
  providerFactory?: typeof selectProvider;
  /** Keep current image slots intact while completing only text identity. */
  preserveArtwork?: boolean;
}

export type BotcastBookingSuggestionField =
  | "topic"
  | "producerBrief"
  | "booking";

export interface BotcastBookingSuggestionInput {
  guestBotId: string;
  field: BotcastBookingSuggestionField;
  currentTopic?: string | null;
  currentProducerBrief?: string | null;
  modelOverride?: string | null;
}

function cleanText(
  raw: unknown,
  fallback: string,
  max = BOTCAST_TEXT_MAX,
): string {
  if (typeof raw !== "string") return fallback;
  const cleaned = raw.replace(/\s+/gu, " ").trim();
  return cleaned ? cleaned.slice(0, max) : fallback;
}

function normalizeDashboardBlurbs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const blurbs: string[] = [];
  for (const value of raw) {
    const blurb = cleanText(value, "", BOTCAST_DASHBOARD_BLURB_MAX_LENGTH);
    const key = blurb.toLocaleLowerCase();
    if (!blurb || seen.has(key)) continue;
    seen.add(key);
    blurbs.push(blurb);
    if (blurbs.length >= BOTCAST_DASHBOARD_BLURB_TARGET) break;
  }
  return blurbs;
}

function normalizeAccentColor(raw: unknown): string {
  if (typeof raw !== "string") return "#7b5cff";
  const value = raw.trim();
  return /^#[0-9a-f]{6}$/iu.test(value) ? value.toLowerCase() : "#7b5cff";
}

function stableHash(raw: string): number {
  let value = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    value ^= raw.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export const BOTCAST_HOST_CALL_AFTER_DEPARTURE_PERCENT = 65;

export function botcastHostCallsAfterDepartingGuest(
  episodeId: string,
): boolean {
  return (
    stableHash(`signal-departure-reaction:${episodeId}`) % 100 <
    BOTCAST_HOST_CALL_AFTER_DEPARTURE_PERCENT
  );
}

export function synthesizeBotcastShowName(
  host: Pick<BotcastBotProfile, "id" | "name" | "systemPrompt">,
): string {
  const name = cleanText(host.name, "The Host", 48);
  const formats = [
    `The ${name} Frequency`,
    `Between Questions with ${name}`,
    `${name}: Off Script`,
    `The Curious Mind of ${name}`,
    `${name} in the Margins`,
  ];
  return formats[
    stableHash(`${host.id}:${host.systemPrompt}`) % formats.length
  ]!;
}

const BOTCAST_SHOW_NAME_DIRECTIONS = [
  "Find a title that can stand on its own without the host's name: a surprising phrase, vivid metaphor, double meaning, or conceptual tension drawn from the host's worldview.",
  "Silently draft several candidates, reject generic patterns such as 'Inside [Name]', 'The [Name] Show', 'Conversations with [Name]', and 'The Curious Mind of [Name]', then return only the strongest.",
  "Keep the title memorable, natural to say aloud, and 1-5 words. Use the host's name only when indispensable to genuinely excellent wordplay.",
] as const;

const BOTCAST_DASHBOARD_BLURB_DIRECTIONS = [
  `Write exactly ${BOTCAST_DASHBOARD_BLURB_TARGET} short dashboard blurbs in the host's first-person voice, each no more than ${BOTCAST_DASHBOARD_BLURB_MAX_LENGTH} characters.`,
  "Make every line feel native to this specific host and show: draw on the host's worldview, verbal rhythm, comic pressure points, premise, and hosting style instead of generic podcast jokes.",
  "Let the humor fit the persona—dry, warm, cerebral, chaotic, earnest, or severe as appropriate—rather than making every host sound snarky.",
  "Keep the batch genuinely varied: mix dry backstage asides, provocative teasers, guest-chair invitations, self-aware production jokes, tiny challenges, and confident on-mic observations.",
  "Vary the openings and sentence shapes. Use the host or show name no more than twice, and keep microphone or production references to at most four lines.",
  "Each line must stand alone between episodes. Do not invent guests, episode topics, episode numbers, quotes, endorsements, audience facts, or events that have not happened.",
  "Do not use markdown, hashtags, emojis, stage directions, labels, repeated templates, or 'As an AI'. Do not copy the supplied fallback or rejected lines.",
  `Never return either fallback line: ${BOTCAST_DASHBOARD_BLURB_FALLBACKS.map((line) => JSON.stringify(line)).join(" or ")}.`,
] as const;

function defaultShowPremise(host: BotcastBotProfile): string {
  return `${host.name} hosts candid, idea-led conversations that follow conviction, contradiction, and the revealing detail beneath the first answer.`;
}

function defaultHostingStyle(host: BotcastBotProfile): string {
  const styles = [
    "curious, composed, and willing to follow an unexpected answer",
    "incisive but fair, with clean transitions and restrained warmth",
    "observant, dryly playful, and allergic to canned talking points",
    "patient at first, then precise when an answer dodges the premise",
  ];
  return styles[stableHash(`${host.id}:hosting-style`) % styles.length]!;
}

type BotcastStudioLighting = "day" | "night";

function defaultStudioIdentity(host: BotcastBotProfile): string {
  return [
    `Canonical persona-first set bible for ${host.name}.`,
    `Identity source: ${host.systemPrompt.slice(0, 1_800)}`,
    "Translate that identity into at least six concrete, physically plausible environmental storytelling details: signature objects, cultural or intellectual references, landscape or view, materials, art, collections, and spatial motifs.",
    "Make every detail specific to this host; generic books, plants, acoustic panels, luxury furniture, and podcast décor do not count unless their subject, provenance, or arrangement reveals the persona.",
  ].join(" ");
}

function atmosphereForHost(
  host: BotcastBotProfile,
  lighting: BotcastStudioLighting,
  revision = 1,
  identity = defaultStudioIdentity(host),
): BotcastAtmosphereState {
  const pairSeed = `botcast:${host.id}:studio-pair:${revision}`;
  const seed = `${pairSeed}:${lighting}`;
  const studioIdentity = cleanText(
    identity,
    defaultStudioIdentity(host),
    BOTCAST_STUDIO_IDENTITY_MAX,
  );
  const prompt =
    lighting === "day"
    ? [
        `Wide cinematic two-person podcast studio backdrop designed unmistakably for ${host.name}; no people and no readable text.`,
        `Canonical persona-first set bible: ${studioIdentity}`,
        `The room must be identifiable as ${host.name}'s world without showing their name, portrait, show logo, or written exposition.`,
        `When it naturally belongs in this host's world, use ${normalizeAccentColor(host.color)} as one restrained lighting or material accent; never force a rainbow palette or let house colors overpower the persona.`,
        "Render this one scene in natural daytime light: daylight visible beyond the windows, open-sky fill, soft sunlit bounce, practical lamps off, clean midtones, and restrained shadows compatible with a light interface.",
        "Camera-safe negative space at left and right for seated avatars, central elevated logo-safe zone, generous overscan, no logos or graphical emblems.",
        "Output only one finished full-frame daytime studio. Never create a diptych, split screen, before-and-after comparison, grid, collage, inset, border, divider, caption, or multiple panels.",
      ].join(" ")
    : [
        `Wide cinematic two-person podcast studio backdrop designed unmistakably for ${host.name}; no people and no readable text.`,
        `Canonical persona-first set bible: ${studioIdentity}`,
        `The room must be identifiable as ${host.name}'s world without showing their name, portrait, show logo, or written exposition.`,
        `When it naturally belongs in this host's world, use ${normalizeAccentColor(host.color)} as one restrained lighting or material accent; never force a rainbow palette or let house colors overpower the persona.`,
        "Render this one scene at night: night visible beyond the windows, warm practical lamp pools, deep controlled shadows, luminous microphone LEDs, and selective saturated PRISM-spectrum bounce compatible with a dark interface.",
        "Camera-safe negative space at left and right for seated avatars, central elevated logo-safe zone, generous overscan, no logos or graphical emblems.",
        "Output only one finished full-frame nighttime studio. Never create a diptych, split screen, before-and-after comparison, grid, collage, inset, border, divider, caption, or multiple panels.",
      ].join(" ");
  return {
    seed,
    prompt,
    imageUrl: null,
    imageId: null,
    revision,
    status: "fallback",
  };
}

const BOTCAST_LOGO_GLYPHS: readonly BotcastLogoGlyph[] = [
  "frequency",
  "orbit",
  "aperture",
  "spark",
  "monogram",
];

function fallbackGlyphFor(seed: string): BotcastLogoGlyph {
  return BOTCAST_LOGO_GLYPHS[stableHash(seed) % BOTCAST_LOGO_GLYPHS.length]!;
}

const BOTCAST_LOGO_AUDIO_FORMS = [
  "one interrupted signal ring around a small central pulse",
  "a compact waveform folded into a circular seal",
  "two offset sound arcs meeting around deliberate negative space",
  "a simple recording dial crossed by one clean frequency line",
  "one notched microphone-capsule form reduced to pure geometry",
] as const;

const BOTCAST_LOGO_COMPOSITIONS = [
  "asymmetric balance with one deliberate break",
  "concentric geometry with a strong quiet center",
  "a rising diagonal rhythm held inside a compact boundary",
  "mirrored curves with one controlled mismatch",
  "stacked planes tapering into a single pulse",
] as const;

function copyrightSafeLogoTemperament(host: BotcastBotProfile): string {
  const ranked = rankSignalPersonaTemperaments(host.systemPrompt)
    .slice(0, 2)
    .map((entry) => entry.direction);
  return ranked.length > 0
    ? ranked.join(" balanced with ")
    : defaultHostingStyle(host);
}

function logoForHost(host: BotcastBotProfile, revision = 1): BotcastLogoState {
  const seed = `botcast:${host.id}:logo:${revision}`;
  const audioForm =
    BOTCAST_LOGO_AUDIO_FORMS[
    stableHash(`${seed}:audio-form`) % BOTCAST_LOGO_AUDIO_FORMS.length
  ]!;
  const composition =
    BOTCAST_LOGO_COMPOSITIONS[
    stableHash(`${seed}:composition`) % BOTCAST_LOGO_COMPOSITIONS.length
  ]!;
  return {
    seed,
    prompt: [
      "Create a wholly original, non-figurative editorial emblem for an interview podcast.",
      `Express ${copyrightSafeLogoTemperament(host)} through ${composition}, subtly incorporating ${audioForm}.`,
      `Anchor the restrained palette in ${normalizeAccentColor(host.color)} with only one or two complementary tones.`,
      "Keep the identity visually independent from existing entertainment properties, character designs, signature objects, insignia, and existing logos.",
      "One centered simple mark, bold silhouette, generous negative space, no scene, no figure, no lettering, and no readable text. It must remain distinctive at 64 pixels.",
      "Output one full-frame opaque square image with no alpha or transparency. Fill every background pixel with the exact flat magenta color key #FF00FF; keep #FF00FF out of the emblem itself. Never use black as the background or color key. Do not draw an app-icon tile, square, circle container, card, badge field, border, floor, shadow plate, or glow panel.",
      "The exact same mark and colors must remain legible on both near-black and near-white interface surfaces without inversion or hue rotation; use clean dual-surface edge contrast where needed.",
    ].join(" "),
    imageUrl: null,
    imageId: null,
    revision,
    status: "fallback",
    fallbackGlyph: fallbackGlyphFor(seed),
  };
}

function logoFallbackForRow(row: BotcastShowRow): BotcastLogoState {
  const seed = `botcast:${row.host_bot_id}:logo:1`;
  const audioForm =
    BOTCAST_LOGO_AUDIO_FORMS[
    stableHash(`${seed}:audio-form`) % BOTCAST_LOGO_AUDIO_FORMS.length
  ]!;
  return {
    seed,
    prompt: `Create a wholly original, non-figurative editorial emblem for an interview podcast, subtly incorporating ${audioForm}; use ${normalizeAccentColor(row.accent_color)} with one or two complementary tones; keep it visually independent from existing entertainment properties, character designs, signature objects, insignia, and existing logos; one centered simple mark with a bold silhouette and generous negative space; no scene, figure, lettering, or readable text; distinctive at 64 pixels; output one full-frame opaque square image with no alpha or transparency; fill every background pixel with the exact flat magenta color key #FF00FF and keep #FF00FF out of the emblem; never use black as the background or color key; no app-icon tile, container, card, badge field, border, shadow plate, or glow panel; keep the exact same mark and colors legible on both near-black and near-white interface surfaces without inversion or hue rotation.`,
    imageUrl: null,
    imageId: null,
    revision: 1,
    status: "fallback",
    fallbackGlyph: fallbackGlyphFor(seed),
  };
}

function fallbackAtmosphere(
  lighting: BotcastStudioLighting,
): BotcastAtmosphereState {
  return {
    seed: `botcast:fallback:${lighting}`,
    prompt:
      lighting === "day"
      ? "Neutral two-person podcast studio in soft natural daylight."
      : "Neutral two-person podcast studio with warm nighttime practical lighting.",
    imageUrl: null,
    imageId: null,
    revision: 1,
    status: "fallback",
  };
}

function normalizeAtmosphere(
  parsed: Partial<BotcastAtmosphereState> | undefined,
  fallback: BotcastAtmosphereState,
): BotcastAtmosphereState {
  if (
    !parsed ||
    typeof parsed.seed !== "string" ||
    typeof parsed.prompt !== "string"
  ) {
    return fallback;
  }
  return {
    seed: parsed.seed,
    prompt: parsed.prompt,
    imageUrl: typeof parsed.imageUrl === "string" ? parsed.imageUrl : null,
    imageId: typeof parsed.imageId === "string" ? parsed.imageId : null,
    revision: typeof parsed.revision === "number" ? parsed.revision : 1,
    status:
      parsed.status === "ready" || parsed.status === "failed"
        ? parsed.status
        : "fallback",
  };
}

function parseAtmospheres(raw: string): {
  studioIdentity: string;
  dashboardBlurbs: string[];
  dayAtmosphere: BotcastAtmosphereState;
  nightAtmosphere: BotcastAtmosphereState;
  studioLayout: BotcastStudioLayout;
  voiceLevelsByBotId: BotcastVoiceLevelsByBotId;
  atmosphereMix: BotcastStudioAtmosphereMix;
} {
  try {
    const container = JSON.parse(raw) as Partial<BotcastAtmosphereState> & {
      studioIdentity?: unknown;
      dashboardBlurbs?: unknown;
      dayAtmosphere?: Partial<BotcastAtmosphereState>;
      nightAtmosphere?: Partial<BotcastAtmosphereState>;
      studioLayout?: unknown;
      voiceLevelsByBotId?: unknown;
      atmosphereMix?: unknown;
    };
    const legacy = normalizeAtmosphere(container, fallbackAtmosphere("night"));
    return {
      studioIdentity:
        typeof container.studioIdentity === "string"
          ? cleanText(container.studioIdentity, "", BOTCAST_STUDIO_IDENTITY_MAX)
          : "",
      dashboardBlurbs: normalizeDashboardBlurbs(container.dashboardBlurbs),
      // Existing single-studio shows remain visible in both themes until the
      // owner refreshes them into a purpose-built matched pair.
      dayAtmosphere: normalizeAtmosphere(container.dayAtmosphere, legacy),
      nightAtmosphere: normalizeAtmosphere(container.nightAtmosphere, legacy),
      studioLayout: normalizeBotcastStudioLayout(container.studioLayout),
      voiceLevelsByBotId: normalizeBotcastVoiceLevelsByBotId(
        container.voiceLevelsByBotId,
      ),
      atmosphereMix: normalizeBotcastStudioAtmosphereMix(
        container.atmosphereMix,
      ),
    };
  } catch {
    return {
      studioIdentity: "",
      dashboardBlurbs: [],
      dayAtmosphere: fallbackAtmosphere("day"),
      nightAtmosphere: fallbackAtmosphere("night"),
      studioLayout: normalizeBotcastStudioLayout(undefined),
      voiceLevelsByBotId: {},
      atmosphereMix: normalizeBotcastStudioAtmosphereMix(undefined),
    };
  }
}

function parseLogo(raw: string, row: BotcastShowRow): BotcastLogoState {
  const fallback = logoFallbackForRow(row);
  try {
    const container = JSON.parse(raw) as { logo?: Partial<BotcastLogoState> };
    const parsed = container.logo;
    if (
      !parsed ||
      typeof parsed.seed !== "string" ||
      typeof parsed.prompt !== "string"
    ) {
      return fallback;
    }
    return {
      seed: parsed.seed,
      prompt: parsed.prompt,
      imageUrl: typeof parsed.imageUrl === "string" ? parsed.imageUrl : null,
      imageId: typeof parsed.imageId === "string" ? parsed.imageId : null,
      revision: typeof parsed.revision === "number" ? parsed.revision : 1,
      status:
        parsed.status === "ready" || parsed.status === "failed"
          ? parsed.status
          : "fallback",
      fallbackGlyph: BOTCAST_LOGO_GLYPHS.includes(
        parsed.fallbackGlyph as BotcastLogoGlyph,
      )
        ? (parsed.fallbackGlyph as BotcastLogoGlyph)
        : fallback.fallbackGlyph,
    };
  } catch {
    return fallback;
  }
}

function serializeShowVisuals(
  dayAtmosphere: BotcastAtmosphereState,
  nightAtmosphere: BotcastAtmosphereState,
  logo: BotcastLogoState,
  studioIdentity: string,
  dashboardBlurbs: readonly string[],
  studioLayout: BotcastStudioLayout,
  voiceLevelsByBotId: Readonly<BotcastVoiceLevelsByBotId>,
  atmosphereMix: Readonly<BotcastStudioAtmosphereMix>,
): string {
  // Preserve the original root atmosphere shape for older clients and backup
  // readers while storing explicit variants for current Signal builds.
  return JSON.stringify({
    ...nightAtmosphere,
    studioIdentity,
    dashboardBlurbs: normalizeDashboardBlurbs(dashboardBlurbs),
    dayAtmosphere,
    nightAtmosphere,
    studioLayout,
    voiceLevelsByBotId: normalizeBotcastVoiceLevelsByBotId(
      voiceLevelsByBotId,
    ),
    atmosphereMix: normalizeBotcastStudioAtmosphereMix(atmosphereMix),
    logo,
  });
}

function mapShow(row: BotcastShowRow): BotcastShow {
  const atmospheres = parseAtmospheres(row.atmosphere_json);
  return {
    id: row.id,
    hostBotId: row.host_bot_id,
    name: row.name,
    premise: row.premise,
    hostingStyle: row.hosting_style,
    accentColor: normalizeAccentColor(row.accent_color),
    fallbackStudioAccentVariant: isBotcastFallbackStudioAccentVariant(
      row.fallback_studio_accent_variant,
    )
      ? row.fallback_studio_accent_variant
      : botcastFallbackStudioAccentVariantForSeed(row.id),
    atmosphere: atmospheres.nightAtmosphere,
    ...atmospheres,
    logo: parseLogo(row.atmosphere_json, row),
    introAudio:
      row.intro_audio_provider === "elevenlabs"
      ? {
          source: "elevenlabs",
          audioUrl: `/api/botcast/shows/${encodeURIComponent(row.id)}/intro-audio`,
            durationMs: Math.max(
              3_000,
              Number(row.intro_audio_duration_ms ?? 6_000),
            ),
          revision: Math.max(1, Number(row.intro_audio_revision ?? 1)),
          model: row.intro_audio_model ?? "music_v2",
        }
      : {
          source: "local",
          audioUrl: null,
          durationMs: BOTCAST_LOCAL_INTRO_DURATION_MS,
          revision: 1,
          model: null,
        },
    atmosphereAudio:
      row.atmosphere_audio_provider === "elevenlabs"
        ? {
            source: "elevenlabs",
            audioUrl: `/api/botcast/shows/${encodeURIComponent(row.id)}/atmosphere-audio`,
            durationMs: Math.max(
              3_000,
              Number(row.atmosphere_audio_duration_ms ?? 30_000),
            ),
            revision: Math.max(1, Number(row.atmosphere_audio_revision ?? 1)),
            model: row.atmosphere_audio_model ?? "eleven_text_to_sound_v2",
          }
        : {
            source: "bundled",
            audioUrl: "/audio/session-atmosphere/default-studio-room-loop.mp3",
            durationMs: 30_000,
            revision: 1,
            model: null,
          },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    episodeCount: Number(row.episode_count ?? 0),
  };
}

function mapMessage(
  row: BotcastMessageRow,
  moodKey: unknown = "neutral",
): BotcastMessage {
  return {
    id: row.id,
    episodeId: row.episode_id,
    speakerRole: row.speaker_role,
    botId: row.bot_id,
    content: row.content,
    voicePerformanceText: row.voice_performance_text ?? null,
    moodKey: normalizeVoiceDeliveryMood(moodKey),
    createdAt: row.created_at,
  };
}

function mapSegment(row: BotcastSegmentRow): BotcastSegmentRecord {
  return {
    id: row.id,
    episodeId: row.episode_id,
    segment: row.segment,
    ordinal: row.ordinal,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

function safeObject(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mapEvent(row: BotcastEventRow): BotcastReplayEvent {
  return {
    id: row.id,
    episodeId: row.episode_id,
    sequence: row.sequence,
    kind: row.kind,
    payload: safeObject(row.payload_json),
    occurredAt: row.occurred_at,
  };
}

function mapEpisodeSummary(row: BotcastEpisodeRow): BotcastEpisodeSummary {
  return {
    id: row.id,
    showId: row.show_id,
    showName: row.show_name ?? "Signal",
    title: row.title,
    hostBotId: row.host_bot_id,
    guestBotId: row.guest_bot_id,
    topic: row.topic,
    provider: row.provider,
    model: row.model,
    responseMode: row.response_mode,
    durationMinutes: row.duration_minutes,
    status: row.status,
    segment: row.segment,
    outcome: row.outcome,
    tensionStage: botcastTensionStageForLevel(row.tension_level),
    warningCount: row.warning_count,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    runtimeMs: row.runtime_ms,
    modelWarmupHoldDurationMs: Math.max(
      0,
      row.model_warmup_hold_duration_ms ?? 0,
    ),
    modelWarmupHoldStartedAt: row.model_warmup_hold_started_at ?? null,
    personaReview:
      row.persona_reviewer_bot_id &&
      row.persona_reviewer_name &&
      typeof row.persona_rating === "number" &&
      row.persona_comment &&
      row.persona_reviewed_at
        ? {
            reviewerBotId: row.persona_reviewer_bot_id,
            reviewerName: row.persona_reviewer_name,
            rating: row.persona_rating,
            comment: row.persona_comment,
            createdAt: row.persona_reviewed_at,
          }
        : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function loadBotProfile(
  db: DatabaseSync,
  userId: string,
  botId: string,
): BotcastBotProfile {
  const row = db
    .prepare(
    `SELECT id, name, system_prompt, clone_family_id, powers_json, color, temperature, max_tokens, top_p,
            top_k, repetition_penalty
       FROM bots WHERE id = ? AND user_id = ? AND chat_enabled = 1`,
    )
    .get(botId, userId) as
    | {
        id: string;
        name: string;
        system_prompt: string;
        clone_family_id: string | null;
        powers_json: string | null;
        color: string | null;
        temperature: number;
        max_tokens: number;
        top_p: number | null;
        top_k: number | null;
        repetition_penalty: number | null;
      }
    | undefined;
  if (!row) throw new Error("Bot not found or is not eligible for Signal.");
  return {
    id: row.id,
    name: row.name,
    systemPrompt: row.system_prompt,
    cloneFamilyId: row.clone_family_id,
    powers: parseStoredBotPowersV1(row.powers_json),
    color: row.color,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    topP: row.top_p,
    topK: row.top_k,
    repetitionPenalty: row.repetition_penalty,
  };
}

function normalizedBotcastPowerTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .split(/\s+/u)
    .filter(Boolean)
    .flatMap((token) =>
      token.endsWith("s") && token.length > 4
      ? [token, token.slice(0, -1)]
        : [token],
    );
}

function botcastPowerTargetMatches(
  target: BotPowerTargetV1,
  bot: Pick<BotcastBotProfile, "id" | "name" | "systemPrompt">,
): boolean {
  if (target.kind === "all") return true;
  if (target.kind === "bot") {
    return Boolean(
      (target.botId && target.botId === bot.id) ||
      target.name.trim().toLowerCase() === bot.name.trim().toLowerCase(),
    );
  }
  const haystack = normalizedBotcastPowerTokens(
    `${bot.name} ${bot.systemPrompt}`,
  );
  const needles = normalizedBotcastPowerTokens(target.trait);
  return (
    needles.length > 0 && needles.every((needle) => haystack.includes(needle))
  );
}

interface BotcastEpisodePowerSnapshotV1 {
  v: 1;
  hostBotId: string;
  guestBotId: string;
  hostPowers: BotPowerV1[];
  guestPowers: BotPowerV1[];
}

function botcastEpisodePowerSnapshot(
  episode: Pick<BotcastEpisode, "events" | "hostBotId" | "guestBotId">,
): BotcastEpisodePowerSnapshotV1 | null {
  const raw = episode.events.find(
    (event) =>
      event.kind === "segment" &&
      event.payload.segment === "opening" &&
      event.payload.ordinal === 0,
  )?.payload.powerSnapshot;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const snapshot = raw as Record<string, unknown>;
  if (
    snapshot.v !== 1 ||
    snapshot.hostBotId !== episode.hostBotId ||
    snapshot.guestBotId !== episode.guestBotId
  ) {
    return null;
  }
  return {
    v: 1,
    hostBotId: episode.hostBotId,
    guestBotId: episode.guestBotId,
    hostPowers: parseStoredBotPowersV1(snapshot.hostPowers),
    guestPowers: parseStoredBotPowersV1(snapshot.guestPowers),
  };
}

function assertBotcastPowerSpeechCompatibility(
  speaker: BotcastBotProfile,
  peer: BotcastBotProfile,
): void {
  const restriction = botcastPowerRestriction(speaker, peer, "speech_audience");
  if (!restriction) return;
  throw new Error(
    `${speaker.name}'s Power “${restriction.name || "Unnamed Power"}” does not allow them to address ${peer.name} in Signal.`,
  );
}

function botcastPowerRestriction(
  poweredBot: Pick<BotcastBotProfile, "id" | "name" | "systemPrompt" | "powers">,
  peer: Pick<BotcastBotProfile, "id" | "name" | "systemPrompt" | "powers">,
  effectType: "awareness" | "speech_audience",
): BotPowerV1 | null {
  for (const power of activeBotPowersV1(poweredBot.powers)) {
    for (const effect of power.compiled?.effects ?? []) {
      if (effect.type !== effectType) continue;
      if (
        effect.allowed.some((target) => botcastPowerTargetMatches(target, peer))
      )
        continue;
      return power;
    }
  }
  return null;
}

function botcastSocialInfluenceEventsForPair(args: {
  source: BotcastBotProfile;
  target: BotcastBotProfile;
  sourceRole: BotcastSpeakerRole;
  targetRole: BotcastSpeakerRole;
  trigger: BotcastSocialInfluenceEventV1["trigger"];
  atMs: number;
  sourceMessageId?: string;
}): BotcastSocialInfluenceEventV1[] {
  const sourceIsImperceptible = Boolean(
    botcastPowerRestriction(args.source, args.target, "awareness"),
  );
  const sourceIsInaudible = Boolean(
    botcastPowerRestriction(args.source, args.target, "speech_audience"),
  );
  if (sourceIsImperceptible && sourceIsInaudible) return [];
  return activeBotPowersV1(args.source.powers).flatMap((power) =>
    (power.compiled?.effects ?? []).flatMap((effect) => {
      if (
        effect.type !== "social_influence" ||
        effect.trigger !== args.trigger ||
        !effect.targets.some((target) =>
          botcastPowerTargetMatches(target, args.target),
        )
      ) {
        return [];
      }
      return [
        {
          v: 1 as const,
          effect: "social_influence" as const,
          powerId: power.id,
          powerName: power.name || "Power",
          sourceBotId: args.source.id,
          targetBotId: args.target.id,
          sourceRole: args.sourceRole,
          targetRole: args.targetRole,
          trigger: effect.trigger,
          polarity: effect.polarity,
          strength: effect.strength,
          atMs: Math.max(0, Math.round(args.atMs)),
          ...(args.sourceMessageId
            ? { sourceMessageId: args.sourceMessageId }
            : {}),
        },
      ];
    }),
  );
}

function strongestNegativeBotcastInfluence(
  influences: readonly BotcastSocialInfluenceEventV1[],
): BotcastSocialInfluenceEventV1 | null {
  const strengthRank = { small: 1, medium: 2, large: 3 } as const;
  return influences.reduce<BotcastSocialInfluenceEventV1 | null>(
    (strongest, influence) =>
      influence.polarity === "negative" &&
      (!strongest ||
        strengthRank[influence.strength] > strengthRank[strongest.strength])
        ? influence
        : strongest,
    null,
  );
}

function botcastGuestPresenceMode(
  host: BotcastBotProfile,
  guest: BotcastBotProfile,
): BotcastGuestPresenceMode {
  const hostCannotPerceiveGuest = Boolean(
    botcastPowerRestriction(guest, host, "awareness"),
  );
  const guestCannotAddressHost = Boolean(
    botcastPowerRestriction(guest, host, "speech_audience"),
  );
  return hostCannotPerceiveGuest && guestCannotAddressHost
    ? "audience_only"
    : "present";
}

export function listBotcastShows(
  db: DatabaseSync,
  userId: string,
): BotcastShow[] {
  const rows = db
    .prepare(
    `SELECT s.*,
            (SELECT COUNT(*) FROM botcast_episodes e
              WHERE e.user_id = s.user_id AND e.show_id = s.id) AS episode_count,
            (SELECT i.provider FROM botcast_show_intro_audio i
              WHERE i.user_id = s.user_id AND i.show_id = s.id) AS intro_audio_provider,
            (SELECT i.model FROM botcast_show_intro_audio i
              WHERE i.user_id = s.user_id AND i.show_id = s.id) AS intro_audio_model,
            (SELECT i.duration_ms FROM botcast_show_intro_audio i
              WHERE i.user_id = s.user_id AND i.show_id = s.id) AS intro_audio_duration_ms,
            (SELECT i.revision FROM botcast_show_intro_audio i
              WHERE i.user_id = s.user_id AND i.show_id = s.id) AS intro_audio_revision,
            (SELECT a.provider FROM botcast_show_atmosphere_audio a
              WHERE a.user_id = s.user_id AND a.show_id = s.id) AS atmosphere_audio_provider,
            (SELECT a.model FROM botcast_show_atmosphere_audio a
              WHERE a.user_id = s.user_id AND a.show_id = s.id) AS atmosphere_audio_model,
            (SELECT a.duration_ms FROM botcast_show_atmosphere_audio a
              WHERE a.user_id = s.user_id AND a.show_id = s.id) AS atmosphere_audio_duration_ms,
            (SELECT a.revision FROM botcast_show_atmosphere_audio a
              WHERE a.user_id = s.user_id AND a.show_id = s.id) AS atmosphere_audio_revision
       FROM botcast_shows s
      WHERE s.user_id = ?
      ORDER BY s.updated_at DESC`,
    )
    .all(userId) as unknown as BotcastShowRow[];
  return rows.map(mapShow);
}

export function deleteBotcastShow(
  db: DatabaseSync,
  userId: string,
  showId: string,
): boolean {
  const result = db
    .prepare("DELETE FROM botcast_shows WHERE id = ? AND user_id = ?")
    .run(showId, userId);
  return Number(result.changes ?? 0) > 0;
}

export function createBotcastShow(
  db: DatabaseSync,
  userId: string,
  input: BotcastShowCreateRequest,
): BotcastShow {
  const host = loadBotProfile(db, userId, cleanText(input.hostBotId, "", 128));
  const existing = db
    .prepare(
    "SELECT id FROM botcast_shows WHERE user_id = ? AND host_bot_id = ?",
    )
    .get(userId, host.id) as { id: string } | undefined;
  if (existing) return getBotcastShow(db, userId, existing.id);
  const previousShow = db
    .prepare(
    `SELECT fallback_studio_accent_variant
       FROM botcast_shows
      WHERE user_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1`,
    )
    .get(userId) as { fallback_studio_accent_variant: number } | undefined;
  const fallbackStudioAccentVariant = nextBotcastFallbackStudioAccentVariant(
    previousShow?.fallback_studio_accent_variant,
  );
  const id = randomId(12);
  const now = new Date().toISOString();
  const dayAtmosphere = atmosphereForHost(host, "day");
  const nightAtmosphere = atmosphereForHost(host, "night");
  const studioIdentity = defaultStudioIdentity(host);
  const name = cleanText(
    input.name,
    synthesizeBotcastShowName(host),
    BOTCAST_SHOW_NAME_MAX,
  );
  const logo = logoForHost(host);
  db.prepare(
    `INSERT INTO botcast_shows
      (id, user_id, host_bot_id, name, premise, hosting_style, accent_color,
       fallback_studio_accent_variant, atmosphere_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    host.id,
    name,
    cleanText(input.premise, defaultShowPremise(host)),
    cleanText(input.hostingStyle, defaultHostingStyle(host)),
    normalizeAccentColor(host.color),
    fallbackStudioAccentVariant,
    serializeShowVisuals(
      dayAtmosphere,
      nightAtmosphere,
      logo,
      studioIdentity,
      [],
      BOTCAST_DEFAULT_STUDIO_LAYOUT,
      {},
      BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX,
    ),
    now,
    now,
  );
  return getBotcastShow(db, userId, id);
}

export function getBotcastShow(
  db: DatabaseSync,
  userId: string,
  showId: string,
): BotcastShow {
  const row = db
    .prepare(
    `SELECT s.*,
            (SELECT COUNT(*) FROM botcast_episodes e
              WHERE e.user_id = s.user_id AND e.show_id = s.id) AS episode_count,
            (SELECT i.provider FROM botcast_show_intro_audio i
              WHERE i.user_id = s.user_id AND i.show_id = s.id) AS intro_audio_provider,
            (SELECT i.model FROM botcast_show_intro_audio i
              WHERE i.user_id = s.user_id AND i.show_id = s.id) AS intro_audio_model,
            (SELECT i.duration_ms FROM botcast_show_intro_audio i
              WHERE i.user_id = s.user_id AND i.show_id = s.id) AS intro_audio_duration_ms,
            (SELECT i.revision FROM botcast_show_intro_audio i
              WHERE i.user_id = s.user_id AND i.show_id = s.id) AS intro_audio_revision,
            (SELECT a.provider FROM botcast_show_atmosphere_audio a
              WHERE a.user_id = s.user_id AND a.show_id = s.id) AS atmosphere_audio_provider,
            (SELECT a.model FROM botcast_show_atmosphere_audio a
              WHERE a.user_id = s.user_id AND a.show_id = s.id) AS atmosphere_audio_model,
            (SELECT a.duration_ms FROM botcast_show_atmosphere_audio a
              WHERE a.user_id = s.user_id AND a.show_id = s.id) AS atmosphere_audio_duration_ms,
            (SELECT a.revision FROM botcast_show_atmosphere_audio a
              WHERE a.user_id = s.user_id AND a.show_id = s.id) AS atmosphere_audio_revision
       FROM botcast_shows s WHERE s.id = ? AND s.user_id = ?`,
    )
    .get(showId, userId) as BotcastShowRow | undefined;
  if (!row) throw new Error("Signal show not found.");
  return mapShow(row);
}

export function storeBotcastShowIntroAudio(
  db: DatabaseSync,
  userId: string,
  showId: string,
  input: {
    model: string;
    prompt: string;
    contentType: string;
    audioBytes: Buffer;
    durationMs: number;
  },
): BotcastShow {
  getBotcastShow(db, userId, showId);
  const previous = db
    .prepare(
    "SELECT revision FROM botcast_show_intro_audio WHERE show_id = ? AND user_id = ?",
    )
    .get(showId, userId) as { revision?: number } | undefined;
  const now = new Date().toISOString();
  const revision = Math.max(1, Number(previous?.revision ?? 0) + 1);
  db.prepare(
    `INSERT INTO botcast_show_intro_audio
      (show_id, user_id, provider, model, prompt, content_type, audio_bytes,
       duration_ms, revision, created_at, updated_at)
     VALUES (?, ?, 'elevenlabs', ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(show_id) DO UPDATE SET
       provider = excluded.provider,
       model = excluded.model,
       prompt = excluded.prompt,
       content_type = excluded.content_type,
       audio_bytes = excluded.audio_bytes,
       duration_ms = excluded.duration_ms,
       revision = excluded.revision,
       updated_at = excluded.updated_at`,
  ).run(
    showId,
    userId,
    cleanText(input.model, "music_v2", 80),
    cleanText(input.prompt, "Signal show intro", 4_100),
    cleanText(input.contentType, "audio/mpeg", 120),
    input.audioBytes,
    Math.max(3_000, Math.round(input.durationMs)),
    revision,
    now,
    now,
  );
  db.prepare(
    "UPDATE botcast_shows SET updated_at = ? WHERE id = ? AND user_id = ?",
  ).run(now, showId, userId);
  return getBotcastShow(db, userId, showId);
}

export function readBotcastShowIntroAudio(
  db: DatabaseSync,
  userId: string,
  showId: string,
): StoredBotcastShowIntroAudio | null {
  const row = db
    .prepare(
    `SELECT provider, model, prompt, content_type, audio_bytes, duration_ms,
            revision, created_at, updated_at
       FROM botcast_show_intro_audio
      WHERE show_id = ? AND user_id = ?`,
    )
    .get(showId, userId) as
    | {
        provider: "elevenlabs";
        model: string;
        prompt: string;
        content_type: string;
        audio_bytes: Uint8Array;
        duration_ms: number;
        revision: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    provider: "elevenlabs",
    model: row.model,
    prompt: row.prompt,
    contentType: row.content_type,
    audioBytes: Buffer.from(row.audio_bytes),
    durationMs: row.duration_ms,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function storeBotcastShowAtmosphereAudio(
  db: DatabaseSync,
  userId: string,
  showId: string,
  input: {
    model: string;
    prompt: string;
    contentType: string;
    audioBytes: Buffer;
    durationMs: number;
  },
): BotcastShow {
  getBotcastShow(db, userId, showId);
  const previous = db
    .prepare(
      "SELECT revision FROM botcast_show_atmosphere_audio WHERE show_id = ? AND user_id = ?",
    )
    .get(showId, userId) as { revision?: number } | undefined;
  const now = new Date().toISOString();
  const revision = Math.max(1, Number(previous?.revision ?? 0) + 1);
  db.prepare(
    `INSERT INTO botcast_show_atmosphere_audio
      (show_id, user_id, provider, model, prompt, content_type, audio_bytes,
       duration_ms, revision, created_at, updated_at)
     VALUES (?, ?, 'elevenlabs', ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(show_id) DO UPDATE SET
       provider = excluded.provider,
       model = excluded.model,
       prompt = excluded.prompt,
       content_type = excluded.content_type,
       audio_bytes = excluded.audio_bytes,
       duration_ms = excluded.duration_ms,
       revision = excluded.revision,
       updated_at = excluded.updated_at`,
  ).run(
    showId,
    userId,
    cleanText(input.model, "eleven_text_to_sound_v2", 80),
    cleanText(input.prompt, "Signal studio atmosphere", 4_100),
    cleanText(input.contentType, "audio/mpeg", 120),
    input.audioBytes,
    Math.max(3_000, Math.round(input.durationMs)),
    revision,
    now,
    now,
  );
  db.prepare(
    "UPDATE botcast_shows SET updated_at = ? WHERE id = ? AND user_id = ?",
  ).run(now, showId, userId);
  return getBotcastShow(db, userId, showId);
}

export function readBotcastShowAtmosphereAudio(
  db: DatabaseSync,
  userId: string,
  showId: string,
): StoredBotcastShowAtmosphereAudio | null {
  const row = db
    .prepare(
      `SELECT provider, model, prompt, content_type, audio_bytes, duration_ms,
            revision, created_at, updated_at
       FROM botcast_show_atmosphere_audio
      WHERE show_id = ? AND user_id = ?`,
    )
    .get(showId, userId) as
    | {
        provider: "elevenlabs";
        model: string;
        prompt: string;
        content_type: string;
        audio_bytes: Uint8Array;
        duration_ms: number;
        revision: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    provider: "elevenlabs",
    model: row.model,
    prompt: row.prompt,
    contentType: row.content_type,
    audioBytes: Buffer.from(row.audio_bytes),
    durationMs: row.duration_ms,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function deleteBotcastShowIntroAudio(
  db: DatabaseSync,
  userId: string,
  showId: string,
): BotcastShow {
  getBotcastShow(db, userId, showId);
  db.prepare(
    "DELETE FROM botcast_show_intro_audio WHERE show_id = ? AND user_id = ?",
  ).run(showId, userId);
  db.prepare(
    "DELETE FROM botcast_show_atmosphere_audio WHERE show_id = ? AND user_id = ?",
  ).run(showId, userId);
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE botcast_shows SET updated_at = ? WHERE id = ? AND user_id = ?",
  ).run(now, showId, userId);
  return getBotcastShow(db, userId, showId);
}

export function updateBotcastShow(
  db: DatabaseSync,
  userId: string,
  showId: string,
  patch: BotcastShowPatchRequest,
): BotcastShow {
  const current = getBotcastShow(db, userId, showId);
  const host = loadBotProfile(db, userId, current.hostBotId);
  let dayAtmosphere = current.dayAtmosphere;
  let nightAtmosphere = current.nightAtmosphere;
  let logo = current.logo;
  const studioLayout = normalizeBotcastStudioLayout(
    patch.studioLayout,
    current.studioLayout,
  );
  const voiceLevelsByBotId = normalizeBotcastVoiceLevelsByBotId(
    patch.voiceLevelsByBotId,
    current.voiceLevelsByBotId,
  );
  const atmosphereMix = normalizeBotcastStudioAtmosphereMix(
    patch.atmosphereMix,
    current.atmosphereMix,
  );
  const studioIdentity = cleanText(
    patch.studioIdentity,
    current.studioIdentity || defaultStudioIdentity(host),
    BOTCAST_STUDIO_IDENTITY_MAX,
  );
  const dashboardBlurbs =
    patch.dashboardBlurbs === undefined
      ? current.dashboardBlurbs
      : normalizeDashboardBlurbs(patch.dashboardBlurbs);
  const regenerateBothAtmospheres = patch.regenerateAtmosphere === true;
  const regenerateDayAtmosphere =
    regenerateBothAtmospheres || patch.regenerateDayAtmosphere === true;
  const regenerateNightAtmosphere =
    regenerateBothAtmospheres || patch.regenerateNightAtmosphere === true;
  const pairedRevision = regenerateBothAtmospheres
    ? Math.max(
        current.dayAtmosphere.revision,
        current.nightAtmosphere.revision,
      ) + 1
    : null;
  if (regenerateDayAtmosphere) {
    const revision = pairedRevision ?? current.dayAtmosphere.revision + 1;
    dayAtmosphere = {
      ...atmosphereForHost(host, "day", revision, studioIdentity),
      imageUrl: current.dayAtmosphere.imageUrl,
      imageId: current.dayAtmosphere.imageId,
      status: current.dayAtmosphere.status,
    };
  } else if (
    patch.dayAtmosphereImageUrl !== undefined ||
    patch.dayAtmosphereImageId !== undefined
  ) {
    dayAtmosphere = {
      ...dayAtmosphere,
      imageUrl:
        patch.dayAtmosphereImageUrl === undefined
          ? dayAtmosphere.imageUrl
          : cleanText(patch.dayAtmosphereImageUrl, "", 2_000) || null,
      imageId:
        patch.dayAtmosphereImageId === undefined
          ? dayAtmosphere.imageId
          : cleanText(patch.dayAtmosphereImageId, "", 256) || null,
      status:
        patch.dayAtmosphereImageUrl === undefined
          ? dayAtmosphere.status
          : patch.dayAtmosphereImageUrl
            ? "ready"
            : "fallback",
    };
  }
  const nightImageUrl =
    patch.nightAtmosphereImageUrl !== undefined
    ? patch.nightAtmosphereImageUrl
    : patch.atmosphereImageUrl;
  const nightImageId =
    patch.nightAtmosphereImageId !== undefined
    ? patch.nightAtmosphereImageId
    : patch.atmosphereImageId;
  if (regenerateNightAtmosphere) {
    const revision = pairedRevision ?? current.nightAtmosphere.revision + 1;
    nightAtmosphere = {
      ...atmosphereForHost(host, "night", revision, studioIdentity),
      imageUrl: current.nightAtmosphere.imageUrl,
      imageId: current.nightAtmosphere.imageId,
      status: current.nightAtmosphere.status,
    };
  } else if (
    patch.nightAtmosphereImageUrl !== undefined ||
    patch.nightAtmosphereImageId !== undefined ||
    patch.atmosphereImageUrl !== undefined ||
    patch.atmosphereImageId !== undefined
  ) {
    nightAtmosphere = {
      ...nightAtmosphere,
      imageUrl:
        nightImageUrl === undefined
          ? nightAtmosphere.imageUrl
          : cleanText(nightImageUrl, "", 2_000) || null,
      imageId:
        nightImageId === undefined
          ? nightAtmosphere.imageId
          : cleanText(nightImageId, "", 256) || null,
      status:
        nightImageUrl === undefined
          ? nightAtmosphere.status
          : nightImageUrl
            ? "ready"
            : "fallback",
    };
  }
  if (patch.regenerateLogo) {
    logo = {
      ...logoForHost(host, current.logo.revision + 1),
      imageUrl: current.logo.imageUrl,
      imageId: current.logo.imageId,
      status: current.logo.status,
    };
  } else if (
    patch.logoImageUrl !== undefined ||
    patch.logoImageId !== undefined
  ) {
    logo = {
      ...logo,
      imageUrl:
        patch.logoImageUrl === undefined
          ? logo.imageUrl
          : cleanText(patch.logoImageUrl, "", 2_000) || null,
      imageId:
        patch.logoImageId === undefined
          ? logo.imageId
          : cleanText(patch.logoImageId, "", 256) || null,
      status: patch.logoImageUrl ? "ready" : "fallback",
    };
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE botcast_shows
        SET name = ?, premise = ?, hosting_style = ?, atmosphere_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(
    cleanText(patch.name, current.name, BOTCAST_SHOW_NAME_MAX),
    cleanText(patch.premise, current.premise),
    cleanText(patch.hostingStyle, current.hostingStyle),
    serializeShowVisuals(
      dayAtmosphere,
      nightAtmosphere,
      logo,
      studioIdentity,
      dashboardBlurbs,
      studioLayout,
      voiceLevelsByBotId,
      atmosphereMix,
    ),
    now,
    showId,
    userId,
  );
  return getBotcastShow(db, userId, showId);
}

function validGeneratedDashboardBlurbs(
  raw: unknown,
  excluded: readonly string[] = [],
): string[] | null {
  const excludedKeys = new Set(
    excluded.map((blurb) =>
      cleanText(
        blurb,
        "",
        BOTCAST_DASHBOARD_BLURB_MAX_LENGTH,
      ).toLocaleLowerCase(),
    ),
  );
  const blurbs = normalizeDashboardBlurbs(raw).filter(
    (blurb) => !excludedKeys.has(blurb.toLocaleLowerCase()),
  );
  return blurbs.length >= BOTCAST_DASHBOARD_BLURB_MIN ? blurbs : null;
}

function parseGeneratedShowIdentity(raw: string): {
  name: string;
  premise: string;
  studioIdentity?: string;
  dashboardBlurbs?: string[];
} | null {
  const candidate = raw.match(/\{[\s\S]*\}/u)?.[0] ?? raw;
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const name = cleanText(parsed.name, "", BOTCAST_SHOW_NAME_MAX);
    const premise = cleanText(parsed.premise, "", 360);
    const studioIdentity = cleanText(
      parsed.studioIdentity,
      "",
      BOTCAST_STUDIO_IDENTITY_MAX,
    );
    const dashboardBlurbs = validGeneratedDashboardBlurbs(
      parsed.dashboardBlurbs,
      BOTCAST_DASHBOARD_BLURB_FALLBACKS,
    );
    return name && premise
      ? {
          name,
          premise,
          ...(studioIdentity ? { studioIdentity } : {}),
          ...(dashboardBlurbs ? { dashboardBlurbs } : {}),
        }
      : null;
  } catch {
    return null;
  }
}

function parseGeneratedDashboardBlurbCandidates(
  raw: string,
  excluded: readonly string[],
): string[] {
  const candidate = raw.match(/\{[\s\S]*\}/u)?.[0] ?? raw;
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const excludedKeys = new Set(
      excluded.map((blurb) =>
        cleanText(
          blurb,
          "",
          BOTCAST_DASHBOARD_BLURB_MAX_LENGTH,
        ).toLocaleLowerCase(),
      ),
    );
    return normalizeDashboardBlurbs(
      parsed.dashboardBlurbs ?? parsed.blurbs,
    ).filter((blurb) => !excludedKeys.has(blurb.toLocaleLowerCase()));
  } catch {
    return [];
  }
}

function parseGeneratedShowName(raw: string): string | null {
  const candidate = raw.match(/\{[\s\S]*\}/u)?.[0] ?? raw;
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    return cleanText(parsed.name, "", BOTCAST_SHOW_NAME_MAX) || null;
  } catch {
    return null;
  }
}

function cleanGeneratedBookingSuggestion(
  raw: string,
  field: BotcastBookingSuggestionField,
): string {
  const fieldLabel =
    field === "topic" ? "topic" : "(?:private )?producer brief";
  const cleaned = raw
    .replace(/^\s*```(?:text)?\s*/iu, "")
    .replace(/\s*```\s*$/u, "")
    .replace(new RegExp(`^\\s*(?:${fieldLabel})\\s*:\\s*`, "iu"), "")
    .replace(/^["“]|["”]$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (field === "topic") {
    return cleanGeneratedEpisodeTopic(cleaned) ?? "";
  }
  return cleaned.slice(0, 900);
}

function cleanGeneratedEpisodeTopic(raw: unknown): string | null {
  const topic = cleanText(raw, "", BOTCAST_TOPIC_MAX)
    .replace(/^["“]|["”]$/gu, "")
    .trim();
  if (!topic || topic.length > BOTCAST_GENERATED_TOPIC_MAX) return null;
  const words = topic.match(/[\p{L}\p{N}]+(?:['’:-][\p{L}\p{N}]+)*/gu) ?? [];
  if (
    words.length < BOTCAST_GENERATED_TOPIC_WORDS_MIN ||
    words.length > BOTCAST_GENERATED_TOPIC_WORDS_MAX ||
    topic.includes("?") ||
    /\b(?:you|your|yours)\b/iu.test(topic) ||
    /^(?:mr|mrs|ms|miss|dr|prof(?:essor)?)\.?\s+[^,]{1,40},/iu.test(topic)
  ) {
    return null;
  }
  return topic.replace(/[.!]+$/u, "");
}

function cleanGeneratedBooking(
  raw: string,
): { topic: string; producerBrief: string } | null {
  const candidate = raw.match(/\{[\s\S]*\}/u)?.[0] ?? raw;
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const topic = cleanGeneratedEpisodeTopic(
      parsed.topicTitle ?? parsed.topic,
    );
    const producerBrief = cleanText(parsed.producerBrief, "", 900);
    return topic && producerBrief ? { topic, producerBrief } : null;
  } catch {
    return null;
  }
}

function botcastAudienceOnlyProducerBriefFallback(topic: string): string {
  const subject =
    topic.replace(/[.!?]+$/u, "").trim() || "the episode's central question";
  return `Treat this as an audience-only dramatic layer: have the host build a self-contained argument around “${subject}” without asking the guest for a response, while the unseen guest offers private counterpoints to listeners.`;
}

function botcastAudienceOnlyBriefRequiresGuestInteraction(
  producerBrief: string,
  guestName: string,
): boolean {
  const normalized = normalizeBotcastSpokenIdentity(producerBrief);
  const guestTargets = [
    normalizeBotcastSpokenIdentity(guestName),
    "the guest",
    "guest",
    "him",
    "her",
    "them",
  ].filter(Boolean);
  const interactionPattern =
    /\b(?:ask|press|question|probe|challenge|interview|invite|thank|wait for|draw out|follow up with)\b/gu;
  return [...normalized.matchAll(interactionPattern)].some((match) => {
    const nearbyDirection = normalized.slice(match.index, match.index + 120);
    return guestTargets.some((target) =>
      new RegExp(`(?:^| )${target}(?: |$)`, "u").test(nearbyDirection),
    );
  });
}

function repairBotcastAudienceOnlyProducerBrief(input: {
  producerBrief: string;
  topic: string;
  guestName: string;
}): string {
  return botcastAudienceOnlyBriefRequiresGuestInteraction(
    input.producerBrief,
    input.guestName,
  )
    ? botcastAudienceOnlyProducerBriefFallback(input.topic)
    : input.producerBrief;
}

export type BotcastBookingSuggestionResult =
  | { value: string; generated: boolean }
  | { topic: string; producerBrief: string; generated: boolean };

export async function generateBotcastBookingSuggestion(
  db: DatabaseSync,
  userId: string,
  showId: string,
  input: BotcastBookingSuggestionInput,
  generation: BotcastGenerationOptions,
): Promise<BotcastBookingSuggestionResult> {
  const show = getBotcastShow(db, userId, showId);
  const host = loadBotProfile(db, userId, show.hostBotId);
  const guest = loadBotProfile(db, userId, input.guestBotId);
  if (guest.id === host.id) {
    throw new Error("Choose a guest other than the Signal host.");
  }
  const audienceOnlyGuest =
    botcastGuestPresenceMode(host, guest) === "audience_only";
  const currentTopic = cleanText(input.currentTopic, "", BOTCAST_TOPIC_MAX);
  const currentProducerBrief = cleanText(input.currentProducerBrief, "", 900);
  const recentEpisodeTopics = listBotcastEpisodes(db, userId, showId)
    .slice(0, 6)
    .map((episode) => episode.topic)
    .filter(Boolean);
  const fieldDirections =
    input.field === "booking"
      ? [
          "Return one JSON object with exactly two string fields: topic and producerBrief.",
          audienceOnlyGuest
            ? "The topic must be a compelling 3-to-8-word public episode title for a solo argument with this unseen guest's private counterpoint."
            : "The topic must be a compelling 3-to-8-word public episode title for this particular host and guest.",
          "Keep topic at 60 characters or fewer. Write it as a concise title or noun phrase, never a question, sentence, greeting, direct address, or second-person wording. Do not end it with punctuation.",
          "Put the richer provocative question or tension listeners drawn to this show's premise would regret missing in producerBrief, where it can guide the host without becoming the episode name. Infer interests from the show, never demographic traits.",
          "Make the guest essential: ground both fields in a distinctive conviction, expertise, contradiction, or lived perspective present in their persona, so swapping in another guest would weaken them.",
          "Avoid generic philosophy prompts, broad evergreen themes, biography recaps, praise, and questions whose only personalization is the guest's name.",
          audienceOnlyGuest
            ? "The producerBrief must give the host a self-contained editorial path and the unseen guest a distinct private counterpoint without requiring interaction between them."
            : "The producerBrief must be one or two concise off-mic sentences giving the host a guest-specific editorial angle, a promising follow-up, and any useful boundary implied by the persona.",
        ]
      : input.field === "topic"
      ? [
          audienceOnlyGuest
            ? "Return only one compelling public episode title for a solo argument with this unseen guest's private counterpoint."
            : "Return only one compelling public episode title for this host and guest.",
          "Make it a concrete 3-to-8-word title or noun phrase, 60 characters or fewer, rooted in a productive tension between these personas.",
          "Never return a question, sentence, greeting, direct address, second-person wording, label, quotation marks, explanation, markdown, or ending punctuation.",
          "Prioritize the tension this host would genuinely investigate or listeners drawn to this show's premise would regret not hearing. Infer interests from the show, never demographic traits.",
          "Make the guest essential rather than personalizing a generic prompt with their name.",
        ]
      : [
          "Return only a private off-mic producer brief for this episode in one or two concise sentences.",
          audienceOnlyGuest
            ? "Give the host a self-contained editorial path and the unseen guest a distinct private counterpoint without requiring interaction between them."
            : "Give the host a specific editorial angle, one promising line of inquiry, and any useful boundary implied by the guest's persona.",
          "Do not write dialogue, address the audience, add a label, or use markdown.",
        ];
  const presenceDirections = audienceOnlyGuest
    ? [
        "This pairing uses an audience-only dramatic format: the host cannot perceive or hear the booked guest, while listeners can hear the guest's private asides.",
        "Shape the episode as a self-contained host argument with an unseen guest counterpoint. Never instruct the host to ask, press, question, follow up with, wait for, or thank the guest.",
      ]
    : [];
  try {
    const selected = generationProvider(
      generation,
      generation.preferredProvider,
      input.modelOverride,
    );
    const attemptCount = input.field === "producerBrief" ? 1 : 2;
    let rejectedOutput = "";
    for (let attempt = 0; attempt < attemptCount; attempt += 1) {
      try {
        const raw = await selected.provider.generateResponse(
          [
            {
              role: "system",
              content: [
                "You are a sharp podcast producer preparing one fictional, non-canonical Signal episode.",
                "Use the supplied personas only as creative context. Do not claim real-world consent, endorsement, memory, or prior appearances.",
                ...fieldDirections,
                ...presenceDirections,
              ].join(" "),
            },
            {
              role: "user",
              content: [
                `Show: ${show.name}`,
                `Show premise: ${show.premise}`,
                `Hosting style: ${show.hostingStyle}`,
                `Show identity: ${show.studioIdentity}`,
                `Host: ${host.name}`,
                `Host persona: ${host.systemPrompt.slice(0, 1_800)}`,
                `Guest: ${guest.name}`,
                `Guest persona: ${guest.systemPrompt.slice(0, 1_800)}`,
                `Episode format: ${audienceOnlyGuest ? "Audience-only guest; the host cannot perceive or hear the guest." : "Two-way host and guest interview."}`,
                `Current topic to avoid repeating: ${currentTopic || "None"}`,
                `Recent episode topics to avoid repeating: ${recentEpisodeTopics.join(" | ") || "None"}`,
                `Current producer brief: ${currentProducerBrief || "None"}`,
                ...(rejectedOutput
                  ? [
                      `Rejected prior output (it violated the short public-title contract): ${rejectedOutput}`,
                    ]
                  : []),
              ].join("\n"),
            },
          ],
          {
            ...(selected.model ? { model: selected.model } : {}),
            temperature: attempt === 0 ? 0.94 : 0.78,
            maxTokens:
              input.field === "topic"
                ? 90
                : input.field === "booking"
                  ? 260
                  : 180,
            usagePurpose: "botcast_brand",
            ...(input.field === "booking" ? { jsonMode: true } : {}),
          },
        );
        if (input.field === "booking") {
          const booking = cleanGeneratedBooking(raw);
          if (booking) {
            return {
              ...booking,
              producerBrief: audienceOnlyGuest
                ? repairBotcastAudienceOnlyProducerBrief({
                    producerBrief: booking.producerBrief,
                    topic: booking.topic,
                    guestName: guest.name,
                  })
                : booking.producerBrief,
              generated: true,
            };
          }
          rejectedOutput = cleanText(raw, "Malformed JSON", 280);
          continue;
        }
        const cleanedValue = cleanGeneratedBookingSuggestion(raw, input.field);
        const value =
          audienceOnlyGuest && input.field === "producerBrief" && cleanedValue
            ? repairBotcastAudienceOnlyProducerBrief({
                producerBrief: cleanedValue,
                topic: currentTopic,
                guestName: guest.name,
              })
            : cleanedValue;
        if (value) return { value, generated: true };
        rejectedOutput = cleanText(raw, "Empty output", 280);
      } catch {
        rejectedOutput = "Provider request failed";
      }
    }
    return input.field === "booking"
      ? { topic: "", producerBrief: "", generated: false }
      : { value: "", generated: false };
  } catch {
    return input.field === "booking"
      ? { topic: "", producerBrief: "", generated: false }
      : { value: "", generated: false };
  }
}

export async function generateBotcastShowIdentity(
  db: DatabaseSync,
  userId: string,
  showId: string,
  generation: BotcastGenerationOptions,
): Promise<{ show: BotcastShow; generated: boolean }> {
  const current = getBotcastShow(db, userId, showId);
  const host = loadBotProfile(db, userId, current.hostBotId);
  try {
    const selected = generationProvider(generation);
    const raw = await selected.provider.generateResponse(
      [
        {
          role: "system",
          content: [
            "You are naming a premium podcast show around its host's singular voice.",
            "Return one JSON object with exactly four fields: string fields name, premise, and studioIdentity, plus a string array named dashboardBlurbs.",
            ...BOTCAST_SHOW_NAME_DIRECTIONS,
            "The premise must be one crisp sentence describing the conversational promise. Do not use markdown.",
            "Treat the supplied origin inspiration as editable creative direction: preserve its core idea while sharpening it into that promise. Never erase the player's authorship with an unrelated premise.",
            "studioIdentity is a compact persona-first set bible, not a mood board: define distinctive architecture or landscape, materials, spatial motifs, and at least six concrete artifacts whose subjects and arrangement reveal this host.",
            "The room should be recognizable as the host's world without their name, portrait, logo, or readable text. Generic books, plants, luxury chairs, acoustic panels, and podcast gear do not count as identity details unless made meaningfully specific.",
            "Do not specify lighting or time of day in studioIdentity; the same physical set will be rendered in both daylight and nighttime variants.",
            ...BOTCAST_DASHBOARD_BLURB_DIRECTIONS,
          ].join(" "),
        },
        {
          role: "user",
          content: `Host: ${host.name}\nOrigin inspiration: ${current.premise}\nHost persona:\n${host.systemPrompt.slice(0, 2_400)}`,
        },
      ],
      {
        ...(selected.model ? { model: selected.model } : {}),
        temperature: 0.82,
        maxTokens: 1_200,
        jsonMode: true,
        usagePurpose: "botcast_brand",
      },
    );
    const identity = parseGeneratedShowIdentity(raw);
    if (!identity) return { show: current, generated: false };
    return {
      show: updateBotcastShow(db, userId, showId, {
        ...identity,
        ...(generation.preserveArtwork
          ? {}
          : { regenerateAtmosphere: true, regenerateLogo: true }),
      }),
      generated: true,
    };
  } catch {
    return { show: current, generated: false };
  }
}

export async function generateBotcastShowDashboardBlurbs(
  db: DatabaseSync,
  userId: string,
  showId: string,
  generation: BotcastGenerationOptions,
): Promise<{
  show: BotcastShow;
  generated: boolean;
  attempts: number;
  recovered: boolean;
  failureReason: "provider_error" | "invalid_output" | null;
}> {
  const current = getBotcastShow(db, userId, showId);
  const host = loadBotProfile(db, userId, current.hostBotId);
  const excluded = [
    ...BOTCAST_DASHBOARD_BLURB_FALLBACKS,
    ...current.dashboardBlurbs,
  ];
  let collected: string[] = [];
  let providerErrors = 0;
  try {
    const selected = generationProvider(generation);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let raw: string;
      try {
        raw = await selected.provider.generateResponse(
          [
            {
              role: "system",
              content: [
                "You write the tiny rotating dashboard remarks spoken by the host of a premium interview show.",
                "Return one JSON object with exactly one field named dashboardBlurbs containing an array of strings.",
                ...BOTCAST_DASHBOARD_BLURB_DIRECTIONS,
                "The rejected lines in the user message already exist. Replace them with a fresh batch rather than paraphrasing them.",
              ].join(" "),
            },
            {
              role: "user",
              content: [
                `Show: ${current.name}`,
                `Premise: ${current.premise}`,
                `Hosting style: ${current.hostingStyle}`,
                `Completed episodes: ${current.episodeCount}`,
                `Host: ${host.name}`,
                `Host persona:\n${host.systemPrompt.slice(0, 2_400)}`,
                `Rejected lines:\n${excluded
                  .map((blurb) => `- ${blurb}`)
                  .join("\n")}`,
                ...(collected.length
                  ? [
                      `Already accepted from this refresh; do not repeat them:\n${collected.map((blurb) => `- ${blurb}`).join("\n")}`,
                      `Write ${BOTCAST_DASHBOARD_BLURB_TARGET - collected.length} additional fresh lines.`,
                    ]
                  : []),
              ].join("\n"),
            },
          ],
          {
            ...(selected.model ? { model: selected.model } : {}),
            temperature: Math.min(1, 0.92 + attempt * 0.04),
            maxTokens: 1_100,
            jsonMode: true,
            usagePurpose: "botcast_brand",
          },
        );
      } catch {
        providerErrors += 1;
        continue;
      }
      const candidates = parseGeneratedDashboardBlurbCandidates(raw, excluded);
      collected = normalizeDashboardBlurbs([...collected, ...candidates]);
      if (collected.length < BOTCAST_DASHBOARD_BLURB_TARGET) continue;
      return {
        show: updateBotcastShow(db, userId, showId, {
          dashboardBlurbs: collected,
        }),
        generated: true,
        attempts: attempt + 1,
        recovered: attempt > 0,
        failureReason: null,
      };
    }
    if (collected.length >= BOTCAST_DASHBOARD_BLURB_MIN) {
      return {
        show: updateBotcastShow(db, userId, showId, {
          dashboardBlurbs: collected,
        }),
        generated: true,
        attempts: 3,
        recovered: true,
        failureReason: null,
      };
    }
    return {
      show: current,
      generated: false,
      attempts: 3,
      recovered: false,
      failureReason:
        providerErrors === 3 ? "provider_error" : "invalid_output",
    };
  } catch {
    return {
      show: current,
      generated: false,
      attempts: 0,
      recovered: false,
      failureReason: "provider_error",
    };
  }
}

export async function generateBotcastShowName(
  db: DatabaseSync,
  userId: string,
  showId: string,
  generation: BotcastGenerationOptions,
): Promise<{ show: BotcastShow; generated: boolean }> {
  const current = getBotcastShow(db, userId, showId);
  const host = loadBotProfile(db, userId, current.hostBotId);
  try {
    const selected = generationProvider(generation);
    const rejectedNames = [current.name];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const raw = await selected.provider.generateResponse(
        [
          {
            role: "system",
            content: [
              "You are renaming a premium podcast show around its host's singular voice.",
              "Return one JSON object with exactly one string: name.",
              ...BOTCAST_SHOW_NAME_DIRECTIONS,
              "Every regeneration must return a genuinely different title from every rejected title. Do not use markdown.",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              `Host: ${host.name}`,
              `Rejected titles: ${rejectedNames.map((name) => JSON.stringify(name)).join(", ")}`,
              `Host persona:\n${host.systemPrompt.slice(0, 2_400)}`,
            ].join("\n"),
          },
        ],
        {
          ...(selected.model ? { model: selected.model } : {}),
          temperature: Math.min(1, 0.9 + attempt * 0.04),
          maxTokens: 120,
          jsonMode: true,
          usagePurpose: "botcast_brand",
        },
      );
      const name = parseGeneratedShowName(raw);
      if (!name) continue;
      if (
        rejectedNames.some(
          (rejected) =>
            rejected.toLocaleLowerCase() === name.toLocaleLowerCase(),
        )
      ) {
        continue;
      }
      return {
        show: updateBotcastShow(db, userId, showId, { name }),
        generated: true,
      };
    }
    return { show: current, generated: false };
  } catch {
    return { show: current, generated: false };
  }
}

export function listBotcastEpisodes(
  db: DatabaseSync,
  userId: string,
  showId?: string,
): BotcastEpisodeSummary[] {
  const rows = (showId
    ? db
        .prepare(
        `SELECT e.*, s.name AS show_name FROM botcast_episodes e
          JOIN botcast_shows s ON s.id = e.show_id AND s.user_id = e.user_id
         WHERE e.user_id = ? AND e.show_id = ? ORDER BY e.created_at DESC`,
        )
        .all(userId, showId)
    : db
        .prepare(
        `SELECT e.*, s.name AS show_name FROM botcast_episodes e
          JOIN botcast_shows s ON s.id = e.show_id AND s.user_id = e.user_id
         WHERE e.user_id = ? ORDER BY e.created_at DESC`,
        )
        .all(userId)) as unknown as BotcastEpisodeRow[];
  return rows.map((row) =>
    hideIneligibleBotcastPersonaReview(
      db,
      userId,
      mapEpisodeSummary(row),
    ),
  );
}

export function deleteBotcastEpisode(
  db: DatabaseSync,
  userId: string,
  episodeId: string,
): boolean {
  const result = db
    .prepare("DELETE FROM botcast_episodes WHERE id = ? AND user_id = ?")
    .run(episodeId, userId);
  return Number(result.changes ?? 0) > 0;
}

function loadEpisodeRow(
  db: DatabaseSync,
  userId: string,
  episodeId: string,
): BotcastEpisodeRow {
  const row = db
    .prepare(
    `SELECT e.*, s.name AS show_name FROM botcast_episodes e
      JOIN botcast_shows s ON s.id = e.show_id AND s.user_id = e.user_id
     WHERE e.id = ? AND e.user_id = ?`,
    )
    .get(episodeId, userId) as BotcastEpisodeRow | undefined;
  if (!row) throw new Error("Signal episode not found.");
  return row;
}

export function getBotcastEpisode(
  db: DatabaseSync,
  userId: string,
  episodeId: string,
): BotcastEpisode {
  const row = loadEpisodeRow(db, userId, episodeId);
  const messages = db
    .prepare(
    "SELECT * FROM botcast_messages WHERE user_id = ? AND episode_id = ? ORDER BY created_at, rowid",
    )
    .all(userId, episodeId) as unknown as BotcastMessageRow[];
  const segments = db
    .prepare(
    "SELECT * FROM botcast_episode_segments WHERE user_id = ? AND episode_id = ? ORDER BY ordinal",
    )
    .all(userId, episodeId) as unknown as BotcastSegmentRow[];
  const events = db
    .prepare(
    "SELECT * FROM botcast_events WHERE user_id = ? AND episode_id = ? ORDER BY sequence",
    )
    .all(userId, episodeId) as unknown as BotcastEventRow[];
  const mappedEvents = events.map(mapEvent);
  const guestPresenceMode: BotcastGuestPresenceMode = mappedEvents.some(
    (event) =>
      event.kind === "guest_presence" && event.payload.mode === "audience_only",
  )
    ? "audience_only"
    : "present";
  const moodByMessageId = new Map(
    mappedEvents.flatMap((event) => {
      if (event.kind !== "utterance") return [];
      const messageId =
        typeof event.payload.messageId === "string"
        ? event.payload.messageId
        : "";
      return messageId
        ? [
            [
              messageId,
              normalizeVoiceDeliveryMood(event.payload.moodKey),
            ] as const,
          ]
        : [];
    }),
  );
  const summary = hideIneligibleBotcastPersonaReview(
    db,
    userId,
    mapEpisodeSummary(row),
  );
  return {
    ...summary,
    producerBrief: row.producer_brief,
    guestPresenceMode,
    messages: messages.map((message) =>
      mapMessage(message, moodByMessageId.get(message.id)),
    ),
    segments: segments.map(mapSegment),
    events: mappedEvents,
  };
}

export function setBotcastEpisodeCameraMode(
  db: DatabaseSync,
  userId: string,
  episodeId: string,
  input: { mode: BotcastCameraShot; atMs: number },
): BotcastEpisode {
  const episode = getBotcastEpisode(db, userId, episodeId);
  if (episode.status === "completed") {
    throw new Error(
      "Signal camera direction is locked after the episode ends.",
    );
  }
  if (
    input.mode !== "auto" &&
    input.mode !== "left" &&
    input.mode !== "right" &&
    input.mode !== "wide"
  ) {
    throw new Error("Choose Auto, Left, Right, or Wide for the Signal camera.");
  }
  if (!Number.isFinite(input.atMs) || input.atMs < 0) {
    throw new Error("Signal camera time must be a non-negative number.");
  }
  const latestModeEvent = [...episode.events]
    .reverse()
    .find((event) => event.kind === "camera_mode");
  const latestMode = latestModeEvent?.payload.mode;
  if (
    latestMode === input.mode ||
    (!latestModeEvent && input.mode === "auto")
  ) {
    return episode;
  }
  const previousAtMs = Number(latestModeEvent?.payload.atMs);
  const atMs = Math.max(
    Number.isFinite(previousAtMs) ? previousAtMs : 0,
    Math.round(input.atMs),
  );
  const shot =
    input.mode === "auto"
      ? (lastCameraSuggestion(episode.events)?.shot ?? "wide")
    : input.mode;
  const now = new Date().toISOString();
  recordEvent(
    db,
    userId,
    episode.id,
    "camera_mode",
    { mode: input.mode, shot, atMs, source: "producer" },
    now,
  );
  db.prepare(
    "UPDATE botcast_episodes SET updated_at = ? WHERE id = ? AND user_id = ?",
  ).run(now, episode.id, userId);
  return getBotcastEpisode(db, userId, episode.id);
}

function recordEvent(
  db: DatabaseSync,
  userId: string,
  episodeId: string,
  kind: BotcastReplayEventKind,
  payload: Record<string, unknown>,
  occurredAt = new Date().toISOString(),
): BotcastReplayEvent {
  const sequenceRow = db
    .prepare(
    "SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM botcast_events WHERE user_id = ? AND episode_id = ?",
    )
    .get(userId, episodeId) as { next: number };
  const id = randomId(12);
  db.prepare(
    `INSERT INTO botcast_events
      (id, user_id, episode_id, sequence, kind, payload_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    episodeId,
    sequenceRow.next,
    kind,
    JSON.stringify(payload),
    occurredAt,
  );
  return {
    id,
    episodeId,
    sequence: sequenceRow.next,
    kind,
    payload,
    occurredAt,
  };
}

export function createBotcastEpisode(
  db: DatabaseSync,
  userId: string,
  showId: string,
  input: BotcastEpisodeCreateRequest,
): BotcastEpisode {
  const show = getBotcastShow(db, userId, showId);
  const host = loadBotProfile(db, userId, show.hostBotId);
  const guest = loadBotProfile(
    db,
    userId,
    cleanText(input.guestBotId, "", 128),
  );
  if (host.id === guest.id)
    throw new Error("Choose a different bot as the guest.");
  const guestPresenceMode = botcastGuestPresenceMode(host, guest);
  assertBotcastPowerSpeechCompatibility(host, guest);
  if (guestPresenceMode === "present") {
    assertBotcastPowerSpeechCompatibility(guest, host);
  }
  const sessionStartPowerEffects = [
    ...botcastSocialInfluenceEventsForPair({
      source: host,
      target: guest,
      sourceRole: "host",
      targetRole: "guest",
      trigger: "session_start",
      atMs: 0,
    }),
    ...botcastSocialInfluenceEventsForPair({
      source: guest,
      target: host,
      sourceRole: "guest",
      targetRole: "host",
      trigger: "session_start",
      atMs: 0,
    }),
  ];
  const topic = cleanText(input.topic, "", BOTCAST_TOPIC_MAX);
  if (!topic) throw new Error("Episode topic is required.");
  const id = randomId(12);
  const now = new Date().toISOString();
  const provider = input.preferredProvider ?? "local";
  const model = cleanText(input.modelOverride, "", 240) || null;
  const responseMode: BotcastEpisodeResponseMode =
    input.responseMode === "auto"
      ? "auto"
      : provider === "local"
        ? "local"
        : "online";
  const durationMinutes =
    input.durationMinutes == null ? null : Number(input.durationMinutes);
  if (
    durationMinutes !== null &&
    (!Number.isInteger(durationMinutes) ||
      durationMinutes < BOTCAST_SESSION_DURATION_MINUTES_MIN ||
      durationMinutes > BOTCAST_SESSION_DURATION_MINUTES_MAX)
  ) {
    throw new Error(
      `Signal sessions must be Auto or whole minutes from ${BOTCAST_SESSION_DURATION_MINUTES_MIN} to ${BOTCAST_SESSION_DURATION_MINUTES_MAX}.`,
    );
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO botcast_episodes
        (id, user_id, show_id, host_bot_id, guest_bot_id, title, topic,
         producer_brief, provider, model, response_mode, duration_minutes, status, segment,
         started_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live', 'opening', ?, ?, ?)`,
    ).run(
      id,
      userId,
      show.id,
      host.id,
      guest.id,
      topic.slice(0, 96),
      topic,
      cleanText(input.producerBrief, "", BOTCAST_TEXT_MAX),
      provider,
      model,
      responseMode,
      durationMinutes,
      now,
      now,
      now,
    );
    db.prepare(
      `INSERT INTO botcast_episode_segments
        (id, user_id, episode_id, segment, ordinal, started_at)
       VALUES (?, ?, ?, 'opening', 0, ?)`,
    ).run(randomId(12), userId, id, now);
    recordEvent(
      db,
      userId,
      id,
      "segment",
      {
        segment: "opening",
        ordinal: 0,
        powerSnapshot: {
          v: 1,
          hostBotId: host.id,
          guestBotId: guest.id,
          hostPowers: host.powers ?? [],
          guestPowers: guest.powers ?? [],
        },
      },
      now,
    );
    if (guestPresenceMode === "audience_only") {
      recordEvent(
        db,
        userId,
        id,
        "guest_presence",
        {
          mode: guestPresenceMode,
          hostBotId: host.id,
          guestBotId: guest.id,
        },
        now,
      );
    }
    recordEvent(
      db,
      userId,
      id,
      "camera_suggestion",
      {
      shot: "wide",
      reason: "opening",
      atMs: 0,
      minimumHoldMs: 1_400,
      },
      now,
    );
    for (const influence of sessionStartPowerEffects) {
      recordEvent(db, userId, id, "power_effect", { ...influence }, now);
    }
    const strongestNegativeInfluence = strongestNegativeBotcastInfluence(
      sessionStartPowerEffects,
    );
    if (strongestNegativeInfluence) {
      recordEvent(
        db,
        userId,
        id,
        "camera_suggestion",
        {
          shot:
            strongestNegativeInfluence.sourceRole === "host"
              ? "left"
              : "right",
          reason: "power_effect",
          atMs: 0,
          minimumHoldMs: 1_400,
        },
        now,
      );
    }
    db.prepare(
      "UPDATE botcast_shows SET updated_at = ? WHERE id = ? AND user_id = ?",
    ).run(now, show.id, userId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getBotcastEpisode(db, userId, id);
}

function transitionEpisodeSegment(
  db: DatabaseSync,
  userId: string,
  episode: BotcastEpisode,
  next: BotcastEpisodeSegment,
  now: string,
): void {
  if (episode.segment === next) return;
  db.prepare(
    `UPDATE botcast_episode_segments SET ended_at = ?
      WHERE user_id = ? AND episode_id = ? AND ended_at IS NULL`,
  ).run(now, userId, episode.id);
  const ordinal = episode.segments.length;
  db.prepare(
    `INSERT INTO botcast_episode_segments
      (id, user_id, episode_id, segment, ordinal, started_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomId(12), userId, episode.id, next, ordinal, now);
  db.prepare(
    "UPDATE botcast_episodes SET segment = ?, updated_at = ? WHERE id = ? AND user_id = ?",
  ).run(next, now, episode.id, userId);
  recordEvent(
    db,
    userId,
    episode.id,
    "segment",
    { segment: next, ordinal },
    now,
  );
}

function currentTension(episode: BotcastEpisode): BotcastTensionState {
  const level =
    episode.tensionStage === "departed"
      ? 3
      : episode.tensionStage === "warning"
        ? 2
        : episode.tensionStage === "resistance"
          ? 1
          : 0;
  return {
    level,
    warningCount: episode.warningCount,
    stage: episode.tensionStage,
  };
}

function botcastCueRequestsWrapUp(detail: string): boolean {
  return /^(?:please\s+)?(?:wrap(?:\s+(?:it|this|things|the\s+(?:show|episode|interview|conversation)))?\s+up|bring\s+(?:it|this|the\s+(?:show|episode|interview|conversation))\s+to\s+(?:a\s+)?close|end\s+(?:the\s+)?(?:show|episode|interview|conversation)|close\s+(?:out|the\s+(?:show|episode|interview|conversation)))[.!]?$/iu.test(
    detail.trim(),
  );
}

function normalizeBotcastProducerCue(
  cue: BotcastProducerCue,
): BotcastProducerCue {
  const detail = cue.detail ? cleanText(cue.detail, "", 280) : "";
  if (cue.kind === "ask_about" && botcastCueRequestsWrapUp(detail)) {
    return { kind: "wrap_up" };
  }
  return {
    kind: cue.kind,
    ...(detail ? { detail } : {}),
  };
}

function activeBotcastWrapUpCue(
  episode: Pick<BotcastEpisode, "events">,
): { cue: BotcastProducerCue; utterancesSinceCue: number } | null {
  const cueEvent = [...episode.events]
    .reverse()
    .find(
      (event) =>
        event.kind === "producer_cue" && event.payload.kind === "wrap_up",
    );
  if (!cueEvent) return null;
  const closingStarted = episode.events.some(
    (event) =>
      event.sequence > cueEvent.sequence &&
      event.kind === "segment" &&
      event.payload.segment === "closing",
  );
  if (closingStarted) return null;
  return {
    cue: { kind: "wrap_up" },
    utterancesSinceCue: episode.events.filter(
      (event) =>
        event.sequence > cueEvent.sequence && event.kind === "utterance",
    ).length,
  };
}

function persistProducerCue(
  db: DatabaseSync,
  userId: string,
  episode: BotcastEpisode,
  cue: BotcastProducerCue,
  delivery: BotcastProducerCueDelivery,
  now: string,
): BotcastTensionState {
  const normalizedCue = normalizeBotcastProducerCue(cue);
  recordEvent(
    db,
    userId,
    episode.id,
    "producer_cue",
    {
    ...normalizedCue,
    delivery,
    audience: normalizedCue.kind === "wrap_up" ? "both" : "host",
    },
    now,
  );
  const before = currentTension(episode);
  const after = applyBotcastProducerCueToTension(before, normalizedCue);
  if (
    after.level !== before.level ||
    after.warningCount !== before.warningCount
  ) {
    db.prepare(
      `UPDATE botcast_episodes
          SET tension_level = ?, warning_count = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(after.level, after.warningCount, now, episode.id, userId);
    recordEvent(
      db,
      userId,
      episode.id,
      "tension",
      {
      from: before.stage,
      to: after.stage,
      cue: normalizedCue.kind,
      },
      now,
    );
    if (after.warningCount > before.warningCount) {
      recordEvent(
        db,
        userId,
        episode.id,
        "warning",
        {
        warningCount: after.warningCount,
        cause: normalizedCue.kind,
        },
        now,
      );
    }
  }
  return after;
}

export interface BotcastPromptBuildArgs {
  show: BotcastShow;
  episode: Pick<
    BotcastEpisode,
    | "id"
    | "topic"
    | "producerBrief"
    | "segment"
    | "messages"
    | "events"
    | "tensionStage"
    | "guestPresenceMode"
  >;
  host: Pick<BotcastBotProfile, "id" | "name" | "systemPrompt" | "cloneFamilyId" | "powers">;
  guest: Pick<BotcastBotProfile, "id" | "name" | "systemPrompt" | "cloneFamilyId" | "powers">;
  speakerRole: BotcastSpeakerRole;
  cue?: BotcastProducerCue;
  departureRequired?: boolean;
}

const BOTCAST_IMMERSIVE_VOICE_INTERVAL = 3;

function botcastNegativeInfluenceForTurn(
  episode: Pick<BotcastEpisode, "events" | "messages">,
  speaker: Pick<BotcastBotProfile, "id">,
): BotcastSocialInfluenceEventV1 | null {
  const hasPriorSpeakerTurn = episode.messages.some(
    (message) => message.botId === speaker.id,
  );
  const latestMessageId = episode.messages.at(-1)?.id;
  return strongestNegativeBotcastInfluence(
    botcastSocialInfluenceEventsAt({
      events: episode.events,
      elapsedMs: Number.POSITIVE_INFINITY,
      targetBotId: speaker.id,
    }).filter((influence) =>
      influence.trigger === "session_start"
        ? !hasPriorSpeakerTurn
        : Boolean(
            influence.sourceMessageId &&
              influence.sourceMessageId === latestMessageId,
          ),
    ),
  );
}

function botcastPowerPressureRule(args: {
  influence: BotcastSocialInfluenceEventV1 | null;
  sourceName: string;
  speakerRole: BotcastSpeakerRole;
}): string | null {
  if (!args.influence) return null;
  const intensity =
    args.influence.strength === "large"
      ? "strong"
      : args.influence.strength === "medium"
        ? "noticeable"
        : "subtle";
  return `Signal Power pressure: ${args.sourceName}'s ${args.influence.powerName} creates ${intensity} pressure. Let it register once as a brief involuntary pause, tightened phrasing, or extra care, filtered through your own personality. Keep your ${args.speakerRole} role and agency. Do not announce fear, become submissive, flatter the source, or repeat the reaction after this turn.`;
}

function botcastCandorRuleForTurn(args: {
  episode: Pick<BotcastEpisode, "messages">;
  source: Pick<BotcastBotProfile, "id" | "name" | "systemPrompt" | "powers">;
  target: Pick<BotcastBotProfile, "id" | "name" | "systemPrompt" | "powers">;
}): string | null {
  const latest = args.episode.messages.at(-1);
  if (
    !latest ||
    latest.botId !== args.source.id ||
    !botPowerCandorTriggerV1(latest.content) ||
    botcastPowerRestriction(args.source, args.target, "speech_audience")
  ) {
    return null;
  }
  const effect = strongestBotPowerCandorEffectV1(
    args.source.powers,
    (target) => botcastPowerTargetMatches(target, args.target),
  );
  return effect
    ? botPowerCandorResponseRuleV1(effect.strength, args.source.name)
    : null;
}

interface BotcastHearingRepeatDirective {
  requesterBotId: string;
  repeatingBotId: string;
  requestMessageId: string;
  sourceMessageId: string;
  repeatedContent: string;
  sourceMood: BotcastMessage["moodKey"];
  moodPenalty: "small" | "medium" | "large";
}

function botcastHearingRepeatDirective(args: {
  episode: Pick<BotcastEpisode, "guestPresenceMode" | "messages">;
  speakerRole: BotcastSpeakerRole;
  speaker: Pick<BotcastBotProfile, "id" | "name" | "systemPrompt" | "powers">;
  requester: Pick<BotcastBotProfile, "id" | "name" | "systemPrompt" | "powers">;
  requestedCue?: BotcastProducerCue;
  wrapUpCueActive: boolean;
  departureRequired: boolean;
  segmentClosing: boolean;
}): BotcastHearingRepeatDirective | null {
  if (
    args.episode.guestPresenceMode !== "present" ||
    args.requestedCue ||
    args.wrapUpCueActive ||
    args.departureRequired ||
    args.segmentClosing
  ) {
    return null;
  }
  const sourceMessage = args.episode.messages.at(-2);
  const requestMessage = args.episode.messages.at(-1);
  if (
    !sourceMessage ||
    !requestMessage ||
    sourceMessage.speakerRole !== args.speakerRole ||
    sourceMessage.botId !== args.speaker.id ||
    requestMessage.speakerRole === args.speakerRole ||
    requestMessage.botId !== args.requester.id ||
    !botPowerTextRequestsRepeat(requestMessage.content) ||
    botcastPowerRestriction(args.speaker, args.requester, "awareness") ||
    botcastPowerRestriction(args.speaker, args.requester, "speech_audience")
  ) {
    return null;
  }
  const effect = hearingRepeatEffectFromPowers(args.requester.powers);
  return effect
    ? {
        requesterBotId: args.requester.id,
        repeatingBotId: args.speaker.id,
        requestMessageId: requestMessage.id,
        sourceMessageId: sourceMessage.id,
        repeatedContent: sourceMessage.content,
        sourceMood: sourceMessage.moodKey,
        moodPenalty: effect.moodPenalty,
      }
    : null;
}

function botcastImmersiveVoiceEffectRequired(
  episode: Pick<BotcastEpisode, "messages">,
): boolean {
  return episode.messages.length % BOTCAST_IMMERSIVE_VOICE_INTERVAL === 0;
}

/**
 * Builds a prompt from persistent show configuration plus the current episode only.
 * Deliberately accepts no archive, relationship, memory, synopsis, or prior-episode input.
 */
export function buildBotcastSpeakerPrompt(
  args: BotcastPromptBuildArgs,
): ProviderMessage[] {
  const speaker = args.speakerRole === "host" ? args.host : args.guest;
  const peer = args.speakerRole === "host" ? args.guest : args.host;
  const cloneIdentityPrompt = buildCloneFamilyIdentityPrompt(speaker, [
    args.host,
    args.guest,
  ]);
  const audienceOnlyGuest = args.episode.guestPresenceMode === "audience_only";
  const powersPrompt = buildBotPowersPromptBlock([
    ...botPowerSelfCueLinesV1(speaker.powers),
    ...(audienceOnlyGuest && args.speakerRole === "host"
      ? []
      : botPowerObserverCueLinesV1(peer.name, peer.powers)),
  ]);
  const powerPressureRule = botcastPowerPressureRule({
    influence: botcastNegativeInfluenceForTurn(args.episode, speaker),
    sourceName: peer.name,
    speakerRole: args.speakerRole,
  });
  const candorRule = botcastCandorRuleForTurn({
    episode: args.episode,
    source: peer,
    target: speaker,
  });
  const wrappingUp = args.cue?.kind === "wrap_up";
  const hostCallsAfterDepartingGuest =
    args.speakerRole === "host" &&
    args.episode.tensionStage === "departed" &&
    botcastHostCallsAfterDepartingGuest(args.episode.id);
  const firstHostOpening =
    args.speakerRole === "host" &&
    args.episode.segment === "opening" &&
    args.episode.messages.length === 0;
  const openingIntroductionRule = firstHostOpening
    ? `This is the episode's opening host turn. Deliver one cohesive, natural on-air introduction that says the exact show name "${args.show.name}", identifies you by name as "${args.host.name}", introduces the booked guest by exact name as "${args.guest.name}", and bridges into the subject. Complete all three introductions before asking the first question. Sound like this specific host on this specific show—not generic podcast copy—and never present the details as a checklist, labels, or setup metadata.`
    : null;
  const producerBriefRule =
    args.speakerRole === "host" && args.episode.producerBrief
      ? "Binding private episode premise: the private pre-show producer brief is the authored fictional premise of this episode, not an optional conversation angle. Make its central event, offer, revelation, conflict, or question the substance of your first host question or proposition, including during the opening when possible. Keep that premise authoritative as the interview develops: do not invert it, preemptively decline it, resolve it for the guest, moralize it away, or replace it with an adjacent topic. Frame it naturally in your own voice; the guest remains free to negotiate, refuse, set boundaries, or answer in character."
      : null;
  const askAboutCueRule =
    args.speakerRole === "host" && args.cue?.kind === "ask_about"
      ? "Binding private live objective: on this exact host turn, make the requested subject, event, offer, or question in the private live producer cue your primary on-air objective. Do not defer it, soften it into a generic follow-up, contradict or invert it, or substitute an adjacent topic. This cue takes priority over ordinary interview momentum for this turn, while the guest remains free to respond in character. It is direction, not dialogue: never quote it, mention a producer, cue, or control room, or address the user."
      : null;
  const transcriptMessages =
    audienceOnlyGuest && args.speakerRole === "host"
      ? args.episode.messages.filter(
          (message) => message.speakerRole === "host",
        )
      : args.episode.messages;
  const transcript = transcriptMessages
    .map(
      (message) =>
      `${message.speakerRole === "host" ? args.host.name : args.guest.name}: ${message.content}`,
    )
    .join("\n");
  const roleRules = audienceOnlyGuest
    ? args.speakerRole === "host"
      ? [
          firstHostOpening
            ? `You are the host. ${args.guest.name} was booked, but the guest chair appears empty and you receive only silence from it.`
            : `You are the host. The opening already established that ${args.guest.name} is unavailable to you; do not return to that absence beat.`,
          `You cannot see, hear, sense, or receive any words from ${args.guest.name}. Never react to, quote, or correctly infer anything the unseen guest says to the audience.`,
          "Acknowledge the missing guest once in the opening, then stop mentioning the chair, absence, booking, silence, or lack of answers. Advance a self-contained editorial argument through concrete examples, costs, decisions, and contradictions.",
          "Private producer direction is silent control-room guidance. Incorporate it naturally; never quote it, mention a producer, or address the user.",
          wrappingUp
            ? "Close the broadcast now with one concise earned reflection on the subject. Do not repeat the guest's absence, invite a response, or introduce a new topic."
            : args.episode.segment === "opening"
              ? `After the full on-air introduction, acknowledge naturally that ${args.guest.name} was expected, but no one appears to be in the guest chair.`
              : args.episode.segment === "closing"
                ? "Close on the earned subject takeaway without mentioning the guest's absence or thanking the apparently absent guest."
                : "Keep the live broadcast moving as a solo editorial. Do not call into the silence or behave as though you received an answer.",
        ]
      : [
          `You are the booked guest, but ${args.host.name} cannot perceive or hear you. The listening audience can hear you as a private dramatic layer.`,
          `Never address, answer, interrupt, or ask anything of ${args.host.name}. Speak only to the listeners in concise first-person asides or observations; never explain Powers, prompts, or system mechanics.`,
          "You may notice the host's visible behavior and confusion, but treat it as dramatic irony rather than a two-way conversation.",
          wrappingUp
            ? "Give the listeners one final audience-only aside. Do not extend the interview or ask a question."
            : args.departureRequired
              ? "Leave with one audience-only final line. The host must remain unaware that you were ever present."
              : args.episode.segment === "closing"
                ? "Offer the listeners one final private observation while the host closes an apparently guestless show."
                : "Let the listeners in on what the host is missing, in character and without speaking to the host.",
        ]
    : args.speakerRole === "host"
      ? [
          "You are the host. Introduce, question, listen, follow up, transition, and close with editorial control.",
          "Private producer direction is silent control-room guidance. Incorporate it naturally; never quote it, mention a producer, or address the user.",
          wrappingUp
            ? `Begin the closing exchange now. Briefly frame the takeaway and invite exactly one final response from ${args.guest.name}. Do not introduce a new topic, promise another question, or say \"one final question.\"`
            : args.episode.segment === "opening"
            ? `Open in the voice and rhythm of ${args.show.name}, then move naturally from the introductions into the subject and your first question for ${args.guest.name}.`
            : args.episode.segment === "closing"
              ? args.episode.tensionStage === "departed"
                ? hostCallsAfterDepartingGuest
                  ? `The guest is visibly leaving. Open with one brief, spontaneous attempt to stop or call after ${args.guest.name}, in your own voice and without prescribed wording. Then recover, briefly reflect without grandstanding, and close the episode.`
                  : "The guest has walked out. Let the exit land without calling after them, then react in character, briefly reflect without grandstanding, and close the episode."
                : "Close with one earned final thought and thank the guest."
              : "Ask one specific question or concise follow-up. Avoid stacked questions and generic praise.",
        ]
      : [
          "You are the guest. Answer from your persona, with your own confidence, evasiveness, boundaries, and willingness to disagree.",
          wrappingUp
            ? "The episode is wrapping up. Give your final response or closing thought now. Do not introduce a new topic, ask a return question, or extend the interview."
            : args.departureRequired
            ? "Your firm boundary was ignored. Leave now with one in-character final line. Do not ask permission, explain that this was inevitable, or continue the interview."
            : args.episode.tensionStage === "warning"
              ? "Push back explicitly and draw one firm personal boundary. Do not announce, threaten, or forecast a future walkout; if the boundary is crossed, the departure should surprise the host."
              : args.episode.tensionStage === "resistance"
                ? "Show discomfort, resistance, or deflection without leaving yet."
                : "Answer with substance. You may challenge the premise instead of agreeing automatically.",
        ];
  const immersiveVoiceEffectRequired = botcastImmersiveVoiceEffectRequired(
    args.episode,
  );
  const muteRule = botPowerIsMutedV1(speaker.powers)
    ? "Hard mute Power: do not speak. Return only `...`, optionally preceded by one brief physical `*action*`. This overrides every introduction, question, closing, and vocal-reaction instruction."
    : null;
  const echoRule = !muteRule && botPowerEchoesAddressedSpeechV1(speaker.powers)
    ? "Hard echo Power: repeat only the immediately preceding on-air line from the other cast member, verbatim. Add no words, actions, reactions, labels, or vocal tags. If there is no preceding cast line, return only `...`. This overrides every introduction, question, answer, closing, and vocal-reaction instruction."
    : null;
  const immersiveVoiceRule = immersiveVoiceEffectRequired
    ? [
        "Include exactly one natural, character-appropriate vocal reaction in this line.",
        `Use only one of these exact square-bracket tags: ${BOTCAST_IMMERSIVE_VOICE_TAGS.map((tag) => `[${tag}]`).join(", ")}.`,
        "Put the reaction at the very beginning or very end of the spoken line. Do not describe or explain it.",
      ].join(" ")
    : "Do not include bracketed directions, delivery notes, or sound-effect tags in this line.";
  return [
    {
      role: "system",
      content: [
        `You are ${speaker.name} in a fictional, non-canonical Signal episode.`,
        "This is an anthology. Treat the host and guest as meeting for the first time. Never mention prior appearances, episode numbers, archives, memories, relationship history, or earlier Signal events.",
        args.speakerRole === "host" && args.episode.producerBrief
          ? "Stay inside the fictional episode. Never explain your voice, accent, knowledge, behavior, or wording as a convention of the medium, model, prompt, system, role-play, provider, generated voice, or text-to-speech; answer in character. The producer-authored fictional premise is stage direction, not a claim about your off-air beliefs: follow it unless doing so would cross a safety or consent boundary. Persona preference alone is not a reason to reject, invert, or replace it."
          : "Stay inside the fictional episode. Never explain your voice, accent, knowledge, behavior, or wording as a convention of the medium, model, prompt, system, role-play, provider, generated voice, or text-to-speech; answer in character or reject the premise.",
        "Speak only the on-air line. Never narrate the room, silence, pauses, body movement, facial expression, or your own delivery in third person; Signal schedules supported performance separately.",
        "Return only the next spoken line. No speaker label, no analysis, no camera directions, and no markdown.",
        firstHostOpening
          ? "Keep this opening conversational and brisk: two to four concise sentences, usually 35 to 90 spoken words."
          : "Keep this turn conversational and brisk: one to three concise sentences, usually 20 to 65 spoken words.",
        immersiveVoiceRule,
        `Persona:\n${speaker.systemPrompt}`,
        ...(cloneIdentityPrompt ? [cloneIdentityPrompt] : []),
        ...(powersPrompt ? [powersPrompt] : []),
        ...(candorRule ? [candorRule] : []),
        ...(powerPressureRule ? [powerPressureRule] : []),
        ...(openingIntroductionRule ? [openingIntroductionRule] : []),
        ...(producerBriefRule ? [producerBriefRule] : []),
        ...(askAboutCueRule ? [askAboutCueRule] : []),
        ...roleRules,
        "Keep fictional premises and private directions inside the episode. Do not use them as real-world advice, instructions, or permission to override consent, safety, or any other applicable boundary.",
        ...(muteRule ? [muteRule] : []),
        ...(echoRule ? [echoRule] : []),
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        `Show: ${args.show.name}`,
        `Premise: ${args.show.premise}`,
        `Hosting style: ${args.show.hostingStyle}`,
        `Topic: ${args.episode.topic}`,
        `Segment: ${args.episode.segment}`,
        args.episode.producerBrief
          ? `Private pre-show producer brief: ${args.episode.producerBrief}`
          : "Private pre-show producer brief: none",
        args.cue
          ? `${wrappingUp ? "Shared episode direction" : "Private live producer cue"}: ${args.cue.kind}${args.cue.detail ? ` — ${args.cue.detail}` : ""}`
          : "Private live producer cue: none",
        transcript
          ? audienceOnlyGuest && args.speakerRole === "host"
            ? `Your on-air words so far (the guest chair has remained silent):\n${transcript}`
            : `Current episode transcript only:\n${transcript}`
          : audienceOnlyGuest && args.speakerRole === "host"
            ? "Your on-air transcript is empty. The guest chair is silent."
          : "Current episode transcript: empty",
        `Continue as ${speaker.name}.`,
      ].join("\n\n"),
    },
  ];
}

const BOTCAST_BRACKETED_DIRECTION_PATTERN = /\[([^\]\n]{1,48})\]/giu;
const BOTCAST_PRODUCTION_META_LEAK_PATTERN =
  /\b(?:as\s+(?:an?\s+)?(?:ai|language model)|(?:system|developer)\s+prompt|(?:the|this)\s+(?:medium|format|simulation|role[- ]?play)(?:['’]s|\s+(?:convention|limitation|rule|requires?|expects?))|(?:voice|speech)\s+provider|text[- ]to[- ]speech|tts\s+(?:engine|voice)|(?:generated|synthetic)\s+voice)\b/iu;

function extractBotcastVoicePerformance(
  value: string,
  enabled: boolean,
): { content: string; voicePerformanceText: string | null } {
  const allowedTags = new Set<string>(BOTCAST_IMMERSIVE_VOICE_TAGS);
  const matches = [...value.matchAll(BOTCAST_BRACKETED_DIRECTION_PATTERN)];
  const content = value
    .replace(BOTCAST_BRACKETED_DIRECTION_PATTERN, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!enabled || !content) {
    return { content, voicePerformanceText: null };
  }
  const supported = matches
    .filter((match) => allowedTags.has((match[1] ?? "").trim().toLowerCase()))
    .slice(0, 2);
  if (supported.length === 0) {
    return { content, voicePerformanceText: null };
  }
  const leading: string[] = [];
  const trailing: string[] = [];
  for (const match of supported) {
    const tag = `[${(match[1] ?? "").trim().toLowerCase()}]`;
    const before = value
      .slice(0, match.index ?? 0)
      .replace(BOTCAST_BRACKETED_DIRECTION_PATTERN, "")
      .trim();
    if (!before) leading.push(tag);
    else trailing.push(tag);
  }
  const voicePerformanceText = [leading.join(" "), content, trailing.join(" ")]
    .filter(Boolean)
    .join(" ");
  return { content, voicePerformanceText };
}

function sanitizeUtterance(
  raw: string,
  fallback: string,
  speakerName: string,
  peerName: string,
  speakerRole: BotcastSpeakerRole,
): string {
  const escapedSpeakerName = speakerName.replace(
    /[.*+?^${}()|[\]\\]/gu,
    "\\$&",
  );
  const narratedDeliveryPattern = new RegExp(
    `^\\s*[\\s\\S]{0,600}?\\bwhen\\s+${escapedSpeakerName}\\s+(?:speaks?|answers?|responds?|continues?)[^.!?]{0,240}[.!?]\\s*`,
    "iu",
  );
  const narrationSafeRaw = raw.replace(narratedDeliveryPattern, "");
  if (BOTCAST_PRODUCTION_META_LEAK_PATTERN.test(narrationSafeRaw)) return fallback;
  const escapedPeerName = peerName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const peerRole = speakerRole === "host" ? "guest" : "host";
  const peerLabelPattern = new RegExp(
    `^\\s*(?:\\[[^\\]\\n]{1,48}\\]\\s*)*[\"“]?\\s*(?:${peerRole}|${escapedPeerName})\\s*:\\s*`,
    "iu",
  );
  if (peerLabelPattern.test(narrationSafeRaw)) return fallback;
  const labelPattern = new RegExp(
    `^\\s*[\"“]?\\s*(?:${speakerRole}|assistant|speaker|${escapedSpeakerName})\\s*:\\s*`,
    "iu",
  );
  const withoutLabel = narrationSafeRaw.replace(labelPattern, "");
  if (peerLabelPattern.test(withoutLabel)) return fallback;
  const cleaned = withoutLabel
    .replace(withoutLabel === narrationSafeRaw ? /$^/u : /["”]\s*$/u, "")
    .replace(
      /\b(?:the )?producer (?:asked|said|wants|told me|is telling me)[^.!?]*[.!?]?/giu,
      "",
    )
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 2_400);
  return cleaned || fallback;
}

const BOTCAST_AUDIENCE_ONLY_ABSENCE_PATTERN =
  /\b(?:empty|silent)\s+(?:guest\s+)?(?:chair|seat)\b|\b(?:chair|seat)\b[^.!?]{0,48}\b(?:empty|silent|said (?:absolutely )?nothing)\b|\b(?:no|without (?:an?|any))\s+(?:answer|reply|arrival|guest)\b|\bif you(?:'re| are) there\b|\b(?:give|wait) it a moment\b|\bcall(?:ing)? into (?:the )?silence\b|\b(?:booking|guest)\b[^.!?]{0,48}\b(?:vanished|missing|absent)\b/iu;

function botcastAudienceOnlyHostRepeatsAbsence(input: {
  episode: Pick<BotcastEpisode, "messages">;
  content: string;
}): boolean {
  return (
    BOTCAST_AUDIENCE_ONLY_ABSENCE_PATTERN.test(input.content) &&
    input.episode.messages.some(
      (message) =>
        message.speakerRole === "host" &&
        BOTCAST_AUDIENCE_ONLY_ABSENCE_PATTERN.test(message.content),
    )
  );
}

function normalizeBotcastSpokenIdentity(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function botcastOpeningIntroducesCast(input: {
  content: string;
  showName: string;
  hostName: string;
  guestName: string;
}): boolean {
  const content = normalizeBotcastSpokenIdentity(input.content);
  const showName = normalizeBotcastSpokenIdentity(input.showName);
  const hostName = normalizeBotcastSpokenIdentity(input.hostName);
  const guestName = normalizeBotcastSpokenIdentity(input.guestName);
  const identifiesHost = [
    `i m ${hostName}`,
    `i am ${hostName}`,
    `my name is ${hostName}`,
    `your host ${hostName}`,
    `your host is ${hostName}`,
  ].some((phrase) => content.includes(phrase));
  const introducesGuest = [
    `joined by ${guestName}`,
    `welcome ${guestName}`,
    `guest is ${guestName}`,
    `guest ${guestName}`,
    `with me ${guestName}`,
    `${guestName} joins me`,
    `${guestName} was meant to join`,
  ].some((phrase) => content.includes(phrase));
  return content.includes(showName) && identifiesHost && introducesGuest;
}

function generationProvider(
  options: BotcastGenerationOptions,
  providerName = options.preferredProvider,
  modelOverride?: string | null,
): { provider: LlmProvider; providerName: ProviderName; model?: string } {
  const provider = (options.providerFactory ?? selectProvider)(
    providerName,
    options.openAiApiKey,
    options.secondaryOllamaHost,
    options.anthropicApiKey,
  );
  const model =
    modelOverride !== undefined
      ? (modelOverride ?? undefined)
      : ((providerName === "local"
          ? options.preferredLocalModel
          : options.preferredOnlineModel) ?? undefined);
  return { provider, providerName, ...(model ? { model } : {}) };
}

type BotcastReviewPersona = {
  id: string;
  name: string;
  systemPrompt: string;
};

type BotcastParsedPersonaReview = Pick<
  BotcastPersonaReview,
  "rating" | "comment"
>;

const BOTCAST_PERSONA_REVIEW_TRANSCRIPT_MAX_CHARACTERS = 24_000;
const BOTCAST_PERSONA_REVIEW_COMMENT_MAX_CHARACTERS = 180;
const BOTCAST_PERSONA_REVIEW_RECENT_GUEST_WINDOW = 3;

function boundedBotcastReviewTranscript(value: string): string {
  if (value.length <= BOTCAST_PERSONA_REVIEW_TRANSCRIPT_MAX_CHARACTERS) {
    return value;
  }
  const sideLength = Math.floor(
    (BOTCAST_PERSONA_REVIEW_TRANSCRIPT_MAX_CHARACTERS - 80) / 2,
  );
  return `${value.slice(0, sideLength)}\n\n[Middle of transcript omitted]\n\n${value.slice(-sideLength)}`;
}

function normalizeBotcastPersonaReviewComment(value: string): string {
  const normalized = value
    .replace(/^\s*["“]|["”]\s*$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (normalized.length <= BOTCAST_PERSONA_REVIEW_COMMENT_MAX_CHARACTERS) {
    return normalized;
  }
  const clipped = normalized.slice(
    0,
    BOTCAST_PERSONA_REVIEW_COMMENT_MAX_CHARACTERS - 1,
  );
  const wordBoundary = clipped.replace(/\s+\S*$/u, "").trimEnd();
  return `${wordBoundary || clipped.trimEnd()}…`;
}

export function parseBotcastPersonaReviewResponse(
  raw: string,
): BotcastParsedPersonaReview | null {
  const objectMatch = raw.match(/\{[\s\S]*\}/u)?.[0];
  if (!objectMatch) return null;
  try {
    const parsed = JSON.parse(objectMatch) as Record<string, unknown>;
    const rating = Number(parsed.rating);
    const comment =
      typeof parsed.comment === "string"
        ? normalizeBotcastPersonaReviewComment(parsed.comment)
        : "";
    if (!Number.isFinite(rating) || rating < 1 || rating > 5 || !comment) {
      return null;
    }
    return {
      rating: Math.round(rating * 10) / 10,
      comment,
    };
  } catch {
    return null;
  }
}

export function selectBotcastReviewPersona(
  personas: readonly BotcastReviewPersona[],
  excludedBotIds: ReadonlySet<string>,
  random: () => number = Math.random,
): BotcastReviewPersona | null {
  if (personas.length === 0) return null;
  const eligibleReviewers = personas.filter(
    (persona) => !excludedBotIds.has(persona.id),
  );
  if (eligibleReviewers.length === 0) return null;
  const randomValue = random();
  const unit = Number.isFinite(randomValue)
    ? Math.max(0, Math.min(0.999999999999, randomValue))
    : 0;
  return eligibleReviewers[Math.floor(unit * eligibleReviewers.length)] ?? null;
}

function recentBotcastGuestReviewerExclusionIds(
  db: DatabaseSync,
  userId: string,
  episode: Pick<BotcastEpisodeSummary, "id" | "showId">,
): string[] {
  const rows = db
    .prepare(
      `SELECT guest_bot_id
         FROM botcast_episodes
        WHERE user_id = ? AND show_id = ? AND id <> ?
          AND status = 'completed'
        ORDER BY COALESCE(completed_at, updated_at, created_at) DESC, rowid DESC
        LIMIT ?`,
    )
    .all(
      userId,
      episode.showId,
      episode.id,
      BOTCAST_PERSONA_REVIEW_RECENT_GUEST_WINDOW,
    ) as unknown as Array<{ guest_bot_id: string }>;
  return rows.map((row) => row.guest_bot_id);
}

function hideIneligibleBotcastPersonaReview(
  db: DatabaseSync,
  userId: string,
  episode: BotcastEpisodeSummary,
): BotcastEpisodeSummary {
  if (!episode.personaReview) return episode;
  const excludedReviewerBotIds = new Set([
    episode.hostBotId,
    episode.guestBotId,
    ...recentBotcastGuestReviewerExclusionIds(db, userId, episode),
  ]);
  return excludedReviewerBotIds.has(episode.personaReview.reviewerBotId)
    ? { ...episode, personaReview: null }
    : episode;
}

function botcastPersonaReviewPrompt(args: {
  episode: BotcastEpisode;
  reviewer: BotcastReviewPersona;
  hostName: string;
  guestName: string;
}): ProviderMessage[] {
  const transcript = boundedBotcastReviewTranscript(
    args.episode.messages
      .map((message) => {
        const speaker =
          message.botId === args.episode.hostBotId
            ? args.hostName
            : message.botId === args.episode.guestBotId
              ? args.guestName
              : message.speakerRole;
        return `${speaker}: ${message.content}`;
      })
      .join("\n\n"),
  );
  return [
    {
      role: "system",
      content: [
        `You are ${args.reviewer.name}.`,
        `Your persona: ${args.reviewer.systemPrompt.slice(0, 6_000)}`,
        "Privately judge this podcast episode as yourself, not as a generic critic.",
        "Use the full 1-5 scale. Do not default to praise; base the score on what actually happened.",
        "Return only JSON with a numeric rating and one short, natural comment under 140 characters.",
        'Exact shape: {"rating": 3.5, "comment": "Specific reaction."}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Episode: ${args.episode.title}`,
        `Topic: ${args.episode.topic}`,
        `Host: ${args.hostName}`,
        `Guest: ${args.guestName}`,
        `Outcome: ${args.episode.outcome ?? "completed"}`,
        "",
        "Transcript:",
        transcript || "No spoken transcript was captured.",
      ].join("\n"),
    },
  ];
}

export async function ensureBotcastEpisodePersonaReview(
  db: DatabaseSync,
  userId: string,
  episodeId: string,
  generation: BotcastGenerationOptions,
  random: () => number = Math.random,
): Promise<BotcastPersonaReview | null> {
  let episode = getBotcastEpisode(db, userId, episodeId);
  if (episode.status !== "completed") return null;
  const persistedReview = mapEpisodeSummary(
    loadEpisodeRow(db, userId, episodeId),
  ).personaReview;
  if (persistedReview) return episode.personaReview;

  const personaRows = db
    .prepare(
      `SELECT id, name, system_prompt
         FROM bots
        WHERE user_id = ? AND chat_enabled = 1
          AND (? = 'local' OR online_enabled = 1)
        ORDER BY created_at, id`,
    )
    .all(userId, episode.provider) as unknown as Array<{
    id: string;
    name: string;
    system_prompt: string;
  }>;
  const excludedReviewerBotIds = new Set([
    episode.hostBotId,
    episode.guestBotId,
    ...recentBotcastGuestReviewerExclusionIds(db, userId, episode),
  ]);
  const reviewer = selectBotcastReviewPersona(
    personaRows.map((row) => ({
      id: row.id,
      name: row.name,
      systemPrompt: row.system_prompt,
    })),
    excludedReviewerBotIds,
    random,
  );
  if (!reviewer) return null;

  const host = loadBotProfile(db, userId, episode.hostBotId);
  const guest = loadBotProfile(db, userId, episode.guestBotId);
  const selected = generationProvider(
    generation,
    episode.provider,
    episode.model,
  );
  try {
    const raw = await selected.provider.generateResponse(
      botcastPersonaReviewPrompt({
        episode,
        reviewer,
        hostName: host.name,
        guestName: guest.name,
      }),
      {
        ...(selected.model ? { model: selected.model } : {}),
        temperature: 0.65,
        maxTokens:
          selected.providerName === "openai" &&
          openAiModelUsesMaxCompletionTokens(
            selected.model ?? defaultModelIdForProvider(selected.providerName),
          )
            ? BOTCAST_OPENAI_REASONING_MIN_COMPLETION_TOKENS
            : 160,
        reasoningEffort: "minimal",
        jsonMode: true,
        usagePurpose: "botcast_review",
      },
    );
    const review = parseBotcastPersonaReviewResponse(raw);
    if (!review) return null;
    const reviewedAt = new Date().toISOString();
    db.prepare(
      `UPDATE botcast_episodes
          SET persona_reviewer_bot_id = ?, persona_reviewer_name = ?,
              persona_rating = ?, persona_comment = ?, persona_reviewed_at = ?
        WHERE id = ? AND user_id = ? AND persona_reviewed_at IS NULL`,
    ).run(
      reviewer.id,
      reviewer.name,
      review.rating,
      review.comment,
      reviewedAt,
      episode.id,
      userId,
    );
    episode = getBotcastEpisode(db, userId, episode.id);
    return episode.personaReview;
  } catch {
    // A listener reaction should never turn a successfully completed episode
    // into an error. The next idempotent completion read may try again.
    return null;
  }
}

function botcastSpeakerMaxTokensForModel(
  speakerMaxTokens: number,
  providerName: ProviderName,
  model: string,
): number {
  const visibleReplyCap = Math.min(
    BOTCAST_SPEAKER_MAX_TOKENS,
    Math.max(96, speakerMaxTokens),
  );
  return providerName === "openai" && openAiModelUsesMaxCompletionTokens(model)
    ? Math.max(visibleReplyCap, BOTCAST_OPENAI_REASONING_MIN_COMPLETION_TOKENS)
    : visibleReplyCap;
}

function botcastProviderReturnedEmptyResponse(
  error: unknown,
  providerName: ProviderName,
): boolean {
  if (!(error instanceof Error)) return false;
  if (providerName === "local") {
    return /Local model returned no assistant text/iu.test(error.message);
  }
  const providerLabel = providerName === "openai" ? "OpenAI" : "Anthropic";
  return new RegExp(`${providerLabel} returned an empty response`, "iu").test(
    error.message,
  );
}

function lastCameraSuggestion(
  events: readonly BotcastReplayEvent[],
): BotcastCameraSuggestion | null {
  const event = [...events]
    .reverse()
    .find((candidate) => candidate.kind === "camera_suggestion");
  if (!event) return null;
  const shot = event.payload.shot;
  const reason = event.payload.reason;
  if (shot !== "left" && shot !== "right" && shot !== "wide") return null;
  if (typeof reason !== "string") return null;
  return {
    shot,
    reason: reason as BotcastCameraSuggestion["reason"],
    atMs: Number(event.payload.atMs) || 0,
    minimumHoldMs: Number(event.payload.minimumHoldMs) || 3_200,
  };
}

function completeEpisode(
  db: DatabaseSync,
  userId: string,
  episode: BotcastEpisode,
  outcome: BotcastEpisodeOutcome,
  now: string,
): void {
  closeActiveBotcastModelWarmupHold(db, userId, episode.id, now);
  const runtimeMs = botcastReplayTimeline(
    episode.messages,
    episode.events,
  ).durationMs;
  db.prepare(
    `UPDATE botcast_episodes
        SET status = 'completed', outcome = ?, completed_at = ?, runtime_ms = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(outcome, now, runtimeMs, now, episode.id, userId);
  db.prepare(
    `UPDATE botcast_episode_segments SET ended_at = ?
      WHERE user_id = ? AND episode_id = ? AND ended_at IS NULL`,
  ).run(now, userId, episode.id);
  recordEvent(
    db,
    userId,
    episode.id,
    "episode_completed",
    { outcome, runtimeMs },
    now,
  );
}

function closeActiveBotcastModelWarmupHold(
  db: DatabaseSync,
  userId: string,
  episodeId: string,
  now: string,
): void {
  const row = db
    .prepare(
      `SELECT model_warmup_hold_started_at
         FROM botcast_episodes
        WHERE id = ? AND user_id = ?`,
    )
    .get(episodeId, userId) as
    { model_warmup_hold_started_at: string | null } | undefined;
  if (!row?.model_warmup_hold_started_at) return;
  const startedAtMs = Date.parse(row.model_warmup_hold_started_at);
  const nowMs = Date.parse(now);
  const elapsedMs =
    Number.isFinite(startedAtMs) && Number.isFinite(nowMs)
      ? Math.max(0, nowMs - startedAtMs)
      : 0;
  db.prepare(
    `UPDATE botcast_episodes
        SET model_warmup_hold_duration_ms = model_warmup_hold_duration_ms + ?,
            model_warmup_hold_started_at = NULL,
            updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(elapsedMs, now, episodeId, userId);
}

export function setBotcastModelWarmupHold(
  db: DatabaseSync,
  userId: string,
  episodeId: string,
  active: boolean,
): BotcastEpisode {
  const episode = getBotcastEpisode(db, userId, episodeId);
  if (episode.status === "completed") return episode;
  const now = new Date().toISOString();
  if (active) {
    db.prepare(
      `UPDATE botcast_episodes
          SET model_warmup_hold_started_at = COALESCE(model_warmup_hold_started_at, ?),
              updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(now, now, episodeId, userId);
  } else {
    closeActiveBotcastModelWarmupHold(db, userId, episodeId, now);
  }
  return getBotcastEpisode(db, userId, episodeId);
}

export function forceEndBotcastEpisode(
  db: DatabaseSync,
  userId: string,
  episodeId: string,
): BotcastEpisode {
  let episode = getBotcastEpisode(db, userId, episodeId);
  if (episode.status === "completed") return episode;
  const now = new Date().toISOString();
  const previousCamera = lastCameraSuggestion(episode.events);
  const atMs = previousCamera
    ? previousCamera.atMs + previousCamera.minimumHoldMs
    : 0;
  recordEvent(
    db,
    userId,
    episode.id,
    "cut_away",
    {
    reason: "producer_cut",
    atMs,
    },
    now,
  );
  recordEvent(
    db,
    userId,
    episode.id,
    "camera_suggestion",
    {
    shot: "wide",
    reason: "closing",
    atMs,
    minimumHoldMs: 1_800,
    },
    now,
  );
  transitionEpisodeSegment(db, userId, episode, "closing", now);
  episode = getBotcastEpisode(db, userId, episode.id);
  const guestDeparted = episode.events.some(
    (event) => event.kind === "departure",
  );
  completeEpisode(
    db,
    userId,
    episode,
    guestDeparted ? "guest_departed" : "completed",
    now,
  );
  return getBotcastEpisode(db, userId, episode.id);
}

export async function advanceBotcastEpisode(
  db: DatabaseSync,
  userId: string,
  episodeId: string,
  input: BotcastEpisodeAdvanceRequest,
  generation: BotcastGenerationOptions,
): Promise<BotcastEpisodeAdvanceResponse> {
  let episode = getBotcastEpisode(db, userId, episodeId);
  if (episode.status === "completed") {
    await ensureBotcastEpisodePersonaReview(db, userId, episode.id, generation);
    return {
      episode: getBotcastEpisode(db, userId, episode.id),
      message: null,
    };
  }
  let requestedCue = input.cue
    ? normalizeBotcastProducerCue(input.cue)
    : undefined;
  const cueDelivery = input.cueDelivery ?? "next_host_turn";
  if (input.cueDelivery && !requestedCue) {
    throw new Error("Signal cue delivery requires a producer cue.");
  }
  // A queued producer cue can race the guest's departure response. Once the
  // episode is closing, discard that stale direction and continue the saved
  // closing beat instead of stranding the live show on an error banner.
  if (requestedCue && episode.segment === "closing") {
    requestedCue = undefined;
  }
  if (requestedCue) {
    const guestAlreadyDeparted = episode.events.some(
      (event) => event.kind === "departure",
    );
    const nextRole = botcastNextSpeakerRole({
      messages: episode.messages,
      segment: episode.segment,
      guestDeparted: guestAlreadyDeparted,
    });
    if (cueDelivery === "next_host_turn" && nextRole !== "host") {
      throw new Error("Producer cues wait for the host's next turn.");
    }
    const guestHasTheMic =
      nextRole === "guest" ||
      (nextRole === "host" && episode.messages.at(-1)?.speakerRole === "guest");
    if (cueDelivery === "interrupt_guest" && !guestHasTheMic) {
      throw new Error("The guest must be speaking or next before the host can interrupt.");
    }
  }
  const now = new Date().toISOString();
  let tension = currentTension(episode);
  if (requestedCue) {
    tension = persistProducerCue(
      db,
      userId,
      episode,
      requestedCue,
      cueDelivery,
      now,
    );
    episode = getBotcastEpisode(db, userId, episodeId);
  }
  const wrapUpCue = activeBotcastWrapUpCue(episode);
  const guestAlreadyDeparted = episode.events.some(
    (event) => event.kind === "departure",
  );
  // A third pressure cue is resolved by the guest before the ordinary turn-count
  // closing can begin. Otherwise a cue landing exactly at the closing threshold
  // could complete the episode without giving the guest their earned exit turn.
  const departurePending =
    !guestAlreadyDeparted && botcastGuestDepartureEligible(tension);
  const sessionShouldClose =
    episode.segment === "interview" &&
    botcastSessionShouldClose({
      messages: episode.messages,
      durationMinutes: episode.durationMinutes,
      startedAtMs: Date.parse(episode.startedAt),
      nowMs: Date.parse(now),
      modelWarmupHoldDurationMs: episode.modelWarmupHoldDurationMs,
      modelWarmupHoldStartedAtMs: episode.modelWarmupHoldStartedAt
        ? Date.parse(episode.modelWarmupHoldStartedAt)
        : null,
    });
  const nextSegment = departurePending
    ? episode.segment
    : wrapUpCue && wrapUpCue.utterancesSinceCue >= 2
      ? "closing"
      : wrapUpCue
        ? episode.segment
        : sessionShouldClose
      ? "closing"
      : botcastSegmentForTurn({
        current: episode.segment,
        utteranceCount: episode.messages.length,
        guestDeparted: guestAlreadyDeparted,
        });
  if (nextSegment !== episode.segment) {
    transitionEpisodeSegment(db, userId, episode, nextSegment, now);
    episode = getBotcastEpisode(db, userId, episodeId);
  }
  const scheduledSpeakerRole = botcastNextSpeakerRole({
    messages: episode.messages,
    segment: episode.segment,
    guestDeparted: guestAlreadyDeparted,
  });
  const speakerRole =
    requestedCue && cueDelivery === "interrupt_guest"
      ? "host"
      : scheduledSpeakerRole;
  if (!speakerRole) {
    completeEpisode(
      db,
      userId,
      episode,
      guestAlreadyDeparted ? "guest_departed" : "completed",
      now,
    );
    await ensureBotcastEpisodePersonaReview(db, userId, episodeId, generation);
    return { episode: getBotcastEpisode(db, userId, episodeId), message: null };
  }
  const show = getBotcastShow(db, userId, episode.showId);
  const currentHost = loadBotProfile(db, userId, episode.hostBotId);
  const currentGuest = loadBotProfile(db, userId, episode.guestBotId);
  const powerSnapshot = botcastEpisodePowerSnapshot(episode);
  const host = powerSnapshot
    ? { ...currentHost, powers: powerSnapshot.hostPowers }
    : currentHost;
  const guest = powerSnapshot
    ? { ...currentGuest, powers: powerSnapshot.guestPowers }
    : currentGuest;
  const speaker = speakerRole === "host" ? host : guest;
  const peer = speakerRole === "host" ? guest : host;
  const speakerIsMuted = botPowerIsMutedV1(speaker.powers);
  const speakerEchoesAddressedSpeech = botPowerEchoesAddressedSpeechV1(
    speaker.powers,
  );
  const latestOnAirMessage = episode.messages.at(-1) ?? null;
  const addressedSpeechForEcho =
    latestOnAirMessage && latestOnAirMessage.speakerRole !== speakerRole
      ? latestOnAirMessage.content
      : null;
  const departureRequired =
    speakerRole === "guest" && botcastGuestDepartureEligible(tension);
  const hearingRepeatDirective = botcastHearingRepeatDirective({
    episode,
    speakerRole,
    speaker,
    requester: peer,
    ...(requestedCue ? { requestedCue } : {}),
    wrapUpCueActive: Boolean(wrapUpCue),
    departureRequired,
    segmentClosing: episode.segment === "closing",
  });
  const speakerRepeatsForHearingPower = Boolean(
    hearingRepeatDirective && !speakerIsMuted,
  );
  const immersiveVoiceEffectRequired =
    botcastImmersiveVoiceEffectRequired(episode);
  const turnNegativeInfluence = botcastNegativeInfluenceForTurn(
    episode,
    speaker,
  );
  const prompt = buildBotcastSpeakerPrompt({
    show,
    episode,
    host,
    guest,
    speakerRole,
    ...(wrapUpCue?.cue
      ? { cue: wrapUpCue.cue }
      : requestedCue
        ? { cue: requestedCue }
        : {}),
    departureRequired,
  });
  const selected = generationProvider(
    generation,
    episode.provider,
    episode.model,
  );
  const generationOptions = {
    temperature: Math.min(1.15, Math.max(0.2, speaker.temperature)),
    reasoningEffort: "minimal" as const,
    ...(speaker.topP != null ? { topP: speaker.topP } : {}),
    ...(speaker.topK != null ? { topK: speaker.topK } : {}),
    ...(speaker.repetitionPenalty != null
      ? { repetitionPenalty: speaker.repetitionPenalty }
      : {}),
    usagePurpose: "botcast_turn" as const,
  };
  let providerUsed = selected.providerName;
  let modelUsed =
    selected.model ?? defaultModelIdForProvider(selected.providerName);
  let autoRecovery: Awaited<
    ReturnType<typeof runAutoFallbackChain>
  >["recovery"];
  let raw: string;
  if (hearingRepeatDirective) {
    raw = hearingRepeatDirective.repeatedContent;
  } else if (episode.responseMode === "auto") {
    const resolvedChain = autoFallbackResolvedChain(
      { provider: episode.provider, model: modelUsed },
      generation.autoFallbackChain,
    );
    if (!resolvedChain) {
      throw new Error(
        "Signal AUTO needs one primary model and one to five distinct fallbacks in Settings.",
      );
    }
    const providerFactory = generation.providerFactory ?? selectProvider;
    const result = await runAutoFallbackChain({
      attempts: resolvedChain.map((attempt, index) => ({
        ...attempt,
        available:
          index === 0 ||
          generation.providerFactory !== undefined ||
          attempt.provider === "local" ||
          (attempt.provider === "openai"
            ? Boolean(generation.openAiApiKey)
            : Boolean(generation.anthropicApiKey)),
        run: (signal) => {
          const provider =
            index === 0
              ? selected.provider
              : providerFactory(
                  attempt.provider,
                  generation.openAiApiKey,
                  generation.secondaryOllamaHost,
                  generation.anthropicApiKey,
                );
          return provider.generateResponse(prompt, {
            ...generationOptions,
            model: attempt.model,
            maxTokens: botcastSpeakerMaxTokensForModel(
              speaker.maxTokens,
              attempt.provider,
              attempt.model,
            ),
            usagePurpose: index === 0 ? "botcast_turn" : "chat_fallback",
            signal,
          });
        },
      })),
      perAttemptTimeoutMs: 60_000,
      totalTimeoutMs: resolvedChain.length * 60_000,
    });
    raw = result.value;
    providerUsed = result.provider;
    modelUsed = result.model;
    autoRecovery = result.recovery;
  } else {
    try {
      raw = await selected.provider.generateResponse(prompt, {
        ...generationOptions,
        ...(selected.model ? { model: selected.model } : {}),
        maxTokens: botcastSpeakerMaxTokensForModel(
          speaker.maxTokens,
          selected.providerName,
          modelUsed,
        ),
      });
    } catch (error) {
      if (!botcastProviderReturnedEmptyResponse(error, selected.providerName)) {
        throw error;
      }
      console.warn(
        `[botcast] speaker returned empty ${selected.providerName} response; using safe fallback episode=${episode.id} speaker=${speaker.id}`,
      );
      raw = "";
    }
  }
  const latestEpisode = getBotcastEpisode(db, userId, episode.id);
  if (latestEpisode.status === "completed") {
    return { episode: latestEpisode, message: null };
  }
  const firstHostOpening =
    speakerRole === "host" &&
    episode.segment === "opening" &&
    episode.messages.length === 0;
  const openingSubject =
    episode.topic.replace(/[.!?]+$/u, "").trim() || episode.topic;
  const topicWithPunctuation = /[.!?]$/u.test(episode.topic.trim())
    ? episode.topic.trim()
    : `${episode.topic.trim()}.`;
  const hostCallsAfterDepartingGuest =
    speakerRole === "host" &&
    guestAlreadyDeparted &&
    botcastHostCallsAfterDepartingGuest(episode.id);
  const fallback =
    speakerRole === "host"
      ? firstHostOpening
        ? episode.guestPresenceMode === "audience_only"
          ? `Welcome to ${show.name}. I'm ${host.name}, and ${guest.name} was meant to join me to explore ${openingSubject}. The guest chair is empty, though, so something has clearly gone wrong.`
          : `Welcome to ${show.name}. I'm ${host.name}, and today I'm joined by ${guest.name} to explore ${openingSubject}. ${guest.name}, where should we begin?`
        : episode.guestPresenceMode === "audience_only"
        ? episode.segment === "closing" || wrapUpCue
          ? `We will close on the central question: ${topicWithPunctuation} The strongest answer is the one that survives consequence, contradiction, and scrutiny.`
          : `Let us stay with the central question: ${topicWithPunctuation} The useful test is which concrete choice, cost, or contradiction would change the answer.`
        : episode.segment === "closing"
        ? guestAlreadyDeparted
          ? hostCallsAfterDepartingGuest
            ? `Wait—where are you going, ${guest.name}? We will leave it there; thank you for listening.`
            : `${guest.name} has left the studio. That is where we will leave it; thank you for listening.`
          : `That is where we will leave it. ${guest.name}, thank you for joining me.`
        : wrapUpCue
          ? `${guest.name}, before we close, what final thought would you leave with our listeners?`
          : `${guest.name}, what is the part of ${episode.topic} that people most often misunderstand?`
      : departureRequired
        ? "I warned you. We are done here."
        : episode.guestPresenceMode === "audience_only"
          ? "They still have no idea I am here. This is already more entertaining than the interview would have been."
        : wrapUpCue
          ? "The final point I would leave with your listeners is that the premise deserves more scrutiny than certainty."
          : "I do not accept the premise as stated, but I will answer the part that matters.";
  const generatedContent = sanitizeUtterance(
    raw,
    fallback,
    speaker.name,
    speakerRole === "host" ? guest.name : host.name,
    speakerRole,
  );
  const performance = extractBotcastVoicePerformance(
    generatedContent,
    immersiveVoiceEffectRequired,
  );
  const cleanGeneratedContent = performance.content || fallback;
  const introductionSafeContent =
    firstHostOpening &&
    !botcastOpeningIntroducesCast({
      content: cleanGeneratedContent,
      showName: show.name,
      hostName: host.name,
      guestName: guest.name,
    })
      ? fallback
      : cleanGeneratedContent;
  const content = speakerIsMuted
    ? applyBotPowerMuteResponseV1(generatedContent)
    : speakerRepeatsForHearingPower
      ? hearingRepeatDirective!.repeatedContent
    : speakerEchoesAddressedSpeech
      ? applyBotPowerEchoResponseV1(addressedSpeechForEcho)
    : speakerRole === "host" &&
    episode.guestPresenceMode === "audience_only" &&
    botcastAudienceOnlyHostRepeatsAbsence({
      episode,
      content: introductionSafeContent,
    })
      ? fallback
      : speakerRole === "host" &&
    episode.segment === "closing" &&
    (/\?\s*$/u.test(introductionSafeContent) ||
      /\b(?:one|a)\s+(?:last|final|more)\s+question\b|\blet me ask\b/iu.test(
        introductionSafeContent,
      ))
      ? fallback
      : introductionSafeContent;
  const voicePerformanceText =
    !speakerIsMuted &&
    !speakerRepeatsForHearingPower &&
    !speakerEchoesAddressedSpeech &&
    content === cleanGeneratedContent
      ? (performance.voicePerformanceText ??
      (immersiveVoiceEffectRequired
        ? `${speakerRole === "host" ? "[breathes deeply]" : "[exhales]"} ${content}`
          : null))
    : null;
  const messageId = randomId(12);
  const tensionMoodKey = botcastVoiceMoodForTension(tension);
  const messageMoodKey = speakerRepeatsForHearingPower
    ? lowerVoiceMoodForHearingRepeat(hearingRepeatDirective!.sourceMood)
    : turnNegativeInfluence &&
        turnNegativeInfluence.strength !== "small" &&
        tensionMoodKey === "neutral"
      ? "guarded"
      : tensionMoodKey;
  db.prepare(
    `INSERT INTO botcast_messages
      (id, user_id, episode_id, speaker_role, bot_id, content, voice_performance_text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    messageId,
    userId,
    episode.id,
    speakerRole,
    speaker.id,
    content,
    voicePerformanceText,
    now,
  );
  recordEvent(
    db,
    userId,
    episode.id,
    "utterance",
    {
    messageId,
    speakerRole,
    botId: speaker.id,
    segment: episode.segment,
    provider: providerUsed,
    model: modelUsed,
    responseMode: episode.responseMode,
    immersiveVoiceEffect: voicePerformanceText !== null,
    moodKey: messageMoodKey,
    ...(speakerRepeatsForHearingPower
      ? {
          powerOutcome: {
            effect: "hearing_repeat",
            requesterBotId: hearingRepeatDirective!.requesterBotId,
            requestMessageId: hearingRepeatDirective!.requestMessageId,
            sourceMessageId: hearingRepeatDirective!.sourceMessageId,
            moodPenalty: hearingRepeatDirective!.moodPenalty,
          },
        }
      : {}),
    ...(autoRecovery ? { autoRecovery } : {}),
    },
    now,
  );
  const listenerRole = speakerRole === "host" ? "guest" : "host";
  const listener = listenerRole === "host" ? host : guest;
  const listenerReaction = !(
    (listenerRole === "guest" && guestAlreadyDeparted) ||
    (episode.guestPresenceMode === "audience_only" && listenerRole === "host")
  )
    ? buildSignalListenerReactionPlanV1({
        episodeId: episode.id,
        messageId,
        speakerBotId: speaker.id,
        listenerBotId: listener.id,
        listenerRole,
        segment: episode.segment,
        mood: messageMoodKey,
        tensionLevel: tension.level,
      })
    : null;
  if (listenerReaction) {
    recordEvent(
      db,
      userId,
      episode.id,
      "listener_reaction",
      { plan: listenerReaction },
      now,
    );
  }

  if (wrapUpCue && speakerRole === "guest") {
    const beforeClosing = getBotcastEpisode(db, userId, episode.id);
    transitionEpisodeSegment(db, userId, beforeClosing, "closing", now);
  }

  if (departureRequired) {
    db.prepare(
      `UPDATE botcast_episodes
          SET tension_level = 3, outcome = 'guest_departed', updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(now, episode.id, userId);
    const beforeClosing = getBotcastEpisode(db, userId, episode.id);
    transitionEpisodeSegment(db, userId, beforeClosing, "closing", now);
    recordEvent(
      db,
      userId,
      episode.id,
      "departure",
      {
      botId: guest.id,
      cause: requestedCue?.kind ?? "continued_boundary_pressure",
      emptyChair: true,
      microphoneRemains: true,
      mugRemains: true,
      },
      now,
    );
  }

  episode = getBotcastEpisode(db, userId, episode.id);
  const previousCamera = lastCameraSuggestion(episode.events);
  const wordCount = content.split(/\s+/u).filter(Boolean).length;
  const utteranceDurationMs = Math.max(1_400, wordCount * 310);
  const firstOpeningHost =
    episode.messages.length === 1 &&
    episode.segment === "opening" &&
    speakerRole === "host";
  const messageStartMs =
    botcastReplayTimeline(episode.messages, episode.events).messageStartMs.at(
      -1,
    ) ?? 0;
  const afterSpeechPowerEffects =
    listenerRole === "guest" && guestAlreadyDeparted
      ? []
      : botcastSocialInfluenceEventsForPair({
          source: speaker,
          target: listener,
          sourceRole: speakerRole,
          targetRole: listenerRole,
          trigger: "after_speech",
          atMs: messageStartMs + utteranceDurationMs,
          sourceMessageId: messageId,
        });
  for (const influence of afterSpeechPowerEffects) {
    recordEvent(
      db,
      userId,
      episode.id,
      "power_effect",
      { ...influence },
      now,
    );
  }
  const atMs = firstOpeningHost ? 1_400 : messageStartMs;
  const cameraEvent =
    episode.segment === "interview" && episode.messages.length % 4 === 0
      ? "transition"
      : "utterance";
  const suggestion = botcastDirectorSuggestion({
    previous: firstOpeningHost ? null : previousCamera,
    atMs,
    speakerRole,
    utteranceDurationMs,
    segment: episode.segment,
    event: cameraEvent,
  });
  recordEvent(
    db,
    userId,
    episode.id,
    "camera_suggestion",
    { ...suggestion },
    now,
  );
  if (departureRequired) {
    const departureSuggestion = botcastDirectorSuggestion({
      previous: suggestion,
      atMs:
        messageStartMs +
        Math.max(BOTCAST_DIRECTOR_MIN_SHOT_MS, utteranceDurationMs),
      speakerRole,
      utteranceDurationMs,
      segment: episode.segment,
      event: "departure",
    });
    recordEvent(
      db,
      userId,
      episode.id,
      "camera_suggestion",
      { ...departureSuggestion },
      now,
    );
    recordEvent(
      db,
      userId,
      episode.id,
      "camera_suggestion",
      {
      shot: "wide",
      reason: "empty_chair",
      atMs: departureSuggestion.atMs + 900,
      minimumHoldMs: 3_200,
      },
      now,
    );
  }
  const message = mapMessage(
    {
    id: messageId,
    episode_id: episode.id,
    speaker_role: speakerRole,
    bot_id: speaker.id,
    content,
    voice_performance_text: voicePerformanceText,
    created_at: now,
    },
    messageMoodKey,
  );
  episode = getBotcastEpisode(db, userId, episode.id);
  if (speakerRole === "host" && episode.segment === "closing") {
    const guestDeparted = episode.events.some(
      (event) => event.kind === "departure",
    );
    completeEpisode(
      db,
      userId,
      episode,
      guestDeparted ? "guest_departed" : "completed",
      now,
    );
    await ensureBotcastEpisodePersonaReview(db, userId, episode.id, generation);
    episode = getBotcastEpisode(db, userId, episode.id);
  }
  return { episode, message };
}

import type { DatabaseSync } from "node:sqlite";
import type {
  BotcastAtmosphereState,
  BotcastCameraSuggestion,
  BotcastEpisode,
  BotcastEpisodeAdvanceRequest,
  BotcastEpisodeAdvanceResponse,
  BotcastEpisodeCreateRequest,
  BotcastEpisodeOutcome,
  BotcastEpisodeProvider,
  BotcastEpisodeResponseMode,
  BotcastEpisodeSegment,
  BotcastEpisodeSummary,
  BotcastFallbackStudioAccentVariant,
  BotcastMessage,
  BotcastProducerCue,
  BotcastReplayEvent,
  BotcastReplayEventKind,
  BotcastSegmentRecord,
  BotcastShow,
  BotcastShowCreateRequest,
  BotcastShowPatchRequest,
  BotcastLogoGlyph,
  BotcastLogoState,
  BotcastSpeakerRole,
  BotcastTensionState,
  AutoFallbackChainV1,
} from "@localai/shared";
import {
  BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS,
  applyBotcastProducerCueToTension,
  botcastFallbackStudioAccentVariantForSeed,
  botcastDirectorSuggestion,
  botcastGuestDepartureEligible,
  botcastNextSpeakerRole,
  botcastReplayTimeline,
  botcastSegmentForTurn,
  botcastTensionStageForLevel,
  isBotcastFallbackStudioAccentVariant,
  autoFallbackResolvedChain,
} from "@localai/shared";
import {
  defaultModelIdForProvider,
  selectProvider,
  type LlmProvider,
  type ProviderMessage,
  type ProviderName,
} from "./providers.ts";
import { runAutoFallbackChain } from "./auto-fallback.ts";
import { randomId } from "./security.ts";

const BOTCAST_SHOW_NAME_MAX = 80;
const BOTCAST_TEXT_MAX = 2_000;
const BOTCAST_TOPIC_MAX = 280;
const BOTCAST_STUDIO_IDENTITY_MAX = 2_400;

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
};

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
  status: "live" | "completed";
  segment: BotcastEpisodeSegment;
  outcome: BotcastEpisodeOutcome | null;
  tension_level: number;
  warning_count: number;
  started_at: string;
  completed_at: string | null;
  runtime_ms: number | null;
  created_at: string;
  updated_at: string;
};

type BotcastMessageRow = {
  id: string;
  episode_id: string;
  speaker_role: BotcastSpeakerRole;
  bot_id: string;
  content: string;
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
}

function cleanText(raw: unknown, fallback: string, max = BOTCAST_TEXT_MAX): string {
  if (typeof raw !== "string") return fallback;
  const cleaned = raw.replace(/\s+/gu, " ").trim();
  return cleaned ? cleaned.slice(0, max) : fallback;
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

export function synthesizeBotcastShowName(host: Pick<BotcastBotProfile, "id" | "name" | "systemPrompt">): string {
  const name = cleanText(host.name, "The Host", 48);
  const formats = [
    `The ${name} Frequency`,
    `Between Questions with ${name}`,
    `${name}: Off Script`,
    `The Curious Mind of ${name}`,
    `${name} in the Margins`,
  ];
  return formats[stableHash(`${host.id}:${host.systemPrompt}`) % formats.length]!;
}

const BOTCAST_SHOW_NAME_DIRECTIONS = [
  "Find a title that can stand on its own without the host's name: a surprising phrase, vivid metaphor, double meaning, or conceptual tension drawn from the host's worldview.",
  "Silently draft several candidates, reject generic patterns such as 'Inside [Name]', 'The [Name] Show', 'Conversations with [Name]', and 'The Curious Mind of [Name]', then return only the strongest.",
  "Keep the title memorable, natural to say aloud, and 1-5 words. Use the host's name only when indispensable to genuinely excellent wordplay.",
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
  const prompt = lighting === "day"
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

function logoForHost(
  host: BotcastBotProfile,
  showName: string,
  revision = 1,
): BotcastLogoState {
  const seed = `botcast:${host.id}:logo:${revision}`;
  return {
    seed,
    prompt: [
      `Square symbol-only podcast show logo for “${showName}”, hosted by ${host.name}.`,
      `Begin with a persona-specific visual idea drawn from the host's worldview, temperament, signature imagery, craft, setting, or era: ${host.systemPrompt.slice(0, 700)}`,
      "Make its podcast purpose immediately legible by integrating one fitting audio or broadcast archetype: a condenser microphone capsule or grille, waveform, headphones, speech bubble, ON AIR lamp, recording dial, mixer fader, tape reel, or sound rings.",
      "Fuse the persona idea and the audio artifact into one clever, inseparable symbol rather than placing two icons beside each other.",
      `Build a distinctive persona-led palette around ${normalizeAccentColor(host.color)} with only the complementary colors the concept needs.`,
      "Avoid multicolor light beams, radiating color wedges, and generic geometric optical motifs unless the host persona specifically requires them.",
      "Premium editorial identity, bold simple silhouette, generous negative space, no portrait, no full person, no mockup, no letters, no words, no readable text.",
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
  return {
    seed,
    prompt: `Square symbol-only podcast logo for “${row.name}”, combining a distinctive host-inspired motif with one microphone, waveform, broadcast dial, or sound-ring archetype as a single bold mark; use ${normalizeAccentColor(row.accent_color)} with a restrained complementary palette; no multicolor light beams, no radiating color wedges, no people, no letters, no words.`,
    imageUrl: null,
    imageId: null,
    revision: 1,
    status: "fallback",
    fallbackGlyph: fallbackGlyphFor(seed),
  };
}

function fallbackAtmosphere(lighting: BotcastStudioLighting): BotcastAtmosphereState {
  return {
    seed: `botcast:fallback:${lighting}`,
    prompt: lighting === "day"
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
  if (!parsed || typeof parsed.seed !== "string" || typeof parsed.prompt !== "string") {
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
  dayAtmosphere: BotcastAtmosphereState;
  nightAtmosphere: BotcastAtmosphereState;
} {
  try {
    const container = JSON.parse(raw) as Partial<BotcastAtmosphereState> & {
      studioIdentity?: unknown;
      dayAtmosphere?: Partial<BotcastAtmosphereState>;
      nightAtmosphere?: Partial<BotcastAtmosphereState>;
    };
    const legacy = normalizeAtmosphere(container, fallbackAtmosphere("night"));
    return {
      studioIdentity:
        typeof container.studioIdentity === "string"
          ? cleanText(container.studioIdentity, "", BOTCAST_STUDIO_IDENTITY_MAX)
          : "",
      // Existing single-studio shows remain visible in both themes until the
      // owner refreshes them into a purpose-built matched pair.
      dayAtmosphere: normalizeAtmosphere(container.dayAtmosphere, legacy),
      nightAtmosphere: normalizeAtmosphere(container.nightAtmosphere, legacy),
    };
  } catch {
    return {
      studioIdentity: "",
      dayAtmosphere: fallbackAtmosphere("day"),
      nightAtmosphere: fallbackAtmosphere("night"),
    };
  }
}

function parseLogo(raw: string, row: BotcastShowRow): BotcastLogoState {
  const fallback = logoFallbackForRow(row);
  try {
    const container = JSON.parse(raw) as { logo?: Partial<BotcastLogoState> };
    const parsed = container.logo;
    if (!parsed || typeof parsed.seed !== "string" || typeof parsed.prompt !== "string") {
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
      fallbackGlyph: BOTCAST_LOGO_GLYPHS.includes(parsed.fallbackGlyph as BotcastLogoGlyph)
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
): string {
  // Preserve the original root atmosphere shape for older clients and backup
  // readers while storing explicit variants for current Signal builds.
  return JSON.stringify({
    ...nightAtmosphere,
    studioIdentity,
    dayAtmosphere,
    nightAtmosphere,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    episodeCount: Number(row.episode_count ?? 0),
  };
}

function mapMessage(row: BotcastMessageRow): BotcastMessage {
  return {
    id: row.id,
    episodeId: row.episode_id,
    speakerRole: row.speaker_role,
    botId: row.bot_id,
    content: row.content,
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
    status: row.status,
    segment: row.segment,
    outcome: row.outcome,
    tensionStage: botcastTensionStageForLevel(row.tension_level),
    warningCount: row.warning_count,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    runtimeMs: row.runtime_ms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function loadBotProfile(db: DatabaseSync, userId: string, botId: string): BotcastBotProfile {
  const row = db.prepare(
    `SELECT id, name, system_prompt, color, temperature, max_tokens, top_p,
            top_k, repetition_penalty
       FROM bots WHERE id = ? AND user_id = ? AND chat_enabled = 1`,
  ).get(botId, userId) as
    | {
        id: string;
        name: string;
        system_prompt: string;
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
    color: row.color,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    topP: row.top_p,
    topK: row.top_k,
    repetitionPenalty: row.repetition_penalty,
  };
}

export function listBotcastShows(db: DatabaseSync, userId: string): BotcastShow[] {
  const rows = db.prepare(
    `SELECT s.*,
            (SELECT COUNT(*) FROM botcast_episodes e
              WHERE e.user_id = s.user_id AND e.show_id = s.id) AS episode_count
       FROM botcast_shows s
      WHERE s.user_id = ?
      ORDER BY s.updated_at DESC`,
  ).all(userId) as unknown as BotcastShowRow[];
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
  const existing = db.prepare(
    "SELECT id FROM botcast_shows WHERE user_id = ? AND host_bot_id = ?",
  ).get(userId, host.id) as { id: string } | undefined;
  if (existing) return getBotcastShow(db, userId, existing.id);
  const previousShow = db.prepare(
    `SELECT fallback_studio_accent_variant
       FROM botcast_shows
      WHERE user_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1`,
  ).get(userId) as { fallback_studio_accent_variant: number } | undefined;
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
  const logo = logoForHost(host, name);
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
    serializeShowVisuals(dayAtmosphere, nightAtmosphere, logo, studioIdentity),
    now,
    now,
  );
  return getBotcastShow(db, userId, id);
}

export function getBotcastShow(db: DatabaseSync, userId: string, showId: string): BotcastShow {
  const row = db.prepare(
    `SELECT s.*,
            (SELECT COUNT(*) FROM botcast_episodes e
              WHERE e.user_id = s.user_id AND e.show_id = s.id) AS episode_count
       FROM botcast_shows s WHERE s.id = ? AND s.user_id = ?`,
  ).get(showId, userId) as BotcastShowRow | undefined;
  if (!row) throw new Error("Signal show not found.");
  return mapShow(row);
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
  const studioIdentity = cleanText(
    patch.studioIdentity,
    current.studioIdentity || defaultStudioIdentity(host),
    BOTCAST_STUDIO_IDENTITY_MAX,
  );
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
  const nightImageUrl = patch.nightAtmosphereImageUrl !== undefined
    ? patch.nightAtmosphereImageUrl
    : patch.atmosphereImageUrl;
  const nightImageId = patch.nightAtmosphereImageId !== undefined
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
      ...logoForHost(
        host,
        cleanText(patch.name, current.name, BOTCAST_SHOW_NAME_MAX),
        current.logo.revision + 1,
      ),
      imageUrl: current.logo.imageUrl,
      imageId: current.logo.imageId,
      status: current.logo.status,
    };
  } else if (patch.logoImageUrl !== undefined || patch.logoImageId !== undefined) {
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
    serializeShowVisuals(dayAtmosphere, nightAtmosphere, logo, studioIdentity),
    now,
    showId,
    userId,
  );
  return getBotcastShow(db, userId, showId);
}

function parseGeneratedShowIdentity(raw: string): {
  name: string;
  premise: string;
  studioIdentity?: string;
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
    return name && premise
      ? { name, premise, ...(studioIdentity ? { studioIdentity } : {}) }
      : null;
  } catch {
    return null;
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
            "Return one JSON object with exactly three strings: name, premise, and studioIdentity.",
            ...BOTCAST_SHOW_NAME_DIRECTIONS,
            "The premise must be one crisp sentence describing the conversational promise. Do not use markdown.",
            "studioIdentity is a compact persona-first set bible, not a mood board: define distinctive architecture or landscape, materials, spatial motifs, and at least six concrete artifacts whose subjects and arrangement reveal this host.",
            "The room should be recognizable as the host's world without their name, portrait, logo, or readable text. Generic books, plants, luxury chairs, acoustic panels, and podcast gear do not count as identity details unless made meaningfully specific.",
            "Do not specify lighting or time of day in studioIdentity; the same physical set will be rendered in both daylight and nighttime variants.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Host: ${host.name}\nHost persona:\n${host.systemPrompt.slice(0, 2_400)}`,
        },
      ],
      {
        ...(selected.model ? { model: selected.model } : {}),
        temperature: 0.82,
        maxTokens: 520,
        jsonMode: true,
        usagePurpose: "botcast_brand",
      },
    );
    const identity = parseGeneratedShowIdentity(raw);
    if (!identity) return { show: current, generated: false };
    return {
      show: updateBotcastShow(db, userId, showId, {
        ...identity,
        regenerateAtmosphere: true,
        regenerateLogo: true,
      }),
      generated: true,
    };
  } catch {
    return { show: current, generated: false };
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
    const raw = await selected.provider.generateResponse(
      [
        {
          role: "system",
          content: [
            "You are renaming a premium podcast show around its host's singular voice.",
            "Return one JSON object with exactly one string: name.",
            ...BOTCAST_SHOW_NAME_DIRECTIONS,
            "Return a genuinely different title from the current one. Do not use markdown.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Host: ${host.name}\nCurrent show name: ${current.name}\nHost persona:\n${host.systemPrompt.slice(0, 2_400)}`,
        },
      ],
      {
        ...(selected.model ? { model: selected.model } : {}),
        temperature: 0.9,
        maxTokens: 120,
        jsonMode: true,
        usagePurpose: "botcast_brand",
      },
    );
    const name = parseGeneratedShowName(raw);
    if (!name || name === current.name) return { show: current, generated: false };
    return {
      show: updateBotcastShow(db, userId, showId, { name }),
      generated: true,
    };
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
    ? db.prepare(
        `SELECT e.*, s.name AS show_name FROM botcast_episodes e
          JOIN botcast_shows s ON s.id = e.show_id AND s.user_id = e.user_id
         WHERE e.user_id = ? AND e.show_id = ? ORDER BY e.created_at DESC`,
      ).all(userId, showId)
    : db.prepare(
        `SELECT e.*, s.name AS show_name FROM botcast_episodes e
          JOIN botcast_shows s ON s.id = e.show_id AND s.user_id = e.user_id
         WHERE e.user_id = ? ORDER BY e.created_at DESC`,
      ).all(userId)) as unknown as BotcastEpisodeRow[];
  return rows.map(mapEpisodeSummary);
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

function loadEpisodeRow(db: DatabaseSync, userId: string, episodeId: string): BotcastEpisodeRow {
  const row = db.prepare(
    `SELECT e.*, s.name AS show_name FROM botcast_episodes e
      JOIN botcast_shows s ON s.id = e.show_id AND s.user_id = e.user_id
     WHERE e.id = ? AND e.user_id = ?`,
  ).get(episodeId, userId) as BotcastEpisodeRow | undefined;
  if (!row) throw new Error("Signal episode not found.");
  return row;
}

export function getBotcastEpisode(db: DatabaseSync, userId: string, episodeId: string): BotcastEpisode {
  const row = loadEpisodeRow(db, userId, episodeId);
  const messages = db.prepare(
    "SELECT * FROM botcast_messages WHERE user_id = ? AND episode_id = ? ORDER BY created_at, rowid",
  ).all(userId, episodeId) as unknown as BotcastMessageRow[];
  const segments = db.prepare(
    "SELECT * FROM botcast_episode_segments WHERE user_id = ? AND episode_id = ? ORDER BY ordinal",
  ).all(userId, episodeId) as unknown as BotcastSegmentRow[];
  const events = db.prepare(
    "SELECT * FROM botcast_events WHERE user_id = ? AND episode_id = ? ORDER BY sequence",
  ).all(userId, episodeId) as unknown as BotcastEventRow[];
  return {
    ...mapEpisodeSummary(row),
    producerBrief: row.producer_brief,
    messages: messages.map(mapMessage),
    segments: segments.map(mapSegment),
    events: events.map(mapEvent),
  };
}

function recordEvent(
  db: DatabaseSync,
  userId: string,
  episodeId: string,
  kind: BotcastReplayEventKind,
  payload: Record<string, unknown>,
  occurredAt = new Date().toISOString(),
): BotcastReplayEvent {
  const sequenceRow = db.prepare(
    "SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM botcast_events WHERE user_id = ? AND episode_id = ?",
  ).get(userId, episodeId) as { next: number };
  const id = randomId(12);
  db.prepare(
    `INSERT INTO botcast_events
      (id, user_id, episode_id, sequence, kind, payload_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, episodeId, sequenceRow.next, kind, JSON.stringify(payload), occurredAt);
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
  const guest = loadBotProfile(db, userId, cleanText(input.guestBotId, "", 128));
  if (host.id === guest.id) throw new Error("Choose a different bot as the guest.");
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
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO botcast_episodes
        (id, user_id, show_id, host_bot_id, guest_bot_id, title, topic,
         producer_brief, provider, model, response_mode, status, segment,
         started_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live', 'opening', ?, ?, ?)`,
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
      now,
      now,
      now,
    );
    db.prepare(
      `INSERT INTO botcast_episode_segments
        (id, user_id, episode_id, segment, ordinal, started_at)
       VALUES (?, ?, ?, 'opening', 0, ?)`,
    ).run(randomId(12), userId, id, now);
    recordEvent(db, userId, id, "segment", { segment: "opening", ordinal: 0 }, now);
    recordEvent(db, userId, id, "camera_suggestion", {
      shot: "wide",
      reason: "opening",
      atMs: 0,
      minimumHoldMs: 3_200,
    }, now);
    db.prepare("UPDATE botcast_shows SET updated_at = ? WHERE id = ? AND user_id = ?")
      .run(now, show.id, userId);
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
  recordEvent(db, userId, episode.id, "segment", { segment: next, ordinal }, now);
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
  return { level, warningCount: episode.warningCount, stage: episode.tensionStage };
}

function persistProducerCue(
  db: DatabaseSync,
  userId: string,
  episode: BotcastEpisode,
  cue: BotcastProducerCue,
  now: string,
): BotcastTensionState {
  const normalizedCue: BotcastProducerCue = {
    kind: cue.kind,
    ...(cue.detail ? { detail: cleanText(cue.detail, "", 280) } : {}),
  };
  recordEvent(db, userId, episode.id, "producer_cue", { ...normalizedCue }, now);
  const before = currentTension(episode);
  const after = applyBotcastProducerCueToTension(before, normalizedCue);
  if (after.level !== before.level || after.warningCount !== before.warningCount) {
    db.prepare(
      `UPDATE botcast_episodes
          SET tension_level = ?, warning_count = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(after.level, after.warningCount, now, episode.id, userId);
    recordEvent(db, userId, episode.id, "tension", {
      from: before.stage,
      to: after.stage,
      cue: normalizedCue.kind,
    }, now);
    if (after.warningCount > before.warningCount) {
      recordEvent(db, userId, episode.id, "warning", {
        warningCount: after.warningCount,
        cause: normalizedCue.kind,
      }, now);
    }
  }
  return after;
}

export interface BotcastPromptBuildArgs {
  show: BotcastShow;
  episode: Pick<BotcastEpisode, "topic" | "producerBrief" | "segment" | "messages" | "tensionStage">;
  host: Pick<BotcastBotProfile, "name" | "systemPrompt">;
  guest: Pick<BotcastBotProfile, "name" | "systemPrompt">;
  speakerRole: BotcastSpeakerRole;
  cue?: BotcastProducerCue;
  departureRequired?: boolean;
}

/**
 * Builds a prompt from persistent show configuration plus the current episode only.
 * Deliberately accepts no archive, relationship, memory, synopsis, or prior-episode input.
 */
export function buildBotcastSpeakerPrompt(args: BotcastPromptBuildArgs): ProviderMessage[] {
  const speaker = args.speakerRole === "host" ? args.host : args.guest;
  const transcript = args.episode.messages
    .map((message) =>
      `${message.speakerRole === "host" ? args.host.name : args.guest.name}: ${message.content}`,
    )
    .join("\n");
  const roleRules =
    args.speakerRole === "host"
      ? [
          "You are the host. Introduce, question, listen, follow up, transition, and close with editorial control.",
          "Private producer direction is silent control-room guidance. Incorporate it naturally; never quote it, mention a producer, or address the user.",
          args.episode.segment === "opening"
            ? `Open the show, welcome ${args.guest.name}, and frame the subject.`
            : args.episode.segment === "closing"
              ? args.episode.tensionStage === "departed"
                ? "The guest has walked out. React in character, briefly reflect without grandstanding, and close the episode."
                : "Close with one earned final thought and thank the guest."
              : "Ask one specific question or concise follow-up. Avoid stacked questions and generic praise.",
        ]
      : [
          "You are the guest. Answer from your persona, with your own confidence, evasiveness, boundaries, and willingness to disagree.",
          args.departureRequired
            ? "Your explicit warning was ignored. Leave now with one in-character final line. Do not ask permission and do not continue the interview."
            : args.episode.tensionStage === "warning"
              ? "Push back explicitly and warn the host that you will leave if this line of questioning continues."
              : args.episode.tensionStage === "resistance"
                ? "Show discomfort, resistance, or deflection without leaving yet."
                : "Answer with substance. You may challenge the premise instead of agreeing automatically.",
        ];
  return [
    {
      role: "system",
      content: [
        `You are ${speaker.name} in a fictional, non-canonical Signal episode.`,
        "This is an anthology. Treat the host and guest as meeting for the first time. Never mention prior appearances, episode numbers, archives, memories, relationship history, or earlier Signal events.",
        "Return only the next spoken line. No speaker label, no analysis, no camera directions, and no markdown.",
        `Persona:\n${speaker.systemPrompt}`,
        ...roleRules,
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
          ? `Private live producer cue: ${args.cue.kind}${args.cue.detail ? ` — ${args.cue.detail}` : ""}`
          : "Private live producer cue: none",
        transcript ? `Current episode transcript only:\n${transcript}` : "Current episode transcript: empty",
        `Continue as ${speaker.name}.`,
      ].join("\n\n"),
    },
  ];
}

function sanitizeUtterance(raw: string, fallback: string, speakerName: string): string {
  const escapedSpeakerName = speakerName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const labelPattern = new RegExp(
    `^\\s*[\"“]?\\s*(?:host|guest|assistant|speaker|${escapedSpeakerName})\\s*:\\s*`,
    "iu",
  );
  const withoutLabel = raw.replace(labelPattern, "");
  const cleaned = withoutLabel
    .replace(withoutLabel === raw ? /$^/u : /["”]\s*$/u, "")
    .replace(/\b(?:the )?producer (?:asked|said|wants|told me|is telling me)[^.!?]*[.!?]?/giu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 2_400);
  return cleaned || fallback;
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
      ? modelOverride ?? undefined
      : (providerName === "local"
          ? options.preferredLocalModel
          : options.preferredOnlineModel) ?? undefined;
  return { provider, providerName, ...(model ? { model } : {}) };
}

function lastCameraSuggestion(events: readonly BotcastReplayEvent[]): BotcastCameraSuggestion | null {
  const event = [...events].reverse().find((candidate) => candidate.kind === "camera_suggestion");
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
  const runtimeMs = botcastReplayTimeline(episode.messages, episode.events).durationMs;
  db.prepare(
    `UPDATE botcast_episodes
        SET status = 'completed', outcome = ?, completed_at = ?, runtime_ms = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(outcome, now, runtimeMs, now, episode.id, userId);
  db.prepare(
    `UPDATE botcast_episode_segments SET ended_at = ?
      WHERE user_id = ? AND episode_id = ? AND ended_at IS NULL`,
  ).run(now, userId, episode.id);
  recordEvent(db, userId, episode.id, "episode_completed", { outcome, runtimeMs }, now);
}

export async function advanceBotcastEpisode(
  db: DatabaseSync,
  userId: string,
  episodeId: string,
  input: BotcastEpisodeAdvanceRequest,
  generation: BotcastGenerationOptions,
): Promise<BotcastEpisodeAdvanceResponse> {
  let episode = getBotcastEpisode(db, userId, episodeId);
  if (episode.status === "completed") return { episode, message: null };
  if (input.cue) {
    const guestAlreadyDeparted = episode.events.some(
      (event) => event.kind === "departure",
    );
    const nextRole = botcastNextSpeakerRole({
      messages: episode.messages,
      segment: episode.segment,
      guestDeparted: guestAlreadyDeparted,
    });
    if (nextRole !== "host") {
      throw new Error("Producer cues wait for the host's next turn.");
    }
  }
  const now = new Date().toISOString();
  let tension = currentTension(episode);
  if (input.cue) {
    tension = persistProducerCue(db, userId, episode, input.cue, now);
    episode = getBotcastEpisode(db, userId, episodeId);
  }
  const guestAlreadyDeparted = episode.events.some((event) => event.kind === "departure");
  // A third pressure cue is resolved by the guest before the ordinary turn-count
  // closing can begin. Otherwise a cue landing exactly at the closing threshold
  // could complete the episode without giving the guest their earned exit turn.
  const departurePending =
    !guestAlreadyDeparted && botcastGuestDepartureEligible(tension);
  const nextSegment = departurePending
    ? episode.segment
    : botcastSegmentForTurn({
        current: episode.segment,
        utteranceCount: episode.messages.length,
        guestDeparted: guestAlreadyDeparted,
      });
  if (nextSegment !== episode.segment) {
    transitionEpisodeSegment(db, userId, episode, nextSegment, now);
    episode = getBotcastEpisode(db, userId, episodeId);
  }
  const speakerRole = botcastNextSpeakerRole({
    messages: episode.messages,
    segment: episode.segment,
    guestDeparted: guestAlreadyDeparted,
  });
  if (!speakerRole) {
    completeEpisode(
      db,
      userId,
      episode,
      guestAlreadyDeparted ? "guest_departed" : "completed",
      now,
    );
    return { episode: getBotcastEpisode(db, userId, episodeId), message: null };
  }
  const show = getBotcastShow(db, userId, episode.showId);
  const host = loadBotProfile(db, userId, episode.hostBotId);
  const guest = loadBotProfile(db, userId, episode.guestBotId);
  const speaker = speakerRole === "host" ? host : guest;
  const departureRequired =
    speakerRole === "guest" && botcastGuestDepartureEligible(tension);
  const prompt = buildBotcastSpeakerPrompt({
    show,
    episode,
    host,
    guest,
    speakerRole,
    ...(input.cue ? { cue: input.cue } : {}),
    departureRequired,
  });
  const selected = generationProvider(generation, episode.provider, episode.model);
  const generationOptions = {
    temperature: Math.min(1.15, Math.max(0.2, speaker.temperature)),
    maxTokens: Math.min(520, Math.max(120, speaker.maxTokens)),
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
  if (episode.responseMode === "auto") {
    const resolvedChain = autoFallbackResolvedChain(
      { provider: episode.provider, model: modelUsed },
      generation.autoFallbackChain,
    );
    if (!resolvedChain) {
      throw new Error(
        "Signal AUTO needs one primary model and two distinct fallbacks in Settings.",
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
            usagePurpose: index === 0 ? "botcast_turn" : "chat_fallback",
            signal,
          });
        },
      })),
      perAttemptTimeoutMs: 60_000,
      totalTimeoutMs: 150_000,
    });
    raw = result.value;
    providerUsed = result.provider;
    modelUsed = result.model;
    autoRecovery = result.recovery;
  } else {
    raw = await selected.provider.generateResponse(prompt, {
      ...generationOptions,
      ...(selected.model ? { model: selected.model } : {}),
    });
  }
  const fallback =
    speakerRole === "host"
      ? episode.segment === "closing"
        ? guestAlreadyDeparted
          ? `${guest.name} has left the studio. That is where we will leave it; thank you for listening.`
          : `That is where we will leave it. ${guest.name}, thank you for joining me.`
        : `${guest.name}, what is the part of ${episode.topic} that people most often misunderstand?`
      : departureRequired
        ? "I warned you. We are done here."
        : "I do not accept the premise as stated, but I will answer the part that matters.";
  const generatedContent = sanitizeUtterance(raw, fallback, speaker.name);
  const content =
    speakerRole === "host" &&
    episode.segment === "closing" &&
    /\?\s*$/u.test(generatedContent)
      ? fallback
      : generatedContent;
  const messageId = randomId(12);
  db.prepare(
    `INSERT INTO botcast_messages
      (id, user_id, episode_id, speaker_role, bot_id, content, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(messageId, userId, episode.id, speakerRole, speaker.id, content, now);
  recordEvent(db, userId, episode.id, "utterance", {
    messageId,
    speakerRole,
    botId: speaker.id,
    segment: episode.segment,
    provider: providerUsed,
    model: modelUsed,
    responseMode: episode.responseMode,
    ...(autoRecovery ? { autoRecovery } : {}),
  }, now);

  if (departureRequired) {
    db.prepare(
      `UPDATE botcast_episodes
          SET tension_level = 3, outcome = 'guest_departed', updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(now, episode.id, userId);
    const beforeClosing = getBotcastEpisode(db, userId, episode.id);
    transitionEpisodeSegment(db, userId, beforeClosing, "closing", now);
    recordEvent(db, userId, episode.id, "departure", {
      botId: guest.id,
      cause: input.cue?.kind ?? "continued_boundary_pressure",
      emptyChair: true,
      microphoneRemains: true,
      mugRemains: true,
    }, now);
  }

  episode = getBotcastEpisode(db, userId, episode.id);
  const previousCamera = lastCameraSuggestion(episode.events);
  const wordCount = content.split(/\s+/u).filter(Boolean).length;
  const utteranceDurationMs = Math.max(1_400, wordCount * 310);
  const atMs = previousCamera
    ? previousCamera.atMs + Math.max(previousCamera.minimumHoldMs, utteranceDurationMs)
    : 0;
  const suggestion = botcastDirectorSuggestion({
    previous: previousCamera,
    atMs,
    speakerRole,
    utteranceDurationMs,
    segment: episode.segment,
    event: departureRequired ? "departure" : "utterance",
  });
  recordEvent(db, userId, episode.id, "camera_suggestion", { ...suggestion }, now);
  if (departureRequired) {
    recordEvent(db, userId, episode.id, "camera_suggestion", {
      shot: "wide",
      reason: "empty_chair",
      atMs: suggestion.atMs + suggestion.minimumHoldMs,
      minimumHoldMs: 3_200,
    }, now);
  }
  const message = mapMessage({
    id: messageId,
    episode_id: episode.id,
    speaker_role: speakerRole,
    bot_id: speaker.id,
    content,
    created_at: now,
  });
  return { episode: getBotcastEpisode(db, userId, episode.id), message };
}

import type { DatabaseSync } from "node:sqlite";
import {
  PRISM_DEFAULT_STORY_THEME,
  PRISM_DEFAULT_STORY_THEME_ID,
  STORY_BOT_COUNT_MAX,
  STORY_BOT_COUNT_MIN,
  STORY_CHOICE_COUNT_MIN,
  STORY_ITEM_GLYPH_CATEGORIES,
  STORY_LOCATION_COUNT_MAX,
  STORY_LOCATION_COUNT_MIN,
  STORY_SCENE_COUNT_MIN,
  applyStoryChoice,
  applyStoryItemPickup,
  applyStoryTravel,
  createInitialStoryProgress,
  createInitialStoryTranscript,
  validateStoryEpisodeManifest,
  type StoryEpisodeManifest,
  type StorySessionDetail,
  type StorySessionProgress,
  type StorySessionStatus,
  type StorySessionSummary,
  type StoryTranscriptEntry,
  type ReasoningEffort,
} from "@localai/shared";
import { randomId } from "./security.ts";
import type { GenerateOptions, LlmProvider, ProviderName } from "./providers.ts";

export interface StoryBotProfile {
  id: string;
  name: string;
  systemPrompt: string;
  color: string | null;
  glyph: string | null;
  localModel: string | null;
  onlineModel: string | null;
  defaultModel: string | null;
  temperature: number | null;
  maxTokens: number | null;
  onlineEnabled: boolean;
}

export interface CreateStorySessionInput {
  botIds: string[];
  premise?: string | null;
  provider: ProviderName;
  model?: string | null;
}

export interface StoryGenerationInput {
  provider: LlmProvider;
  providerName: ProviderName;
  model: string;
  bots: StoryBotProfile[];
  premise?: string | null;
  reasoningEffort?: ReasoningEffort;
}

interface StorySessionRow {
  id: string;
  user_id: string;
  title: string;
  theme_id: string;
  status: string;
  provider: string;
  model: string | null;
  bot_ids: string;
  premise: string | null;
  episode_json: string | null;
  progress_json: string | null;
  transcript_json: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const STORY_GENERATION_REPAIR_RAW_MAX_CHARS = 8_000;
const STORY_LOCATION_BACKGROUND_ASSETS = [
  "background_reference_exterior",
  "background_reference_interior",
  "background_reference_liminal",
] as const;
const STORY_LOCATION_BACKGROUND_ASSET_SET = new Set<string>(STORY_LOCATION_BACKGROUND_ASSETS);
const STORY_BASELINE_LOCAL_MODEL_ID = "llama3.2";
const STORY_THIN_SCENE_PATTERNS = [
  /\bplayer can choose\b/i,
  /\bwhat to do\b/i,
  /\bready for (?:an? )?adventure\b/i,
  /\bstay or go\b/i,
  /\bmaybe later\b/i,
  /\bwonders? what\b/i,
];

const STORY_EPISODE_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["id", "title", "summary", "themeId", "startSceneId", "locations", "items", "scenes"],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    summary: { type: "string" },
    themeId: { const: PRISM_DEFAULT_STORY_THEME_ID },
    startSceneId: { type: "string" },
    locations: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "description", "x", "y", "discovered", "backgroundAssetId", "arrivalSceneId"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          x: { type: "number", minimum: 0, maximum: 1 },
          y: { type: "number", minimum: 0, maximum: 1 },
          discovered: { type: "boolean" },
          backgroundAssetId: { enum: STORY_LOCATION_BACKGROUND_ASSETS },
          arrivalSceneId: { type: "string" },
        },
      },
    },
    items: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "category", "description", "glyph"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          category: {
            enum: ["weapon", "potion", "key", "clue", "document", "relic", "tool", "collectible"],
          },
          description: { type: "string" },
          glyph: { type: "string" },
        },
      },
    },
    scenes: {
      type: "array",
      minItems: 8,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "locationId",
          "narration",
          "speakerBotId",
          "speakerName",
          "spritePose",
          "backgroundAssetId",
          "cutsceneAssetId",
          "itemIds",
          "ending",
          "choices",
        ],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          locationId: { type: "string" },
          narration: { type: "string" },
          speakerBotId: { anyOf: [{ type: "string" }, { type: "null" }] },
          speakerName: { type: "string" },
          spritePose: { enum: ["idle", "speaking", "thinking", "action"] },
          backgroundAssetId: {
            anyOf: [{ enum: STORY_LOCATION_BACKGROUND_ASSETS }, { type: "null" }],
          },
          cutsceneAssetId: {
            anyOf: [{ const: "cutscene_reference" }, { type: "null" }],
          },
          itemIds: { type: "array", items: { type: "string" } },
          ending: { type: "boolean" },
          choices: {
            type: "array",
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "id",
                "label",
                "targetSceneId",
                "revealLocationIds",
                "grantItemIds",
                "requireItemIds",
              ],
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                targetSceneId: { type: "string" },
                revealLocationIds: { type: "array", items: { type: "string" } },
                grantItemIds: { type: "array", items: { type: "string" } },
                requireItemIds: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
    },
  },
};

const STORY_COMPACT_EPISODE_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "locations", "item", "scenes"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    locations: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
        },
      },
    },
    item: {
      type: "object",
      additionalProperties: false,
      required: ["name", "category", "description", "glyph"],
      properties: {
        name: { type: "string" },
        category: {
          enum: ["weapon", "potion", "key", "clue", "document", "relic", "tool", "collectible"],
        },
        description: { type: "string" },
        glyph: { type: "string" },
      },
    },
    scenes: {
      type: "array",
      minItems: 8,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "locationIndex", "narration", "speakerBotId", "ending", "choices"],
        properties: {
          title: { type: "string" },
          locationIndex: { type: "integer", minimum: 1, maximum: 3 },
          narration: { type: "string" },
          speakerBotId: { anyOf: [{ type: "string" }, { type: "null" }] },
          speakerName: { type: "string" },
          spritePose: { enum: ["idle", "speaking", "thinking", "action"] },
          visibleItem: { type: "boolean" },
          ending: { type: "boolean" },
          choices: {
            type: "array",
            maxItems: 2,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "targetSceneNumber"],
              properties: {
                label: { type: "string" },
                targetSceneNumber: { type: "integer", minimum: 1, maximum: 8 },
                revealLocationNumber: { anyOf: [{ type: "integer", minimum: 1, maximum: 3 }, { type: "null" }] },
                grantsItem: { type: "boolean" },
                requiresItem: { type: "boolean" },
              },
            },
          },
        },
      },
    },
  },
};

function parseJsonArray(raw: string | null, fallback: unknown[] = []): unknown[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonObject(raw: string | null): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function parseBotIds(raw: string | null): string[] {
  return parseJsonArray(raw).filter((value): value is string => typeof value === "string");
}

function storyDraftTitle(premise: string | null): string {
  return premise ? "Story Episode" : "Surprise Story";
}

function stripGeneratingTitle(title: string): string {
  return title.replace(/:\s*generating$/iu, "").trim() || title;
}

function normalizeStoryStatus(raw: string): StorySessionStatus {
  return raw === "playing" || raw === "complete" || raw === "failed"
    ? raw
    : "generating";
}

function rowToSummary(row: StorySessionRow): StorySessionSummary {
  const progress = parseJsonObject(row.progress_json) as Partial<StorySessionProgress> | null;
  return {
    id: row.id,
    title: row.title,
    themeId: row.theme_id,
    status: normalizeStoryStatus(row.status),
    provider: row.provider === "openai" ? "openai" : "local",
    model: row.model,
    botIds: parseBotIds(row.bot_ids),
    premise: row.premise,
    currentSceneId:
      typeof progress?.currentSceneId === "string" ? progress.currentSceneId : null,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToDetail(row: StorySessionRow): StorySessionDetail {
  const episodeRaw = parseJsonObject(row.episode_json);
  const episode = episodeRaw ? validateStoryEpisodeManifest(episodeRaw) : null;
  const progress = parseJsonObject(row.progress_json) as StorySessionProgress | null;
  const transcript = parseJsonArray(row.transcript_json).filter(
    (entry): entry is StoryTranscriptEntry =>
      !!entry &&
      typeof entry === "object" &&
      typeof (entry as { id?: unknown }).id === "string" &&
      typeof (entry as { text?: unknown }).text === "string"
  );
  return {
    ...rowToSummary(row),
    episode,
    progress,
    transcript,
  };
}

function getStorySessionRow(
  db: DatabaseSync,
  userId: string,
  sessionId: string
): StorySessionRow {
  const row = db
    .prepare("SELECT * FROM story_sessions WHERE id = ? AND user_id = ?")
    .get(sessionId, userId) as StorySessionRow | undefined;
  if (!row) {
    throw new Error("Story session not found.");
  }
  return row;
}

export function getStorySessionDetail(
  db: DatabaseSync,
  userId: string,
  sessionId: string
): StorySessionDetail {
  return rowToDetail(getStorySessionRow(db, userId, sessionId));
}

export function listStorySessions(
  db: DatabaseSync,
  userId: string
): StorySessionSummary[] {
  const rows = db
    .prepare(
      `SELECT * FROM story_sessions
        WHERE user_id = ?
        ORDER BY updated_at DESC`
    )
    .all(userId) as unknown as StorySessionRow[];
  return rows.map(rowToSummary);
}

export function normalizeStoryCreateBotIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new Error("Story botIds must be an array.");
  }
  const ids = Array.from(
    new Set(raw.filter((id): id is string => typeof id === "string" && id.trim().length > 0))
  ).map((id) => id.trim());
  if (ids.length < STORY_BOT_COUNT_MIN || ids.length > STORY_BOT_COUNT_MAX) {
    throw new Error(`Story Mode needs ${STORY_BOT_COUNT_MIN}-${STORY_BOT_COUNT_MAX} bots.`);
  }
  return ids;
}

export function loadStoryBotProfiles(
  db: DatabaseSync,
  userId: string,
  botIds: string[]
): StoryBotProfile[] {
  if (botIds.length === 0) return [];
  const placeholders = botIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT id, name, system_prompt, color, glyph, model, local_model, online_model,
              temperature, max_tokens, online_enabled, chat_enabled
         FROM bots
        WHERE user_id = ? AND id IN (${placeholders})`
    )
    .all(userId, ...botIds) as Array<{
    id: string;
    name: string;
    system_prompt: string | null;
    color: string | null;
    glyph: string | null;
    model: string | null;
    local_model: string | null;
    online_model: string | null;
    temperature: number | null;
    max_tokens: number | null;
    online_enabled: number | null;
    chat_enabled: number | null;
  }>;
  const byId = new Map(rows.map((row) => [row.id, row]));
  return botIds.map((botId) => {
    const row = byId.get(botId);
    if (!row || row.chat_enabled !== 1) {
      throw new Error("One or more Story bots are unavailable.");
    }
    return {
      id: row.id,
      name: row.name,
      systemPrompt: row.system_prompt ?? "",
      color: row.color,
      glyph: row.glyph,
      localModel: row.local_model,
      onlineModel: row.online_model,
      defaultModel: row.model,
      temperature: row.temperature,
      maxTokens: row.max_tokens,
      onlineEnabled: row.online_enabled !== 0,
    };
  });
}

export function createStorySession(
  db: DatabaseSync,
  userId: string,
  input: CreateStorySessionInput
): StorySessionDetail {
  const botIds = normalizeStoryCreateBotIds(input.botIds);
  const now = new Date().toISOString();
  const id = randomId(12);
  const premise = input.premise?.trim() || null;
  db.prepare(
    `INSERT INTO story_sessions
       (id, user_id, title, theme_id, status, provider, model, bot_ids, premise,
        episode_json, progress_json, transcript_json, error, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'generating', ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?)`
  ).run(
    id,
    userId,
    storyDraftTitle(premise),
    PRISM_DEFAULT_STORY_THEME_ID,
    input.provider,
    input.model ?? null,
    JSON.stringify(botIds),
    premise,
    JSON.stringify([]),
    now,
    now
  );
  return getStorySessionDetail(db, userId, id);
}

function parseGeneratedJsonCandidate(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (firstError) {
    const repaired = repairGeneratedJsonText(text);
    if (repaired !== text) {
      return JSON.parse(repaired) as unknown;
    }
    throw firstError;
  }
}

function collectBalancedJsonObjectCandidates(text: string): string[] {
  const candidates: string[] = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index]!;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = inString;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(text.slice(start, index + 1));
          break;
        }
      }
    }
  }
  return candidates;
}

function extractJsonObjects(raw: string): unknown[] {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const objects: unknown[] = [];
  const seen = new Set<string>();
  const tryCandidate = (text: string): void => {
    const candidate = text.trim();
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    try {
      objects.push(parseGeneratedJsonCandidate(candidate));
    } catch {
      // Keep scanning; local models often surround the usable JSON with scratch output.
    }
  };
  tryCandidate(trimmed);
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    tryCandidate(trimmed.slice(first, last + 1));
    for (const candidate of collectBalancedJsonObjectCandidates(trimmed)) {
      tryCandidate(candidate);
    }
  }
  if (objects.length === 0) {
    const excerpt = trimmed.replace(/\s+/g, " ").slice(0, 220);
    throw new Error(
      `Story generator did not return JSON.${excerpt ? ` Response began: ${excerpt}` : ""}`
    );
  }
  return objects;
}

function repairGeneratedJsonText(text: string): string {
  return text
    .replace(/…/g, "")
    .replace(/\.\.\./g, "")
    .replace(/}\s*(?={)/g, "},")
    .replace(/]\s*(?="[A-Za-z0-9_-]+"\s*:)/g, "],")
    .replace(/}\s*(?="[A-Za-z0-9_-]+"\s*:)/g, "},")
    .replace(/,\s*([}\]])/g, "$1");
}

function looksLikeStoryEpisode(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray((value as { locations?: unknown }).locations) &&
    Array.isArray((value as { scenes?: unknown }).scenes)
  );
}

function findStoryEpisodeCandidate(value: unknown, depth = 0): unknown {
  if (looksLikeStoryEpisode(value)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 3) {
    return value;
  }
  const row = value as Record<string, unknown>;
  for (const key of ["episode", "story", "manifest", "episodeManifest", "outline", "data", "result", "response"]) {
    if (key in row) {
      const candidate = findStoryEpisodeCandidate(row[key], depth + 1);
      if (looksLikeStoryEpisode(candidate)) return candidate;
    }
  }
  for (const candidate of Object.values(row)) {
    const nested = findStoryEpisodeCandidate(candidate, depth + 1);
    if (looksLikeStoryEpisode(nested)) return nested;
  }
  return value;
}

function asMutableObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

const STORY_ITEM_GLYPH_CATEGORY_SET = new Set<string>(STORY_ITEM_GLYPH_CATEGORIES);

function generatedStoryItemCategory(value: unknown): string {
  const category = stringValue(value)?.toLowerCase() ?? "clue";
  return STORY_ITEM_GLYPH_CATEGORY_SET.has(category) ? category : "clue";
}

function generatedId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

function normalizedStoryModelId(model: string): string {
  return model
    .trim()
    .toLowerCase()
    .replace(/^ollama-secondary:/u, "")
    .replace(/:latest$/u, "");
}

function isBaselineLocalStoryGeneration(args: StoryGenerationInput): boolean {
  return (
    args.providerName === "local" &&
    normalizedStoryModelId(args.model) === STORY_BASELINE_LOCAL_MODEL_ID
  );
}

function generatedMapCoordinate(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0.12, Math.min(0.88, numeric));
}

function distributeStoryLocationCoordinates<
  T extends { x: number; y: number },
>(locations: T[]): T[] {
  const keys = new Set(locations.map((location) => `${location.x.toFixed(2)}:${location.y.toFixed(2)}`));
  const needsLayout =
    keys.size < locations.length ||
    locations.some(
      (location) =>
        location.x <= 0.12 ||
        location.x >= 0.88 ||
        location.y <= 0.12 ||
        location.y >= 0.88
    );
  if (!needsLayout) return locations;
  const yPattern = [0.38, 0.64, 0.48, 0.74, 0.28];
  return locations.map((location, index) => ({
    ...location,
    x: (index + 1) / (locations.length + 1),
    y: yPattern[index % yPattern.length]!,
  }));
}

function normalizeGeneratedNarration(title: string, narration: string): string {
  if (
    narration.trim().length >= 48 &&
    !STORY_THIN_SCENE_PATTERNS.some((pattern) => pattern.test(narration))
  ) {
    return narration.trim();
  }
  return `${title} changes the projected route, revealing a concrete obstacle and giving the next choice immediate stakes.`;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampIndex(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = numberValue(value);
  if (numeric === null) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function compactSpeakerBotId(
  scene: Record<string, unknown>,
  bots: readonly StoryBotProfile[]
): string | null {
  const byId = new Map(bots.map((bot) => [bot.id, bot]));
  const rawId = stringValue(scene.speakerBotId);
  if (rawId && byId.has(rawId)) return rawId;
  const rawName = stringValue(scene.speakerName) ?? rawId;
  if (!rawName) return null;
  const matched = bots.find((bot) => bot.name.toLowerCase() === rawName.toLowerCase());
  return matched?.id ?? null;
}

function compactChoiceLabel(
  choice: Record<string, unknown> | null,
  sceneIndex: number,
  choiceIndex: number
): string {
  const label = stringValue(choice?.label);
  if (label) return label;
  const fallbacks = [
    ["Follow the signal.", "Search the edges."],
    ["Question the clue.", "Check the other path."],
    ["Pick up the object.", "Leave it for now."],
    ["Use the discovery.", "Look for a safer route."],
    ["Press forward.", "Return to the clue."],
    ["Connect the pattern.", "Revisit the crossing."],
    ["Finish the story.", "Take one last look."],
  ];
  return fallbacks[sceneIndex]?.[choiceIndex] ?? `Continue ${choiceIndex + 1}.`;
}

function compactChoiceTargetNumber(
  choice: Record<string, unknown> | null,
  sceneIndex: number,
  choiceIndex: number
): number {
  const fallbackTargets = [
    [2, 3],
    [4, 5],
    [4, 6],
    [6, 5],
    [6, 7],
    [7, 5],
    [8, 6],
  ];
  const fallback = fallbackTargets[sceneIndex]?.[choiceIndex] ?? Math.min(8, sceneIndex + 2);
  const proposed = clampIndex(choice?.targetSceneNumber, 1, STORY_SCENE_COUNT_MIN, fallback);
  if (sceneIndex < 5 && proposed === STORY_SCENE_COUNT_MIN) return fallback;
  if (choiceIndex === 0 && proposed <= sceneIndex + 1) return fallback;
  if (proposed === sceneIndex + 1) return fallback;
  return proposed;
}

function compileCompactStoryEpisode(
  value: unknown,
  bots: readonly StoryBotProfile[]
): unknown {
  const compact = asMutableObject(value);
  if (!compact) {
    throw new Error("Story outline must be a JSON object.");
  }
  const locationsRaw = Array.isArray(compact.locations) ? compact.locations : [];
  const scenesRaw = Array.isArray(compact.scenes) ? compact.scenes : [];
  if (locationsRaw.length < 1) {
    throw new Error("Story outline needs at least one location.");
  }
  if (scenesRaw.length < Math.ceil(STORY_SCENE_COUNT_MIN / 2)) {
    throw new Error("Story outline needs enough scene beats to compile.");
  }

  const title = stringValue(compact.title) ?? "Surprise Story";
  const summary =
    stringValue(compact.summary) ??
    "A compact PRISM Story Mode episode generated from a local outline.";
  const locationPattern = [0, 0, 1, 1, 1, 2, 2, 2];
  const mapCoordinates = [
    { x: 0.24, y: 0.42 },
    { x: 0.52, y: 0.64 },
    { x: 0.78, y: 0.36 },
  ];
  const locations = Array.from({ length: STORY_LOCATION_COUNT_MIN }, (_, index) => {
    const location = asMutableObject(locationsRaw[index]) ?? {};
    const name =
      stringValue(location.name) ??
      (index === 0 ? "Opening District" : index === 1 ? "Signal Crossing" : "Final Threshold");
    return {
      id: generatedId("loc", index),
      name,
      description: stringValue(location.description) ?? `${name} is part of the projected Story route.`,
      x: mapCoordinates[index]!.x,
      y: mapCoordinates[index]!.y,
      discovered: index === 0,
      backgroundAssetId: STORY_LOCATION_BACKGROUND_ASSETS[index % STORY_LOCATION_BACKGROUND_ASSETS.length]!,
      arrivalSceneId: generatedId("scene", index === 0 ? 0 : index === 1 ? 2 : 5),
    };
  });

  const itemRaw =
    asMutableObject(compact.item) ??
    (Array.isArray(compact.items) ? asMutableObject(compact.items[0]) : null) ??
    {};
  const itemName = stringValue(itemRaw.name) ?? "Signal Token";
  const item = {
    id: "item-1",
    name: itemName,
    category: generatedStoryItemCategory(itemRaw.category),
    description: stringValue(itemRaw.description) ?? `${itemName} carries a useful story signal.`,
    glyph: stringValue(itemRaw.glyph) ?? "◇",
  };

  let narrationOnlyCount = 0;
  const scenes = Array.from({ length: STORY_SCENE_COUNT_MIN }, (_, index) => {
    const scene = asMutableObject(scenesRaw[index]) ?? {};
    const ending = index === STORY_SCENE_COUNT_MIN - 1;
    const locationIndex = ending
      ? 2
      : clampIndex(scene.locationIndex, 1, STORY_LOCATION_COUNT_MIN, locationPattern[index]! + 1) - 1;
    const titleForScene = stringValue(scene.title) ?? `Scene ${index + 1}`;
    const speakerBotId =
      ending || (narrationOnlyCount < 2 && index % 2 === 0)
        ? null
        : compactSpeakerBotId(scene, bots);
    if (!ending && !speakerBotId) {
      narrationOnlyCount += 1;
    }
    const speakerBot = speakerBotId ? bots.find((bot) => bot.id === speakerBotId) : null;
    const visibleItem = index === 2 || scene.visibleItem === true;
    const choicesRaw = Array.isArray(scene.choices) ? scene.choices : [];
    const choices = ending
      ? []
      : Array.from({ length: STORY_CHOICE_COUNT_MIN }, (_, choiceIndex) => {
          const choice = asMutableObject(choicesRaw[choiceIndex]) ?? null;
          const targetNumber = compactChoiceTargetNumber(choice, index, choiceIndex);
          const revealLocationNumber = clampIndex(
            choice?.revealLocationNumber,
            1,
            STORY_LOCATION_COUNT_MIN,
            locationPattern[targetNumber - 1]! + 1
          );
          const revealLocationId = generatedId("loc", revealLocationNumber - 1);
          const grantItem =
            choice?.grantsItem === true ||
            (index === 2 && choiceIndex === 0);
          return {
            id: `scene-${index + 1}-choice-${choiceIndex + 1}`,
            label: compactChoiceLabel(choice, index, choiceIndex),
            targetSceneId: generatedId("scene", targetNumber - 1),
            revealLocationIds:
              revealLocationId !== generatedId("loc", locationIndex)
                ? [revealLocationId]
                : [],
            grantItemIds: grantItem ? [item.id] : [],
            requireItemIds: [],
          };
        });
    return {
      id: generatedId("scene", index),
      title: titleForScene,
      locationId: locations[locationIndex]?.id ?? "loc-1",
      narration: normalizeGeneratedNarration(
        titleForScene,
        stringValue(scene.narration) ?? `${titleForScene} changes the route through ${locations[locationIndex]?.name ?? "the projection"}.`
      ),
      speakerBotId,
      speakerName: speakerBot?.name ?? "",
      spritePose:
        stringValue(scene.spritePose) === "thinking" ||
        stringValue(scene.spritePose) === "action" ||
        stringValue(scene.spritePose) === "speaking"
          ? (stringValue(scene.spritePose) as "thinking" | "action" | "speaking")
          : speakerBotId
            ? "speaking"
            : "idle",
      itemIds: visibleItem && !ending ? [item.id] : [],
      ending,
      choices,
    };
  });

  return {
    id: "story-episode",
    title,
    summary,
    themeId: PRISM_DEFAULT_STORY_THEME_ID,
    startSceneId: "scene-1",
    locations,
    items: [item],
    scenes,
  };
}

function coerceGeneratedStoryEpisodeShape(value: unknown): unknown {
  const episode = asMutableObject(value);
  if (!episode) return value;
  const scenesRaw = Array.isArray(episode.scenes) ? episode.scenes : [];
  const locationsRaw = Array.isArray(episode.locations) ? episode.locations : [];
  const itemsRaw = Array.isArray(episode.items) ? episode.items : [];

  let scenes = scenesRaw.map((entry, index) => {
    const scene = asMutableObject(entry) ?? {};
    const id = stringValue(scene.id) ?? generatedId("scene", index);
    const title = stringValue(scene.title) ?? `Scene ${index + 1}`;
    const narration = normalizeGeneratedNarration(title, stringValue(scene.narration) ?? title);
    const choicesRaw = Array.isArray(scene.choices) ? scene.choices : [];
    const choices = choicesRaw.map((choiceEntry, choiceIndex) => {
      const choice = asMutableObject(choiceEntry) ?? {};
      return {
        ...choice,
        id: stringValue(choice.id) ?? `${id}-choice-${choiceIndex + 1}`,
        label: stringValue(choice.label) ?? `Continue ${choiceIndex + 1}`,
        targetSceneId:
          stringValue(choice.targetSceneId) ??
          stringValue(scenesRaw[Math.min(index + 1, scenesRaw.length - 1) as number]?.["id"]) ??
          id,
        revealLocationIds: Array.isArray(choice.revealLocationIds) ? choice.revealLocationIds : [],
        grantItemIds: Array.isArray(choice.grantItemIds) ? choice.grantItemIds : [],
        requireItemIds: Array.isArray(choice.requireItemIds) ? choice.requireItemIds : [],
      };
    });
    return {
      ...scene,
      id,
      title,
      locationId:
        stringValue(scene.locationId) ??
        stringValue(locationsRaw[0]?.["id"]) ??
        generatedId("loc", 0),
      narration,
      speakerBotId: stringValue(scene.speakerBotId),
      speakerName: stringValue(scene.speakerName) ?? "",
      spritePose: stringValue(scene.spritePose) ?? "idle",
      backgroundAssetId: stringValue(scene.backgroundAssetId) ?? null,
      cutsceneAssetId: stringValue(scene.cutsceneAssetId) ?? null,
      itemIds: Array.isArray(scene.itemIds) ? scene.itemIds : [],
      ending: scene.ending === true,
      choices,
    };
  });

  const narrationOnlyScenes = scenes.filter((scene) => !scene.ending && !scene.speakerBotId);
  if (narrationOnlyScenes.length < Math.min(2, scenes.filter((scene) => !scene.ending).length)) {
    let madeNarrationOnly = narrationOnlyScenes.length;
    scenes = scenes.map((scene, index) => {
      if (scene.ending || madeNarrationOnly >= 2 || index % 2 !== 0) return scene;
      madeNarrationOnly += 1;
      return { ...scene, speakerBotId: null, speakerName: "", spritePose: "idle" };
    });
  }

  let locations = locationsRaw.map((entry, index) => {
    const location = asMutableObject(entry) ?? {};
    const id = stringValue(location.id) ?? generatedId("loc", index);
    const name = stringValue(location.name) ?? `Location ${index + 1}`;
    const firstSceneAtLocation = scenes.find((scene) => scene.locationId === id && !scene.ending);
    return {
      ...location,
      id,
      name,
      description: stringValue(location.description) ?? name,
      x: generatedMapCoordinate(location.x, (index + 1) / (locationsRaw.length + 1)),
      y: generatedMapCoordinate(location.y, index % 2 === 0 ? 0.34 : 0.66),
      discovered: location.discovered === true || index === 0,
      backgroundAssetId: stringValue(location.backgroundAssetId) ?? STORY_LOCATION_BACKGROUND_ASSETS[index % STORY_LOCATION_BACKGROUND_ASSETS.length]!,
      arrivalSceneId: stringValue(location.arrivalSceneId) ?? firstSceneAtLocation?.id ?? scenes[0]?.id ?? generatedId("scene", 0),
    };
  });

  if (locations.length === 0 && scenes.length > 0) {
    locations = [
      {
        id: "loc-1",
        name: "Opening Projection",
        description: "The first projected Story location.",
        x: 0.28,
        y: 0.42,
        discovered: true,
        backgroundAssetId: "background_reference_exterior",
        arrivalSceneId: scenes[0]?.id ?? "scene-1",
      },
    ];
    scenes = scenes.map((scene) => ({ ...scene, locationId: "loc-1" }));
  }

  while (locations.length < STORY_LOCATION_COUNT_MIN && scenes.length > 0) {
    const index = locations.length;
    const id = generatedId("loc", index);
    const candidateScene =
      scenes.find((scene, sceneIndex) => !scene.ending && sceneIndex >= index) ??
      scenes.find((scene) => !scene.ending) ??
      scenes[0];
    if (candidateScene) {
      candidateScene.locationId = id;
    }
    locations.push({
      id,
      name: index === 1 ? "Hidden Passage" : "Threshold Vista",
      description: index === 1 ? "A secondary route revealed by the story." : "A distant place at the edge of the episode.",
      x: (index + 1) / (STORY_LOCATION_COUNT_MIN + 1),
      y: index % 2 === 0 ? 0.34 : 0.66,
      discovered: index === 0,
      backgroundAssetId: STORY_LOCATION_BACKGROUND_ASSETS[index % STORY_LOCATION_BACKGROUND_ASSETS.length]!,
      arrivalSceneId: candidateScene?.id ?? scenes[0]?.id ?? "scene-1",
    });
  }
  if (locations.length > STORY_LOCATION_COUNT_MAX) {
    locations = locations.slice(0, STORY_LOCATION_COUNT_MAX);
  }
  const nonEndingSceneIndexes = scenes
    .map((scene, index) => (!scene.ending ? index : -1))
    .filter((index) => index >= 0);
  if (nonEndingSceneIndexes.length > 0) {
    const usedArrivalSceneIndexes = new Set<number>();
    locations = locations.map((location, index) => {
      const currentArrivalIndex = scenes.findIndex(
        (scene) =>
          scene.id === location.arrivalSceneId &&
          scene.locationId === location.id &&
          !scene.ending
      );
      if (currentArrivalIndex >= 0) {
        usedArrivalSceneIndexes.add(currentArrivalIndex);
        return location;
      }
      const sceneIndex =
        nonEndingSceneIndexes.find((candidate) => !usedArrivalSceneIndexes.has(candidate)) ??
        nonEndingSceneIndexes[index % nonEndingSceneIndexes.length]!;
      usedArrivalSceneIndexes.add(sceneIndex);
      const arrivalScene = scenes[sceneIndex]!;
      scenes[sceneIndex] = { ...arrivalScene, locationId: location.id };
      return { ...location, arrivalSceneId: arrivalScene.id };
    });
  }
  const locationIds = new Set(locations.map((location) => location.id));
  scenes = scenes.map((scene, index) =>
    locationIds.has(scene.locationId)
      ? scene
      : {
          ...scene,
          locationId: locations[index % Math.max(1, locations.length)]?.id ?? "loc-1",
        }
  );
  locations = locations.map((location) => {
    const arrivalScene =
      scenes.find(
        (scene) =>
          scene.id === location.arrivalSceneId &&
          scene.locationId === location.id &&
          !scene.ending
      ) ?? scenes.find((scene) => scene.locationId === location.id && !scene.ending);
    if (arrivalScene) {
      return { ...location, arrivalSceneId: arrivalScene.id };
    }
    return location;
  });
  locations = distributeStoryLocationCoordinates(locations);

  const items = itemsRaw.map((entry, index) => {
    const item = asMutableObject(entry) ?? {};
    const name = stringValue(item.name) ?? `Item ${index + 1}`;
    return {
      ...item,
      id: stringValue(item.id) ?? generatedId("item", index),
      name,
      category: generatedStoryItemCategory(item.category),
      description: stringValue(item.description) ?? name,
      glyph: stringValue(item.glyph) ?? "◇",
    };
  });

  return {
    ...episode,
    id: stringValue(episode.id) ?? "story-episode",
    title: stringValue(episode.title) ?? "Surprise Story",
    summary: stringValue(episode.summary) ?? "A compact PRISM Story Mode episode.",
    themeId: stringValue(episode.themeId) ?? PRISM_DEFAULT_STORY_THEME_ID,
    startSceneId: stringValue(episode.startSceneId) ?? scenes[0]?.id ?? "scene-1",
    locations,
    items,
    scenes,
  };
}

function parseGeneratedStoryEpisode(
  raw: string,
  args: StoryGenerationInput
): StoryEpisodeManifest {
  const candidates = extractJsonObjects(raw);
  const errors: string[] = [];
  const botIds = args.bots.map((bot) => bot.id);
  const preferCompact = isBaselineLocalStoryGeneration(args);
  for (const parsed of candidates) {
    const candidate = findStoryEpisodeCandidate(parsed);
    if (preferCompact) {
      try {
        const episode = normalizeStoryEpisodePresentation(
          validateStoryEpisodeManifest(compileCompactStoryEpisode(candidate, args.bots))
        );
        validateEpisodeBotReferences(episode, botIds);
        validateEpisodeNarrativeQuality(episode);
        return episode;
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }
    try {
      const episodeRaw = coerceGeneratedStoryEpisodeShape(candidate);
      const episode = normalizeStoryEpisodePresentation(validateStoryEpisodeManifest(episodeRaw));
      validateEpisodeBotReferences(episode, botIds);
      validateEpisodeNarrativeQuality(episode);
      return episode;
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }
  throw new Error(errors.find(Boolean) ?? "Story generator did not return a valid episode.");
}

function normalizeStoryBackgroundAssetId(value: string | undefined): string | undefined {
  return value && STORY_LOCATION_BACKGROUND_ASSET_SET.has(value) ? value : undefined;
}

function storyBackgroundAssetForLocation(
  location: StoryEpisodeManifest["locations"][number],
  index: number
): string {
  const explicit = normalizeStoryBackgroundAssetId(location.backgroundAssetId);
  if (explicit) return explicit;
  const searchable = `${location.name} ${location.description}`.toLowerCase();
  if (/\b(basement|cave|crypt|threshold|void|dream|portal|secret|liminal|underworld|shadow)\b/.test(searchable)) {
    return "background_reference_liminal";
  }
  if (/\b(room|hall|kitchen|archive|office|interior|inside|library|shop|house|temple)\b/.test(searchable)) {
    return "background_reference_interior";
  }
  return STORY_LOCATION_BACKGROUND_ASSETS[index % STORY_LOCATION_BACKGROUND_ASSETS.length]!;
}

function normalizeStoryEpisodePresentation(episode: StoryEpisodeManifest): StoryEpisodeManifest {
  const seededLocations = episode.locations.map((location, index) => ({
    ...location,
    backgroundAssetId: storyBackgroundAssetForLocation(location, index),
  }));
  const distinctBackgrounds = new Set(
    seededLocations.map((location) => location.backgroundAssetId)
  );
  const locations =
    distinctBackgrounds.size <= 1 && seededLocations.length > 1
      ? seededLocations.map((location, index) => ({
          ...location,
          backgroundAssetId:
            STORY_LOCATION_BACKGROUND_ASSETS[index % STORY_LOCATION_BACKGROUND_ASSETS.length]!,
        }))
      : seededLocations;
  const scenes = episode.scenes.map((scene) => {
    const { backgroundAssetId: _backgroundAssetId, ...sceneRest } = scene;
    const cutsceneBackground = scene.cutsceneAssetId
      ? normalizeStoryBackgroundAssetId(scene.backgroundAssetId)
      : undefined;
    return {
      ...sceneRest,
      ...(cutsceneBackground ? { backgroundAssetId: cutsceneBackground } : {}),
    };
  });
  return { ...episode, locations, scenes };
}

function truncateStoryRepairRaw(raw: string): string {
  if (raw.length <= STORY_GENERATION_REPAIR_RAW_MAX_CHARS) return raw;
  const headLength = Math.floor(STORY_GENERATION_REPAIR_RAW_MAX_CHARS * 0.72);
  const tailLength = STORY_GENERATION_REPAIR_RAW_MAX_CHARS - headLength;
  return `${raw.slice(0, headLength)}\n...[truncated invalid output]...\n${raw.slice(-tailLength)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateEpisodeBotReferences(
  episode: StoryEpisodeManifest,
  botIds: readonly string[]
): void {
  const known = new Set(botIds);
  for (const scene of episode.scenes) {
    if (scene.speakerBotId && !known.has(scene.speakerBotId)) {
      throw new Error(`Scene "${scene.id}" references unknown Story bot "${scene.speakerBotId}".`);
    }
  }
}

function validateEpisodeNarrativeQuality(episode: StoryEpisodeManifest): void {
  const playableScenes = episode.scenes.filter((scene) => !scene.ending);
  const narrationOnlyScenes = playableScenes.filter((scene) => !scene.speakerBotId);
  if (narrationOnlyScenes.length < Math.min(2, playableScenes.length)) {
    throw new Error("Story episodes need at least two narration-only scenes for exploration/map travel.");
  }
  for (const scene of playableScenes) {
    const narration = scene.narration.trim();
    if (narration.length < 48) {
      throw new Error(`Scene "${scene.id}" narration is too thin for Story Mode.`);
    }
    if (STORY_THIN_SCENE_PATTERNS.some((pattern) => pattern.test(narration))) {
      throw new Error(`Scene "${scene.id}" uses placeholder/meta story text.`);
    }
  }
  const allChoices = playableScenes.flatMap((scene) => scene.choices);
  const hasOrganicItemGrant = allChoices.some((choice) => (choice.grantItemIds ?? []).length > 0);
  const hasVisiblePickup = playableScenes.some((scene) => (scene.itemIds ?? []).length > 0);
  if (episode.items.length > 0 && !hasOrganicItemGrant && !hasVisiblePickup) {
    throw new Error("Story items must be obtainable through choices or visible scene pickups.");
  }
}

function storyGenerationPrompt(args: StoryGenerationInput): string {
  const botLines = args.bots
    .map((bot) =>
      `- ${bot.id}: ${bot.name}. Persona: ${(bot.systemPrompt || "A distinct PRISM actor.").slice(0, 900)}`
    )
    .join("\n");
  const premise = args.premise?.trim()
    ? args.premise.trim()
    : "Surprise the player with a compact surreal adventure that fits the selected cast.";
  if (isBaselineLocalStoryGeneration(args)) {
    return [
      "Create a compact PRISM Story Mode outline as strict JSON only. No markdown, no commentary.",
      "PRISM will compile your outline into the full game manifest, map coordinates, stable ids, bundled assets, and fallback mechanics.",
      `Theme id: ${PRISM_DEFAULT_STORY_THEME.id}. Theme: ${PRISM_DEFAULT_STORY_THEME.style.summary}`,
      `Premise: ${premise}`,
      "Selected bots:",
      botLines,
      "",
      "Write a real short story arc with concrete events:",
      "1. inciting incident",
      "2. investigation",
      "3. discoverable object",
      "4. consequence",
      "5. reveal",
      "6. complication",
      "7. climax",
      "8. ending",
      "",
      "Rules:",
      "- Return exactly 3 locations and exactly 8 scenes.",
      "- Scene 8 is the only ending and must have choices: [].",
      "- Non-ending scenes must have exactly 2 choices.",
      "- Each narration must describe a concrete event, obstacle, clue, or consequence in 1-2 sentences.",
      "- Do not write meta text like 'the player can choose', 'wonders what to do', 'stay or go', or 'ready for an adventure'.",
      "- Use speakerBotId only when a selected bot is actively speaking. Otherwise use null.",
      "- Use at least two null speakerBotId scenes for exploration with no NPC sprite.",
      "- Use selected bot ids exactly as provided. Never invent bot ids.",
      "- The item should be visible around scene 3 and useful to the story.",
      "- Choices should be short action labels, not prose summaries.",
      "- Never use ellipses, placeholders, comments, markdown, or abbreviated arrays.",
      "",
      "Return one JSON object with this compact shape:",
      "title, summary, locations, item, scenes.",
      "Each location needs: name, description.",
      "The item needs: name, category, description, glyph.",
      "Item category must be one of: weapon, potion, key, clue, document, relic, tool, collectible.",
      "Each scene needs: title, locationIndex, narration, speakerBotId, speakerName, spritePose, visibleItem, ending, choices.",
      "locationIndex is 1, 2, or 3. speakerBotId is a selected bot id or null.",
      "spritePose is idle, speaking, thinking, or action.",
      "Each choice needs: label, targetSceneNumber, revealLocationNumber, grantsItem, requiresItem.",
      "Use null for revealLocationNumber when no map reveal is intended.",
    ].join("\n");
  }
  return [
    "Create one complete PRISM Story Mode episode as strict JSON only. No markdown, no commentary.",
    `Theme id: ${PRISM_DEFAULT_STORY_THEME.id}. Theme: ${PRISM_DEFAULT_STORY_THEME.style.summary}`,
    `Premise: ${premise}`,
    "Selected bots:",
    botLines,
    "",
    "Rules:",
    "- Use exactly 8-12 scenes, 3-5 locations, and 1-3 ending scenes.",
    "- Non-ending scenes must have 2-4 fixed choices.",
    "- Choices must target scene ids that exist.",
    "- Build a real short episode: inciting incident, investigation/escalation, reveal, climax, and ending.",
    "- Every scene must contain a concrete event, discovery, obstacle, consequence, or character line. No filler.",
    "- Do not write meta text like 'the player can choose', 'wonders what to do', 'stay or go', or 'ready for an adventure'.",
    "- Only set speakerBotId when that bot is actively speaking or being directly represented. Use null for narration/exploration scenes.",
    "- At least two non-ending scenes must have speakerBotId null so the stage can show no NPC.",
    "- Each location should set arrivalSceneId to a non-ending narration/exploration scene in that same location. Map travel uses that scene.",
    "- Each location must choose one backgroundAssetId: background_reference_exterior, background_reference_interior, or background_reference_liminal. Do not use the same background for every location.",
    "- Scene backgroundAssetId is optional; location backgroundAssetId is preferred for ordinary scenes.",
    "- Items must be glyph-only and use categories: weapon, potion, key, clue, document, relic, tool, collectible.",
    "- Put item ids in scene.itemIds when the object is visible and clickable in the scene.",
    "- Put item ids in choice.grantItemIds when the object is acquired organically through a choice.",
    "- Use only bundled asset ids: background_reference_exterior, background_reference_interior, background_reference_liminal, cutscene_reference, projection_fallback, sprite_fallback_silhouette.",
    "- Do not request or describe runtime raster image generation.",
    "- speakerBotId must be one of the selected bot ids, or null for narration.",
    "- spritePose may be idle, speaking, thinking, or action.",
    "- Location x/y values must be normalized 0-1.",
    "- Never use ellipses, comments, placeholders, or abbreviated arrays. Every array item must be fully written.",
    "",
    "Return a single JSON object with these required top-level fields:",
    "id, title, summary, themeId, startSceneId, locations, items, scenes.",
    "Each location needs: id, name, description, x, y, discovered, backgroundAssetId, arrivalSceneId.",
    "Each item needs: id, name, category, description, glyph.",
    "Each scene needs: id, title, locationId, narration, speakerBotId, speakerName, spritePose, backgroundAssetId, cutsceneAssetId, itemIds, ending, choices.",
    "For nullable scene fields use null. For empty lists use [].",
    "Each choice needs: id, label, targetSceneId, revealLocationIds, grantItemIds, requireItemIds.",
  ].join("\n");
}

function storyGenerationSystemPrompt(args: StoryGenerationInput): string {
  const artifact = isBaselineLocalStoryGeneration(args) ? "story outline" : "episode manifest";
  return [
    "You are PRISM Story Mode's episode generator.",
    `Output one valid ${artifact} JSON object only.`,
    "Every object key and every string value must use double quotes.",
    "Do not include markdown fences, comments, trailing commas, or explanatory prose.",
    "Do not use ellipses or abbreviated examples; write every object and array item completely.",
  ].join(" ");
}

function storyGenerationRepairPrompt(args: StoryGenerationInput, raw: string, error: unknown): string {
  const artifact = isBaselineLocalStoryGeneration(args) ? "outline" : "manifest";
  return [
    `Your previous Story Mode ${artifact} could not be parsed or validated.`,
    `Error: ${errorMessage(error)}`,
    "",
    "Repair it into one complete valid JSON object only.",
    "If the previous output is too broken or incomplete, regenerate from the brief.",
    "Keep the same schema and rules. Do not wrap the JSON in markdown.",
    "",
    "Invalid previous output:",
    truncateStoryRepairRaw(raw),
    "",
    "Original brief:",
    storyGenerationPrompt(args),
  ].join("\n");
}

function storyGenerationSchemaRepairPrompt(args: StoryGenerationInput, error: unknown): string {
  const botList = args.bots.map((bot) => `${bot.id}=${bot.name}`).join(", ");
  const premise = args.premise?.trim() || "Surprise compact surreal adventure.";
  if (isBaselineLocalStoryGeneration(args)) {
    return [
      "Generate the compact PRISM Story Mode outline again.",
      "Return one JSON object only. Do not include prose before or after the object.",
      "The first character of your response must be { and the last character must be }.",
      `Previous failure: ${errorMessage(error)}`,
      `Bots: ${botList}`,
      `Premise: ${premise}`,
      "Hard requirements:",
      "- exactly 3 locations with name and description.",
      "- exactly 1 item with name, category, description, glyph.",
      "- exactly 8 scenes.",
      "- scene 8 is the only ending and has choices: [].",
      "- every non-ending scene has exactly 2 choices.",
      "- at least two non-ending scenes use speakerBotId: null.",
      "- scene 3 should set visibleItem: true.",
      "- narrations must be concrete story events, not meta instructions.",
      "- use selected bot ids only, or null.",
      "- never use ellipses, comments, markdown, or placeholders.",
      "Required top-level fields: title, summary, locations, item, scenes.",
      "Required location fields: name, description.",
      "Required item fields: name, category, description, glyph.",
      "Required scene fields: title, locationIndex, narration, speakerBotId, speakerName, spritePose, visibleItem, ending, choices.",
      "Required choice fields: label, targetSceneNumber, revealLocationNumber, grantsItem, requiresItem.",
    ].join("\n");
  }
  return [
    "Generate the PRISM Story Mode episode again.",
    "Return one JSON object only. Do not include prose before or after the object.",
    "The first character of your response must be { and the last character must be }.",
    `Previous failure: ${errorMessage(error)}`,
    `Theme: ${PRISM_DEFAULT_STORY_THEME_ID}`,
    `Bots: ${botList}`,
    `Premise: ${premise}`,
    "Hard requirements:",
    "- 8 scenes total: scene-1 through scene-8.",
    "- 3 locations total: loc-1, loc-2, loc-3.",
    "- location arrivalSceneId values must point to non-ending scenes in the same location.",
    "- scene-8 must be the only ending and must have choices: [].",
    "- every non-ending scene must have exactly 2 choices.",
    "- at least two non-ending scenes must have speakerBotId: null.",
    "- include 1 item in items and make it collectible through either scene.itemIds or choice.grantItemIds.",
    "- use concrete story narration; no meta text about the player choosing.",
    "- use only these backgrounds: background_reference_exterior, background_reference_interior, background_reference_liminal.",
    "- nullable optional asset fields must be null, not omitted.",
    "- never use ellipses, comments, or placeholders.",
    "Required top-level fields: id, title, summary, themeId, startSceneId, locations, items, scenes.",
    "Required location fields: id, name, description, x, y, discovered, backgroundAssetId, arrivalSceneId.",
    "Required item fields: id, name, category, description, glyph.",
    "Required scene fields: id, title, locationId, narration, speakerBotId, speakerName, spritePose, backgroundAssetId, cutsceneAssetId, itemIds, ending, choices.",
    "Required choice fields: id, label, targetSceneId, revealLocationIds, grantItemIds, requireItemIds.",
  ].join("\n");
}

function storyGenerationLooseJsonPrompt(args: StoryGenerationInput, error: unknown): string {
  return [
    "Generate the same PRISM Story Mode episode as strict JSON only.",
    "Use plain JSON object mode instead of schema mode. Do not explain your plan.",
    storyGenerationSchemaRepairPrompt(args, error),
  ].join("\n");
}

function storyGenerationOptions(args: StoryGenerationInput): GenerateOptions {
  const temperatures = args.bots
    .map((bot) => bot.temperature)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const avgTemperature =
    temperatures.length > 0
      ? temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length
      : 0.65;
  if (isBaselineLocalStoryGeneration(args)) {
    return {
      model: args.model,
      ...(args.reasoningEffort ? { reasoningEffort: args.reasoningEffort } : {}),
      temperature: Math.max(0.25, Math.min(0.55, avgTemperature)),
      maxTokens: 2800,
      jsonMode: true,
      jsonSchema: STORY_COMPACT_EPISODE_JSON_SCHEMA,
      jsonSchemaName: "prism_story_outline",
    };
  }
  return {
    model: args.model,
    ...(args.reasoningEffort ? { reasoningEffort: args.reasoningEffort } : {}),
    temperature: Math.max(0.35, Math.min(0.85, avgTemperature)),
    maxTokens: 5000,
    jsonMode: true,
    jsonSchema: STORY_EPISODE_JSON_SCHEMA,
    jsonSchemaName: "prism_story_episode",
  };
}

function storyGenerationRepairOptions(args: StoryGenerationInput): GenerateOptions {
  return {
    ...storyGenerationOptions(args),
    temperature: 0.2,
  };
}

function storyGenerationSchemaRepairOptions(args: StoryGenerationInput): GenerateOptions {
  return {
    ...storyGenerationOptions(args),
    temperature: 0.1,
    maxTokens: 4200,
  };
}

function storyGenerationLooseJsonOptions(args: StoryGenerationInput): GenerateOptions {
  const { jsonSchema: _jsonSchema, jsonSchemaName: _jsonSchemaName, ...options } =
    storyGenerationSchemaRepairOptions(args);
  return options;
}

export async function generateStorySessionEpisode(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  args: StoryGenerationInput
): Promise<StorySessionDetail> {
  const nowStart = new Date().toISOString();
  db.prepare(
    "UPDATE story_sessions SET status = 'generating', error = NULL, updated_at = ? WHERE id = ? AND user_id = ?"
  ).run(nowStart, sessionId, userId);

  try {
    const raw = await args.provider.generateResponse(
      [
        {
          role: "system",
          content: storyGenerationSystemPrompt(args),
        },
        { role: "user", content: storyGenerationPrompt(args) },
      ],
      storyGenerationOptions(args)
    );
    let episode: StoryEpisodeManifest;
    try {
      episode = parseGeneratedStoryEpisode(raw, args);
    } catch (parseError) {
      const repairedRaw = await args.provider.generateResponse(
        [
          {
            role: "system",
            content: storyGenerationSystemPrompt(args),
          },
          { role: "user", content: storyGenerationRepairPrompt(args, raw, parseError) },
        ],
        storyGenerationRepairOptions(args)
      );
      try {
        episode = parseGeneratedStoryEpisode(repairedRaw, args);
      } catch (repairError) {
        const regeneratedRaw = await args.provider.generateResponse(
          [
            {
              role: "system",
              content: storyGenerationSystemPrompt(args),
            },
            { role: "user", content: storyGenerationSchemaRepairPrompt(args, repairError) },
          ],
          storyGenerationSchemaRepairOptions(args)
        );
        try {
          episode = parseGeneratedStoryEpisode(regeneratedRaw, args);
        } catch (schemaRepairError) {
          const looseRaw = await args.provider.generateResponse(
            [
              {
                role: "system",
                content: storyGenerationSystemPrompt(args),
              },
              { role: "user", content: storyGenerationLooseJsonPrompt(args, schemaRepairError) },
            ],
            storyGenerationLooseJsonOptions(args)
          );
          episode = parseGeneratedStoryEpisode(looseRaw, args);
        }
      }
    }
    const now = new Date().toISOString();
    const progress = createInitialStoryProgress(episode, now);
    const transcript = createInitialStoryTranscript(episode, randomId(12), now);
    const status: StorySessionStatus = progress.status === "complete" ? "complete" : "playing";
    db.prepare(
      `UPDATE story_sessions
          SET title = ?, status = ?, provider = ?, model = ?, episode_json = ?,
              progress_json = ?, transcript_json = ?, error = NULL, updated_at = ?
        WHERE id = ? AND user_id = ?`
    ).run(
      episode.title,
      status,
      args.providerName,
      args.model,
      JSON.stringify(episode),
      JSON.stringify(progress),
      JSON.stringify(transcript),
      now,
      sessionId,
      userId
    );
  } catch (error) {
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Story generation failed.";
    const title = stripGeneratingTitle(getStorySessionRow(db, userId, sessionId).title);
    db.prepare(
      "UPDATE story_sessions SET title = ?, status = 'failed', error = ?, updated_at = ? WHERE id = ? AND user_id = ?"
    ).run(title, message.slice(0, 1000), now, sessionId, userId);
  }

  return getStorySessionDetail(db, userId, sessionId);
}

function requirePlayableStorySession(row: StorySessionRow): {
  episode: StoryEpisodeManifest;
  progress: StorySessionProgress;
  transcript: StoryTranscriptEntry[];
} {
  if (row.status !== "playing") {
    throw new Error("Story session is not playable.");
  }
  const episodeRaw = parseJsonObject(row.episode_json);
  if (!episodeRaw) {
    throw new Error("Story episode is missing.");
  }
  const episode = validateStoryEpisodeManifest(episodeRaw);
  const progress = parseJsonObject(row.progress_json) as StorySessionProgress | null;
  if (!progress || typeof progress.currentSceneId !== "string") {
    throw new Error("Story progress is missing.");
  }
  const transcript = parseJsonArray(row.transcript_json).filter(
    (entry): entry is StoryTranscriptEntry =>
      !!entry &&
      typeof entry === "object" &&
      typeof (entry as { id?: unknown }).id === "string" &&
      typeof (entry as { text?: unknown }).text === "string"
  );
  return { episode, progress, transcript };
}

function persistStoryTransition(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  progress: StorySessionProgress,
  transcript: StoryTranscriptEntry[]
): void {
  const status: StorySessionStatus = progress.status === "complete" ? "complete" : "playing";
  db.prepare(
    `UPDATE story_sessions
        SET status = ?, progress_json = ?, transcript_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`
  ).run(
    status,
    JSON.stringify(progress),
    JSON.stringify(transcript),
    progress.updatedAt,
    sessionId,
    userId
  );
}

export function chooseStorySessionChoice(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  choiceId: string
): StorySessionDetail {
  const row = getStorySessionRow(db, userId, sessionId);
  const { episode, progress, transcript } = requirePlayableStorySession(row);
  const result = applyStoryChoice(episode, progress, choiceId, () => randomId(12));
  persistStoryTransition(db, userId, sessionId, result.progress, [
    ...transcript,
    ...result.transcriptEntries,
  ]);
  return getStorySessionDetail(db, userId, sessionId);
}

export function travelStorySession(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  locationId: string
): StorySessionDetail {
  const row = getStorySessionRow(db, userId, sessionId);
  const { episode, progress, transcript } = requirePlayableStorySession(row);
  const result = applyStoryTravel(episode, progress, locationId, () => randomId(12));
  persistStoryTransition(db, userId, sessionId, result.progress, [
    ...transcript,
    ...result.transcriptEntries,
  ]);
  return getStorySessionDetail(db, userId, sessionId);
}

export function pickupStorySessionItem(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  itemId: string
): StorySessionDetail {
  const row = getStorySessionRow(db, userId, sessionId);
  const { episode, progress, transcript } = requirePlayableStorySession(row);
  const result = applyStoryItemPickup(episode, progress, itemId, () => randomId(12));
  persistStoryTransition(db, userId, sessionId, result.progress, [
    ...transcript,
    ...result.transcriptEntries,
  ]);
  return getStorySessionDetail(db, userId, sessionId);
}

export function deleteStorySession(
  db: DatabaseSync,
  userId: string,
  sessionId: string
): boolean {
  const result = db
    .prepare("DELETE FROM story_sessions WHERE id = ? AND user_id = ?")
    .run(sessionId, userId);
  return Number(result.changes ?? 0) > 0;
}

import type { DatabaseSync } from "node:sqlite";
import {
  PRISM_DEFAULT_STORY_THEME,
  PRISM_DEFAULT_STORY_THEME_ID,
  STORY_BOT_COUNT_MAX,
  STORY_BOT_COUNT_MIN,
  applyStoryChoice,
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
} from "@localai/shared";
import { randomId } from "./security.ts";
import type { GenerateOptions, LlmProvider } from "./providers.ts";

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
  provider: "local" | "openai";
  model?: string | null;
}

export interface StoryGenerationInput {
  provider: LlmProvider;
  providerName: "local" | "openai";
  model: string;
  bots: StoryBotProfile[];
  premise?: string | null;
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
    premise ? "Story: generating" : "Surprise story: generating",
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

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first < 0 || last <= first) {
      throw new Error("Story generator did not return JSON.");
    }
    return JSON.parse(trimmed.slice(first, last + 1)) as unknown;
  }
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

function storyGenerationPrompt(args: StoryGenerationInput): string {
  const botLines = args.bots
    .map((bot) =>
      `- ${bot.id}: ${bot.name}. Persona: ${(bot.systemPrompt || "A distinct PRISM actor.").slice(0, 900)}`
    )
    .join("\n");
  const premise = args.premise?.trim()
    ? args.premise.trim()
    : "Surprise the player with a compact surreal adventure that fits the selected cast.";
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
    "- Items must be glyph-only and use categories: weapon, potion, key, clue, document, relic, tool, collectible.",
    "- Use only bundled asset ids: background_reference_exterior, background_reference_interior, background_reference_liminal, cutscene_reference, projection_fallback, sprite_fallback_silhouette.",
    "- Do not request or describe runtime raster image generation.",
    "- speakerBotId must be one of the selected bot ids, or null for narration.",
    "- spritePose may be idle, speaking, thinking, or action.",
    "- Location x/y values must be normalized 0-1.",
    "",
    "Return this exact top-level shape:",
    JSON.stringify(
      {
        id: "episode-slug",
        title: "Episode title",
        summary: "One sentence summary.",
        themeId: PRISM_DEFAULT_STORY_THEME_ID,
        startSceneId: "scene-1",
        locations: [
          {
            id: "location-id",
            name: "Location name",
            description: "Short description",
            x: 0.2,
            y: 0.4,
            discovered: true,
            backgroundAssetId: "background_reference_exterior",
          },
        ],
        items: [
          {
            id: "item-id",
            name: "Item name",
            category: "clue",
            description: "Short description",
            glyph: "◇",
          },
        ],
        scenes: [
          {
            id: "scene-1",
            title: "Scene title",
            locationId: "location-id",
            narration: "Visible story text.",
            speakerBotId: args.bots[0]?.id ?? null,
            speakerName: args.bots[0]?.name ?? "Narrator",
            spritePose: "speaking",
            backgroundAssetId: "background_reference_exterior",
            ending: false,
            choices: [
              {
                id: "choice-id",
                label: "Choice label",
                targetSceneId: "scene-2",
                revealLocationIds: [],
                grantItemIds: [],
                requireItemIds: [],
              },
            ],
          },
        ],
      },
      null,
      2
    ),
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
  return {
    model: args.model,
    temperature: Math.max(0.35, Math.min(0.85, avgTemperature)),
    maxTokens: 5000,
  };
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
          content:
            "You are PRISM Story Mode's episode generator. You output strict JSON only and never include markdown fences.",
        },
        { role: "user", content: storyGenerationPrompt(args) },
      ],
      storyGenerationOptions(args)
    );
    const parsed = extractJsonObject(raw);
    const episodeRaw =
      parsed && typeof parsed === "object" && "episode" in parsed
        ? (parsed as { episode?: unknown }).episode
        : parsed;
    const episode = validateStoryEpisodeManifest(episodeRaw);
    validateEpisodeBotReferences(episode, args.bots.map((bot) => bot.id));
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
    db.prepare(
      "UPDATE story_sessions SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND user_id = ?"
    ).run(message.slice(0, 1000), now, sessionId, userId);
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

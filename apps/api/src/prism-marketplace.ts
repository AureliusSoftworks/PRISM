import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import {
  DEFAULT_BOT_FACE_BLINK_BAR,
  DEFAULT_BOT_FACE_BLINK_OFFSET_X,
  DEFAULT_BOT_FACE_BLINK_OFFSET_Y,
  DEFAULT_BOT_FACE_BLINK_ROTATION_DEG,
  DEFAULT_BOT_FACE_BLINK_SCALE,
  DEFAULT_BOT_FACE_EYE_COUNT,
  DEFAULT_BOT_FACE_EYE_SPACING,
  DEFAULT_BOT_FACE_GLYPH_ANIMATION,
  normalizeBotAudioVoiceProfileV1,
  normalizeBotFaceBlinkBar,
  normalizeBotFaceBlinkOffsetX,
  normalizeBotFaceBlinkOffsetY,
  normalizeBotFaceBlinkRotationDeg,
  normalizeBotFaceBlinkScale,
  normalizeBotFaceEyeCharacter,
  normalizeBotFaceEyeCount,
  normalizeBotFaceEyeSpacing,
  normalizeBotFaceEyeOffsetX,
  normalizeBotFaceEyeOffsetY,
  normalizeBotFaceEyeRotationDeg,
  normalizeBotFaceEyeScale,
  normalizeBotFaceFontId,
  normalizeBotFaceFontWeight,
  normalizeBotFaceGlyphAnimation,
  normalizeBotFaceMouthCharacter,
  normalizeBotFaceMouthOffsetX,
  normalizeBotFaceMouthOffsetY,
  normalizeBotFaceMouthRotationDeg,
  normalizeBotFaceMouthScale,
  normalizeBotFaceThinkingFrames,
  normalizeBotFaceThinkingOffsetX,
  normalizeBotFaceThinkingOffsetY,
  normalizeBotFaceThinkingScale,
  normalizeBotNamePronunciation,
  normalizeBotPowersV1,
  normalizeBotSelfReferral,
  normalizeOptionalBotAudioVoiceProfileV1,
  parseStoredBotAvatarDetailsV1,
  serializeBotAudioVoiceProfileV1,
  serializeBotAvatarDetailsV1,
  serializeBotPowersV1,
  serializeStoredBotPrompt,
  type BotProfileFields,
} from "@localai/shared";
import { listLibraryGroups, replaceLibraryGroups } from "./library-groups.ts";
import { restoreMemory } from "./memory.ts";
import { randomId } from "./security.ts";

const API_SOURCE_DIR = dirname(fileURLToPath(import.meta.url));
const MARKETPLACE_ROOT = resolve(
  API_SOURCE_DIR,
  "../../../apps/web/public/bot-marketplace",
);
const MARKETPLACE_MANIFEST_PATH = join(MARKETPLACE_ROOT, "manifest.json");
const MARKETPLACE_SCHEMA = "prism-bot-marketplace-v1";
const BOT_ARCHIVE_SCHEMA = "prism-bot-export-v2";
const BOT_HASH_PATTERN = /^[a-f0-9]{32}$/u;

interface MarketplaceEntry {
  id: string;
  name: string;
  description: string;
  botHash: string;
  bundlePath: string;
  themeIds: string[];
}

interface MarketplaceTheme {
  id: string;
  name: string;
  description: string;
  botIds: string[];
}

interface MarketplaceCatalog {
  entries: MarketplaceEntry[];
  themes: MarketplaceTheme[];
}

interface MarketplaceArchiveBot {
  name: string;
  namePronunciation?: unknown;
  selfReferral?: unknown;
  color?: unknown;
  glyph?: unknown;
  avatarDetails?: unknown;
  temperature?: unknown;
  maxTokens?: unknown;
  topP?: unknown;
  topK?: unknown;
  repetitionPenalty?: unknown;
  faceEyesFont?: unknown;
  faceEyeCharacter?: unknown;
  faceEyeAnimation?: unknown;
  faceMouthFont?: unknown;
  faceMouthCharacter?: unknown;
  faceMouthAnimation?: unknown;
  faceMouthCoffeePucker?: unknown;
  faceFontWeight?: unknown;
  faceEyeScale?: unknown;
  faceEyeOffsetX?: unknown;
  faceEyeOffsetY?: unknown;
  faceEyeRotationDeg?: unknown;
  faceEyeCount?: unknown;
  faceEyeSpacing?: unknown;
  faceMouthScale?: unknown;
  faceMouthOffsetX?: unknown;
  faceMouthOffsetY?: unknown;
  faceMouthRotationDeg?: unknown;
  faceBlinkBar?: unknown;
  faceBlinkCount?: unknown;
  faceBlinkScale?: unknown;
  faceBlinkOffsetX?: unknown;
  faceBlinkOffsetY?: unknown;
  faceBlinkRotationDeg?: unknown;
  faceThinkingFrames?: unknown;
  faceThinkingScale?: unknown;
  faceThinkingOffsetX?: unknown;
  faceThinkingOffsetY?: unknown;
  onlineEnabled?: unknown;
  flirtEnabled?: unknown;
  chatEnabled?: unknown;
  voicePreviewLine?: unknown;
  authoredAudioVoiceProfile?: unknown;
  audioVoiceProfileOverride?: unknown;
  powers?: unknown;
}

export interface PrismMarketplacePreparedArchive {
  entry: MarketplaceEntry;
  name: string;
  systemPrompt: string;
  bot: MarketplaceArchiveBot;
  memories: string[];
}

export interface PrismMarketplaceSelection {
  selectionType: "entry" | "theme";
  selectionId: string;
  label: string;
  description: string;
  themeId: string | null;
  entries: Array<{
    id: string;
    name: string;
    botHash: string;
  }>;
  installedEntryIds: string[];
  missingEntryIds: string[];
}

export interface PrismMarketplaceInstallResult {
  installed: Array<{ entryId: string; botId: string; name: string }>;
  skippedEntryIds: string[];
  groupId: string | null;
  previousGroups: ReturnType<typeof listLibraryGroups>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map(text).filter((candidate) => candidate.length > 0)),
  );
}

function loadCatalog(): MarketplaceCatalog {
  const raw = JSON.parse(readFileSync(MARKETPLACE_MANIFEST_PATH, "utf8")) as unknown;
  const manifest = record(raw);
  if (!manifest || manifest.schema !== MARKETPLACE_SCHEMA) {
    throw new Error("The bundled Marketplace catalog is unavailable.");
  }
  const entries = (Array.isArray(manifest.bots) ? manifest.bots : []).flatMap(
    (candidate): MarketplaceEntry[] => {
      const row = record(candidate);
      if (!row || row.marketplaceVisible === false || row.deprecated === true) {
        return [];
      }
      // Branch-locked shelves are developer content and are not part of normal
      // product orchestration.
      if (row.branchLock !== undefined && row.branchLock !== null) return [];
      const id = text(row.id).toLowerCase();
      const name = text(row.name);
      const botHash = text(row.botHash).toLowerCase();
      const bundlePath = text(row.bundlePath);
      if (!id || !name || !BOT_HASH_PATTERN.test(botHash) || !bundlePath) {
        return [];
      }
      return [
        {
          id,
          name,
          description: text(row.description),
          botHash,
          bundlePath,
          themeIds: stringArray(row.themeIds).map((value) =>
            value.toLowerCase(),
          ),
        },
      ];
    },
  );
  const entryIds = new Set(entries.map((entry) => entry.id));
  const themes = (Array.isArray(manifest.themes) ? manifest.themes : []).flatMap(
    (candidate): MarketplaceTheme[] => {
      const row = record(candidate);
      if (!row || (row.branchLock !== undefined && row.branchLock !== null)) {
        return [];
      }
      const id = text(row.id).toLowerCase();
      const name = text(row.name);
      if (!id || !name) return [];
      return [
        {
          id,
          name,
          description: text(row.description),
          botIds: stringArray(row.botIds)
            .map((value) => value.toLowerCase())
            .filter((value) => entryIds.has(value)),
        },
      ];
    },
  );
  return { entries, themes };
}

function normalizeQuery(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/\b(?:the|from|in|on|marketplace|bot|bots|pack|theme)\b/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function uniqueMatch<T extends { id: string; name: string }>(
  values: readonly T[],
  query: string,
): T | null {
  const normalized = normalizeQuery(query);
  const exact = values.filter(
    (value) =>
      normalizeQuery(value.id) === normalized ||
      normalizeQuery(value.name) === normalized,
  );
  if (exact.length === 1) return exact[0]!;
  const fuzzy = values.filter((value) => {
    const id = normalizeQuery(value.id);
    const name = normalizeQuery(value.name);
    return (
      id.includes(normalized) ||
      name.includes(normalized) ||
      normalized.includes(id) ||
      normalized.includes(name)
    );
  });
  return fuzzy.length === 1 ? fuzzy[0]! : null;
}

export function resolvePrismMarketplaceSelection(
  db: DatabaseSync,
  userId: string,
  query: string,
): PrismMarketplaceSelection {
  const catalog = loadCatalog();
  const normalized = normalizeQuery(query);
  const theme =
    /\b(?:pack|theme|collection|group|all|everything|originals)\b/iu.test(
      query,
    ) || normalized === "starter"
      ? uniqueMatch(
          catalog.themes,
          normalized === "starter" ? "originals" : query,
        )
      : null;
  const entry = theme ? null : uniqueMatch(catalog.entries, query);
  if (!theme && !entry) {
    throw new Error(
      "Name one exact Marketplace bot or pack so Prism can preview the install.",
    );
  }
  const selectedEntries = theme
    ? theme.botIds.flatMap((id) => {
        const found = catalog.entries.find((candidate) => candidate.id === id);
        return found ? [found] : [];
      })
    : [entry!];
  const installedHashes = new Set(
    (
      db
        .prepare(
          "SELECT export_hash FROM bots WHERE user_id = ? AND export_hash IS NOT NULL",
        )
        .all(userId) as Array<{ export_hash: string | null }>
    )
      .map((row) => text(row.export_hash).toLowerCase())
      .filter(Boolean),
  );
  const installedEntryIds = selectedEntries
    .filter((candidate) => installedHashes.has(candidate.botHash))
    .map((candidate) => candidate.id);
  const missingEntryIds = selectedEntries
    .filter((candidate) => !installedHashes.has(candidate.botHash))
    .map((candidate) => candidate.id);
  return {
    selectionType: theme ? "theme" : "entry",
    selectionId: theme?.id ?? entry!.id,
    label: theme?.name ?? entry!.name,
    description: theme?.description ?? entry!.description,
    themeId: theme?.id ?? entry!.themeIds[0] ?? null,
    entries: selectedEntries.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      botHash: candidate.botHash,
    })),
    installedEntryIds,
    missingEntryIds,
  };
}

function archiveFilePath(bundlePath: string): string {
  const relative = bundlePath.replace(/^\/?bot-marketplace\//u, "");
  const absolute = resolve(MARKETPLACE_ROOT, relative);
  if (
    absolute !== MARKETPLACE_ROOT &&
    !absolute.startsWith(`${MARKETPLACE_ROOT}/`)
  ) {
    throw new Error("Marketplace bundle path escaped the catalog root.");
  }
  return absolute;
}

function parseMarketplaceArchive(
  entry: MarketplaceEntry,
): PrismMarketplacePreparedArchive {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(readFileSync(archiveFilePath(entry.bundlePath)));
  } catch {
    throw new Error(`${entry.name}'s bundled Marketplace archive is invalid.`);
  }
  const unsupported = Object.keys(files).filter(
    (name) => name !== "bot.json" && name !== "memories.json",
  );
  if (unsupported.length > 0 || !files["bot.json"]) {
    throw new Error(`${entry.name}'s Marketplace archive has unsupported files.`);
  }
  const botJson = record(JSON.parse(strFromU8(files["bot.json"]!)));
  const bot = record(botJson?.bot);
  if (
    !botJson ||
    botJson.schema !== BOT_ARCHIVE_SCHEMA ||
    text(botJson.botHash).toLowerCase() !== entry.botHash ||
    !bot ||
    !text(bot.name)
  ) {
    throw new Error(`${entry.name}'s Marketplace archive failed validation.`);
  }
  const memories = files["memories.json"]
    ? JSON.parse(strFromU8(files["memories.json"]!))
    : [];
  if (
    !Array.isArray(memories) ||
    memories.some((memory) => typeof memory !== "string")
  ) {
    throw new Error(`${entry.name}'s bundled memories failed validation.`);
  }
  const profile = record(botJson.profile);
  const name = text(bot.name);
  const systemPrompt = profile
    ? serializeStoredBotPrompt(profile as unknown as BotProfileFields, name)
    : text(botJson.systemPrompt);
  return {
    entry,
    name,
    systemPrompt,
    bot: bot as unknown as MarketplaceArchiveBot,
    memories: memories.map((memory) => memory.trim()).filter(Boolean),
  };
}

export function preparePrismMarketplaceInstall(
  selection: PrismMarketplaceSelection,
): PrismMarketplacePreparedArchive[] {
  const catalog = loadCatalog();
  return selection.missingEntryIds.map((entryId) => {
    const entry = catalog.entries.find((candidate) => candidate.id === entryId);
    if (!entry) throw new Error("A Marketplace item changed after preview.");
    return parseMarketplaceArchive(entry);
  });
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalText(value: unknown): string | null {
  return text(value) || null;
}

function insertMarketplaceBot(args: {
  db: DatabaseSync;
  userId: string;
  archive: PrismMarketplacePreparedArchive;
  now: string;
}): string {
  const { bot, entry, name, systemPrompt } = args.archive;
  const botId = randomId(12);
  const avatarDetails = parseStoredBotAvatarDetailsV1(bot.avatarDetails);
  const thinkingFrames = normalizeBotFaceThinkingFrames(
    bot.faceThinkingFrames,
  );
  args.db
    .prepare(
      `INSERT INTO bots
        (id, user_id, name, name_pronunciation, self_referral, system_prompt,
         voice_preview_line, export_hash, powers_json, temperature, max_tokens,
         top_p, top_k, repetition_penalty, color, glyph, avatar_details_json,
         face_eyes_font, face_eye_character, face_eye_animation,
         face_mouth_font, face_mouth_character, face_mouth_animation,
         face_mouth_coffee_pucker, face_font_weight, face_eye_scale,
         face_eye_offset_x, face_eye_offset_y, face_eye_rotation_deg,
         face_eye_count, face_mouth_scale, face_mouth_offset_x,
         face_mouth_offset_y, face_mouth_rotation_deg, face_blink_bar,
         face_blink_scale, face_blink_offset_x, face_blink_offset_y,
         face_blink_rotation_deg, face_thinking_frames, face_thinking_scale,
         face_thinking_offset_x, face_thinking_offset_y,
         authored_audio_voice_profile, audio_voice_profile_override,
         chat_enabled, online_enabled, flirt_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      botId,
      args.userId,
      name,
      normalizeBotNamePronunciation(bot.namePronunciation),
      normalizeBotSelfReferral(bot.selfReferral),
      systemPrompt,
      optionalText(bot.voicePreviewLine),
      entry.botHash,
      serializeBotPowersV1(normalizeBotPowersV1(bot.powers)),
      numberOr(bot.temperature, 0.7),
      Math.max(64, Math.round(numberOr(bot.maxTokens, 2048))),
      numberOr(bot.topP, 1),
      Math.round(numberOr(bot.topK, 40)),
      numberOr(bot.repetitionPenalty, 1.1),
      optionalText(bot.color),
      optionalText(bot.glyph),
      avatarDetails ? serializeBotAvatarDetailsV1(avatarDetails) : null,
      normalizeBotFaceFontId(bot.faceEyesFont),
      normalizeBotFaceEyeCharacter(bot.faceEyeCharacter),
      normalizeBotFaceGlyphAnimation(bot.faceEyeAnimation) ??
        DEFAULT_BOT_FACE_GLYPH_ANIMATION,
      normalizeBotFaceFontId(bot.faceMouthFont),
      normalizeBotFaceMouthCharacter(bot.faceMouthCharacter),
      normalizeBotFaceGlyphAnimation(bot.faceMouthAnimation) ??
        DEFAULT_BOT_FACE_GLYPH_ANIMATION,
      bot.faceMouthCoffeePucker === false ? 0 : 1,
      normalizeBotFaceFontWeight(bot.faceFontWeight),
      normalizeBotFaceEyeScale(bot.faceEyeScale),
      normalizeBotFaceEyeOffsetX(bot.faceEyeOffsetX),
      normalizeBotFaceEyeOffsetY(bot.faceEyeOffsetY),
      normalizeBotFaceEyeRotationDeg(bot.faceEyeRotationDeg),
      normalizeBotFaceEyeCount(bot.faceEyeCount) ?? DEFAULT_BOT_FACE_EYE_COUNT,
      normalizeBotFaceMouthScale(bot.faceMouthScale),
      normalizeBotFaceMouthOffsetX(bot.faceMouthOffsetX),
      normalizeBotFaceMouthOffsetY(bot.faceMouthOffsetY),
      normalizeBotFaceMouthRotationDeg(bot.faceMouthRotationDeg),
      normalizeBotFaceBlinkBar(bot.faceBlinkBar) ?? DEFAULT_BOT_FACE_BLINK_BAR,
      normalizeBotFaceBlinkScale(bot.faceBlinkScale) ??
        DEFAULT_BOT_FACE_BLINK_SCALE,
      normalizeBotFaceBlinkOffsetX(bot.faceBlinkOffsetX) ??
        DEFAULT_BOT_FACE_BLINK_OFFSET_X,
      normalizeBotFaceBlinkOffsetY(bot.faceBlinkOffsetY) ??
        DEFAULT_BOT_FACE_BLINK_OFFSET_Y,
      normalizeBotFaceBlinkRotationDeg(bot.faceBlinkRotationDeg) ??
        DEFAULT_BOT_FACE_BLINK_ROTATION_DEG,
      thinkingFrames ? JSON.stringify(thinkingFrames) : null,
      normalizeBotFaceThinkingScale(bot.faceThinkingScale),
      normalizeBotFaceThinkingOffsetX(bot.faceThinkingOffsetX),
      normalizeBotFaceThinkingOffsetY(bot.faceThinkingOffsetY),
      serializeBotAudioVoiceProfileV1(
        normalizeBotAudioVoiceProfileV1(bot.authoredAudioVoiceProfile),
      ),
      normalizeOptionalBotAudioVoiceProfileV1(bot.audioVoiceProfileOverride)
        ? serializeBotAudioVoiceProfileV1(
            normalizeOptionalBotAudioVoiceProfileV1(
              bot.audioVoiceProfileOverride,
            )!,
          )
        : null,
      bot.chatEnabled === false ? 0 : 1,
      bot.onlineEnabled === false ? 0 : 1,
      bot.flirtEnabled === true ? 1 : 0,
      args.now,
      args.now,
    );
  args.db
    .prepare("UPDATE bots SET face_eye_spacing = ? WHERE id = ? AND user_id = ?")
    .run(
      normalizeBotFaceEyeSpacing(bot.faceEyeSpacing) ??
        DEFAULT_BOT_FACE_EYE_SPACING,
      botId,
      args.userId,
    );
  args.db
    .prepare("UPDATE bots SET face_blink_count = ? WHERE id = ? AND user_id = ?")
    .run(
      normalizeBotFaceEyeCount(bot.faceBlinkCount) ??
        (normalizeBotFaceEyeCharacter(bot.faceEyeCharacter) !== null
          ? normalizeBotFaceEyeCount(bot.faceEyeCount)
          : null) ??
        DEFAULT_BOT_FACE_EYE_COUNT,
      botId,
      args.userId,
    );
  return botId;
}

export async function installPrismMarketplaceSelection(args: {
  db: DatabaseSync;
  userId: string;
  userKey: Buffer;
  selection: PrismMarketplaceSelection;
  archives: PrismMarketplacePreparedArchive[];
  now: string;
}): Promise<PrismMarketplaceInstallResult> {
  const previousGroups = listLibraryGroups(args.db, args.userId);
  const installed: PrismMarketplaceInstallResult["installed"] = [];
  try {
    for (const archive of args.archives) {
      const duplicate = args.db
        .prepare(
          "SELECT id FROM bots WHERE user_id = ? AND export_hash = ? LIMIT 1",
        )
        .get(args.userId, archive.entry.botHash) as { id?: string } | undefined;
      if (duplicate?.id) continue;
      const botId = insertMarketplaceBot({
        db: args.db,
        userId: args.userId,
        archive,
        now: args.now,
      });
      installed.push({ entryId: archive.entry.id, botId, name: archive.name });
      for (const memory of archive.memories) {
        await restoreMemory(args.db, args.userId, args.userKey, {
          text: memory,
          botId,
          source: "compiled",
          category: "general",
          sourceMessageIds: [],
        });
      }
    }
    let groupId: string | null = null;
    if (installed.length > 0 && args.selection.themeId) {
      groupId = `group:marketplace:${args.selection.themeId}`;
      const existing = previousGroups.find((group) => group.id === groupId);
      const installedIds = installed.map((entry) => entry.botId);
      replaceLibraryGroups({
        db: args.db,
        userId: args.userId,
        groups: [
          ...previousGroups.filter((group) => group.id !== groupId),
          {
            id: groupId,
            name:
              args.selection.selectionType === "theme"
                ? args.selection.label
                : existing?.name ?? "Marketplace",
            description:
              args.selection.description ||
              existing?.description ||
              "Bots installed from the Prism Marketplace.",
            botIds: Array.from(
              new Set([...(existing?.botIds ?? []), ...installedIds]),
            ),
            marketplaceThemeId: args.selection.themeId,
            deleteProtected: existing?.deleteProtected ?? false,
            deleteProtectionByBotId:
              existing?.deleteProtectionByBotId ?? {},
            builtIn: false,
            createdAt: existing?.createdAt ?? args.now,
            updatedAt: args.now,
          },
        ],
        now: new Date(args.now),
      });
    }
    return {
      installed,
      skippedEntryIds: args.selection.installedEntryIds,
      groupId,
      previousGroups,
    };
  } catch (error) {
    for (const created of installed) {
      args.db
        .prepare("DELETE FROM memories WHERE user_id = ? AND bot_id = ?")
        .run(args.userId, created.botId);
      args.db
        .prepare("DELETE FROM bots WHERE user_id = ? AND id = ?")
        .run(args.userId, created.botId);
    }
    replaceLibraryGroups({
      db: args.db,
      userId: args.userId,
      groups: previousGroups,
    });
    throw error;
  }
}

export function undoPrismMarketplaceInstall(args: {
  db: DatabaseSync;
  userId: string;
  bots: ReadonlyArray<{ botId: string; createdRevision: string }>;
  groupId: string | null;
  groupRevision: string | null;
  previousGroups: ReturnType<typeof listLibraryGroups>;
}): void {
  for (const bot of args.bots) {
    const current = args.db
      .prepare(
        "SELECT updated_at FROM bots WHERE user_id = ? AND id = ?",
      )
      .get(args.userId, bot.botId) as { updated_at?: string } | undefined;
    if (!current || current.updated_at !== bot.createdRevision) {
      throw new Error(
        "A Marketplace bot changed after installation, so Prism stopped the undo.",
      );
    }
  }
  if (args.groupId && args.groupRevision) {
    const group = listLibraryGroups(args.db, args.userId).find(
      (candidate) => candidate.id === args.groupId,
    );
    if (!group || group.updatedAt !== args.groupRevision) {
      throw new Error(
        "The Marketplace Library group changed after installation, so Prism stopped the undo.",
      );
    }
  }
  for (const bot of args.bots) {
    args.db
      .prepare("DELETE FROM memories WHERE user_id = ? AND bot_id = ?")
      .run(args.userId, bot.botId);
    args.db
      .prepare("DELETE FROM bots WHERE user_id = ? AND id = ?")
      .run(args.userId, bot.botId);
  }
  replaceLibraryGroups({
    db: args.db,
    userId: args.userId,
    groups: args.previousGroups,
    manageTransaction: false,
  });
}

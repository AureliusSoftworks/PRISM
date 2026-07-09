import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  type BotFaceBlinkBar,
  type BotFaceFontId,
  type BotFaceThinkingFrames,
  type BotProfileFields,
} from "@localai/shared";

export const PRISM_BOT_ARCHIVE_SCHEMA = "prism-bot-export-v2";
export const BOT_ARCHIVE_MIME = "application/vnd.prism.bot+zip";
export const BOT_ARCHIVE_BOT_ENTRY_NAME = "bot.json";
export const BOT_ARCHIVE_MEMORIES_ENTRY_NAME = "memories.json";

const ALLOWED_BOT_ARCHIVE_ENTRIES = new Set([
  BOT_ARCHIVE_BOT_ENTRY_NAME,
  BOT_ARCHIVE_MEMORIES_ENTRY_NAME,
]);

export interface PrismBotArchiveJson {
  schema: typeof PRISM_BOT_ARCHIVE_SCHEMA;
  botHash?: string;
  exportedAt: string;
  bot: {
    name: string;
    color?: string | null;
    glyph?: string | null;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    repetitionPenalty?: number;
    localModel?: string | null;
    onlineModel?: string | null;
    localImageModel?: string | null;
    openaiImageModel?: string | null;
    faceEyesFont?: BotFaceFontId | null;
    faceEyeCharacter?: string | null;
    faceMouthFont?: BotFaceFontId | null;
    faceFontWeight?: number | null;
    faceEyeScale?: number | null;
    faceEyeOffsetY?: number | null;
    faceMouthOffsetY?: number | null;
    faceBlinkBar?: BotFaceBlinkBar | null;
    faceThinkingFrames?: BotFaceThinkingFrames | null;
    onlineEnabled?: boolean;
    flirtEnabled?: boolean;
    chatEnabled?: boolean;
  };
  profile?: BotProfileFields;
  systemPrompt?: string;
}

export interface ParsedPrismBotArchive {
  botJson: PrismBotArchiveJson;
  memories: string[];
}

export function createPrismBotArchive(args: {
  botJson: PrismBotArchiveJson;
  memories: readonly string[];
}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    [BOT_ARCHIVE_BOT_ENTRY_NAME]: strToU8(`${JSON.stringify(args.botJson, null, 2)}\n`),
  };
  const memories = args.memories
    .map((memory) => memory.trim())
    .filter((memory) => memory.length > 0);
  if (memories.length > 0) {
    files[BOT_ARCHIVE_MEMORIES_ENTRY_NAME] = strToU8(`${JSON.stringify(memories, null, 2)}\n`);
  }
  return zipSync(files, { level: 6 });
}

export function parsePrismBotArchive(bytes: Uint8Array): ParsedPrismBotArchive {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error("Bot import must be a zipped .bot archive.");
  }

  const entryNames = Object.keys(entries);
  const unsupported = entryNames.filter((name) => !ALLOWED_BOT_ARCHIVE_ENTRIES.has(name));
  if (unsupported.length > 0) {
    throw new Error("Bot archive contains unsupported files.");
  }

  const botEntry = entries[BOT_ARCHIVE_BOT_ENTRY_NAME];
  if (!botEntry) {
    throw new Error("Bot archive is missing bot.json.");
  }

  const botJson = parseBotJson(botEntry);

  return {
    botJson,
    memories: parseMemoriesJson(entries[BOT_ARCHIVE_MEMORIES_ENTRY_NAME]),
  };
}

function parseBotJson(bytes: Uint8Array): PrismBotArchiveJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripOptionalLeadingUtf8Bom(strFromU8(bytes)));
  } catch {
    throw new Error("Could not read bot.json.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("bot.json must be a JSON object.");
  }
  const botJson = parsed as Partial<PrismBotArchiveJson>;
  if (botJson.schema !== PRISM_BOT_ARCHIVE_SCHEMA) {
    throw new Error("Unsupported bot archive schema.");
  }
  if (!botJson.bot || typeof botJson.bot.name !== "string" || !botJson.bot.name.trim()) {
    throw new Error("bot.json is missing a valid bot name.");
  }
  return botJson as PrismBotArchiveJson;
}

function parseMemoriesJson(bytes: Uint8Array | undefined): string[] {
  if (!bytes) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripOptionalLeadingUtf8Bom(strFromU8(bytes)));
  } catch {
    throw new Error("Could not read memories.json.");
  }
  if (!Array.isArray(parsed) || parsed.some((memory) => typeof memory !== "string")) {
    throw new Error("memories.json must be an array of strings.");
  }
  return parsed
    .map((memory) => memory.trim())
    .filter((memory) => memory.length > 0);
}

function stripOptionalLeadingUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

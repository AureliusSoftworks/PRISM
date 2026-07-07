import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { BotFaceFontId, BotProfileFields } from "@localai/shared";

export const PRISM_BOT_ARCHIVE_SCHEMA = "prism-bot-export-v2";
export const BOT_ARCHIVE_MIME = "application/vnd.prism.bot+zip";
export const BOT_ARCHIVE_BOT_ENTRY_NAME = "bot.json";
export const BOT_ARCHIVE_MEMORIES_ENTRY_NAME = "memories.json";
export const BOT_ARCHIVE_ACCESSORY_ENTRY_NAME = "accessory.png";

const ALLOWED_BOT_ARCHIVE_ENTRIES = new Set([
  BOT_ARCHIVE_BOT_ENTRY_NAME,
  BOT_ARCHIVE_MEMORIES_ENTRY_NAME,
  BOT_ARCHIVE_ACCESSORY_ENTRY_NAME,
]);

export const DEFAULT_BOT_ARCHIVE_ACCESSORY_PLACEMENT = {
  anchor: "avatar",
  xPct: 0,
  yPct: 0,
  sizePct: 100,
} as const;

export interface PrismBotArchiveAccessoryMetadata {
  file: typeof BOT_ARCHIVE_ACCESSORY_ENTRY_NAME;
  placement: typeof DEFAULT_BOT_ARCHIVE_ACCESSORY_PLACEMENT;
}

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
    faceMouthFont?: BotFaceFontId | null;
    faceFontWeight?: number | null;
    onlineEnabled?: boolean;
    flirtEnabled?: boolean;
    chatEnabled?: boolean;
  };
  profile?: BotProfileFields;
  systemPrompt?: string;
  accessory?: PrismBotArchiveAccessoryMetadata | null;
}

export interface ParsedPrismBotArchive {
  botJson: PrismBotArchiveJson;
  memories: string[];
  accessoryPng: Uint8Array | null;
}

export function createPrismBotArchive(args: {
  botJson: PrismBotArchiveJson;
  memories: readonly string[];
  accessoryPng?: Uint8Array | null;
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
  if (args.accessoryPng && args.accessoryPng.byteLength > 0) {
    files[BOT_ARCHIVE_ACCESSORY_ENTRY_NAME] = args.accessoryPng;
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
  const accessoryPng = entries[BOT_ARCHIVE_ACCESSORY_ENTRY_NAME] ?? null;
  validateAccessoryPairing(botJson, accessoryPng);

  return {
    botJson,
    memories: parseMemoriesJson(entries[BOT_ARCHIVE_MEMORIES_ENTRY_NAME]),
    accessoryPng,
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

function validateAccessoryPairing(
  botJson: PrismBotArchiveJson,
  accessoryPng: Uint8Array | null
): void {
  if (botJson.accessory !== null && botJson.accessory !== undefined) {
    const placement = botJson.accessory.placement;
    if (
      botJson.accessory.file !== BOT_ARCHIVE_ACCESSORY_ENTRY_NAME ||
      placement?.anchor !== DEFAULT_BOT_ARCHIVE_ACCESSORY_PLACEMENT.anchor ||
      placement.xPct !== DEFAULT_BOT_ARCHIVE_ACCESSORY_PLACEMENT.xPct ||
      placement.yPct !== DEFAULT_BOT_ARCHIVE_ACCESSORY_PLACEMENT.yPct ||
      placement.sizePct !== DEFAULT_BOT_ARCHIVE_ACCESSORY_PLACEMENT.sizePct
    ) {
      throw new Error("bot.json has invalid accessory metadata.");
    }
    if (!accessoryPng || accessoryPng.byteLength === 0) {
      throw new Error("bot.json references accessory.png, but the file is missing.");
    }
    return;
  }
  if (accessoryPng && accessoryPng.byteLength > 0) {
    throw new Error("accessory.png requires matching bot.json accessory metadata.");
  }
}

function stripOptionalLeadingUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

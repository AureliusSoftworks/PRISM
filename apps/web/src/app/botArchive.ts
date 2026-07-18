import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  DEFAULT_BOT_FACE_GLYPH_ANIMATION,
  normalizeBotFaceGlyphAnimation,
  parseBotAvatarDetailsV1,
  normalizeBotNamePronunciation,
  normalizeBotPowersV1,
  type BotAvatarDetailsV1,
  type BotFaceBlinkBar,
  type BotFaceEyeCount,
  type BotFaceFontId,
  type BotFaceGlyphAnimation,
  type BotFaceThinkingFrames,
  type BotProfileFields,
  type BotAudioVoiceProfileV1,
  type BotPowerV1,
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
    namePronunciation?: string;
    color?: string | null;
    glyph?: string | null;
    avatarDetails?: BotAvatarDetailsV1 | null;
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
    faceEyeAnimation?: BotFaceGlyphAnimation | null;
    faceMouthFont?: BotFaceFontId | null;
    faceMouthCharacter?: string | null;
    faceMouthAnimation?: BotFaceGlyphAnimation | null;
    faceMouthCoffeePucker?: boolean;
    faceFontWeight?: number | null;
    faceEyeScale?: number | null;
    faceEyeOffsetX?: number | null;
    faceEyeOffsetY?: number | null;
    faceEyeRotationDeg?: number | null;
    faceEyeCount?: BotFaceEyeCount | number | null;
    faceMouthScale?: number | null;
    faceMouthOffsetX?: number | null;
    faceMouthOffsetY?: number | null;
    faceMouthRotationDeg?: number | null;
    faceBlinkBar?: BotFaceBlinkBar | null;
    faceBlinkScale?: number | null;
    faceBlinkOffsetX?: number | null;
    faceBlinkOffsetY?: number | null;
    faceThinkingFrames?: BotFaceThinkingFrames | null;
    onlineEnabled?: boolean;
    flirtEnabled?: boolean;
    chatEnabled?: boolean;
    /** Authored spoken sample copy; audio is synthesized by the importing installation. */
    voicePreviewLine?: string | null;
    /** Portable profile values only; account voice-bank mappings are never exported. */
    authoredAudioVoiceProfile?: BotAudioVoiceProfileV1;
    audioVoiceProfileOverride?: BotAudioVoiceProfileV1 | null;
    powers?: BotPowerV1[];
  };
  profile?: BotProfileFields;
  systemPrompt?: string;
}

export interface ParsedPrismBotArchive {
  botJson: PrismBotArchiveJson;
  memories: string[];
}

export function resolvePrismBotArchiveFaceGlyphAnimation(
  value: unknown,
): BotFaceGlyphAnimation {
  return (
    normalizeBotFaceGlyphAnimation(value) ?? DEFAULT_BOT_FACE_GLYPH_ANIMATION
  );
}

export function createPrismBotArchive(args: {
  botJson: PrismBotArchiveJson;
  memories: readonly string[];
}): Uint8Array {
  const botJson = validateBotJson(args.botJson);
  const files: Record<string, Uint8Array> = {
    [BOT_ARCHIVE_BOT_ENTRY_NAME]: strToU8(`${JSON.stringify(botJson, null, 2)}\n`),
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
  if (entryNames.some((name) => name.trim().toLowerCase() === "accessory.png")) {
    throw new Error("Legacy accessory.png bot archives are not supported.");
  }
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
  return validateBotJson(parsed);
}

function validateBotJson(parsed: unknown): PrismBotArchiveJson {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("bot.json must be a JSON object.");
  }
  const rootRecord = parsed as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(rootRecord, "accessory")) {
    if (rootRecord.accessory !== null) {
      throw new Error("bot.json contains unsupported non-null legacy accessory metadata.");
    }
  }
  const canonicalRoot = { ...rootRecord };
  delete canonicalRoot.accessory;
  const botJson = canonicalRoot as Partial<PrismBotArchiveJson>;
  if (botJson.schema !== PRISM_BOT_ARCHIVE_SCHEMA) {
    throw new Error("Unsupported bot archive schema.");
  }
  if (!botJson.bot || typeof botJson.bot.name !== "string" || !botJson.bot.name.trim()) {
    throw new Error("bot.json is missing a valid bot name.");
  }
  rejectLegacyAvatarMetadata(canonicalRoot, false);
  if (botJson.profile && typeof botJson.profile === "object" && !Array.isArray(botJson.profile)) {
    rejectLegacyAvatarMetadata(
      botJson.profile as unknown as Record<string, unknown>,
      false
    );
  }
  const bot = botJson.bot as PrismBotArchiveJson["bot"] & Record<string, unknown>;
  rejectLegacyAvatarMetadata(bot, true);
  let avatarDetails: BotAvatarDetailsV1 | null | undefined;
  if (bot.avatarDetails !== undefined) {
    if (bot.avatarDetails === null) {
      avatarDetails = null;
    } else {
      rejectRawAvatarDetailsValue(bot.avatarDetails);
      try {
        avatarDetails = parseBotAvatarDetailsV1(bot.avatarDetails);
      } catch (error) {
        throw new Error(
          `bot.json has invalid avatarDetails: ${
            error instanceof Error ? error.message : "invalid structured recipe"
          }`
        );
      }
    }
  }
  return {
    ...(botJson as PrismBotArchiveJson),
    bot: {
      ...botJson.bot,
      ...(bot.namePronunciation !== undefined
        ? { namePronunciation: normalizeBotNamePronunciation(bot.namePronunciation) }
        : {}),
      ...(avatarDetails !== undefined ? { avatarDetails } : {}),
      ...(bot.powers !== undefined ? { powers: normalizeBotPowersV1(bot.powers) } : {}),
    },
  };
}

function rejectLegacyAvatarMetadata(
  record: Record<string, unknown>,
  allowStructuredAvatarDetails: boolean
): void {
  const unsupported = Object.keys(record).find((key) => {
    if (allowStructuredAvatarDetails && key === "avatarDetails") return false;
    const normalized = key.toLowerCase().replace(/[^a-z]/gu, "");
    if (normalized === "localimagemodel" || normalized === "openaiimagemodel") {
      return false;
    }
    const profileIndex = normalized.indexOf("profile");
    const profileSuffix =
      profileIndex >= 0 ? normalized.slice(profileIndex + "profile".length) : "";
    return (
      normalized.includes("accessory") ||
      normalized.startsWith("avatar") ||
      normalized.includes("portrait") ||
      /(?:png|svg|imageurl|dataurl|imagebase64|imagepayload|raster)/u.test(
        normalized
      ) ||
      (profileIndex >= 0 &&
        /(?:picture|image|png|svg|url|data|file)/u.test(profileSuffix))
    );
  });
  if (unsupported) {
    throw new Error(`bot.json contains unsupported legacy avatar field: ${unsupported}.`);
  }
}

function rejectRawAvatarDetailsValue(value: unknown): void {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (
    /^(?:data:image\/|https?:\/\/|<\?xml\b|<svg\b)/iu.test(trimmed) ||
    /\.(?:png|svg)(?:[?#].*)?$/iu.test(trimmed)
  ) {
    throw new Error("bot.json avatarDetails must be a structured recipe, not PNG, SVG, data, or URL content.");
  }
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

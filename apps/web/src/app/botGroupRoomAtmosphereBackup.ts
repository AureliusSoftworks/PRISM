import {
  BOT_GROUP_ROOM_ATMOSPHERE_PROMPT_MAX_CHARS,
  botGroupRoomAtmosphereImageFileUrl,
  normalizeBotGroupRoomAtmosphere,
  type BotGroupRoomAtmosphereGroup,
} from "./botGroupRoomAtmosphere.ts";

export const BOT_GROUP_ROOM_ATMOSPHERE_BACKUP_ASSET_MAX_COUNT = 64;
export const BOT_GROUP_ROOM_ATMOSPHERE_BACKUP_DATA_URL_MAX_CHARS = 24_000_000;
export const BOT_GROUP_ROOM_ATMOSPHERE_BACKUP_TOTAL_DATA_URL_MAX_CHARS =
  48_000_000;

const PNG_DATA_URL_PATTERN = /^data:image\/png;base64,[a-zA-Z0-9+/]+={0,2}$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

export interface BotGroupRoomAtmosphereBackupAsset {
  imageId: string;
  dataUrl: string;
  prompt?: string;
}

export interface BotGroupRoomAtmosphereBackupReference {
  imageId: string;
  prompt?: string;
}

function recordFrom(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizePrompt(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 &&
    normalized.length <= BOT_GROUP_ROOM_ATMOSPHERE_PROMPT_MAX_CHARS &&
    !CONTROL_CHARACTER_PATTERN.test(normalized)
    ? normalized
    : undefined;
}

function normalizeImageId(value: unknown): string | null {
  return typeof value === "string" && botGroupRoomAtmosphereImageFileUrl(value)
    ? value.trim()
    : null;
}

export function normalizeBotGroupRoomAtmosphereBackupAssets(
  value: unknown,
  limits: {
    maxCount?: number;
    maxTotalDataUrlChars?: number;
  } = {},
): BotGroupRoomAtmosphereBackupAsset[] {
  if (!Array.isArray(value)) return [];
  const maxCount = Math.max(
    0,
    Math.min(
      BOT_GROUP_ROOM_ATMOSPHERE_BACKUP_ASSET_MAX_COUNT,
      Math.floor(
        limits.maxCount ?? BOT_GROUP_ROOM_ATMOSPHERE_BACKUP_ASSET_MAX_COUNT,
      ),
    ),
  );
  const maxTotalDataUrlChars = Math.max(
    0,
    Math.min(
      BOT_GROUP_ROOM_ATMOSPHERE_BACKUP_TOTAL_DATA_URL_MAX_CHARS,
      Math.floor(
        limits.maxTotalDataUrlChars ??
          BOT_GROUP_ROOM_ATMOSPHERE_BACKUP_TOTAL_DATA_URL_MAX_CHARS,
      ),
    ),
  );
  const assets: BotGroupRoomAtmosphereBackupAsset[] = [];
  const seen = new Set<string>();
  let totalDataUrlChars = 0;
  for (const candidate of value) {
    if (assets.length >= maxCount) break;
    const record = recordFrom(candidate);
    const imageId = normalizeImageId(record?.imageId);
    const dataUrl = typeof record?.dataUrl === "string" ? record.dataUrl : "";
    if (
      !imageId ||
      seen.has(imageId) ||
      dataUrl.length === 0 ||
      dataUrl.length > BOT_GROUP_ROOM_ATMOSPHERE_BACKUP_DATA_URL_MAX_CHARS ||
      totalDataUrlChars + dataUrl.length > maxTotalDataUrlChars ||
      !PNG_DATA_URL_PATTERN.test(dataUrl)
    ) {
      continue;
    }
    const prompt = normalizePrompt(record?.prompt);
    seen.add(imageId);
    totalDataUrlChars += dataUrl.length;
    assets.push({ imageId, dataUrl, ...(prompt ? { prompt } : {}) });
  }
  return assets;
}

export function uniqueBotGroupRoomAtmosphereBackupReferences(
  groups: readonly BotGroupRoomAtmosphereGroup[],
): BotGroupRoomAtmosphereBackupReference[] {
  const references: BotGroupRoomAtmosphereBackupReference[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    const atmosphere = normalizeBotGroupRoomAtmosphere(group.roomAtmosphere);
    if (!atmosphere || seen.has(atmosphere.imageId)) continue;
    seen.add(atmosphere.imageId);
    references.push({
      imageId: atmosphere.imageId,
      ...(atmosphere.prompt ? { prompt: atmosphere.prompt } : {}),
    });
  }
  return references;
}

export function remapBotGroupRoomAtmosphereBackupImageIds<
  TGroup extends BotGroupRoomAtmosphereGroup,
>(
  groups: readonly TGroup[],
  replacements: ReadonlyMap<string, string>,
): TGroup[] {
  return groups.map((group) => {
    const atmosphere = normalizeBotGroupRoomAtmosphere(group.roomAtmosphere);
    if (!atmosphere) return group;
    const replacement = normalizeImageId(replacements.get(atmosphere.imageId));
    if (!replacement || replacement === atmosphere.imageId) return group;
    return {
      ...group,
      roomAtmosphere: { ...atmosphere, imageId: replacement },
    } as TGroup;
  });
}

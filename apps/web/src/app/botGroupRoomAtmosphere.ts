export const BOT_GROUP_ROOM_ATMOSPHERE_IMAGE_ID_MAX_CHARS = 256;
export const BOT_GROUP_ROOM_ATMOSPHERE_PROMPT_MAX_CHARS = 4_096;

const BOT_GROUP_ROOM_ATMOSPHERE_GROUP_ID_MAX_CHARS = 256;
const BOT_GROUP_ROOM_ATMOSPHERE_TIMESTAMP_MAX_CHARS = 64;
const IMAGE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/u;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

export interface BotGroupRoomAtmosphere {
  imageId: string;
  prompt?: string;
  updatedAt: string;
}

export interface BotGroupRoomAtmosphereGroup {
  id: string;
  updatedAt?: string;
  roomAtmosphere?: unknown;
}

export interface BotGroupRoomAtmosphereImageOption {
  id: string;
  prompt?: string;
  createdAt?: string;
  purpose?: string;
  fileUrl: string;
}

export interface SetBotGroupRoomAtmosphereOptions {
  groupId: string;
  imageId: string;
  prompt?: string;
  updatedAt: string;
}

export interface ClearBotGroupRoomAtmosphereOptions {
  groupId: string;
  updatedAt: string;
}

export interface ResolvedBotGroupRoomAtmosphere {
  atmosphere: BotGroupRoomAtmosphere;
  image: BotGroupRoomAtmosphereImageOption;
}

function recordFrom(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeBoundedText(
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maxLength ||
    CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function normalizeGroupId(value: unknown): string | null {
  return normalizeBoundedText(
    value,
    BOT_GROUP_ROOM_ATMOSPHERE_GROUP_ID_MAX_CHARS,
  );
}

function normalizeImageId(value: unknown): string | null {
  const normalized = normalizeBoundedText(
    value,
    BOT_GROUP_ROOM_ATMOSPHERE_IMAGE_ID_MAX_CHARS,
  );
  return normalized && IMAGE_ID_PATTERN.test(normalized) ? normalized : null;
}

function normalizePrompt(value: unknown): string | undefined {
  return (
    normalizeBoundedText(value, BOT_GROUP_ROOM_ATMOSPHERE_PROMPT_MAX_CHARS) ??
    undefined
  );
}

function normalizeTimestamp(value: unknown): string | null {
  const normalized = normalizeBoundedText(
    value,
    BOT_GROUP_ROOM_ATMOSPHERE_TIMESTAMP_MAX_CHARS,
  );
  if (!normalized || !ISO_TIMESTAMP_PATTERN.test(normalized)) return null;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return null;
  const canonical = new Date(timestamp).toISOString();
  const canonicalInput = normalized.replace(
    /(?:\.(\d{1,3}))?Z$/u,
    (_match, fraction: string | undefined) =>
      `.${(fraction ?? "").padEnd(3, "0")}Z`,
  );
  return canonical === canonicalInput ? canonical : null;
}

/**
 * Reads the optional, storage-backed atmosphere model. Missing and malformed
 * legacy values intentionally collapse to `null`, leaving the color gradient
 * as the room's safe fallback.
 */
export function normalizeBotGroupRoomAtmosphere(
  value: unknown,
): BotGroupRoomAtmosphere | null {
  const record = recordFrom(value);
  if (!record) return null;

  const imageId = normalizeImageId(record.imageId);
  const updatedAt = normalizeTimestamp(record.updatedAt);
  if (!imageId || !updatedAt) return null;

  const prompt = normalizePrompt(record.prompt);
  return {
    imageId,
    ...(prompt ? { prompt } : {}),
    updatedAt,
  };
}

/** Cookie authentication is supplied by the caller's normal same-origin fetch. */
export function botGroupRoomAtmosphereImageFileUrl(
  imageId: unknown,
): string | null {
  const normalized = normalizeImageId(imageId);
  return normalized
    ? `/api/images/${encodeURIComponent(normalized)}/file`
    : null;
}

/**
 * Produces safe choices from the image catalog without trusting remote URLs.
 * The first eligible occurrence of an image wins and source ordering is kept.
 */
export function eligibleBotGroupRoomAtmosphereImages(
  images: readonly unknown[],
  privateImageIds: readonly unknown[] = [],
): BotGroupRoomAtmosphereImageOption[] {
  const privateIds = new Set(
    privateImageIds
      .map((imageId) => normalizeImageId(imageId))
      .filter((imageId): imageId is string => imageId !== null),
  );
  const seen = new Set<string>();
  const eligible: BotGroupRoomAtmosphereImageOption[] = [];

  for (const candidate of images) {
    const record = recordFrom(candidate);
    if (!record || record.hasLocalFile !== true) continue;

    const id = normalizeImageId(record.id);
    if (!id || privateIds.has(id) || seen.has(id)) continue;

    const fileUrl = botGroupRoomAtmosphereImageFileUrl(id);
    if (!fileUrl) continue;

    const prompt = normalizePrompt(record.prompt);
    const createdAt = normalizeTimestamp(record.createdAt) ?? undefined;
    const purpose = normalizeBoundedText(record.purpose, 128) ?? undefined;
    seen.add(id);
    eligible.push({
      id,
      ...(prompt ? { prompt } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(purpose ? { purpose } : {}),
      fileUrl,
    });
  }

  return eligible;
}

/**
 * Resolves a persisted atmosphere only while its authenticated local image is
 * still eligible. Deleted, private, and remote-only records fail closed.
 */
export function resolveBotGroupRoomAtmosphere({
  roomAtmosphere,
  images,
  privateImageIds = [],
}: {
  roomAtmosphere: unknown;
  images: readonly unknown[];
  privateImageIds?: readonly unknown[];
}): ResolvedBotGroupRoomAtmosphere | null {
  const atmosphere = normalizeBotGroupRoomAtmosphere(roomAtmosphere);
  if (!atmosphere) return null;

  const image = eligibleBotGroupRoomAtmosphereImages(
    images,
    privateImageIds,
  ).find((candidate) => candidate.id === atmosphere.imageId);
  return image ? { atmosphere, image } : null;
}

/** Selects or replaces one saved group's atmosphere without mutating inputs. */
export function setBotGroupRoomAtmosphere<
  TGroup extends BotGroupRoomAtmosphereGroup,
>(
  groups: readonly TGroup[],
  options: SetBotGroupRoomAtmosphereOptions,
): TGroup[] {
  const groupId = normalizeGroupId(options.groupId);
  const atmosphere = normalizeBotGroupRoomAtmosphere({
    imageId: options.imageId,
    prompt: options.prompt,
    updatedAt: options.updatedAt,
  });
  if (!groupId || !atmosphere) return [...groups];

  return groups.map((group) =>
    normalizeGroupId(group.id) === groupId
      ? ({
          ...group,
          roomAtmosphere: atmosphere,
          updatedAt: atmosphere.updatedAt,
        } as TGroup)
      : group,
  );
}

/** Clears one saved group's atmosphere without disturbing any other fields. */
export function clearBotGroupRoomAtmosphere<
  TGroup extends BotGroupRoomAtmosphereGroup,
>(
  groups: readonly TGroup[],
  options: ClearBotGroupRoomAtmosphereOptions,
): TGroup[] {
  const groupId = normalizeGroupId(options.groupId);
  const updatedAt = normalizeTimestamp(options.updatedAt);
  if (!groupId || !updatedAt) return [...groups];

  return groups.map((group) => {
    if (normalizeGroupId(group.id) !== groupId) return group;
    const next = { ...group, updatedAt } as TGroup;
    delete (next as BotGroupRoomAtmosphereGroup).roomAtmosphere;
    return next;
  });
}

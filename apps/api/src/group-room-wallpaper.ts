import type { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import {
  GROUP_ROOM_WALLPAPER_GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_ROOM_WALLPAPER_GROUP_NAME_MAX_LENGTH,
  GROUP_ROOM_WALLPAPER_MEMBER_BOT_ID_MAX_LENGTH,
  GROUP_ROOM_WALLPAPER_MEMBER_COUNT_MAX,
  GROUP_ROOM_WALLPAPER_MEMBER_COUNT_MIN,
  GROUP_ROOM_WALLPAPER_VARIATION_SEED_MAX_LENGTH,
  buildImagePersonaContext,
} from "@localai/shared";

const GROUP_ROOM_WALLPAPER_PERSONA_EXCERPT_MAX_LENGTH = 220;
export const GROUP_ROOM_WALLPAPER_BACKUP_UPLOAD_MAX_BYTES = 16 * 1024 * 1024;
export const GROUP_ROOM_WALLPAPER_BACKUP_PROMPT_MAX_LENGTH = 4_096;
const GROUP_ROOM_WALLPAPER_BACKUP_MAX_PIXELS = 40_000_000;
const GROUP_ROOM_WALLPAPER_BACKUP_MAX_DIMENSION = 8_192;
const PNG_DATA_URL_PATTERN = /^data:image\/png;base64,([a-zA-Z0-9+/]+={0,2})$/u;

export interface GroupRoomWallpaperMember {
  id: string;
  name: string;
  color: string | null;
  personaExcerpt: string;
}

export interface GroupRoomWallpaperRequestContext {
  groupName: string;
  groupDescription: string;
  memberBotIds: string[];
  variationSeed?: string;
}

export interface NormalizedGroupRoomWallpaperBackupUpload {
  pngBytes: Buffer;
  width: number;
  height: number;
}

type GroupRoomWallpaperBotRow = {
  id: string;
  name: string;
  system_prompt: string;
  color: string | null;
};

function normalizeSingleLine(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function normalizeGroupRoomWallpaperBackupPrompt(value: unknown): string {
  if (typeof value !== "string") return "Restored group room atmosphere";
  const normalized = normalizeSingleLine(value);
  return normalized
    ? normalized.slice(0, GROUP_ROOM_WALLPAPER_BACKUP_PROMPT_MAX_LENGTH)
    : "Restored group room atmosphere";
}

export async function normalizeGroupRoomWallpaperBackupUpload(
  value: unknown
): Promise<NormalizedGroupRoomWallpaperBackupUpload> {
  if (typeof value !== "string") {
    throw new Error("Room atmosphere backup image is required.");
  }
  const match = PNG_DATA_URL_PATTERN.exec(value);
  if (!match) {
    throw new Error("Room atmosphere backup image must be a PNG data URL.");
  }
  const sourceBytes = Buffer.from(match[1]!, "base64");
  if (
    sourceBytes.length === 0 ||
    sourceBytes.length > GROUP_ROOM_WALLPAPER_BACKUP_UPLOAD_MAX_BYTES
  ) {
    throw new Error("Room atmosphere backup image is too large.");
  }
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(sourceBytes, {
      failOn: "error",
      limitInputPixels: GROUP_ROOM_WALLPAPER_BACKUP_MAX_PIXELS,
    }).metadata();
  } catch {
    throw new Error("Room atmosphere backup image could not be read.");
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (
    width < 1 ||
    height < 1 ||
    width > GROUP_ROOM_WALLPAPER_BACKUP_MAX_DIMENSION ||
    height > GROUP_ROOM_WALLPAPER_BACKUP_MAX_DIMENSION ||
    width * height > GROUP_ROOM_WALLPAPER_BACKUP_MAX_PIXELS
  ) {
    throw new Error("Room atmosphere backup image dimensions are unsupported.");
  }
  let normalized: { data: Buffer; info: sharp.OutputInfo };
  try {
    normalized = await sharp(sourceBytes, {
      failOn: "error",
      limitInputPixels: GROUP_ROOM_WALLPAPER_BACKUP_MAX_PIXELS,
    })
      .rotate()
      .png()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new Error("Room atmosphere backup image could not be normalized.");
  }
  if (normalized.data.length > GROUP_ROOM_WALLPAPER_BACKUP_UPLOAD_MAX_BYTES) {
    throw new Error("Room atmosphere backup image is too large.");
  }
  return {
    pngBytes: normalized.data,
    width: normalized.info.width,
    height: normalized.info.height,
  };
}

function readBoundedText(
  value: unknown,
  label: string,
  maxLength: number,
  options: { required: boolean }
): string {
  if (typeof value !== "string") {
    if (!options.required && (value === undefined || value === null)) return "";
    throw new Error(`${label} is required.`);
  }
  const normalized = normalizeSingleLine(value);
  if (!normalized && options.required) {
    throw new Error(`${label} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

export function readGroupRoomWallpaperRequestContext(
  body: Record<string, unknown>
): GroupRoomWallpaperRequestContext {
  const groupName = readBoundedText(
    body.groupName,
    "Group name",
    GROUP_ROOM_WALLPAPER_GROUP_NAME_MAX_LENGTH,
    { required: true }
  );
  const groupDescription = readBoundedText(
    body.groupDescription,
    "Group description",
    GROUP_ROOM_WALLPAPER_GROUP_DESCRIPTION_MAX_LENGTH,
    { required: false }
  );
  if (!Array.isArray(body.memberBotIds)) {
    throw new Error("Member bot IDs are required.");
  }
  const memberBotIds = body.memberBotIds.map((value) => {
    if (typeof value !== "string") {
      throw new Error("Every member bot ID must be a string.");
    }
    const normalized = value.trim();
    if (!normalized) {
      throw new Error("Member bot IDs must not be blank.");
    }
    if (normalized.length > GROUP_ROOM_WALLPAPER_MEMBER_BOT_ID_MAX_LENGTH) {
      throw new Error(
        `Member bot IDs must be ${GROUP_ROOM_WALLPAPER_MEMBER_BOT_ID_MAX_LENGTH} characters or fewer.`
      );
    }
    return normalized;
  });
  if (
    memberBotIds.length < GROUP_ROOM_WALLPAPER_MEMBER_COUNT_MIN ||
    memberBotIds.length > GROUP_ROOM_WALLPAPER_MEMBER_COUNT_MAX
  ) {
    throw new Error(
      `Group-room wallpaper generation requires ${GROUP_ROOM_WALLPAPER_MEMBER_COUNT_MIN}-${GROUP_ROOM_WALLPAPER_MEMBER_COUNT_MAX} member bot IDs.`
    );
  }
  if (new Set(memberBotIds).size !== memberBotIds.length) {
    throw new Error("Member bot IDs must be unique.");
  }
  const variationSeed = readBoundedText(
    body.variationSeed,
    "Variation seed",
    GROUP_ROOM_WALLPAPER_VARIATION_SEED_MAX_LENGTH,
    { required: false }
  );
  return {
    groupName,
    groupDescription,
    memberBotIds,
    ...(variationSeed ? { variationSeed } : {}),
  };
}

const GROUP_ROOM_ENVIRONMENT_VARIATIONS = [
  "an inhabited interior with one unmistakable architectural focal point",
  "a landscape threshold where shelter opens onto a distant horizon",
  "a tactile studio or workshop shaped by the group's shared curiosity",
  "a quiet civic or ceremonial space with traces of lived history",
  "an abstract spatial installation that still feels physically inhabitable",
  "a nocturnal garden or courtyard with layered depth and weather",
  "an observatory, archive, or laboratory reimagined through the group identity",
  "a liminal passage between two contrasting but harmonious environments",
] as const;

const GROUP_ROOM_COMPOSITION_VARIATIONS = [
  "Use a low, wide horizon and a strong off-center destination.",
  "Frame the room with close foreground texture and a long diagonal sightline.",
  "Build depth through nested thresholds, with the center left calm and open.",
  "Use an elevated viewpoint, broad negative space, and detail clustered at the edges.",
  "Let one sculptural form anchor a mostly open composition without becoming a logo.",
  "Use reflected planes or water to create a second layer of space without symmetry.",
  "Compose around a curved path that draws the eye away from the text-safe center.",
  "Use asymmetrical vertical framing and a distant luminous opening.",
] as const;

const GROUP_ROOM_LIGHTING_VARIATIONS = [
  "Light it with cool pre-dawn haze and one restrained warm practical source.",
  "Use late-afternoon shafts, soft dust, and long quiet shadows.",
  "Use rain-muted window light with small reflected color accents.",
  "Use moonlit blue-black depth with a subtle mineral glow at the edges.",
  "Use diffuse overcast light, rich surface texture, and almost no hard shadow.",
  "Use low amber evening light balanced by a distant cool horizon.",
  "Use bioluminescent edge light while keeping the space believable and calm.",
  "Use luminous fog and soft glass reflections with restrained contrast.",
] as const;

function stableVariationIndex(seed: string, axis: string, length: number): number {
  let hash = 2166136261;
  const value = `${seed}:${axis}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

export function groupRoomWallpaperVariationBrief(
  variationSeed: string | undefined
): string | null {
  const seed = normalizeSingleLine(variationSeed ?? "");
  if (!seed) return null;
  return [
    GROUP_ROOM_ENVIRONMENT_VARIATIONS[
      stableVariationIndex(seed, "environment", GROUP_ROOM_ENVIRONMENT_VARIATIONS.length)
    ],
    GROUP_ROOM_COMPOSITION_VARIATIONS[
      stableVariationIndex(seed, "composition", GROUP_ROOM_COMPOSITION_VARIATIONS.length)
    ],
    GROUP_ROOM_LIGHTING_VARIATIONS[
      stableVariationIndex(seed, "lighting", GROUP_ROOM_LIGHTING_VARIATIONS.length)
    ],
  ].join(" ");
}

function normalizeStoredBotColor(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized.length > 80) return null;
  if (/^#[0-9a-f]{3,8}$/iu.test(normalized)) return normalized.toLowerCase();
  if (
    /^(?:rgb|rgba|hsl|hsla|oklch)\([0-9.,%+\-\s/]+\)$/iu.test(normalized)
  ) {
    return normalized;
  }
  return null;
}

export function loadOwnedGroupRoomWallpaperMembers(
  db: DatabaseSync,
  userId: string,
  memberBotIds: readonly string[]
): GroupRoomWallpaperMember[] {
  if (memberBotIds.length === 0) return [];
  const rows = db
    .prepare(
      `SELECT id, name, system_prompt, color
         FROM bots
        WHERE user_id = ?
          AND id IN (${memberBotIds.map(() => "?").join(", ")})`
    )
    .all(userId, ...memberBotIds) as GroupRoomWallpaperBotRow[];
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const missingIds = memberBotIds.filter((botId) => !rowsById.has(botId));
  if (missingIds.length > 0) {
    throw new Error("Every group-room wallpaper member must be an owned bot.");
  }
  return memberBotIds.map((botId) => {
    const row = rowsById.get(botId)!;
    return {
      id: row.id,
      name: (normalizeSingleLine(row.name) || "Unnamed member").slice(0, 120),
      color: normalizeStoredBotColor(row.color),
      personaExcerpt: buildImagePersonaContext({
        botName: row.name,
        systemPrompt: row.system_prompt,
        maxChars: GROUP_ROOM_WALLPAPER_PERSONA_EXCERPT_MAX_LENGTH,
      }),
    };
  });
}

export function composeGroupRoomWallpaperPrompt(args: {
  userPrompt: string;
  groupName: string;
  groupDescription?: string;
  members: readonly GroupRoomWallpaperMember[];
  zenWallpaperStyleNotes?: string;
  variationSeed?: string;
}): string {
  const groupDescription = normalizeSingleLine(args.groupDescription ?? "");
  const styleNotes = normalizeSingleLine(args.zenWallpaperStyleNotes ?? "");
  const userPrompt = args.userPrompt.trim();
  const variationBrief = groupRoomWallpaperVariationBrief(args.variationSeed);
  const palette = Array.from(
    new Set(
      args.members
        .map((member) => member.color?.trim() ?? "")
        .filter((color) => color.length > 0)
    )
  );
  const memberLines = args.members.map((member) => {
    const identity = normalizeSingleLine(member.name) || "Unnamed member";
    const color = member.color ? `; accent ${member.color}` : "";
    const persona = normalizeSingleLine(member.personaExcerpt);
    return `- ${identity}${color}${persona ? `; atmosphere cues: ${persona}` : ""}`;
  });

  return [
    "Create a widescreen 16:9 ambient wallpaper for a saved PRISM Bot Group waiting room.",
    "This is a full-bleed shared room atmosphere behind interface text: spacious, calm in the center, readable at a glance, and visually rich toward the edges.",
    `Group: ${normalizeSingleLine(args.groupName)}.`,
    groupDescription ? `Group description: ${groupDescription}` : "",
    palette.length > 0
      ? `Combined member color palette: ${palette.join(", ")}. Blend these as one coherent lighting language rather than separate stripes.`
      : "",
    "Trusted member identity and persona cues from this account:",
    ...memberLines,
    userPrompt ? `Requested visual direction: ${userPrompt}` : "",
    styleNotes ? `Global Zen atmosphere style preference: ${styleNotes}` : "",
    variationBrief
      ? `Variation brief for this generation (mandatory): ${variationBrief}`
      : "",
    "Translate the group identity into a single believable environment or abstract room atmosphere. Do not create a collage, lineup, portrait wall, or separate vignette for each member.",
    "No readable words, labels, logos, UI chrome, speech bubbles, watermarks, or generated text. Keep important detail away from the exact center so overlaid conversation remains legible.",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

export type ImageOrigin =
  | "images_panel"
  | "zen_chat"
  | "sandbox_chat"
  | "botcast"
  | "slate_cover"
  | "bot_group_room"
  | "bot_group_room_import"
  | "hub_atmosphere"
  | "coffee_bar"
  | "zen_wallpaper"
  | "bot_profile_picture";

const MAX_RELATED_IMAGE_BOTS = 12;

export function normalizeImageRelatedBotIds(
  value: unknown,
  primaryBotId?: string | null,
): string[] {
  let candidates: unknown[] = [];
  if (Array.isArray(value)) {
    candidates = value;
  } else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) candidates = parsed;
    } catch {
      candidates = [];
    }
  }
  if (primaryBotId?.trim()) candidates.unshift(primaryBotId);
  return Array.from(
    new Set(
      candidates
        .filter(
          (candidate): candidate is string => typeof candidate === "string",
        )
        .map((candidate) => candidate.trim())
        .filter(Boolean),
    ),
  ).slice(0, MAX_RELATED_IMAGE_BOTS);
}

export function serializeImageRelatedBotIds(
  botIds: readonly string[],
  primaryBotId?: string | null,
): string {
  return JSON.stringify(normalizeImageRelatedBotIds(botIds, primaryBotId));
}

export function imageOriginForGenerate(args: {
  purpose: string;
  requestedOrigin: unknown;
}): ImageOrigin {
  if (args.purpose === "group-room-wallpaper") return "bot_group_room";
  if (args.purpose === "hub_atmosphere") return "hub_atmosphere";
  if (args.purpose === "bot_profile_picture") return "bot_profile_picture";
  return args.requestedOrigin === "botcast" ? "botcast" : "images_panel";
}

export const IMAGE_BOT_MEMBERSHIP_SQL = `(
  images.bot_id = ?
  OR EXISTS (
    SELECT 1
      FROM json_each(
        CASE
          WHEN json_valid(images.related_bot_ids) THEN images.related_bot_ids
          ELSE '[]'
        END
      ) AS related_bot
     WHERE related_bot.value = ?
  )
)`;

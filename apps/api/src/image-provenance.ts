import { BOT_LIBRARY_GROUP_MEMBER_MAX } from "@localai/shared";

export type ImageOrigin =
  | "images_panel"
  | "zen_chat"
  | "sandbox_chat"
  | "botcast"
  | "slate_cover"
  | "slate_visual_bible"
  | "debate"
  | "bot_group_room"
  | "bot_group_room_import"
  | "hub_atmosphere"
  | "chat_atmosphere"
  | "coffee_bar"
  | "zen_wallpaper"
  | "bot_profile_picture";

export const DEBATE_EXHIBIT_IMAGE_PURPOSE = "debate_exhibit";
export const SIGNAL_DAY_STUDIO_IMAGE_PURPOSE = "signal_studio_day";
export const SIGNAL_NIGHT_STUDIO_IMAGE_PURPOSE = "signal_studio_night";
export const SIGNAL_LOGO_IMAGE_PURPOSE = "signal_logo";

export type ContextualImageAssetScope =
  | "debate_exhibit"
  | "signal_studio_day"
  | "signal_studio_night"
  | "signal_logo";

export type ContextualImageAssetScopeConfig = {
  origin: Extract<ImageOrigin, "debate" | "botcast">;
  purpose: string;
  botScoped: boolean;
};

const CONTEXTUAL_IMAGE_ASSET_SCOPES: Record<
  ContextualImageAssetScope,
  ContextualImageAssetScopeConfig
> = {
  debate_exhibit: {
    origin: "debate",
    purpose: DEBATE_EXHIBIT_IMAGE_PURPOSE,
    botScoped: false,
  },
  signal_studio_day: {
    origin: "botcast",
    purpose: SIGNAL_DAY_STUDIO_IMAGE_PURPOSE,
    botScoped: true,
  },
  signal_studio_night: {
    origin: "botcast",
    purpose: SIGNAL_NIGHT_STUDIO_IMAGE_PURPOSE,
    botScoped: true,
  },
  signal_logo: {
    origin: "botcast",
    purpose: SIGNAL_LOGO_IMAGE_PURPOSE,
    botScoped: true,
  },
};

export function contextualImageAssetScopeConfig(
  value: unknown,
): ContextualImageAssetScopeConfig | null {
  if (typeof value !== "string") return null;
  return (
    CONTEXTUAL_IMAGE_ASSET_SCOPES[value as ContextualImageAssetScope] ?? null
  );
}

export function signalArtworkImagePurpose(
  kind: "night-studio" | "day-studio" | "logo",
): string {
  if (kind === "night-studio") return SIGNAL_NIGHT_STUDIO_IMAGE_PURPOSE;
  if (kind === "day-studio") return SIGNAL_DAY_STUDIO_IMAGE_PURPOSE;
  return SIGNAL_LOGO_IMAGE_PURPOSE;
}

const MAX_RELATED_IMAGE_BOTS = BOT_LIBRARY_GROUP_MEMBER_MAX;

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
  if (args.purpose === "chat_atmosphere") return "chat_atmosphere";
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

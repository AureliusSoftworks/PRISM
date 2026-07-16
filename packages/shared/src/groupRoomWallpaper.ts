/** Image purpose used for saved Bot Group waiting-room atmosphere art. */
export const GROUP_ROOM_WALLPAPER_IMAGE_PURPOSE = "group-room-wallpaper" as const;

/** Saved Bot Groups require at least two members and cap at twenty-four. */
export const GROUP_ROOM_WALLPAPER_MEMBER_COUNT_MIN = 2;
export const GROUP_ROOM_WALLPAPER_MEMBER_COUNT_MAX = 24;

/** Bounds shared by the client request and the server-side validator. */
export const GROUP_ROOM_WALLPAPER_GROUP_NAME_MAX_LENGTH = 80;
export const GROUP_ROOM_WALLPAPER_GROUP_DESCRIPTION_MAX_LENGTH = 500;
export const GROUP_ROOM_WALLPAPER_MEMBER_BOT_ID_MAX_LENGTH = 200;

/**
 * Extra context accepted by `POST /api/images/generate` when the purpose is
 * {@link GROUP_ROOM_WALLPAPER_IMAGE_PURPOSE}. Bot identity, color, and persona
 * data are deliberately absent: the API resolves those from owned bot rows.
 */
export interface GroupRoomWallpaperImageGenerationRequest {
  purpose: typeof GROUP_ROOM_WALLPAPER_IMAGE_PURPOSE;
  /** Optional visual direction; the server can compose entirely from the saved group. */
  prompt?: string;
  groupName: string;
  groupDescription?: string;
  memberBotIds: string[];
  preferredProvider?: "local" | "openai";
  model?: string;
  quality?: string;
  size?: string;
  /** Group-room wallpapers are standalone account images. */
  botId?: never;
  /** Group-room wallpapers are not attributed to a chat or Coffee session. */
  conversationId?: never;
}

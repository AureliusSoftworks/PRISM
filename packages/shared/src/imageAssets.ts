export const IMAGE_ASSET_KINDS = [
  "general_image",
  "item",
  "debate_exhibit",
  "whodunnit_room",
  "signal_studio",
  "signal_logo",
  "slate_cover",
  "slate_visual_study",
  "zen_atmosphere",
  "home_atmosphere",
  "group_room_atmosphere",
] as const;

export type ImageAssetKind = (typeof IMAGE_ASSET_KINDS)[number];

/** Focused bot Assets order: Images, Signal, Debate, Atmospheres, then Slate. */
export const BOT_IMAGE_ASSET_LIBRARY_KIND_ORDER = [
  "general_image",
  "item",
  "signal_studio",
  "signal_logo",
  "debate_exhibit",
  "whodunnit_room",
  "home_atmosphere",
  "zen_atmosphere",
  "group_room_atmosphere",
  "slate_cover",
  "slate_visual_study",
] as const satisfies readonly ImageAssetKind[];

export const IMAGE_ASSET_SET_STATUSES = [
  "building",
  "ready",
  "incomplete",
] as const;

export type ImageAssetSetStatus =
  (typeof IMAGE_ASSET_SET_STATUSES)[number];

export const IMAGE_ASSET_MEMBER_ROLES = [
  "primary",
  "light",
  "dark",
  "light_mask",
  "dark_mask",
  "lighting",
] as const;

export type ImageAssetMemberRole =
  (typeof IMAGE_ASSET_MEMBER_ROLES)[number];

export type ImageAssetSource = "generated" | "uploaded" | "legacy";

export const IMAGE_ASSET_STORAGE_TIERS = ["hot", "cold"] as const;

export type ImageAssetStorageTier =
  (typeof IMAGE_ASSET_STORAGE_TIERS)[number];

/** Smart automatic tags stay in this inclusive range. */
export const IMAGE_ASSET_SMART_TAG_MIN = 3;
export const IMAGE_ASSET_SMART_TAG_MAX = 6;

export interface ImageAssetClassificationInput {
  origin?: string | null;
  purpose?: string | null;
}

export interface ImageAssetMember {
  imageId: string;
  role: ImageAssetMemberRole;
  url: string;
  thumbnailUrl: string;
  prompt: string;
  revisedPrompt: string | null;
  provider: string;
  model: string;
  size: string;
  createdAt: string;
}

export interface ImageAssetSet {
  id: string;
  kind: ImageAssetKind;
  status: ImageAssetSetStatus;
  title: string;
  source: ImageAssetSource;
  sourceContext: Record<string, unknown>;
  automaticTags: string[];
  playerTags: string[];
  storageTier: ImageAssetStorageTier;
  accessCount: number;
  lastAccessedAt: string | null;
  reuseScore: number;
  compressUndoAvailable: boolean;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  usage: ImageAssetUsage[];
  members: ImageAssetMember[];
  magentaPassCount: number;
  magentaUndoAvailable: boolean;
}

export interface ImageAssetUsage {
  type: string;
  label: string;
  href?: string;
}

export interface ImageAssetCatalogPage {
  assets: ImageAssetSet[];
  nextCursor: string | null;
}

/** A non-empty, bot-scoped rail in the focused bot Assets panel. */
export interface BotImageAssetLibrarySection {
  kind: ImageAssetKind;
  totalCount: number;
  assets: ImageAssetSet[];
}

/** Exact image-library associations for one owned bot. */
export interface BotImageAssetLibraryIndex {
  botId: string;
  sections: BotImageAssetLibrarySection[];
}

export interface ImageAssetStorageKindSummary {
  kind: ImageAssetKind;
  bytes: number;
  count: number;
}

export interface ImageAssetStorageSummary {
  activeBytes: number;
  recoveryTrashBytes: number;
  revisionBytes: number;
  generatedBytes: number;
  uploadedBytes: number;
  systemManagedBytes: number;
  hotBytes: number;
  coldBytes: number;
  compressRevisionBytes: number;
  totalAssetCount: number;
  byKind: ImageAssetStorageKindSummary[];
}

export interface ImageAssetSmartTidyPreview {
  candidateCount: number;
  reclaimableBytes: number;
  protectedHighReuseCount: number;
  sampleTitles: string[];
  assetSetIds: string[];
}

export interface ImageAssetSmartTidyResult {
  deletedCount: number;
  recoveryId: string | null;
  recoveryBytes: number;
  assetSetIds: string[];
}

export function isImageAssetStorageTier(
  value: unknown,
): value is ImageAssetStorageTier {
  return (
    typeof value === "string" &&
    (IMAGE_ASSET_STORAGE_TIERS as readonly string[]).includes(value)
  );
}

export const IMAGE_ASSET_KIND_LABELS: Record<ImageAssetKind, string> = {
  general_image: "Images",
  item: "Items",
  debate_exhibit: "Debate exhibits",
  whodunnit_room: "Whodunnit rooms",
  signal_studio: "Signal studios",
  signal_logo: "Signal logos",
  slate_cover: "Slate covers",
  slate_visual_study: "Slate visual studies",
  zen_atmosphere: "Zen Atmospheres",
  home_atmosphere: "Chat atmospheres",
  group_room_atmosphere: "Group-room Atmospheres",
};

export function isImageAssetKind(value: unknown): value is ImageAssetKind {
  return (
    typeof value === "string" &&
    (IMAGE_ASSET_KINDS as readonly string[]).includes(value)
  );
}

export function isImageAssetSetStatus(
  value: unknown,
): value is ImageAssetSetStatus {
  return (
    typeof value === "string" &&
    (IMAGE_ASSET_SET_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Positive, reusable classification for the local asset library. Returning
 * null keeps automatic derivatives and unknown legacy rows storage-managed
 * without allowing them into a reusable rail.
 */
export function imageAssetKindForImage(
  input: ImageAssetClassificationInput,
): ImageAssetKind | null {
  const origin = input.origin?.trim() ?? "";
  const purpose = input.purpose?.trim() || "gallery";

  if (purpose === "debate_exhibit") return "debate_exhibit";
  if (purpose === "whodunnit_room") return "whodunnit_room";
  if (purpose === "signal_item") return "item";
  if (purpose === "signal_studio_day" || purpose === "signal_studio_night") {
    return "signal_studio";
  }
  if (purpose === "signal_logo") return "signal_logo";
  if (purpose === "slate_cover" || origin === "slate_cover") {
    return "slate_cover";
  }
  if (purpose === "slate_visual_bible" || origin === "slate_visual_bible") {
    return "slate_visual_study";
  }
  if (purpose === "wallpaper" && origin === "zen_wallpaper") {
    return "zen_atmosphere";
  }
  if (purpose === "hub_atmosphere" || origin === "hub_atmosphere") {
    return "home_atmosphere";
  }
  if (purpose === "chat_atmosphere" || origin === "chat_atmosphere") {
    return "home_atmosphere";
  }
  if (
    purpose === "group-room-wallpaper" ||
    origin === "bot_group_room" ||
    origin === "bot_group_room_import"
  ) {
    return "group_room_atmosphere";
  }

  if (
    (purpose === "gallery" || purpose === "image_generation") &&
    (origin === "images_panel" ||
      origin === "zen_chat" ||
      origin === "sandbox_chat")
  ) {
    return "general_image";
  }

  return null;
}

export function imageAssetMemberRoleForImage(
  input: ImageAssetClassificationInput,
): ImageAssetMemberRole {
  if (input.purpose === "signal_studio_day") return "light";
  if (input.purpose === "signal_studio_night") return "dark";
  if (input.purpose === "signal_microphone_tint_mask") {
    return input.origin === "signal_studio_day" ? "light_mask" : "dark_mask";
  }
  if (input.purpose === "signal_studio_lighting") return "lighting";
  return "primary";
}

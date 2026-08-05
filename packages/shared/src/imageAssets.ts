export const IMAGE_ASSET_KINDS = [
  "general_image",
  "debate_exhibit",
  "signal_studio",
  "signal_logo",
  "slate_cover",
  "slate_visual_study",
  "zen_atmosphere",
  "home_atmosphere",
  "group_room_atmosphere",
] as const;

export type ImageAssetKind = (typeof IMAGE_ASSET_KINDS)[number];

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
  totalAssetCount: number;
  byKind: ImageAssetStorageKindSummary[];
}

export const IMAGE_ASSET_KIND_LABELS: Record<ImageAssetKind, string> = {
  general_image: "Images",
  debate_exhibit: "Debate exhibits",
  signal_studio: "Signal studios",
  signal_logo: "Signal logos",
  slate_cover: "Slate covers",
  slate_visual_study: "Slate visual studies",
  zen_atmosphere: "Zen Atmospheres",
  home_atmosphere: "Home Atmospheres",
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

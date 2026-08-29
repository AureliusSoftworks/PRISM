import {
  validateMansionMusicLoopV1,
  validateMansionMusicIdentityV1,
  type MansionMusicIdentityV1,
  type MansionMusicLoopV1,
} from "./mansionMusic.ts";
import {
  mansionLayoutV2ToLegacyRooms,
  validateMansionLayoutV2,
  type MansionLayoutV2,
} from "./mansionLayoutV2.ts";

export const PORTABLE_MYSTERY_PACKAGE_FORMAT_MAJOR_V1 = 1 as const;
export const PORTABLE_MYSTERY_PACKAGE_FORMAT_MINOR_V1 = 0 as const;
export const PORTABLE_MYSTERY_PACKAGE_MAGIC_V1 = "PRISMPKG" as const;
export const PORTABLE_MANSION_PACKAGE_MIME_V1 = "application/vnd.prism.mansion" as const;
export const PORTABLE_WHODUNNIT_PACKAGE_MIME_V1 = "application/vnd.prism.whodunnit" as const;

export type PortableMysteryPackageTypeV1 = "mansion" | "whodunnit";
export type PortableMysteryEncryptionModeV1 = "spoiler_seal" | "password";
export type PortableMysteryAssetRoleV1 =
  | "room"
  | "prop"
  | "ambience"
  | "music"
  | "preview"
  | "presentation"
  | "voice";
export type PortableMysteryAssetMimeTypeV1 =
  | "image/png"
  | "image/webp"
  | "audio/mpeg"
  | "audio/ogg"
  | "audio/wav";

export type PortablePackageJsonPrimitiveV1 = string | number | boolean | null;
export type PortablePackageJsonValueV1 =
  | PortablePackageJsonPrimitiveV1
  | PortablePackageJsonValueV1[]
  | { [key: string]: PortablePackageJsonValueV1 };

export interface PortableMysteryFormatVersionV1 {
  major: typeof PORTABLE_MYSTERY_PACKAGE_FORMAT_MAJOR_V1;
  minor: number;
}

export interface PortableMysteryCompatibilityV1 {
  minimumFormatMajor: number;
  maximumFormatMajor: number;
  minimumPrismVersion: string | null;
}

export interface PortableMysteryCreatorV1 {
  name: string;
  id: string | null;
  url: string | null;
}

export interface PortableMysteryProvenanceV1 {
  createdAt: string;
  prismVersion: string;
  generatedWith: string[];
}

export interface PortableMysteryLicenseV1 {
  name: string;
  url: string | null;
  allowsRedistribution: boolean;
}

export interface PortableMysteryCreatorSignatureV1 {
  algorithm: "ed25519";
  publicKey: string;
  signature: string;
}

/** Public metadata that can be shown before decrypting or expanding a package. */
export interface MansionPackageHeaderV1 {
  magic: typeof PORTABLE_MYSTERY_PACKAGE_MAGIC_V1;
  formatVersion: PortableMysteryFormatVersionV1;
  packageType: PortableMysteryPackageTypeV1;
  title: string;
  creatorName: string;
  compatibility: PortableMysteryCompatibilityV1;
  compressedBytes: number;
  expandedBytes: number;
  assetCount: number;
  contentWarnings: string[];
  payloadSha256: string;
  encryptionMode: PortableMysteryEncryptionModeV1;
  creatorSignature: PortableMysteryCreatorSignatureV1 | null;
}

export interface PortableMysteryAssetDescriptorV1 {
  id: string;
  role: PortableMysteryAssetRoleV1;
  archivePath: string;
  sha256: string;
  byteLength: number;
  mimeType: PortableMysteryAssetMimeTypeV1;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export interface MansionPackageRoomSlotV1 {
  id: string;
  x: number;
  y: number;
}

export interface MansionPackageRoomV1 {
  id: string;
  templateId: string;
  name: string;
  floor: number;
  x: number;
  y: number;
  width: number;
  height: number;
  neighborIds: string[];
  slots: MansionPackageRoomSlotV1[];
  emoji: string;
  roomAssetId: string | null;
  /** Optional high-detail plate. Missing means Mosaic is derived from roomAssetId. */
  illustratedRoomAssetId?: string | null;
  propAssetIds: string[];
}

export interface MansionRoomArtContractV1 {
  version: 1;
  defaultStyle: "mosaic";
  source: { width: 1280; height: 720; quality: "low" };
  mosaic: {
    logicalWidth: 320;
    logicalHeight: 180;
    outputWidth: 1600;
    outputHeight: 900;
    paletteColors: 24;
    dither: false;
    cellSize: 5;
    grid: { red: 3; green: 8; blue: 14; alpha: 30 };
  };
  illustrated: {
    outputWidth: 1600;
    outputHeight: 900;
    source: "generative-upgrade";
  };
  avatars: {
    mosaic: "mini";
    illustrated: "full";
    footprint: "unchanged";
  };
}

export const DEFAULT_MANSION_ROOM_ART_CONTRACT_V1: MansionRoomArtContractV1 = {
  version: 1,
  defaultStyle: "mosaic",
  source: { width: 1280, height: 720, quality: "low" },
  mosaic: {
    logicalWidth: 320,
    logicalHeight: 180,
    outputWidth: 1600,
    outputHeight: 900,
    paletteColors: 24,
    dither: false,
    cellSize: 5,
    grid: { red: 3, green: 8, blue: 14, alpha: 30 },
  },
  illustrated: {
    outputWidth: 1600,
    outputHeight: 900,
    source: "generative-upgrade",
  },
  avatars: { mosaic: "mini", illustrated: "full", footprint: "unchanged" },
};

export type MansionAtmosphereWeatherV1 =
  | "clear"
  | "fog"
  | "rain"
  | "snow"
  | "storm"
  | "wind";

export type MansionAtmosphereTimeOfDayV1 =
  | "dawn"
  | "day"
  | "dusk"
  | "night"
  | "unknown";

/** Spoiler-safe environmental continuity frozen with the reusable house. */
export interface MansionAtmosphereContractV1 {
  version: 1;
  weather: MansionAtmosphereWeatherV1;
  timeOfDay: MansionAtmosphereTimeOfDayV1;
  exteriorSetting: string;
  houseCondition: string;
  mood: string;
}

export type MansionAcousticAssetScopeV1 = "shared" | "theme" | "mansion";
export type MansionAcousticSemanticRoleV1 =
  | "world_bed"
  | "weather_stem"
  | "structural_motif"
  | "room_stem"
  | "localized_emitter"
  | "nonsemantic_stinger";

export interface MansionAcousticAssetReferenceV1 {
  id: string;
  semanticRole: MansionAcousticSemanticRoleV1;
  scope: MansionAcousticAssetScopeV1;
  /** Content-addressed PRISM library or reusable theme-palette asset. */
  sharedAssetId: string | null;
  /** Descriptor ID only for mansion-unique bytes carried by this package. */
  packageAssetId: string | null;
  contentSha256: string;
  fallbackSharedAssetId: string | null;
  generation: {
    source: "authored" | "bundled" | "procedural" | "synthesized";
    provider: string | null;
    model: string | null;
  };
}

export interface MansionAcousticSurfaceMappingV1 {
  interaction: "door" | "footstep" | "object_impact" | "portal";
  materialId: string;
  sharedAssetIds: string[];
}

export interface MansionAcousticEmitterV1 {
  id: string;
  /** Ambient emitters are deliberately non-semantic: clue-bearing sounds are stage cues. */
  role:
    | "clock"
    | "electrical"
    | "fire"
    | "hvac"
    | "insects"
    | "machinery"
    | "plumbing"
    | "structural_creak"
    | "water"
    | "weather_window"
    | "weather_roof";
  assetReferenceId: string;
  x: number;
  y: number;
  radius: number;
  conditions: string[];
}

export interface MansionAmbienceRoomProfileV1 {
  roomId: string;
  acousticPresetId: string;
  exposure: number;
  dampening: number;
  reverbSend: number;
  lowPassHz: number;
  surfaceMaterialId: string;
  emitters: MansionAcousticEmitterV1[];
}

export interface MansionAmbienceManifestV1 {
  version: 1;
  acousticLibrary: { id: string; version: number };
  themePaletteId: string | null;
  bespokeSynthesisRequested: boolean;
  promptContractHash: string;
  atmosphere: MansionAtmosphereContractV1;
  deterministicVariationSeed: string;
  assets: MansionAcousticAssetReferenceV1[];
  surfaceMappings: MansionAcousticSurfaceMappingV1[];
  roomProfiles: MansionAmbienceRoomProfileV1[];
  crossfade: {
    curve: "equal_power";
    roomTransitionMs: number;
    stopFadeMs: number;
  };
  speechDucking: { gain: number; attackMs: number; releaseMs: number };
  /** These never self-trigger; a sealed case stage cue must name the ID. */
  stageCueStingerAllowlist: string[];
  fallbackSharedAssetIds: string[];
}

export interface MansionPackageManifestV1 {
  schema: "prism-mansion-package-v1";
  formatVersion: PortableMysteryFormatVersionV1;
  packageId: string;
  title: string;
  description: string;
  creator: PortableMysteryCreatorV1;
  provenance: PortableMysteryProvenanceV1;
  license: PortableMysteryLicenseV1;
  contentWarnings: string[];
  compatibility: PortableMysteryCompatibilityV1;
  floorCount: number;
  /** Additive so V1 packages without it remain readable. */
  scaleClass?: "compact" | "standard" | "grand";
  /** Additive connected planner contract. `rooms` remains the V1-compatible
   * semantic projection so older PRISM installs can still play the package. */
  layoutV2?: MansionLayoutV2;
  rooms: MansionPackageRoomV1[];
  houseStyle: {
    id: string;
    label: string;
    promptContract: string;
  };
  assets: PortableMysteryAssetDescriptorV1[];
  /** New packages use a single exterior establishing shot. Legacy room-based
   * previews remain readable but are not emitted by current Case Forge. */
  previewAssetId: string | null;
  investigationThemeAssetId: string | null;
  /** Additive title for the active packaged investigation theme. */
  investigationThemeTitle?: string | null;
  /** Additive decoded loop contract; legacy themes use runtime-safe defaults. */
  investigationThemeLoop?: MansionMusicLoopV1 | null;
  /** Sealed mansion-only musical identity; legacy packages derive one on install. */
  musicIdentity?: MansionMusicIdentityV1;
  /** Additive: legacy packages derive room art with PRISM defaults. */
  roomArt?: MansionRoomArtContractV1;
  /** Optional so legacy one-floor and pre-ambience packages stay valid. */
  ambience?: MansionAmbienceManifestV1 | null;
}

export interface PortableMansionInstallationMetadataV1 {
  packageId: string;
  payloadSha256: string;
  description: string;
  creator: PortableMysteryCreatorV1;
  provenance: PortableMysteryProvenanceV1;
  license: PortableMysteryLicenseV1;
  contentWarnings: string[];
  encryptionMode: PortableMysteryEncryptionModeV1;
  creatorSignature: PortableMysteryCreatorSignatureV1 | null;
}

export interface PortableMansionPackagePreviewV1 {
  header: MansionPackageHeaderV1;
  description: string;
  previewImageDataUrl: string | null;
  floorCount: number;
  roomCount: number;
  propCount: number;
  hasInvestigationTheme: boolean;
  provenance: PortableMysteryProvenanceV1;
  license: PortableMysteryLicenseV1;
  duplicateBundleId: string | null;
}

export interface WhodunnitPackageCastSnapshotV1 {
  id: string;
  name: string;
  presentation: { [key: string]: PortablePackageJsonValueV1 };
  voiceId: string | null;
}

export interface WhodunnitPackageVoiceV1 {
  id: string;
  castSnapshotId: string;
  manifestAssetIds: string[];
  profile: { [key: string]: PortablePackageJsonValueV1 };
}

export interface WhodunnitPackageRuntimeAssetBindingV1 {
  assetId: string;
  kind: "evidence" | "room" | "voice";
  subjectId: string;
  lineId: string | null;
  status: "ready" | "fallback" | "complete";
  source: "synthesized" | "bundled" | "local";
}

export interface WhodunnitPackageCompletedPlaythroughV1 {
  schema: "prism-whodunnit-playthrough-v1";
  completedAt: string;
  transcript: PortablePackageJsonValueV1[];
  discoveryIds: string[];
  prosecutionChoiceIds: string[];
  record: PortablePackageJsonValueV1[];
  theory: { [key: string]: PortablePackageJsonValueV1 } | null;
  court: { [key: string]: PortablePackageJsonValueV1 } | null;
  verdict: { [key: string]: PortablePackageJsonValueV1 };
  calloutHistory: PortablePackageJsonValueV1[];
}

/** Authenticated replay substrate. It contains no provider request/response,
 * authoring checkpoint, prompt, account id, or source storage path. */
export interface WhodunnitPackageRuntimeV1 {
  session: { [key: string]: PortablePackageJsonValueV1 };
  compiledPublicState: { [key: string]: PortablePackageJsonValueV1 };
  completedPlaythrough?: WhodunnitPackageCompletedPlaythroughV1 | null;
  audioManifest: { [key: string]: PortablePackageJsonValueV1 } | null;
  assetBindings: WhodunnitPackageRuntimeAssetBindingV1[];
}

/**
 * This manifest lives inside the authenticated package payload. `privateCase`
 * and `proofContract` must never be copied into public headers or projections.
 */
export interface WhodunnitPackageManifestV1 {
  schema: "prism-whodunnit-package-v1";
  formatVersion: PortableMysteryFormatVersionV1;
  packageId: string;
  title: string;
  description: string;
  creator: PortableMysteryCreatorV1;
  provenance: PortableMysteryProvenanceV1;
  license: PortableMysteryLicenseV1;
  contentWarnings: string[];
  compatibility: PortableMysteryCompatibilityV1;
  mansionManifest: MansionPackageManifestV1;
  mansionManifestSha256: string;
  cast: WhodunnitPackageCastSnapshotV1[];
  publicCase: { [key: string]: PortablePackageJsonValueV1 };
  privateCase: { [key: string]: PortablePackageJsonValueV1 };
  proofContract: { [key: string]: PortablePackageJsonValueV1 };
  dialogueGraph: { [key: string]: PortablePackageJsonValueV1 };
  court: { [key: string]: PortablePackageJsonValueV1 };
  evidenceAssignments: { [key: string]: PortablePackageJsonValueV1 };
  voices: WhodunnitPackageVoiceV1[];
  assets: PortableMysteryAssetDescriptorV1[];
  runtime: WhodunnitPackageRuntimeV1;
  silent: boolean;
}

const SHA256_HEX = /^[a-f0-9]{64}$/u;
const SAFE_ARCHIVE_PATH = /^(?:assets|audio)\/[a-f0-9]{64}\.(?:png|webp|mp3|ogg|wav)$/u;
const MAX_PORTABLE_LEGACY_ROOMS_V1 = 64;
const MAX_PORTABLE_LEGACY_FLOORS_V1 = 64;
const MAX_PORTABLE_LEGACY_COORDINATE_V1 = 4_096;
const MAX_PORTABLE_ASSETS_V1 = 511;
const MAX_PORTABLE_CAST_V1 = 64;
const MANSION_PRIVATE_FIELD_NAMES = new Set([
  "caseTitle",
  "victim",
  "culprit",
  "testimony",
  "discoveryPlacement",
  "suspectAssignments",
  "assignedSuspectSeatId",
  "privateCase",
  "proofContract",
  "dialogueGraph",
  "court",
  "evidenceMeanings",
  "evidenceAssignments",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function privateMansionFields(value: unknown, path = "manifest"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => privateMansionFields(entry, `${path}[${index}]`));
  }
  if (!isRecord(value)) return [];
  const errors: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (MANSION_PRIVATE_FIELD_NAMES.has(key)) {
      errors.push(`${path}.${key} is case-private and cannot appear in a mansion package.`);
      continue;
    }
    errors.push(...privateMansionFields(entry, `${path}.${key}`));
  }
  return errors;
}

function validateFormatVersion(value: unknown, path: string): string[] {
  if (!isRecord(value)) return [`${path} is missing.`];
  if (value.major !== PORTABLE_MYSTERY_PACKAGE_FORMAT_MAJOR_V1) {
    return [`${path}.major is unsupported.`];
  }
  return isNonNegativeInteger(value.minor) ? [] : [`${path}.minor is invalid.`];
}

function validateCompatibility(value: unknown, path: string): string[] {
  if (!isRecord(value)) return [`${path} is missing.`];
  const errors: string[] = [];
  if (!isNonNegativeInteger(value.minimumFormatMajor)) {
    errors.push(`${path}.minimumFormatMajor is invalid.`);
  }
  if (!isNonNegativeInteger(value.maximumFormatMajor)) {
    errors.push(`${path}.maximumFormatMajor is invalid.`);
  }
  if (
    isNonNegativeInteger(value.minimumFormatMajor) &&
    isNonNegativeInteger(value.maximumFormatMajor) &&
    value.minimumFormatMajor > value.maximumFormatMajor
  ) {
    errors.push(`${path} has an inverted format range.`);
  }
  if (value.minimumPrismVersion !== null && typeof value.minimumPrismVersion !== "string") {
    errors.push(`${path}.minimumPrismVersion is invalid.`);
  }
  return errors;
}

function validateAsset(value: unknown, path: string): string[] {
  if (!isRecord(value)) return [`${path} is invalid.`];
  const errors: string[] = [];
  if (!isNonEmptyString(value.id)) errors.push(`${path}.id is missing.`);
  if (!["room", "prop", "ambience", "music", "preview", "presentation", "voice"].includes(String(value.role))) {
    errors.push(`${path}.role is unsupported.`);
  }
  if (typeof value.archivePath !== "string" || !SAFE_ARCHIVE_PATH.test(value.archivePath)) {
    errors.push(`${path}.archivePath is unsafe.`);
  }
  if (typeof value.sha256 !== "string" || !SHA256_HEX.test(value.sha256)) {
    errors.push(`${path}.sha256 is invalid.`);
  }
  if (!isNonNegativeInteger(value.byteLength)) errors.push(`${path}.byteLength is invalid.`);
  if (!["image/png", "image/webp", "audio/mpeg", "audio/ogg", "audio/wav"].includes(String(value.mimeType))) {
    errors.push(`${path}.mimeType is unsupported.`);
  }
  for (const dimension of ["width", "height", "durationMs"] as const) {
    if (value[dimension] !== null && !isNonNegativeInteger(value[dimension])) {
      errors.push(`${path}.${dimension} is invalid.`);
    }
  }
  return errors;
}

function validateAssetCollection(
  value: unknown,
  path: string,
): {
  errors: string[];
  byId: Map<string, Record<string, unknown>>;
} {
  const errors: string[] = [];
  const byId = new Map<string, Record<string, unknown>>();
  const paths = new Set<string>();
  if (!Array.isArray(value)) return { errors: [`${path} is invalid.`], byId };
  if (value.length > MAX_PORTABLE_ASSETS_V1) {
    errors.push(`${path} exceeds the portable capacity.`);
  }
  value.forEach((asset, index) => {
    const assetPath = `${path}[${index}]`;
    errors.push(...validateAsset(asset, assetPath));
    if (!isRecord(asset)) return;
    if (isNonEmptyString(asset.id)) {
      if (byId.has(asset.id)) errors.push(`${assetPath}.id is duplicated.`);
      else byId.set(asset.id, asset);
    }
    if (typeof asset.archivePath === "string") {
      if (paths.has(asset.archivePath)) errors.push(`${assetPath}.archivePath is duplicated.`);
      else paths.add(asset.archivePath);
    }
  });
  return { errors, byId };
}

function assetReferenceIsCompatible(
  asset: Record<string, unknown> | undefined,
  roles: readonly string[],
  media: "image" | "audio",
): boolean {
  if (!asset || !roles.includes(String(asset.role))) return false;
  return typeof asset.mimeType === "string" && asset.mimeType.startsWith(`${media}/`);
}

function portableMansionLayoutV2Shape(value: unknown): value is MansionLayoutV2 {
  if (!isRecord(value) || value.version !== 2 || !isRecord(value.envelope)) return false;
  if (
    !Array.isArray(value.entities) || !Array.isArray(value.doors) ||
    !Array.isArray(value.verticalConnectors) || !Array.isArray(value.placementAnchors) ||
    !Array.isArray(value.lights) || !Array.isArray(value.roomArtCandidates)
  ) return false;
  if (!value.entities.every((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.kind !== "string") return false;
    if (entry.kind === "room") {
      return typeof entry.templateId === "string" && typeof entry.name === "string" &&
        typeof entry.rotation === "number";
    }
    return (entry.kind === "corridor" || entry.kind === "infill") &&
      typeof entry.width === "number" && typeof entry.height === "number";
  })) return false;
  if (!value.doors.every((entry) => isRecord(entry) &&
    typeof entry.id === "string" && typeof entry.aEntityId === "string" &&
    typeof entry.bEntityId === "string" && typeof entry.aWall === "string")) return false;
  if (!value.verticalConnectors.every((entry) => isRecord(entry) &&
    typeof entry.id === "string" && typeof entry.kind === "string" &&
    typeof entry.lowerEntityId === "string" && typeof entry.upperEntityId === "string")) return false;
  if (!value.placementAnchors.every((entry) => isRecord(entry) &&
    typeof entry.id === "string" && typeof entry.roomId === "string" &&
    typeof entry.name === "string" && typeof entry.relation === "string" &&
    isRecord(entry.point))) return false;
  if (!value.lights.every((entry) => {
    if (!isRecord(entry) || !["fire", "omni", "directional", "neon"].includes(String(entry.kind)) ||
      typeof entry.id !== "string" || typeof entry.roomId !== "string" ||
      typeof entry.color !== "string" || typeof entry.animationSeed !== "string" ||
      !isRecord(entry.geometry) || !isRecord(entry.cuePermission) ||
      !Array.isArray(entry.cuePermission.allowedCueIds)) return false;
    return entry.kind !== "neon" || Array.isArray(entry.geometry.points) &&
      entry.geometry.points.every(isRecord);
  })) return false;
  return value.roomArtCandidates.every((entry) => isRecord(entry) &&
    typeof entry.id === "string" && typeof entry.roomId === "string" &&
    typeof entry.status === "string" && typeof entry.prompt === "string" &&
    typeof entry.promptSha256 === "string" && typeof entry.createdAt === "string");
}

export function validateMansionPackageHeaderV1(value: unknown): string[] {
  if (!isRecord(value)) return ["header is invalid."];
  const errors = [
    ...validateFormatVersion(value.formatVersion, "header.formatVersion"),
    ...validateCompatibility(value.compatibility, "header.compatibility"),
  ];
  if (value.magic !== PORTABLE_MYSTERY_PACKAGE_MAGIC_V1) errors.push("header.magic is invalid.");
  if (value.packageType !== "mansion" && value.packageType !== "whodunnit") {
    errors.push("header.packageType is invalid.");
  }
  for (const key of ["title", "creatorName"] as const) {
    if (!isNonEmptyString(value[key])) errors.push(`header.${key} is missing.`);
  }
  for (const key of ["compressedBytes", "expandedBytes", "assetCount"] as const) {
    if (!isNonNegativeInteger(value[key])) errors.push(`header.${key} is invalid.`);
  }
  if (!Array.isArray(value.contentWarnings) || !value.contentWarnings.every(isNonEmptyString)) {
    errors.push("header.contentWarnings is invalid.");
  }
  if (typeof value.payloadSha256 !== "string" || !SHA256_HEX.test(value.payloadSha256)) {
    errors.push("header.payloadSha256 is invalid.");
  }
  if (value.encryptionMode !== "spoiler_seal" && value.encryptionMode !== "password") {
    errors.push("header.encryptionMode is invalid.");
  }
  return errors;
}

export function validateMansionPackageManifestV1(value: unknown): string[] {
  if (!isRecord(value)) return ["manifest is invalid."];
  const errors = [
    ...privateMansionFields(value),
    ...validateFormatVersion(value.formatVersion, "manifest.formatVersion"),
    ...validateCompatibility(value.compatibility, "manifest.compatibility"),
  ];
  if (value.schema !== "prism-mansion-package-v1") errors.push("manifest.schema is invalid.");
  for (const key of ["packageId", "title", "description"] as const) {
    if (!isNonEmptyString(value[key])) errors.push(`manifest.${key} is missing.`);
  }
  if (!isNonNegativeInteger(value.floorCount) || value.floorCount < 1) {
    errors.push("manifest.floorCount is invalid.");
  } else if (value.layoutV2 === undefined && value.floorCount > MAX_PORTABLE_LEGACY_FLOORS_V1) {
    errors.push("manifest.floorCount exceeds the legacy portable bound.");
  }
  if (
    value.scaleClass !== undefined &&
    value.scaleClass !== "compact" &&
    value.scaleClass !== "standard" &&
    value.scaleClass !== "grand"
  ) {
    errors.push("manifest.scaleClass is invalid.");
  }
  const assetCollection = validateAssetCollection(value.assets, "manifest.assets");
  errors.push(...assetCollection.errors);
  const roomIds = new Set<string>();
  if (!Array.isArray(value.rooms) || value.rooms.length < 1) {
    errors.push("manifest.rooms is empty.");
  } else {
    const portableRoomCount = value.rooms.length;
    if (value.layoutV2 === undefined && value.rooms.length > MAX_PORTABLE_LEGACY_ROOMS_V1) {
      errors.push("manifest.rooms exceeds the legacy portable capacity.");
    }
    const slotIds = new Set<string>();
    value.rooms.forEach((room, index) => {
      const path = `manifest.rooms[${index}]`;
      if (!isRecord(room)) {
        errors.push(`${path} is invalid.`);
        return;
      }
      for (const key of ["id", "templateId", "name", "emoji"] as const) {
        if (!isNonEmptyString(room[key])) errors.push(`${path}.${key} is missing.`);
      }
      if (isNonEmptyString(room.id)) {
        if (roomIds.has(room.id)) errors.push(`${path}.id is duplicated.`);
        else roomIds.add(room.id);
      }
      if (!isNonNegativeInteger(room.floor) || room.floor < 1 ||
          isNonNegativeInteger(value.floorCount) && room.floor > value.floorCount) {
        errors.push(`${path}.floor is invalid.`);
      }
      for (const key of ["x", "y"] as const) {
        if (!isFiniteNumber(room[key]) || room[key] < 0 || room[key] > MAX_PORTABLE_LEGACY_COORDINATE_V1) {
          errors.push(`${path}.${key} is invalid.`);
        }
      }
      for (const key of ["width", "height"] as const) {
        if (!isFiniteNumber(room[key]) || room[key] <= 0 || room[key] > MAX_PORTABLE_LEGACY_COORDINATE_V1) {
          errors.push(`${path}.${key} is invalid.`);
        }
      }
      if (
        isFiniteNumber(room.x) && isFiniteNumber(room.width) &&
        room.x + room.width > MAX_PORTABLE_LEGACY_COORDINATE_V1 ||
        isFiniteNumber(room.y) && isFiniteNumber(room.height) &&
        room.y + room.height > MAX_PORTABLE_LEGACY_COORDINATE_V1
      ) {
        errors.push(`${path} exceeds the legacy coordinate bound.`);
      }
      if (!Array.isArray(room.neighborIds) || !room.neighborIds.every(isNonEmptyString)) {
        errors.push(`${path}.neighborIds is invalid.`);
      } else if (room.neighborIds.length > portableRoomCount) {
        errors.push(`${path}.neighborIds exceeds the room bound.`);
      } else if (new Set(room.neighborIds).size !== room.neighborIds.length) {
        errors.push(`${path}.neighborIds contains duplicates.`);
      }
      if (!Array.isArray(room.slots)) {
        errors.push(`${path}.slots is invalid.`);
      } else {
        if (room.slots.length > MAX_PORTABLE_CAST_V1) {
          errors.push(`${path}.slots exceeds the portable capacity.`);
        }
        room.slots.forEach((slot, slotIndex) => {
          const slotPath = `${path}.slots[${slotIndex}]`;
          if (!isRecord(slot) || !isNonEmptyString(slot.id) ||
              !isFiniteNumber(slot.x) || slot.x < 0 || slot.x > 1 ||
              !isFiniteNumber(slot.y) || slot.y < 0 || slot.y > 1) {
            errors.push(`${slotPath} is invalid.`);
            return;
          }
          if (slotIds.has(slot.id)) errors.push(`${slotPath}.id is duplicated.`);
          else slotIds.add(slot.id);
        });
      }
      if (room.roomAssetId !== null && !isNonEmptyString(room.roomAssetId)) {
        errors.push(`${path}.roomAssetId is invalid.`);
      } else if (typeof room.roomAssetId === "string" && !assetReferenceIsCompatible(
        assetCollection.byId.get(room.roomAssetId), ["room", "presentation"], "image",
      )) {
        errors.push(`${path}.roomAssetId does not reference compatible room art.`);
      }
      if (
        room.illustratedRoomAssetId !== undefined &&
        room.illustratedRoomAssetId !== null &&
        !isNonEmptyString(room.illustratedRoomAssetId)
      ) {
        errors.push(`${path}.illustratedRoomAssetId is invalid.`);
      } else if (
        typeof room.illustratedRoomAssetId === "string" &&
        !assetReferenceIsCompatible(
          assetCollection.byId.get(room.illustratedRoomAssetId),
          ["room", "presentation"],
          "image",
        )
      ) {
        errors.push(`${path}.illustratedRoomAssetId does not reference compatible room art.`);
      }
      if (!Array.isArray(room.propAssetIds) || !room.propAssetIds.every(isNonEmptyString)) {
        errors.push(`${path}.propAssetIds is invalid.`);
      } else {
        if (room.propAssetIds.length > MAX_PORTABLE_ASSETS_V1) {
          errors.push(`${path}.propAssetIds exceeds the portable capacity.`);
        }
        if (new Set(room.propAssetIds).size !== room.propAssetIds.length) {
          errors.push(`${path}.propAssetIds contains duplicates.`);
        }
        for (const id of room.propAssetIds) {
          if (!assetReferenceIsCompatible(
            assetCollection.byId.get(id), ["prop", "presentation"], "image",
          )) errors.push(`${path}.propAssetIds references incompatible prop art.`);
        }
      }
    });
    value.rooms.forEach((room, index) => {
      if (!isRecord(room) || !Array.isArray(room.neighborIds)) return;
      for (const id of room.neighborIds) {
        if (typeof id === "string" && (!roomIds.has(id) || id === room.id)) {
          errors.push(`manifest.rooms[${index}].neighborIds references an invalid room.`);
        }
      }
    });
  }
  if (value.layoutV2 !== undefined) {
    if (!portableMansionLayoutV2Shape(value.layoutV2)) {
      errors.push("manifest.layoutV2 is invalid.");
    } else {
      const layoutErrors = validateMansionLayoutV2(value.layoutV2, {
        requireEditorFloors: true,
      });
      errors.push(...layoutErrors.map((error) => `manifest.layoutV2: ${error}`));
      if (layoutErrors.length === 0 && Array.isArray(value.rooms)) {
        const projected = mansionLayoutV2ToLegacyRooms(value.layoutV2);
        const projectedById = new Map(projected.map((room) => [room.id, room]));
        if (projected.length !== value.rooms.length) {
          errors.push("manifest.layoutV2 semantic rooms do not match manifest.rooms.");
        }
        for (const room of value.rooms) {
          if (!isRecord(room) || !isNonEmptyString(room.id)) continue;
          const source = projectedById.get(room.id);
          if (!source) {
            errors.push(`manifest.layoutV2 is missing semantic room ${room.id}.`);
            continue;
          }
          const compatible = room.templateId === source.templateId &&
            room.name === source.name && room.floor === source.floor &&
            room.x === source.x && room.y === source.y &&
            room.width === source.width && room.height === source.height &&
            Array.isArray(room.neighborIds) &&
            [...room.neighborIds].sort().join("\u0000") === [...source.neighborIds].sort().join("\u0000");
          if (!compatible) errors.push(`manifest.layoutV2 projection for ${room.id} is not canonical.`);
        }
        const highestFloor = Math.max(0, ...projected.map((room) => room.floor));
        if (value.floorCount !== highestFloor) {
          errors.push("manifest.floorCount does not match manifest.layoutV2.");
        }
      }
      for (const entity of value.layoutV2.entities) {
        if (entity.kind !== "room" || !entity.acceptedRoomAssetId) continue;
        if (!assetReferenceIsCompatible(
          assetCollection.byId.get(entity.acceptedRoomAssetId),
          ["room", "presentation"],
          "image",
        )) errors.push(`manifest.layoutV2 room ${entity.id} references incompatible accepted art.`);
      }
      for (const candidate of value.layoutV2.roomArtCandidates) {
        if (candidate.status !== "ready" || !candidate.assetId) continue;
        if (!assetReferenceIsCompatible(
          assetCollection.byId.get(candidate.assetId),
          ["room", "presentation"],
          "image",
        )) errors.push(`manifest.layoutV2 candidate ${candidate.id} references incompatible art.`);
      }
    }
  }
  if (value.roomArt !== undefined) {
    const roomArt = value.roomArt;
    if (
      !isRecord(roomArt) ||
      roomArt.version !== 1 ||
      roomArt.defaultStyle !== "mosaic" ||
      !isRecord(roomArt.source) ||
      roomArt.source.width !== 1280 ||
      roomArt.source.height !== 720 ||
      roomArt.source.quality !== "low" ||
      !isRecord(roomArt.mosaic) ||
      roomArt.mosaic.logicalWidth !== 320 ||
      roomArt.mosaic.logicalHeight !== 180 ||
      roomArt.mosaic.outputWidth !== 1600 ||
      roomArt.mosaic.outputHeight !== 900 ||
      roomArt.mosaic.paletteColors !== 24 ||
      roomArt.mosaic.dither !== false ||
      roomArt.mosaic.cellSize !== 5 ||
      !isRecord(roomArt.illustrated) ||
      roomArt.illustrated.outputWidth !== 1600 ||
      roomArt.illustrated.outputHeight !== 900 ||
      roomArt.illustrated.source !== "generative-upgrade"
    ) {
      errors.push("manifest.roomArt is invalid.");
    }
  }
  if (!isRecord(value.houseStyle) ||
      !isNonEmptyString(value.houseStyle.id) ||
      !isNonEmptyString(value.houseStyle.label) ||
      !isNonEmptyString(value.houseStyle.promptContract)) {
    errors.push("manifest.houseStyle is invalid.");
  }
  if (value.previewAssetId !== null && !isNonEmptyString(value.previewAssetId)) {
    errors.push("manifest.previewAssetId is invalid.");
  } else if (typeof value.previewAssetId === "string" && !assetReferenceIsCompatible(
    assetCollection.byId.get(value.previewAssetId), ["room", "preview", "presentation"], "image",
  )) {
    errors.push("manifest.previewAssetId does not reference compatible preview art.");
  }
  if (value.investigationThemeAssetId !== null && !isNonEmptyString(value.investigationThemeAssetId)) {
    errors.push("manifest.investigationThemeAssetId is invalid.");
  } else if (typeof value.investigationThemeAssetId === "string" && !assetReferenceIsCompatible(
    assetCollection.byId.get(value.investigationThemeAssetId), ["music"], "audio",
  )) {
    errors.push("manifest.investigationThemeAssetId does not reference music.");
  }
  if (
    value.investigationThemeTitle !== undefined &&
    value.investigationThemeTitle !== null &&
    !isNonEmptyString(value.investigationThemeTitle)
  ) {
    errors.push("manifest.investigationThemeTitle is invalid.");
  }
  const musicIdentityErrors = value.musicIdentity === undefined
    ? []
    : validateMansionMusicIdentityV1(value.musicIdentity);
  const validMusicIdentity = value.musicIdentity !== undefined && musicIdentityErrors.length === 0
    ? value.musicIdentity as MansionMusicIdentityV1
    : null;
  if (value.investigationThemeLoop !== undefined && value.investigationThemeLoop !== null) {
    const themeDuration = typeof value.investigationThemeAssetId === "string"
      ? assetCollection.byId.get(value.investigationThemeAssetId)?.durationMs
      : null;
    if (typeof themeDuration !== "number" || !validMusicIdentity) {
      errors.push("manifest.investigationThemeLoop requires a timed theme and music identity.");
    } else {
      errors.push(...validateMansionMusicLoopV1(
        value.investigationThemeLoop,
        themeDuration,
        validMusicIdentity,
      ).map((error) => `manifest.${error}`));
    }
  }
  errors.push(...musicIdentityErrors.map((error) => `manifest.${error}`));
  if (value.ambience !== undefined && value.ambience !== null) {
    if (!isRecord(value.ambience) || value.ambience.version !== 1) {
      errors.push("manifest.ambience is invalid.");
    } else {
      const atmosphere = value.ambience.atmosphere;
      const weather = ["clear", "fog", "rain", "snow", "storm", "wind"];
      const times = ["dawn", "day", "dusk", "night", "unknown"];
      if (
        !isRecord(atmosphere) ||
        atmosphere.version !== 1 ||
        !weather.includes(String(atmosphere.weather)) ||
        !times.includes(String(atmosphere.timeOfDay)) ||
        !isNonEmptyString(atmosphere.exteriorSetting) ||
        !isNonEmptyString(atmosphere.houseCondition) ||
        !isNonEmptyString(atmosphere.mood)
      ) errors.push("manifest.ambience.atmosphere is invalid.");
      if (!isRecord(value.ambience.acousticLibrary) ||
          !isNonEmptyString(value.ambience.acousticLibrary.id) ||
          !isNonNegativeInteger(value.ambience.acousticLibrary.version) ||
          value.ambience.acousticLibrary.version < 1) {
        errors.push("manifest.ambience.acousticLibrary is invalid.");
      }
      if (value.ambience.themePaletteId !== null && !isNonEmptyString(value.ambience.themePaletteId)) {
        errors.push("manifest.ambience.themePaletteId is invalid.");
      }
      if (typeof value.ambience.bespokeSynthesisRequested !== "boolean") {
        errors.push("manifest.ambience.bespokeSynthesisRequested is invalid.");
      }
      if (typeof value.ambience.promptContractHash !== "string" ||
          !SHA256_HEX.test(value.ambience.promptContractHash)) {
        errors.push("manifest.ambience.promptContractHash is invalid.");
      }
      if (!isNonEmptyString(value.ambience.deterministicVariationSeed)) {
        errors.push("manifest.ambience.deterministicVariationSeed is invalid.");
      }
      const acousticReferences = new Map<string, Record<string, unknown>>();
      if (!Array.isArray(value.ambience.assets)) {
        errors.push("manifest.ambience.assets is invalid.");
      } else {
        const semanticRoles = [
          "world_bed", "weather_stem", "structural_motif", "room_stem",
          "localized_emitter", "nonsemantic_stinger",
        ];
        value.ambience.assets.forEach((reference, index) => {
          const path = `manifest.ambience.assets[${index}]`;
          if (!isRecord(reference) || !isNonEmptyString(reference.id) ||
              !semanticRoles.includes(String(reference.semanticRole)) ||
              !["shared", "theme", "mansion"].includes(String(reference.scope)) ||
              typeof reference.contentSha256 !== "string" || !SHA256_HEX.test(reference.contentSha256) ||
              reference.fallbackSharedAssetId !== null && !isNonEmptyString(reference.fallbackSharedAssetId) ||
              !isRecord(reference.generation) ||
              !["authored", "bundled", "procedural", "synthesized"].includes(String(reference.generation.source)) ||
              reference.generation.provider !== null && !isNonEmptyString(reference.generation.provider) ||
              reference.generation.model !== null && !isNonEmptyString(reference.generation.model)) {
            errors.push(`${path} is invalid.`);
            return;
          }
          if (acousticReferences.has(reference.id)) errors.push(`${path}.id is duplicated.`);
          else acousticReferences.set(reference.id, reference);
          const isMansionAsset = reference.scope === "mansion";
          if (isMansionAsset) {
            if (!isNonEmptyString(reference.packageAssetId) || reference.sharedAssetId !== null ||
                !assetReferenceIsCompatible(
                  assetCollection.byId.get(String(reference.packageAssetId)), ["ambience"], "audio",
                )) {
              errors.push(`${path} does not reference compatible mansion ambience.`);
            } else if (assetCollection.byId.get(reference.packageAssetId)?.sha256 !== reference.contentSha256) {
              errors.push(`${path}.contentSha256 does not match its package asset.`);
            }
          } else if (!isNonEmptyString(reference.sharedAssetId) || reference.packageAssetId !== null) {
            errors.push(`${path} does not reference a shared acoustic asset.`);
          }
        });
        for (const [assetId, descriptor] of assetCollection.byId) {
          if (descriptor.role === "ambience" && !value.ambience.assets.some(
            (reference) => isRecord(reference) && reference.packageAssetId === assetId,
          )) errors.push("manifest.ambience.assets is missing a packaged ambience reference.");
        }
      }
      if (!Array.isArray(value.ambience.surfaceMappings)) {
        errors.push("manifest.ambience.surfaceMappings is invalid.");
      } else {
        value.ambience.surfaceMappings.forEach((mapping, index) => {
          if (!isRecord(mapping) ||
              !["door", "footstep", "object_impact", "portal"].includes(String(mapping.interaction)) ||
              !isNonEmptyString(mapping.materialId) ||
              !Array.isArray(mapping.sharedAssetIds) || !mapping.sharedAssetIds.every(isNonEmptyString)) {
            errors.push(`manifest.ambience.surfaceMappings[${index}] is invalid.`);
          }
        });
      }
      if (!Array.isArray(value.ambience.roomProfiles)) {
        errors.push("manifest.ambience.roomProfiles is invalid.");
      } else {
        const profileRoomIds = new Set<string>();
        value.ambience.roomProfiles.forEach((profile, index) => {
          const path = `manifest.ambience.roomProfiles[${index}]`;
          if (
            !isRecord(profile) ||
            !isNonEmptyString(profile.roomId) ||
            !roomIds.has(String(profile.roomId)) ||
            profileRoomIds.has(String(profile.roomId)) ||
            !isNonEmptyString(profile.acousticPresetId) ||
            !isFiniteNumber(profile.exposure) || profile.exposure < 0 || profile.exposure > 1 ||
            !isFiniteNumber(profile.dampening) || profile.dampening < 0 || profile.dampening > 1 ||
            !isFiniteNumber(profile.reverbSend) || profile.reverbSend < 0 || profile.reverbSend > 1 ||
            !isFiniteNumber(profile.lowPassHz) || profile.lowPassHz < 200 || profile.lowPassHz > 24_000 ||
            !isNonEmptyString(profile.surfaceMaterialId) ||
            !Array.isArray(profile.emitters)
          ) {
            errors.push(`${path} is invalid.`);
          } else {
            profileRoomIds.add(profile.roomId);
            const emitterIds = new Set<string>();
            const emitterRoles = [
              "clock", "electrical", "fire", "hvac", "insects", "machinery",
              "plumbing", "structural_creak", "water", "weather_window", "weather_roof",
            ];
            profile.emitters.forEach((emitter, emitterIndex) => {
              const emitterPath = `${path}.emitters[${emitterIndex}]`;
              if (!isRecord(emitter) || !isNonEmptyString(emitter.id) ||
                  emitterIds.has(String(emitter.id)) ||
                  !emitterRoles.includes(String(emitter.role)) ||
                  !isNonEmptyString(emitter.assetReferenceId) ||
                  acousticReferences.get(String(emitter.assetReferenceId))?.semanticRole !== "localized_emitter" ||
                  !isFiniteNumber(emitter.x) || emitter.x < 0 || emitter.x > 1 ||
                  !isFiniteNumber(emitter.y) || emitter.y < 0 || emitter.y > 1 ||
                  !isFiniteNumber(emitter.radius) || emitter.radius <= 0 || emitter.radius > 10 ||
                  !Array.isArray(emitter.conditions) || !emitter.conditions.every(isNonEmptyString)) {
                errors.push(`${emitterPath} is invalid.`);
              } else emitterIds.add(emitter.id);
            });
          }
        });
      }
      if (!isRecord(value.ambience.crossfade) ||
          value.ambience.crossfade.curve !== "equal_power" ||
          !isFiniteNumber(value.ambience.crossfade.roomTransitionMs) ||
          value.ambience.crossfade.roomTransitionMs < 0 || value.ambience.crossfade.roomTransitionMs > 60_000 ||
          !isFiniteNumber(value.ambience.crossfade.stopFadeMs) ||
          value.ambience.crossfade.stopFadeMs < 0 || value.ambience.crossfade.stopFadeMs > 60_000) {
        errors.push("manifest.ambience.crossfade is invalid.");
      }
      if (!isRecord(value.ambience.speechDucking) ||
          !isFiniteNumber(value.ambience.speechDucking.gain) ||
          value.ambience.speechDucking.gain < 0 || value.ambience.speechDucking.gain > 1 ||
          !isFiniteNumber(value.ambience.speechDucking.attackMs) ||
          value.ambience.speechDucking.attackMs < 0 || value.ambience.speechDucking.attackMs > 60_000 ||
          !isFiniteNumber(value.ambience.speechDucking.releaseMs) ||
          value.ambience.speechDucking.releaseMs < 0 || value.ambience.speechDucking.releaseMs > 60_000) {
        errors.push("manifest.ambience.speechDucking is invalid.");
      }
      for (const key of ["stageCueStingerAllowlist", "fallbackSharedAssetIds"] as const) {
        const entries = value.ambience[key];
        if (!Array.isArray(entries) || !entries.every(isNonEmptyString) ||
            new Set(entries).size !== entries.length) {
          errors.push(`manifest.ambience.${key} is invalid.`);
        }
      }
      if (Array.isArray(value.ambience.stageCueStingerAllowlist)) {
        for (const referenceId of value.ambience.stageCueStingerAllowlist) {
          if (typeof referenceId === "string" &&
              acousticReferences.get(referenceId)?.semanticRole !== "nonsemantic_stinger") {
            errors.push("manifest.ambience.stageCueStingerAllowlist references an invalid stinger.");
          }
        }
      }
    }
  }
  if ((value.ambience === undefined || value.ambience === null) &&
      Array.isArray(value.assets) && value.assets.some(
        (asset) => isRecord(asset) && asset.role === "ambience",
      )) errors.push("manifest.ambience is required for ambience assets.");
  return errors;
}

export function validateWhodunnitPackageManifestV1(value: unknown): string[] {
  if (!isRecord(value)) return ["manifest is invalid."];
  const errors = [
    ...validateFormatVersion(value.formatVersion, "manifest.formatVersion"),
    ...validateCompatibility(value.compatibility, "manifest.compatibility"),
  ];
  if (value.schema !== "prism-whodunnit-package-v1") errors.push("manifest.schema is invalid.");
  for (const key of ["packageId", "title", "description"] as const) {
    if (!isNonEmptyString(value[key])) errors.push(`manifest.${key} is missing.`);
  }
  const mansionErrors = validateMansionPackageManifestV1(value.mansionManifest);
  errors.push(...mansionErrors.map((error) => `manifest.mansionManifest: ${error}`));
  if (typeof value.mansionManifestSha256 !== "string" || !SHA256_HEX.test(value.mansionManifestSha256)) {
    errors.push("manifest.mansionManifestSha256 is invalid.");
  }
  for (const key of ["cast", "voices"] as const) {
    if (!Array.isArray(value[key])) errors.push(`manifest.${key} is invalid.`);
  }
  if (Array.isArray(value.cast) && value.cast.length > MAX_PORTABLE_CAST_V1) {
    errors.push("manifest.cast exceeds the portable capacity.");
  }
  if (Array.isArray(value.voices) && value.voices.length > MAX_PORTABLE_CAST_V1) {
    errors.push("manifest.voices exceeds the portable capacity.");
  }
  const assetCollection = validateAssetCollection(value.assets, "manifest.assets");
  errors.push(...assetCollection.errors);
  const castIds = new Set<string>();
  if (Array.isArray(value.cast)) {
    value.cast.forEach((entry, index) => {
      if (!isRecord(entry) || !isNonEmptyString(entry.id) || !isNonEmptyString(entry.name) || !isRecord(entry.presentation)) {
        errors.push(`manifest.cast[${index}] is invalid.`);
      } else if (castIds.has(entry.id)) {
        errors.push(`manifest.cast[${index}].id is duplicated.`);
      } else castIds.add(entry.id);
      if (isRecord(entry) && entry.voiceId !== null && !isNonEmptyString(entry.voiceId)) {
        errors.push(`manifest.cast[${index}].voiceId is invalid.`);
      }
    });
  }
  if (Array.isArray(value.voices)) {
    const voiceIds = new Set<string>();
    value.voices.forEach((voice, index) => {
      const path = `manifest.voices[${index}]`;
      if (!isRecord(voice) || !isNonEmptyString(voice.id) ||
          !isNonEmptyString(voice.castSnapshotId) || !castIds.has(voice.castSnapshotId) ||
          !Array.isArray(voice.manifestAssetIds) || !voice.manifestAssetIds.every(isNonEmptyString) ||
          !isRecord(voice.profile)) {
        errors.push(`${path} is invalid.`);
        return;
      }
      if (voiceIds.has(voice.id)) errors.push(`${path}.id is duplicated.`);
      else voiceIds.add(voice.id);
      if (new Set(voice.manifestAssetIds).size !== voice.manifestAssetIds.length) {
        errors.push(`${path}.manifestAssetIds contains duplicates.`);
      }
      for (const id of voice.manifestAssetIds) {
        if (!assetReferenceIsCompatible(assetCollection.byId.get(id), ["voice"], "audio")) {
          errors.push(`${path}.manifestAssetIds references incompatible voice audio.`);
        }
      }
    });
  }
  if (isRecord(value.mansionManifest) && Array.isArray(value.mansionManifest.assets)) {
    for (const embedded of value.mansionManifest.assets) {
      if (!isRecord(embedded) || !isNonEmptyString(embedded.id)) continue;
      const parent = assetCollection.byId.get(embedded.id);
      if (!parent || parent.sha256 !== embedded.sha256 || parent.mimeType !== embedded.mimeType ||
          parent.archivePath !== embedded.archivePath) {
        errors.push("manifest.mansionManifest references an incompatible parent asset.");
      }
    }
  }
  for (const key of ["publicCase", "privateCase", "proofContract", "dialogueGraph", "court", "evidenceAssignments"] as const) {
    if (!isRecord(value[key])) errors.push(`manifest.${key} is invalid.`);
  }
  if (!isRecord(value.runtime) || !isRecord(value.runtime.session) ||
      !isRecord(value.runtime.compiledPublicState) ||
      value.runtime.completedPlaythrough !== undefined &&
        value.runtime.completedPlaythrough !== null &&
        !isRecord(value.runtime.completedPlaythrough) ||
      value.runtime.audioManifest !== null && !isRecord(value.runtime.audioManifest) ||
      !Array.isArray(value.runtime.assetBindings)) {
    errors.push("manifest.runtime is invalid.");
  } else {
    const playthrough = value.runtime.completedPlaythrough;
    if (playthrough !== undefined && playthrough !== null) {
      if (playthrough.schema !== "prism-whodunnit-playthrough-v1" ||
          !isNonEmptyString(playthrough.completedAt) ||
          !Array.isArray(playthrough.transcript) ||
          !Array.isArray(playthrough.discoveryIds) ||
          !playthrough.discoveryIds.every(isNonEmptyString) ||
          !Array.isArray(playthrough.prosecutionChoiceIds) ||
          !playthrough.prosecutionChoiceIds.every(isNonEmptyString) ||
          !Array.isArray(playthrough.record) ||
          playthrough.theory !== null && !isRecord(playthrough.theory) ||
          playthrough.court !== null && !isRecord(playthrough.court) ||
          !isRecord(playthrough.verdict) ||
          !Array.isArray(playthrough.calloutHistory)) {
        errors.push("manifest.runtime.completedPlaythrough is invalid.");
      }
    }
    value.runtime.assetBindings.forEach((binding, index) => {
      const path = `manifest.runtime.assetBindings[${index}]`;
      if (!isRecord(binding) || !isNonEmptyString(binding.assetId) ||
          !["evidence", "room", "voice"].includes(String(binding.kind)) ||
          !isNonEmptyString(binding.subjectId) ||
          binding.lineId !== null && !isNonEmptyString(binding.lineId) ||
          !["ready", "fallback", "complete"].includes(String(binding.status)) ||
          !["synthesized", "bundled", "local"].includes(String(binding.source))) {
        errors.push(`${path} is invalid.`);
        return;
      }
      const asset = assetCollection.byId.get(binding.assetId);
      const compatible = binding.kind === "voice"
        ? assetReferenceIsCompatible(asset, ["voice"], "audio")
        : assetReferenceIsCompatible(asset, ["room", "prop", "preview", "presentation"], "image");
      if (!compatible) errors.push(`${path}.assetId is incompatible with its binding kind.`);
    });
  }
  if (typeof value.silent !== "boolean") errors.push("manifest.silent is invalid.");
  return errors;
}

/** Stable UTF-8 JSON input for SHA-256 hashing. Object keys are sorted recursively. */
export function canonicalPortablePackageJsonV1(value: PortablePackageJsonValueV1): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Portable package JSON contains a non-finite number.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalPortablePackageJsonV1).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalPortablePackageJsonV1(entry)}`).join(",")}}`;
}

export function portableMysteryPackageMajorIsSupportedV1(
  compatibility: PortableMysteryCompatibilityV1,
  supportedMajor = PORTABLE_MYSTERY_PACKAGE_FORMAT_MAJOR_V1,
): boolean {
  return compatibility.minimumFormatMajor <= supportedMajor &&
    compatibility.maximumFormatMajor >= supportedMajor;
}

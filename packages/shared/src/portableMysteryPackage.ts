export const PORTABLE_MYSTERY_PACKAGE_FORMAT_MAJOR_V1 = 1 as const;
export const PORTABLE_MYSTERY_PACKAGE_FORMAT_MINOR_V1 = 0 as const;
export const PORTABLE_MYSTERY_PACKAGE_MAGIC_V1 = "PRISMPKG" as const;

export type PortableMysteryPackageTypeV1 = "mansion" | "whodunnit";
export type PortableMysteryEncryptionModeV1 = "spoiler_seal" | "password";
export type PortableMysteryAssetRoleV1 =
  | "room"
  | "prop"
  | "music"
  | "preview"
  | "presentation";
export type PortableMysteryAssetMimeTypeV1 =
  | "image/png"
  | "image/webp"
  | "audio/mpeg";

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
  propAssetIds: string[];
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
  rooms: MansionPackageRoomV1[];
  houseStyle: {
    id: string;
    label: string;
    promptContract: string;
  };
  assets: PortableMysteryAssetDescriptorV1[];
  previewAssetId: string | null;
  investigationThemeAssetId: string | null;
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
  silent: boolean;
}

const SHA256_HEX = /^[a-f0-9]{64}$/u;
const SAFE_ARCHIVE_PATH = /^(?:assets|audio)\/[a-f0-9]{64}\.(?:png|webp|mp3)$/u;
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
  if (!["room", "prop", "music", "preview", "presentation"].includes(String(value.role))) {
    errors.push(`${path}.role is unsupported.`);
  }
  if (typeof value.archivePath !== "string" || !SAFE_ARCHIVE_PATH.test(value.archivePath)) {
    errors.push(`${path}.archivePath is unsafe.`);
  }
  if (typeof value.sha256 !== "string" || !SHA256_HEX.test(value.sha256)) {
    errors.push(`${path}.sha256 is invalid.`);
  }
  if (!isNonNegativeInteger(value.byteLength)) errors.push(`${path}.byteLength is invalid.`);
  if (!["image/png", "image/webp", "audio/mpeg"].includes(String(value.mimeType))) {
    errors.push(`${path}.mimeType is unsupported.`);
  }
  for (const dimension of ["width", "height", "durationMs"] as const) {
    if (value[dimension] !== null && !isNonNegativeInteger(value[dimension])) {
      errors.push(`${path}.${dimension} is invalid.`);
    }
  }
  return errors;
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
  }
  if (!Array.isArray(value.rooms) || value.rooms.length < 1) errors.push("manifest.rooms is empty.");
  if (!Array.isArray(value.assets)) {
    errors.push("manifest.assets is invalid.");
  } else {
    value.assets.forEach((asset, index) => errors.push(...validateAsset(asset, `manifest.assets[${index}]`)));
  }
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
  for (const key of ["cast", "voices", "assets"] as const) {
    if (!Array.isArray(value[key])) errors.push(`manifest.${key} is invalid.`);
  }
  for (const key of ["publicCase", "privateCase", "proofContract", "dialogueGraph", "court", "evidenceAssignments"] as const) {
    if (!isRecord(value[key])) errors.push(`manifest.${key} is invalid.`);
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

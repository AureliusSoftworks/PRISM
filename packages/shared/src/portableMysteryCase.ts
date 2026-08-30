import type {
  PortableMysteryCompatibilityV1,
  PortableMysteryCreatorV1,
  PortableMysteryCreatorSignatureV1,
  PortableMysteryEncryptionModeV1,
  PortableMysteryFormatVersionV1,
  PortableMysteryLicenseV1,
  PortableMysteryProvenanceV1,
  PortablePackageJsonValueV1,
  WhodunnitPackageCastSnapshotV1,
} from "./portableMysteryPackage.js";

export const PORTABLE_CASE_PACKAGE_MIME_V1 = "application/vnd.prism.case" as const;
export const PORTABLE_CASE_PACKAGE_SCHEMA_V1 = "prism-case-package-v1" as const;
export const PORTABLE_CASE_THUMBNAIL_STYLE_V1 = "prism-abstract-v1" as const;

export type PortableCaseRoomRoleV1 = "crime_scene" | "suspect" | "search";

export interface PortableCaseThumbnailV1 {
  version: 1;
  style: typeof PORTABLE_CASE_THUMBNAIL_STYLE_V1;
  /** A public, case-unique seed. It never contains or derives from sealed truth. */
  seed: string;
  palette: [string, string, string, string];
  motif: "fracture" | "orbit" | "fold" | "signal";
}

export interface PortableCaseRoomRequirementV1 {
  id: string;
  role: PortableCaseRoomRoleV1;
  /** Preferred semantic room type. Assembly may use a compatible fallback. */
  templateId: string;
  suspectSeatId: string | null;
  hotspotCount: number;
}

export interface PortableCaseMansionRequirementsV1 {
  version: 1;
  suspectCount: number;
  minimumRoomCount: number;
  minimumFloorCount: number;
  rooms: PortableCaseRoomRequirementV1[];
}

export interface PortableCaseCertificationV1 {
  version: 1;
  /** Export is forbidden until this source investigation has been filed. */
  investigationCompletedAt: string;
  caseHash: string;
  graphHash: string;
  graphValid: true;
  validatorVersion: number;
}

export interface PortableCasePackageManifestV1 {
  schema: typeof PORTABLE_CASE_PACKAGE_SCHEMA_V1;
  formatVersion: PortableMysteryFormatVersionV1;
  packageId: string;
  title: string;
  /** Spoiler-safe public dust-jacket copy. Never derive it from sealed truth. */
  description: string;
  /** Public story signals, distinct from difficulty, trial, cast, or room counts. */
  storyTags?: string[];
  creator: PortableMysteryCreatorV1;
  provenance: PortableMysteryProvenanceV1;
  license: PortableMysteryLicenseV1;
  contentWarnings: string[];
  compatibility: PortableMysteryCompatibilityV1;
  difficulty: "casual" | "classic" | "mastermind";
  trialType: "bench" | "jury";
  investigationMode: "full";
  thumbnail: PortableCaseThumbnailV1;
  mansionRequirements: PortableCaseMansionRequirementsV1;
  certification: PortableCaseCertificationV1;
  cast: WhodunnitPackageCastSnapshotV1[];
  /** Reset, spoiler-safe title-card template. It contains no player progress. */
  publicCase: { [key: string]: PortablePackageJsonValueV1 };
  /** Sealed compiled truth using package-stable room and cast slots. */
  privateCase: { [key: string]: PortablePackageJsonValueV1 };
  proofContract: { [key: string]: PortablePackageJsonValueV1 };
  dialogueGraph: { [key: string]: PortablePackageJsonValueV1 };
  court: { [key: string]: PortablePackageJsonValueV1 };
  evidenceAssignments: { [key: string]: PortablePackageJsonValueV1 };
}

export interface PortableCaseInstallationMetadataV1 {
  packageId: string;
  payloadSha256: string;
  encryptionMode: PortableMysteryEncryptionModeV1;
  creatorSignature: PortableMysteryCreatorSignatureV1 | null;
  creator: PortableMysteryCreatorV1;
  provenance: PortableMysteryProvenanceV1;
  license: PortableMysteryLicenseV1;
  contentWarnings: string[];
}

export interface PortableCaseLibrarySummaryV1 {
  id: string;
  title: string;
  description: string;
  storyTags: string[];
  creatorName: string;
  difficulty: PortableCasePackageManifestV1["difficulty"];
  trialType: PortableCasePackageManifestV1["trialType"];
  suspectCount: number;
  minimumRoomCount: number;
  minimumFloorCount: number;
  thumbnail: PortableCaseThumbnailV1;
  portable: PortableCaseInstallationMetadataV1 | null;
  sourceSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortableCasePackagePreviewV1 {
  title: string;
  description: string;
  storyTags: string[];
  creatorName: string;
  difficulty: PortableCasePackageManifestV1["difficulty"];
  trialType: PortableCasePackageManifestV1["trialType"];
  suspectCount: number;
  minimumRoomCount: number;
  minimumFloorCount: number;
  thumbnail: PortableCaseThumbnailV1;
  provenance: PortableMysteryProvenanceV1;
  license: PortableMysteryLicenseV1;
  duplicateCaseId: string | null;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/iu;
const SHA256_HEX = /^[0-9a-f]{64}$/iu;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function validThumbnail(value: unknown): value is PortableCaseThumbnailV1 {
  return record(value) && value.version === 1 &&
    value.style === PORTABLE_CASE_THUMBNAIL_STYLE_V1 &&
    nonEmpty(value.seed) && value.seed.length <= 200 &&
    Array.isArray(value.palette) && value.palette.length === 4 &&
    value.palette.every((color) => typeof color === "string" && HEX_COLOR.test(color)) &&
    (value.motif === "fracture" || value.motif === "orbit" ||
      value.motif === "fold" || value.motif === "signal");
}

export function validatePortableCasePackageManifestV1(value: unknown): string[] {
  if (!record(value)) return ["manifest is invalid."];
  const errors: string[] = [];
  if (value.schema !== PORTABLE_CASE_PACKAGE_SCHEMA_V1) errors.push("manifest.schema is invalid.");
  for (const key of ["packageId", "title", "description"] as const) {
    if (!nonEmpty(value[key])) errors.push(`manifest.${key} is missing.`);
  }
  if (value.storyTags !== undefined && (
    !Array.isArray(value.storyTags) ||
    value.storyTags.length < 1 ||
    value.storyTags.length > 4 ||
    !value.storyTags.every((tag) => nonEmpty(tag) && tag.trim().length <= 32) ||
    new Set(value.storyTags.map((tag) => typeof tag === "string" ? tag.trim().toLocaleLowerCase() : "")).size !==
      value.storyTags.length
  )) {
    errors.push("manifest.storyTags is invalid.");
  }
  if (!record(value.formatVersion) || value.formatVersion.major !== 1 ||
      typeof value.formatVersion.minor !== "number") errors.push("manifest.formatVersion is invalid.");
  if (!record(value.compatibility)) errors.push("manifest.compatibility is invalid.");
  if (!record(value.creator) || !nonEmpty(value.creator.name)) errors.push("manifest.creator is invalid.");
  if (!record(value.provenance) || !nonEmpty(value.provenance.createdAt) ||
      !nonEmpty(value.provenance.prismVersion)) errors.push("manifest.provenance is invalid.");
  if (!record(value.license) || !nonEmpty(value.license.name) ||
      typeof value.license.allowsRedistribution !== "boolean") errors.push("manifest.license is invalid.");
  if (!Array.isArray(value.contentWarnings) || !value.contentWarnings.every(nonEmpty)) {
    errors.push("manifest.contentWarnings is invalid.");
  }
  if (value.difficulty !== "casual" && value.difficulty !== "classic" &&
      value.difficulty !== "mastermind") errors.push("manifest.difficulty is invalid.");
  if (value.trialType !== "bench" && value.trialType !== "jury") {
    errors.push("manifest.trialType is invalid.");
  }
  if (value.investigationMode !== "full") errors.push("manifest.investigationMode is invalid.");
  if (!validThumbnail(value.thumbnail)) errors.push("manifest.thumbnail is invalid.");
  if (!record(value.mansionRequirements) || value.mansionRequirements.version !== 1 ||
      !positiveInteger(value.mansionRequirements.suspectCount) ||
      !positiveInteger(value.mansionRequirements.minimumRoomCount) ||
      !positiveInteger(value.mansionRequirements.minimumFloorCount) ||
      !Array.isArray(value.mansionRequirements.rooms) ||
      value.mansionRequirements.rooms.length !== value.mansionRequirements.minimumRoomCount) {
    errors.push("manifest.mansionRequirements is invalid.");
  } else {
    const ids = new Set<string>();
    for (const room of value.mansionRequirements.rooms) {
      if (!record(room) || !nonEmpty(room.id) || !nonEmpty(room.templateId) ||
          (room.role !== "crime_scene" && room.role !== "suspect" && room.role !== "search") ||
          (room.suspectSeatId !== null && !nonEmpty(room.suspectSeatId)) ||
          !positiveInteger(room.hotspotCount)) {
        errors.push("manifest.mansionRequirements.rooms contains an invalid room.");
        continue;
      }
      if (ids.has(room.id)) errors.push("manifest.mansionRequirements.rooms contains duplicate ids.");
      ids.add(room.id);
    }
    const suspectRooms = value.mansionRequirements.rooms.filter((room) =>
      record(room) && room.role === "suspect");
    if (suspectRooms.length !== value.mansionRequirements.suspectCount) {
      errors.push("manifest.mansionRequirements suspect rooms do not match suspectCount.");
    }
  }
  if (!record(value.certification) || value.certification.version !== 1 ||
      !nonEmpty(value.certification.investigationCompletedAt) ||
      typeof value.certification.caseHash !== "string" || !SHA256_HEX.test(value.certification.caseHash) ||
      typeof value.certification.graphHash !== "string" || !SHA256_HEX.test(value.certification.graphHash) ||
      value.certification.graphValid !== true || !positiveInteger(value.certification.validatorVersion)) {
    errors.push("manifest.certification is invalid.");
  }
  if (!Array.isArray(value.cast) || value.cast.length < 1) errors.push("manifest.cast is invalid.");
  for (const key of ["publicCase", "privateCase", "proofContract", "dialogueGraph", "court", "evidenceAssignments"] as const) {
    if (!record(value[key])) errors.push(`manifest.${key} is invalid.`);
  }
  return errors;
}

function seedHash(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

const CASE_THUMBNAIL_PALETTES: ReadonlyArray<PortableCaseThumbnailV1["palette"]> = [
  ["#61e7f2", "#8b6cff", "#ff5e9d", "#f5dc75"],
  ["#75f1bf", "#57a7ff", "#c874ff", "#ff7968"],
  ["#8be8ff", "#4f6dff", "#ff71ce", "#ffd166"],
  ["#79ffe1", "#9c79ff", "#ff6b9a", "#ffba69"],
];
const CASE_THUMBNAIL_MOTIFS: PortableCaseThumbnailV1["motif"][] = [
  "fracture", "orbit", "fold", "signal",
];

export function proceduralPortableCaseThumbnailV1(seed: string): PortableCaseThumbnailV1 {
  const normalized = seed.trim().slice(0, 200) || "prism-case";
  const hash = seedHash(normalized);
  return {
    version: 1,
    style: PORTABLE_CASE_THUMBNAIL_STYLE_V1,
    seed: normalized,
    palette: [...CASE_THUMBNAIL_PALETTES[hash % CASE_THUMBNAIL_PALETTES.length]!] as PortableCaseThumbnailV1["palette"],
    motif: CASE_THUMBNAIL_MOTIFS[(hash >>> 5) % CASE_THUMBNAIL_MOTIFS.length]!,
  };
}

function svgPolygon(points: string, fill: string, opacity: number): string {
  return `<polygon points="${points}" fill="${fill}" opacity="${opacity}"/>`;
}

/** Pure local SVG. It uses public seed metadata only and never calls a provider. */
export function proceduralPortableCaseThumbnailSvgV1(
  thumbnail: PortableCaseThumbnailV1,
  width = 720,
  height = 450,
): string {
  const hash = seedHash(thumbnail.seed);
  const [cyan, violet, rose, gold] = thumbnail.palette;
  const drift = 12 + hash % 46;
  const inverse = 100 - drift;
  const motif = thumbnail.motif;
  const motifLayer = motif === "orbit"
    ? `<ellipse cx="50%" cy="50%" rx="31%" ry="18%" fill="none" stroke="${cyan}" stroke-width="3" opacity=".64" transform="rotate(${hash % 80 - 40} ${width / 2} ${height / 2})"/><circle cx="${drift}%" cy="${inverse}%" r="5.5%" fill="${gold}" opacity=".82"/>`
    : motif === "signal"
      ? `<path d="M0 ${height * .72} Q ${width * .18} ${height * .28}, ${width * .36} ${height * .64} T ${width * .72} ${height * .38} T ${width} ${height * .58}" fill="none" stroke="${cyan}" stroke-width="5" opacity=".7"/><path d="M0 ${height * .8} L${width} ${height * .2}" stroke="${rose}" stroke-width="2" opacity=".55"/>`
      : motif === "fold"
        ? `${svgPolygon(`0,${height} ${width * .46},0 ${width * .62},${height} `, violet, .56)}${svgPolygon(`${width * .33},0 ${width},${height * .78} ${width},0`, cyan, .38)}`
        : `${svgPolygon(`0,${height * .82} ${width * .42},0 ${width * .55},${height}`, cyan, .48)}${svgPolygon(`${width * .3},${height} ${width * .67},0 ${width},${height * .68}`, rose, .44)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Abstract PRISM case design"><defs><radialGradient id="g" cx="${drift}%" cy="${inverse}%" r="78%"><stop offset="0" stop-color="#1b2331"/><stop offset="1" stop-color="#08090e"/></radialGradient><filter id="b"><feGaussianBlur stdDeviation="18"/></filter></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${inverse}%" cy="${drift}%" r="24%" fill="${violet}" opacity=".18" filter="url(#b)"/>${motifLayer}<path d="M${width * .13} ${height * .74} L${width * .5} ${height * .12} L${width * .86} ${height * .74} Z" fill="none" stroke="${gold}" stroke-width="2.5" opacity=".86"/><path d="M${width * .5} ${height * .12} L${width * .5} ${height * .9}" stroke="${violet}" stroke-width="2" opacity=".8"/><rect x="${width * .08}" y="${height * .08}" width="${width * .84}" height="${height * .84}" rx="18" fill="none" stroke="white" stroke-opacity=".12"/></svg>`;
}

export function proceduralPortableCaseThumbnailDataUrlV1(
  thumbnail: PortableCaseThumbnailV1,
): string {
  return `data:image/svg+xml,${encodeURIComponent(proceduralPortableCaseThumbnailSvgV1(thumbnail))}`;
}

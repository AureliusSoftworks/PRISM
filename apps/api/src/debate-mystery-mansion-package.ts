import type { DatabaseSync } from "node:sqlite";
import type {
  MansionPackageHeaderV1,
  MansionPackageManifestV1,
  PortableMansionInstallationMetadataV1,
  PortableMysteryEncryptionModeV1,
} from "@localai/shared";
import {
  decodeInternalMansionPackageV1,
  encodeInternalMansionPackageV1,
  exportInternalMansionPackageFromDbV1,
  importInternalMansionPackageToDbV1,
} from "./debate-mystery-mansion-codec.ts";
import {
  inspectPortableMysteryEnvelopeHeaderV1,
  openPortableMysteryEnvelopeV1,
  sealPortableMysteryEnvelopeV1,
} from "./debate-mystery-package-envelope.ts";
import {
  preflightPortableMysteryArchiveV1,
  sanitizePortableMansionMediaV1,
  validatePortableMansionMediaV1,
} from "./debate-mystery-package-safety.ts";

export class PortableMansionPackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortableMansionPackageError";
  }
}

export interface OpenedPortableMansionPreviewV1 {
  header: MansionPackageHeaderV1;
  manifest: MansionPackageManifestV1;
  previewImage: { mimeType: "image/png" | "image/webp"; bytes: Uint8Array } | null;
}

export async function exportPortableMansionPackageV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  bundleId: string;
  prismVersion: string;
  creatorName?: string;
  mode?: PortableMysteryEncryptionModeV1;
  password?: string;
}): Promise<Uint8Array> {
  const payload = exportInternalMansionPackageFromDbV1(args);
  const preflight = preflightPortableMysteryArchiveV1(payload);
  const decoded = decodeInternalMansionPackageV1(payload);
  await validatePortableMansionMediaV1(decoded);
  return sealPortableMysteryEnvelopeV1({
    payload,
    mode: args.mode ?? "spoiler_seal",
    password: args.password,
    metadata: {
      packageType: "mansion",
      title: decoded.manifest.title,
      creatorName: decoded.manifest.creator.name,
      compatibility: decoded.manifest.compatibility,
      expandedBytes: preflight.expandedBytes,
      assetCount: decoded.manifest.assets.length,
      contentWarnings: decoded.manifest.contentWarnings,
    },
  });
}

export function inspectPortableMansionPackageV1(
  envelope: Uint8Array,
): MansionPackageHeaderV1 {
  const header = inspectPortableMysteryEnvelopeHeaderV1(envelope);
  if (header.packageType !== "mansion") {
    throw new PortableMansionPackageError("This package is not a mansion.");
  }
  return header;
}

export async function previewPortableMansionPackageV1(args: {
  envelope: Uint8Array;
  password?: string;
}): Promise<OpenedPortableMansionPreviewV1> {
  const opened = openPortableMysteryEnvelopeV1(args);
  if (opened.header.packageType !== "mansion") {
    throw new PortableMansionPackageError("This package is not a mansion.");
  }
  const preflight = preflightPortableMysteryArchiveV1(opened.payload);
  const decoded = decodeInternalMansionPackageV1(opened.payload);
  if (
    opened.header.expandedBytes !== preflight.expandedBytes ||
    opened.header.assetCount !== decoded.manifest.assets.length ||
    preflight.entryCount !== decoded.manifest.assets.length + 1
  ) throw new PortableMansionPackageError("Package header does not match its authenticated contents.");
  await validatePortableMansionMediaV1(decoded);
  const previewDescriptor = decoded.manifest.previewAssetId
    ? decoded.manifest.assets.find((asset) => asset.id === decoded.manifest.previewAssetId)
    : null;
  const previewBytes = previewDescriptor && (
    previewDescriptor.mimeType === "image/png" ||
    previewDescriptor.mimeType === "image/webp"
  )
    ? decoded.assets.get(previewDescriptor.archivePath)
    : null;
  return {
    header: opened.header,
    manifest: decoded.manifest,
    previewImage: previewDescriptor && previewBytes && (
      previewDescriptor.mimeType === "image/png" ||
      previewDescriptor.mimeType === "image/webp"
    )
      ? { mimeType: previewDescriptor.mimeType, bytes: previewBytes }
      : null,
  };
}

/** Authenticates and validates the complete package before opening a DB transaction. */
export async function importPortableMansionPackageV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  envelope: Uint8Array;
  password?: string;
}): Promise<string> {
  const opened = openPortableMysteryEnvelopeV1({
    envelope: args.envelope,
    password: args.password,
  });
  if (opened.header.packageType !== "mansion") {
    throw new PortableMansionPackageError("This package is not a mansion.");
  }
  const preflight = preflightPortableMysteryArchiveV1(opened.payload);
  const decoded = decodeInternalMansionPackageV1(opened.payload);
  if (
    opened.header.expandedBytes !== preflight.expandedBytes ||
    opened.header.assetCount !== decoded.manifest.assets.length ||
    preflight.entryCount !== decoded.manifest.assets.length + 1 ||
    opened.header.title !== decoded.manifest.title ||
    opened.header.creatorName !== decoded.manifest.creator.name ||
    JSON.stringify(opened.header.compatibility) !== JSON.stringify(decoded.manifest.compatibility) ||
    JSON.stringify(opened.header.contentWarnings) !== JSON.stringify(decoded.manifest.contentWarnings)
  ) throw new PortableMansionPackageError("Package header does not match its authenticated contents.");
  const sanitized = await sanitizePortableMansionMediaV1(decoded);
  const sanitizedArchive = encodeInternalMansionPackageV1(sanitized);
  const portableMetadata: PortableMansionInstallationMetadataV1 = {
    packageId: decoded.manifest.packageId,
    payloadSha256: opened.header.payloadSha256,
    description: decoded.manifest.description,
    creator: decoded.manifest.creator,
    provenance: decoded.manifest.provenance,
    license: decoded.manifest.license,
    contentWarnings: decoded.manifest.contentWarnings,
    encryptionMode: opened.header.encryptionMode,
    creatorSignature: opened.header.creatorSignature,
  };
  return importInternalMansionPackageToDbV1({
    db: args.db,
    userKey: args.userKey,
    userId: args.userId,
    archive: sanitizedArchive,
    portableMetadata,
  });
}

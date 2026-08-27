import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  canonicalPortablePackageJsonV1,
  validateMansionPackageManifestV1,
  type MansionPackageManifestV1,
  type PortablePackageJsonValueV1,
} from "@localai/shared";
import { unzipSync, zipSync } from "fflate";
import { getDebateMysteryMansionBundleV2 } from "./debate-mystery-mansion-bundles.ts";
import { decryptBytes, encryptBytes } from "./security.ts";

const MANIFEST_PATH = "manifest.json";
const MAX_INTERNAL_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_INTERNAL_EXPANDED_BYTES = 384 * 1024 * 1024;
const MAX_INTERNAL_ENTRY_COUNT = 512;

export class DebateMysteryMansionCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DebateMysteryMansionCodecError";
  }
}

export interface InternalMansionPackageV1 {
  manifest: MansionPackageManifestV1;
  assets: ReadonlyMap<string, Uint8Array>;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function manifestJson(manifest: MansionPackageManifestV1): string {
  return canonicalPortablePackageJsonV1(
    JSON.parse(JSON.stringify(manifest)) as PortablePackageJsonValueV1,
  );
}

function validatePackage(input: InternalMansionPackageV1): void {
  const errors = validateMansionPackageManifestV1(input.manifest);
  if (errors.length > 0) throw new DebateMysteryMansionCodecError(errors.join("\n"));
  const expectedPaths = new Set<string>();
  for (const descriptor of input.manifest.assets) {
    expectedPaths.add(descriptor.archivePath);
    const bytes = input.assets.get(descriptor.archivePath);
    if (!bytes) {
      throw new DebateMysteryMansionCodecError(`Mansion is missing ${descriptor.archivePath}.`);
    }
    if (bytes.byteLength !== descriptor.byteLength || sha256(bytes) !== descriptor.sha256) {
      throw new DebateMysteryMansionCodecError(`Mansion asset integrity failed: ${descriptor.archivePath}.`);
    }
  }
  for (const path of input.assets.keys()) {
    if (!expectedPaths.has(path)) {
      throw new DebateMysteryMansionCodecError(`Mansion contains undeclared asset ${path}.`);
    }
  }
}

/** Deterministic plain ZIP used only to prove the internal V1 round-trip. */
export function encodeInternalMansionPackageV1(
  input: InternalMansionPackageV1,
): Uint8Array {
  validatePackage(input);
  const encoder = new TextEncoder();
  const entries: Record<string, Uint8Array> = {
    [MANIFEST_PATH]: encoder.encode(manifestJson(input.manifest)),
  };
  for (const path of [...input.assets.keys()].sort()) {
    entries[path] = Uint8Array.from(input.assets.get(path)!);
  }
  const archive = zipSync(entries, { level: 9 });
  if (archive.byteLength > MAX_INTERNAL_ARCHIVE_BYTES) {
    throw new DebateMysteryMansionCodecError("Mansion archive is too large.");
  }
  return archive;
}

export function decodeInternalMansionPackageV1(
  archive: Uint8Array,
): InternalMansionPackageV1 {
  if (!(archive instanceof Uint8Array) || archive.byteLength < 1) {
    throw new DebateMysteryMansionCodecError("Mansion archive is empty.");
  }
  if (archive.byteLength > MAX_INTERNAL_ARCHIVE_BYTES) {
    throw new DebateMysteryMansionCodecError("Mansion archive is too large.");
  }
  let expandedBytes = 0;
  let entryCount = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(archive, {
      filter(file) {
        entryCount += 1;
        expandedBytes += file.originalSize;
        if (
          entryCount > MAX_INTERNAL_ENTRY_COUNT ||
          expandedBytes > MAX_INTERNAL_EXPANDED_BYTES
        ) {
          throw new DebateMysteryMansionCodecError("Mansion archive expands beyond its internal limit.");
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof DebateMysteryMansionCodecError) throw error;
    throw new DebateMysteryMansionCodecError("Mansion archive could not be decoded.");
  }
  const rawManifest = entries[MANIFEST_PATH];
  if (!rawManifest) throw new DebateMysteryMansionCodecError("Mansion manifest is missing.");
  let manifest: MansionPackageManifestV1;
  try {
    manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawManifest)) as MansionPackageManifestV1;
  } catch {
    throw new DebateMysteryMansionCodecError("Mansion manifest is invalid JSON.");
  }
  const assets = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(entries)) {
    if (path !== MANIFEST_PATH) assets.set(path, Uint8Array.from(bytes));
  }
  const decoded = { manifest, assets };
  validatePackage(decoded);
  return decoded;
}

interface StoredMansionAssetRow {
  id: string;
  role: MansionPackageManifestV1["assets"][number]["role"];
  logical_id: string;
  mime_type: MansionPackageManifestV1["assets"][number]["mimeType"];
  ciphertext: Buffer;
  cipher_iv: Buffer;
  cipher_tag: Buffer;
  sha256: string;
  byte_size: number;
}

function assetExtension(mimeType: StoredMansionAssetRow["mime_type"]): "png" | "webp" | "mp3" {
  return mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "mp3";
}

export function exportInternalMansionPackageFromDbV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  bundleId: string;
  prismVersion: string;
  creatorName?: string;
}): Uint8Array {
  const bundle = getDebateMysteryMansionBundleV2(args.db, args.userId, args.bundleId);
  const stored = args.db.prepare(
    `SELECT assets.id, refs.role, refs.logical_id, assets.mime_type,
            assets.ciphertext, assets.cipher_iv, assets.cipher_tag,
            assets.sha256, assets.byte_size
       FROM debate_mystery_mansion_asset_refs AS refs
       JOIN debate_mystery_mansion_assets AS assets
         ON assets.id = refs.asset_id AND assets.user_id = refs.user_id
      WHERE refs.bundle_id = ? AND refs.user_id = ?
      ORDER BY refs.role, refs.logical_id, assets.id`,
  ).all(args.bundleId, args.userId) as unknown as StoredMansionAssetRow[];
  const files = new Map<string, Uint8Array>();
  const portableIdByStoredId = new Map<string, string>();
  const assets = stored.map((asset, index) => {
    const bytes = decryptBytes({
      ciphertext: asset.ciphertext,
      iv: asset.cipher_iv,
      tag: asset.cipher_tag,
    }, args.userKey);
    if (bytes.byteLength !== asset.byte_size || sha256(bytes) !== asset.sha256) {
      throw new DebateMysteryMansionCodecError("Saved mansion asset integrity failed.");
    }
    const id = `asset-${String(index + 1).padStart(3, "0")}`;
    portableIdByStoredId.set(asset.id, id);
    const archivePath = `${asset.role === "music" ? "audio" : "assets"}/${asset.sha256}.${assetExtension(asset.mime_type)}`;
    files.set(archivePath, bytes);
    return {
      id,
      role: asset.role,
      archivePath,
      sha256: asset.sha256,
      byteLength: asset.byte_size,
      mimeType: asset.mime_type,
      width: asset.role === "room" ? 1536 : asset.role === "prop" ? 1024 : null,
      height: asset.role === "room" ? 1024 : asset.role === "prop" ? 1024 : null,
      durationMs: null,
    };
  });
  const roomAssetByLogicalId = new Map(
    stored.filter((asset) => asset.role === "room")
      .map((asset) => [asset.logical_id, portableIdByStoredId.get(asset.id)!]),
  );
  let slotIndex = 0;
  const manifest: MansionPackageManifestV1 = {
    schema: "prism-mansion-package-v1",
    formatVersion: { major: 1, minor: 0 },
    packageId: bundle.id,
    title: `${bundle.houseStyle.label.trim() || "Whodunnit"} Mansion`,
    description: "A reusable PRISM Whodunnit mansion.",
    creator: { name: args.creatorName?.trim() || "PRISM creator", id: null, url: null },
    provenance: { createdAt: bundle.createdAt, prismVersion: args.prismVersion, generatedWith: [] },
    license: { name: "Private use", url: null, allowsRedistribution: false },
    contentWarnings: [],
    compatibility: { minimumFormatMajor: 1, maximumFormatMajor: 1, minimumPrismVersion: args.prismVersion },
    floorCount: bundle.floors,
    rooms: bundle.rooms.map((room) => ({
      id: room.id,
      templateId: room.templateId,
      name: room.name,
      floor: room.floor,
      x: room.x,
      y: room.y,
      width: room.width,
      height: room.height,
      neighborIds: [...room.neighborIds],
      slots: room.assignedSuspectSeatId
        ? [{ id: `slot-${String(++slotIndex).padStart(3, "0")}`, x: 0.5, y: 0.5 }]
        : [],
      emoji: room.emoji,
      roomAssetId: roomAssetByLogicalId.get(room.id) ?? null,
      propAssetIds: [],
    })),
    houseStyle: { ...bundle.houseStyle },
    assets,
    previewAssetId: assets.find((asset) => asset.role === "room")?.id ?? null,
    investigationThemeAssetId: assets.find((asset) => asset.role === "music")?.id ?? null,
  };
  return encodeInternalMansionPackageV1({ manifest, assets: files });
}

export function importInternalMansionPackageToDbV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  archive: Uint8Array;
}): string {
  const decoded = decodeInternalMansionPackageV1(args.archive);
  const bundleId = randomUUID();
  const now = new Date().toISOString();
  const roomIdMap = new Map(decoded.manifest.rooms.map((room) => [room.id, randomUUID()]));
  let suspectIndex = 0;
  const rooms = decoded.manifest.rooms.map((room) => ({
    id: roomIdMap.get(room.id)!,
    templateId: room.templateId,
    name: room.name,
    floor: room.floor,
    x: room.x,
    y: room.y,
    width: room.width,
    height: room.height,
    neighborIds: room.neighborIds
      .map((id): string | null => roomIdMap.get(id) ?? null)
      .filter((id): id is string => id !== null),
    assignedSuspectSeatId: room.slots.length > 0 ? `suspect-${++suspectIndex}` : null,
    emoji: room.emoji,
    imageId: null,
    bundledAssetPath: null,
  }));
  if (suspectIndex < 1) {
    throw new DebateMysteryMansionCodecError("Mansion has no reusable suspect slots.");
  }
  const assetByPortableId = new Map(decoded.manifest.assets.map((asset) => [asset.id, asset]));
  args.db.exec("BEGIN IMMEDIATE");
  try {
    args.db.prepare(
      `INSERT INTO debate_mystery_mansion_bundles
         (id, user_id, source_session_id, name, floors, total_rooms,
          suspect_count, style_json, layout_json, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      bundleId,
      args.userId,
      decoded.manifest.title.slice(0, 180),
      decoded.manifest.floorCount,
      rooms.length,
      suspectIndex,
      JSON.stringify({ version: 1, ...decoded.manifest.houseStyle }),
      JSON.stringify(rooms),
      now,
      now,
    );
    const insertAsset = args.db.prepare(
      `INSERT INTO debate_mystery_mansion_assets
         (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
          mime_type, provider, model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'package-import', 'internal-mansion-v1', ?, ?)
       ON CONFLICT(user_id, sha256) DO NOTHING`,
    );
    const findAsset = args.db.prepare(
      "SELECT id FROM debate_mystery_mansion_assets WHERE user_id = ? AND sha256 = ?",
    );
    const insertRef = args.db.prepare(
      `INSERT INTO debate_mystery_mansion_asset_refs
         (bundle_id, user_id, asset_id, role, logical_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    let propIndex = 0;
    for (const descriptor of decoded.manifest.assets) {
      const bytes = Buffer.from(decoded.assets.get(descriptor.archivePath)!);
      const encrypted = encryptBytes(bytes, args.userKey);
      insertAsset.run(
        randomUUID(), args.userId, encrypted.ciphertext, encrypted.iv,
        encrypted.tag, descriptor.sha256, bytes.byteLength,
        descriptor.mimeType, now, now,
      );
      const stored = findAsset.get(args.userId, descriptor.sha256) as { id: string };
      let logicalId: string;
      if (descriptor.role === "room") {
        const sourceRoom = decoded.manifest.rooms.find((room) => room.roomAssetId === descriptor.id);
        logicalId = sourceRoom ? roomIdMap.get(sourceRoom.id)! : `room-asset-${descriptor.id}`;
      } else if (descriptor.role === "prop") {
        logicalId = `prop-${String(++propIndex).padStart(3, "0")}`;
      } else {
        logicalId = descriptor.id;
      }
      const storedRole = descriptor.role === "preview" ? "presentation" : descriptor.role;
      insertRef.run(bundleId, args.userId, stored.id, storedRole, logicalId, now);
    }
    for (const room of decoded.manifest.rooms) {
      if (room.roomAssetId && !assetByPortableId.has(room.roomAssetId)) {
        throw new DebateMysteryMansionCodecError(`Room ${room.id} references a missing asset.`);
      }
    }
    args.db.exec("COMMIT");
  } catch (error) {
    if (args.db.isTransaction) args.db.exec("ROLLBACK");
    throw error;
  }
  return bundleId;
}

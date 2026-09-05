import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  buildMansionAmbienceManifestV1,
  mansionSfxLogicalIdV1,
  parseMansionSfxLogicalIdV1,
  canonicalPortablePackageJsonV1,
  canonicalMansionLayoutV2,
  debateMysteryAcousticThemePaletteV1,
  CURRENT_MANSION_ROOM_ART_CONTRACT,
  MANSION_MUSIC_ACTIVE_LOGICAL_ID_V1,
  MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1,
  MANSION_MUSIC_PREVIOUS_LOGICAL_ID_V1,
  MANSION_ATMOSPHERE_CANDIDATE_LOGICAL_ID_V1,
  MANSION_ATMOSPHERE_PREVIOUS_LOGICAL_ID_V1,
  deriveMansionMusicIdentityV1,
  normalizeMansionMusicIdentityV1,
  normalizeDebateMysteryAtmosphereContractV1,
  PORTABLE_MYSTERY_PACKAGE_FORMAT_MINOR_V1,
  remapMansionLayoutV2Ids,
  validateMansionPackageManifestV1,
  WHODUNNIT_PROP_ARCHETYPE_IDS_V1,
  type MansionPackageManifestV1,
  type PortableMansionInstallationMetadataV1,
  type PortablePackageJsonValueV1,
  type MansionLayoutV2,
  type MansionPropThemeV1,
  type DebateMysteryMansionSnapshotV2,
} from "@localai/shared";
import type { MansionSfxPackV1 } from "@localai/shared";
import { unzipSync, zipSync } from "fflate";
import { getDebateMysteryMansionBundleV2 } from "./debate-mystery-mansion-bundles.ts";
import { decryptBytes, encryptBytes } from "./security.ts";
import {
  portableMp3DurationMsV1,
  preflightPortableMysteryArchiveV1,
} from "./debate-mystery-package-safety.ts";

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

export interface ImportedMansionPackageV1 {
  bundleId: string;
  roomIdMap: ReadonlyMap<string, string>;
  assetIdMap: ReadonlyMap<string, string>;
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
  // ZIP stores local DOS time. A fixed local date keeps payload identity stable
  // across exports, wall clocks, and time zones (the outer seal remains random).
  const archive = zipSync(entries, { level: 9, mtime: new Date(1980, 0, 1) });
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
  preflightPortableMysteryArchiveV1(archive);
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
  width: number | null;
  height: number | null;
  duration_ms: number | null;
}

function assetExtension(mimeType: StoredMansionAssetRow["mime_type"]): "png" | "webp" | "mp3" | "ogg" | "wav" {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/wav") return "wav";
  return "mp3";
}

export function exportInternalMansionPackageFromDbV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  bundleId: string;
  prismVersion: string;
  creatorName?: string;
  /** Case exports pin the exact create-time layout and presentation. */
  snapshot?: DebateMysteryMansionSnapshotV2 | null;
}): Uint8Array {
  const bundle = getDebateMysteryMansionBundleV2(args.db, args.userId, args.bundleId);
  const allStored = args.db.prepare(
    `SELECT assets.id, refs.role, refs.logical_id, assets.mime_type,
            assets.ciphertext, assets.cipher_iv, assets.cipher_tag,
            assets.sha256, assets.byte_size, assets.width, assets.height,
            assets.duration_ms
       FROM debate_mystery_mansion_asset_refs AS refs
      JOIN debate_mystery_mansion_assets AS assets
         ON assets.id = refs.asset_id AND assets.user_id = refs.user_id
      WHERE refs.bundle_id = ? AND refs.user_id = ?
      ORDER BY refs.role, refs.logical_id, assets.id`,
  ).all(args.bundleId, args.userId) as unknown as StoredMansionAssetRow[];
  const frozenSnapshot = args.snapshot?.sourceBundleId === bundle.id ? args.snapshot : null;
  const snapshotAssets = args.snapshot?.sourceBundleId === args.bundleId
    ? args.snapshot.presentation.assets
    : null;
  const candidatePropTheme =
    frozenSnapshot?.presentation.propTheme ?? bundle.propTheme ?? null;
  const availableAssetIds = new Set(
    snapshotAssets?.map((asset) => asset.id) ?? allStored.map((asset) => asset.id),
  );
  const availableThemeRefKeys = new Set(
    (snapshotAssets ?? allStored.map((asset) => ({
      id: asset.id,
      role: asset.role,
      logicalId: asset.logical_id,
    })))
      .filter((asset) => asset.role === "prop" && asset.logicalId.startsWith("theme:"))
      .map((asset) => `${asset.logicalId}\u0000${asset.id}`),
  );
  const completeSourcePropTheme = candidatePropTheme &&
    candidatePropTheme.version === 1 &&
    candidatePropTheme.registryVersion === 1 &&
    candidatePropTheme.variants.length === WHODUNNIT_PROP_ARCHETYPE_IDS_V1.length &&
    new Set(candidatePropTheme.variants.map((variant) => variant.archetypeId)).size ===
      WHODUNNIT_PROP_ARCHETYPE_IDS_V1.length &&
    new Set(candidatePropTheme.variants.map((variant) => variant.packageAssetId)).size ===
      WHODUNNIT_PROP_ARCHETYPE_IDS_V1.length &&
    WHODUNNIT_PROP_ARCHETYPE_IDS_V1.every((archetypeId) =>
      candidatePropTheme.variants.some((variant) =>
        variant.archetypeId === archetypeId &&
        availableAssetIds.has(variant.packageAssetId) &&
        availableThemeRefKeys.has(`theme:${archetypeId}\u0000${variant.packageAssetId}`)),
    )
      ? candidatePropTheme
      : null;
  const completeThemeAssetIds = new Set(
    completeSourcePropTheme?.variants.map((variant) => variant.packageAssetId) ?? [],
  );
  const stored = snapshotAssets
    ? snapshotAssets.flatMap((snapshotAsset) => {
        const row = allStored.find((candidate) => candidate.id === snapshotAsset.id);
        if (!row ||
          snapshotAsset.logicalId.startsWith("theme:") &&
            !completeThemeAssetIds.has(snapshotAsset.id) ||
          snapshotAsset.role === "music" &&
          (snapshotAsset.logicalId === MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1 ||
            snapshotAsset.logicalId === MANSION_MUSIC_PREVIOUS_LOGICAL_ID_V1)) return [];
        return [{
          ...row,
          role: snapshotAsset.role,
          logical_id: snapshotAsset.logicalId,
        }];
      })
    : allStored.filter((asset) =>
        !asset.logical_id.startsWith("case:") &&
        (!asset.logical_id.startsWith("theme:") || completeThemeAssetIds.has(asset.id)) &&
        !(asset.role === "music" &&
          (asset.logical_id === MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1 ||
            asset.logical_id === MANSION_MUSIC_PREVIOUS_LOGICAL_ID_V1 ||
            asset.logical_id === MANSION_ATMOSPHERE_CANDIDATE_LOGICAL_ID_V1 ||
            asset.logical_id === MANSION_ATMOSPHERE_PREVIOUS_LOGICAL_ID_V1)) &&
        // Effect previews and replaced clips never leave the authoring library.
        !(asset.role === "sfx" && parseMansionSfxLogicalIdV1(asset.logical_id)?.lane !== "active"),
      );
  const files = new Map<string, Uint8Array>();
  const portableIdByStoredId = new Map<string, string>();
  const grouped = new Map<string, { asset: StoredMansionAssetRow; refs: StoredMansionAssetRow[] }>();
  for (const asset of stored) {
    const current = grouped.get(asset.id);
    if (current) current.refs.push(asset);
    else grouped.set(asset.id, { asset, refs: [asset] });
  }
  const assets = [...grouped.values()].map((group, index) => {
    const asset = group.asset;
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
    const roles = new Set(group.refs.map((ref) => ref.role));
    const onlyAmbience = group.refs.every(
      (ref) => ref.role === "music" && ref.logical_id.startsWith("ambience:"),
    );
    const role: StoredMansionAssetRow["role"] = onlyAmbience
      ? "ambience"
      : roles.size === 1
      ? group.refs[0]!.role
      : asset.mime_type.startsWith("image/") ? "presentation" : "music";
    const effectiveMimeType: StoredMansionAssetRow["mime_type"] =
      role === "ambience" && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "OggS"
        ? "audio/ogg"
        : asset.mime_type;
    const archivePath = `${role === "music" || role === "ambience" || role === "sfx" ? "audio" : "assets"}/${asset.sha256}.${assetExtension(effectiveMimeType)}`;
    files.set(archivePath, bytes);
    return {
      id,
      role,
      archivePath,
      sha256: asset.sha256,
      byteLength: asset.byte_size,
      mimeType: effectiveMimeType,
      width: asset.width ?? (role === "room" ? 1536 : role === "prop" || role === "presentation" ? 1024 : null),
      height: asset.height ?? (role === "room" ? 1024 : role === "prop" || role === "presentation" ? 1024 : null),
      durationMs: role === "music" || role === "ambience" || role === "sfx"
        ? (asset.duration_ms ?? (effectiveMimeType === "audio/mpeg"
            ? portableMp3DurationMsV1(bytes)
            : null))
        : null,
    };
  });
  const roomAssetByLogicalId = new Map(
    stored.filter((asset) => asset.role === "room")
      .map((asset) => [asset.logical_id, portableIdByStoredId.get(asset.id)!]),
  );
  const sourceRooms = frozenSnapshot?.rooms ?? bundle.rooms;
  const sourceLayoutV2 = frozenSnapshot?.layoutV2 ?? bundle.layoutV2 ?? null;
  const sourceHouseStyle = frozenSnapshot?.presentation.houseStyle ?? bundle.houseStyle;
  const sourceTitle = frozenSnapshot?.presentation.title ?? (bundle.portable || bundle.derivation
    ? bundle.name.trim() || `${bundle.houseStyle.label.trim() || "Whodunnit"} Mansion`
    : `${bundle.houseStyle.label.trim() || "Whodunnit"} Mansion`);
  const sourceDescription = frozenSnapshot?.presentation.description ??
    bundle.portable?.description?.trim() ?? "A reusable PRISM Whodunnit mansion.";
  const portableRoomIdByStoredId = new Map(
    sourceRooms.map((room, index) => [room.id, `room-${String(index + 1).padStart(3, "0")}`]),
  );
  const portableLayoutV2 = sourceLayoutV2
    ? (() => {
        let blockIndex = 0;
        const remapped = remapMansionLayoutV2Ids(
          sourceLayoutV2,
          (id, entity) => entity.kind === "room"
            ? portableRoomIdByStoredId.get(id) ?? id
            : `block-${String(++blockIndex).padStart(3, "0")}`,
          (id) => portableIdByStoredId.get(id) ?? null,
        );
        const storedRoomIdByPortableId = new Map(
          [...portableRoomIdByStoredId.entries()].map(([storedId, portableId]) => [portableId, storedId]),
        );
        const portable: MansionLayoutV2 = {
          ...remapped,
          entities: remapped.entities.map((entity) => {
            if (entity.kind !== "room") return entity;
            const storedRoomId = storedRoomIdByPortableId.get(entity.id);
            return {
              ...entity,
              acceptedRoomAssetId:
                entity.acceptedRoomAssetId ??
                (storedRoomId ? roomAssetByLogicalId.get(`${storedRoomId}:illustrated-v1`) ?? null : null),
            };
          }),
          // Unaccepted candidates stay with the editable local derivative and
          // never hitchhike in a reusable package.
          roomArtCandidates: [],
        };
        return JSON.parse(canonicalMansionLayoutV2(portable)) as MansionLayoutV2;
      })()
    : null;
  const portablePropTheme: MansionPropThemeV1 | null = completeSourcePropTheme
    ? {
        version: 1,
        registryVersion: 1,
        variants: WHODUNNIT_PROP_ARCHETYPE_IDS_V1.map((archetypeId) => {
          const variant = completeSourcePropTheme.variants.find(
            (candidate) => candidate.archetypeId === archetypeId,
          )!;
          return {
            ...variant,
            packageAssetId: portableIdByStoredId.get(variant.packageAssetId)!,
          };
        }),
      }
    : null;
  const anonymousPropAssetIds = [...new Set(
    stored.filter((asset) => asset.role === "prop")
      .filter((asset) => !asset.logical_id.startsWith("theme:"))
      .map((asset) => portableIdByStoredId.get(asset.id))
      .filter((id): id is string => Boolean(id)),
  )];
  let slotIndex = 0;
  const generatedAmbience = buildMansionAmbienceManifestV1({
    houseStyle: sourceHouseStyle,
    rooms: sourceRooms.map((room) => ({
      id: portableRoomIdByStoredId.get(room.id)!,
      name: room.name,
      floor: room.floor,
    })),
    promptContractHash: sha256(Buffer.from(sourceHouseStyle.promptContract, "utf8")),
    variationSeed: sourceHouseStyle.id,
  });
  const ambience = sourceHouseStyle.ambience
    ? {
        ...sourceHouseStyle.ambience,
        promptContractHash: sha256(Buffer.from(sourceHouseStyle.promptContract, "utf8")),
        atmosphere: { ...sourceHouseStyle.atmosphere },
        themePaletteId: sourceHouseStyle.acousticThemePaletteId,
        bespokeSynthesisRequested: sourceHouseStyle.bespokeAmbienceRequested,
        assets: sourceHouseStyle.ambience.assets.map((reference) => ({
          ...reference,
          packageAssetId: reference.packageAssetId
            ? portableIdByStoredId.get(reference.packageAssetId) ?? reference.packageAssetId
            : null,
        })),
        roomProfiles: sourceHouseStyle.ambience.roomProfiles.map((profile) => ({
          ...profile,
          roomId: portableRoomIdByStoredId.get(profile.roomId) ?? profile.roomId,
        })),
      }
    : generatedAmbience;
  const activePreviewCandidateId =
    frozenSnapshot?.presentation.thumbnailAssetId ??
    bundle.library?.overrides.thumbnailAssetId ??
    bundle.library?.defaults.thumbnailAssetId ??
    null;
  const activePreviewStoredId = activePreviewCandidateId && stored.some(
    (asset) => asset.id === activePreviewCandidateId && asset.role === "presentation",
  )
    ? activePreviewCandidateId
    : null;
  const portableEffectCues = stored
    .filter((asset) => asset.role === "sfx")
    .flatMap((asset) => {
      const parsed = parseMansionSfxLogicalIdV1(asset.logical_id);
      const packageAssetId = portableIdByStoredId.get(asset.id);
      return parsed?.lane === "active" && packageAssetId
        ? [{ cueId: parsed.cueId, packageAssetId }]
        : [];
    });
  const portableEffects: MansionSfxPackV1 | null = portableEffectCues.length > 0
    ? { version: 1, cues: portableEffectCues }
    : null;
  const manifest: MansionPackageManifestV1 = {
    schema: "prism-mansion-package-v1",
    formatVersion: { major: 1, minor: PORTABLE_MYSTERY_PACKAGE_FORMAT_MINOR_V1 },
    packageId: randomUUID(),
    title: sourceTitle,
    description: sourceDescription,
    creator: { name: args.creatorName?.trim() || "PRISM creator", id: null, url: null },
    provenance: { createdAt: bundle.createdAt, prismVersion: args.prismVersion, generatedWith: [] },
    license: { name: "Private use", url: null, allowsRedistribution: false },
    contentWarnings: [],
    compatibility: { minimumFormatMajor: 1, maximumFormatMajor: 1, minimumPrismVersion: args.prismVersion },
    floorCount: Math.max(1, ...sourceRooms.map((room) => room.floor)),
    scaleClass: frozenSnapshot?.presentation.scaleClass ?? bundle.scaleClass,
    ...(portableLayoutV2 ? { layoutV2: portableLayoutV2 } : {}),
    ...(portableLayoutV2?.venueProfile ? { venueProfile: portableLayoutV2.venueProfile } : {}),
    rooms: sourceRooms.map((room, roomIndex) => ({
      id: portableRoomIdByStoredId.get(room.id)!,
      templateId: room.templateId,
      name: room.name,
      floor: room.floor,
      x: room.x,
      y: room.y,
      width: room.width,
      height: room.height,
      neighborIds: room.neighborIds
        .map((id) => portableRoomIdByStoredId.get(id))
        .filter((id): id is string => Boolean(id)),
      slots: room.assignedSuspectSeatId
        ? [{ id: `slot-${String(++slotIndex).padStart(3, "0")}`, x: 0.5, y: 0.5 }]
        : [],
      emoji: room.emoji,
      roomAssetId:
        roomAssetByLogicalId.get(`${room.id}:accepted-v2`) ??
        roomAssetByLogicalId.get(room.id) ??
        null,
      illustratedRoomAssetId:
        roomAssetByLogicalId.get(`${room.id}:illustrated-v1`) ?? null,
      // Preserve presentation art without retaining original evidence placement.
      propAssetIds: anonymousPropAssetIds.filter(
        (_assetId, propIndex) => propIndex % sourceRooms.length === roomIndex,
      ),
    })),
    houseStyle: {
      id: sourceHouseStyle.id,
      label: sourceHouseStyle.label,
      promptContract: sourceHouseStyle.promptContract,
    },
    assets,
    previewAssetId:
      (activePreviewStoredId ? portableIdByStoredId.get(activePreviewStoredId) : null) ??
      assets.find((asset) => asset.role === "presentation")?.id ??
      null,
    investigationThemeAssetId: assets.find((asset) => asset.role === "music")?.id ?? null,
    investigationThemeTitle: assets.some((asset) => asset.role === "music")
      ? bundle.music?.active?.title ?? `${sourceTitle} investigation theme`
      : null,
    investigationThemeLoop: assets.some((asset) => asset.role === "music")
      ? bundle.music?.active?.loop ?? null
      : null,
    musicIdentity: sourceHouseStyle.musicIdentity ?? bundle.music?.identity,
    roomArt: CURRENT_MANSION_ROOM_ART_CONTRACT,
    ambience,
    ...(portablePropTheme ? { propTheme: portablePropTheme } : {}),
    ...(portableEffects ? { effects: portableEffects } : {}),
  };
  return encodeInternalMansionPackageV1({ manifest, assets: files });
}

export function importInternalMansionPackageToDbV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  archive: Uint8Array;
  portableMetadata?: PortableMansionInstallationMetadataV1 | null;
  /** Parent package imports own the surrounding transaction. */
  manageTransaction?: boolean;
}): string {
  return importInternalMansionPackageToDbDetailedV1(args).bundleId;
}

export interface UpgradedInstalledMansionRoomArtV1 {
  bundleId: string;
  updatedRoomIds: readonly string[];
  acceptedAssetIds: ReadonlyMap<string, string>;
  illustratedAssetIds: ReadonlyMap<string, string>;
}

/** Promotes the authored Pixel Art and Realistic room plates from a portable
 * mansion into an already-installed copy without replacing its identity,
 * topology, music, ambience, props, or active-case references. This is the
 * compatibility seam for mansions installed before the dual-style contract. */
export function upgradeInstalledMansionRoomArtFromPackageV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  bundleId: string;
  archive: Uint8Array;
}): UpgradedInstalledMansionRoomArtV1 {
  const decoded = decodeInternalMansionPackageV1(args.archive);
  const mansion = getDebateMysteryMansionBundleV2(args.db, args.userId, args.bundleId);
  if (mansion.rooms.length !== decoded.manifest.rooms.length) {
    throw new DebateMysteryMansionCodecError(
      `Room-art upgrade expected ${mansion.rooms.length} rooms but the package contains ${decoded.manifest.rooms.length}.`,
    );
  }

  const unusedRoomIds = new Set(mansion.rooms.map((room) => room.id));
  const packageRoomByInstalledId = new Map<string, MansionPackageManifestV1["rooms"][number]>();
  for (const sourceRoom of decoded.manifest.rooms) {
    const available = mansion.rooms.filter((room) => unusedRoomIds.has(room.id));
    const exact = available.filter(
      (room) => room.templateId === sourceRoom.templateId && room.name === sourceRoom.name,
    );
    const sameTemplate = available.filter((room) => room.templateId === sourceRoom.templateId);
    const sameName = available.filter((room) => room.name === sourceRoom.name);
    const installedRoom = exact.length === 1
      ? exact[0]
      : sameTemplate.length === 1
        ? sameTemplate[0]
        : sameName.length === 1
          ? sameName[0]
          : null;
    if (!installedRoom) {
      throw new DebateMysteryMansionCodecError(
        `Could not safely match package room ${sourceRoom.name} to the installed mansion.`,
      );
    }
    unusedRoomIds.delete(installedRoom.id);
    packageRoomByInstalledId.set(installedRoom.id, sourceRoom);
  }

  const bundleRow = args.db.prepare(
    `SELECT layout_json FROM debate_mystery_mansion_bundles
      WHERE id = ? AND user_id = ?`,
  ).get(args.bundleId, args.userId) as { layout_json: string } | undefined;
  if (!bundleRow) throw new DebateMysteryMansionCodecError("Installed mansion was not found.");
  const storedLayout = JSON.parse(bundleRow.layout_json) as unknown;
  const assetByPortableId = new Map(decoded.manifest.assets.map((asset) => [asset.id, asset]));
  const acceptedAssetIds = new Map<string, string>();
  const illustratedAssetIds = new Map<string, string>();
  const now = new Date().toISOString();
  const insertAsset = args.db.prepare(
    `INSERT INTO debate_mystery_mansion_assets
       (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
        mime_type, width, height, duration_ms, provider, model, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'package-upgrade',
             'tessera-mosaic-v6', ?, ?)
     ON CONFLICT(user_id, sha256) DO NOTHING`,
  );
  const findAsset = args.db.prepare(
    "SELECT id FROM debate_mystery_mansion_assets WHERE user_id = ? AND sha256 = ?",
  );
  const upsertRef = args.db.prepare(
    `INSERT INTO debate_mystery_mansion_asset_refs
       (bundle_id, user_id, asset_id, role, logical_id, created_at)
     VALUES (?, ?, ?, 'room', ?, ?)
     ON CONFLICT(bundle_id, role, logical_id) DO UPDATE SET
       asset_id = excluded.asset_id,
       created_at = excluded.created_at`,
  );
  const storeAsset = (portableAssetId: string): string => {
    const descriptor = assetByPortableId.get(portableAssetId);
    if (!descriptor || descriptor.role !== "room") {
      throw new DebateMysteryMansionCodecError(
        `Room-art upgrade references missing room asset ${portableAssetId}.`,
      );
    }
    const source = decoded.assets.get(descriptor.archivePath);
    if (!source) {
      throw new DebateMysteryMansionCodecError(
        `Room-art upgrade is missing ${descriptor.archivePath}.`,
      );
    }
    const bytes = Buffer.from(source);
    const encrypted = encryptBytes(bytes, args.userKey);
    insertAsset.run(
      randomUUID(),
      args.userId,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      descriptor.sha256,
      bytes.byteLength,
      descriptor.mimeType,
      descriptor.width,
      descriptor.height,
      descriptor.durationMs,
      now,
      now,
    );
    const stored = findAsset.get(args.userId, descriptor.sha256) as { id: string } | undefined;
    if (!stored) throw new DebateMysteryMansionCodecError("Upgraded room asset was not stored.");
    return stored.id;
  };

  args.db.exec("BEGIN IMMEDIATE");
  try {
    for (const [installedRoomId, sourceRoom] of packageRoomByInstalledId) {
      if (!sourceRoom.roomAssetId) {
        throw new DebateMysteryMansionCodecError(
          `Package room ${sourceRoom.name} has no authored Pixel Art asset.`,
        );
      }
      const acceptedAssetId = storeAsset(sourceRoom.roomAssetId);
      acceptedAssetIds.set(installedRoomId, acceptedAssetId);
      upsertRef.run(args.bundleId, args.userId, acceptedAssetId, installedRoomId, now);
      upsertRef.run(
        args.bundleId,
        args.userId,
        acceptedAssetId,
        `${installedRoomId}:accepted-v2`,
        now,
      );
      if (sourceRoom.illustratedRoomAssetId) {
        const illustratedAssetId = storeAsset(sourceRoom.illustratedRoomAssetId);
        illustratedAssetIds.set(installedRoomId, illustratedAssetId);
        upsertRef.run(
          args.bundleId,
          args.userId,
          illustratedAssetId,
          `${installedRoomId}:illustrated-v1`,
          now,
        );
      }
    }

    const upgradedLayout = Array.isArray(storedLayout)
      ? storedLayout.map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
          const room = entry as Record<string, unknown>;
          const acceptedRoomAssetId = typeof room.id === "string"
            ? acceptedAssetIds.get(room.id)
            : null;
          return acceptedRoomAssetId ? { ...room, acceptedRoomAssetId } : room;
        })
      : storedLayout && typeof storedLayout === "object" &&
          (storedLayout as { version?: unknown }).version === 2
        ? {
            ...(storedLayout as MansionLayoutV2),
            entities: (storedLayout as MansionLayoutV2).entities.map((entity) =>
              entity.kind === "room" && acceptedAssetIds.has(entity.id)
                ? { ...entity, acceptedRoomAssetId: acceptedAssetIds.get(entity.id)! }
                : entity
            ),
          }
        : null;
    if (!upgradedLayout) {
      throw new DebateMysteryMansionCodecError("Installed mansion layout is invalid.");
    }
    args.db.prepare(
      `UPDATE debate_mystery_mansion_bundles
          SET layout_json = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(
      typeof upgradedLayout === "object" && !Array.isArray(upgradedLayout) &&
          (upgradedLayout as { version?: unknown }).version === 2
        ? canonicalMansionLayoutV2(upgradedLayout as MansionLayoutV2)
        : JSON.stringify(upgradedLayout),
      now,
      args.bundleId,
      args.userId,
    );
    args.db.exec("COMMIT");
  } catch (error) {
    if (args.db.isTransaction) args.db.exec("ROLLBACK");
    throw error;
  }

  return {
    bundleId: args.bundleId,
    updatedRoomIds: [...packageRoomByInstalledId.keys()],
    acceptedAssetIds,
    illustratedAssetIds,
  };
}

export function importInternalMansionPackageToDbDetailedV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  archive: Uint8Array;
  portableMetadata?: PortableMansionInstallationMetadataV1 | null;
  /** Parent package imports own the surrounding transaction. */
  manageTransaction?: boolean;
}): ImportedMansionPackageV1 {
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
  const importedAssetIdByPortableId = new Map<string, string>();
  const mansionAssetSchema = args.db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'debate_mystery_mansion_assets'",
  ).get() as { sql?: string } | undefined;
  const storesOggNatively = mansionAssetSchema?.sql?.includes("'audio/ogg'") === true;
  const importedHouseStyle = {
    version: 1 as const,
    id: decoded.manifest.houseStyle.id,
    label: decoded.manifest.houseStyle.label,
    promptContract: decoded.manifest.houseStyle.promptContract,
    atmosphere: normalizeDebateMysteryAtmosphereContractV1(
      decoded.manifest.ambience?.atmosphere,
      `${decoded.manifest.houseStyle.label} ${decoded.manifest.houseStyle.promptContract}`,
    ),
    acousticThemePaletteId:
      decoded.manifest.ambience?.themePaletteId ??
      debateMysteryAcousticThemePaletteV1(
        `${decoded.manifest.houseStyle.label} ${decoded.manifest.houseStyle.promptContract}`,
      ),
    bespokeAmbienceRequested:
      decoded.manifest.ambience?.bespokeSynthesisRequested === true,
    ambience: null,
    musicIdentity: normalizeMansionMusicIdentityV1(
      decoded.manifest.musicIdentity,
      deriveMansionMusicIdentityV1({
        title: decoded.manifest.title,
        houseStyleLabel: decoded.manifest.houseStyle.label,
        houseStylePromptContract: decoded.manifest.houseStyle.promptContract,
        atmosphere: normalizeDebateMysteryAtmosphereContractV1(
          decoded.manifest.ambience?.atmosphere,
          `${decoded.manifest.houseStyle.label} ${decoded.manifest.houseStyle.promptContract}`,
        ),
      }),
    ),
  };
  const manageTransaction = args.manageTransaction !== false;
  if (manageTransaction) args.db.exec("BEGIN IMMEDIATE");
  try {
    args.db.prepare(
      `INSERT INTO debate_mystery_mansion_bundles
         (id, user_id, source_session_id, name, floors, total_rooms,
          suspect_count, style_json, layout_json, portable_metadata_json,
          portable_payload_sha256, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      bundleId,
      args.userId,
      decoded.manifest.title.slice(0, 180),
      decoded.manifest.floorCount,
      rooms.length,
      suspectIndex,
      JSON.stringify(importedHouseStyle),
      JSON.stringify(rooms),
      args.portableMetadata ? JSON.stringify(args.portableMetadata) : null,
      args.portableMetadata?.payloadSha256 ?? null,
      now,
      now,
    );
    const insertAsset = args.db.prepare(
      `INSERT INTO debate_mystery_mansion_assets
         (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
          mime_type, width, height, duration_ms, provider, model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'package-import', 'internal-mansion-v1', ?, ?)
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
    const insertPropVariant = args.db.prepare(
      `INSERT INTO debate_mystery_mansion_prop_variants
         (user_id, bundle_id, registry_version, archetype_id, status,
          display_name, appearance_description, asset_id, attempt_count,
          failure_code, created_at, updated_at)
       VALUES (?, ?, 1, ?, 'ready', ?, ?, ?, 0, NULL, ?, ?)
       ON CONFLICT(user_id, bundle_id, registry_version, archetype_id) DO UPDATE SET
         status = 'ready',
         display_name = excluded.display_name,
         appearance_description = excluded.appearance_description,
         asset_id = excluded.asset_id,
         attempt_count = 0,
         failure_code = NULL,
         updated_at = excluded.updated_at`,
    );
    let propIndex = 0;
    const themedVariantByPortableAssetId = new Map(
      decoded.manifest.propTheme?.variants.map((variant) => [variant.packageAssetId, variant]) ?? [],
    );
    for (const descriptor of decoded.manifest.assets) {
      const bytes = Buffer.from(decoded.assets.get(descriptor.archivePath)!);
      const encrypted = encryptBytes(bytes, args.userKey);
      insertAsset.run(
        randomUUID(), args.userId, encrypted.ciphertext, encrypted.iv,
        encrypted.tag, descriptor.sha256, bytes.byteLength,
        descriptor.mimeType === "audio/ogg" && !storesOggNatively
          ? "audio/mpeg"
          : descriptor.mimeType,
        descriptor.width, descriptor.height,
        descriptor.durationMs, now, now,
      );
      const stored = findAsset.get(args.userId, descriptor.sha256) as { id: string };
      importedAssetIdByPortableId.set(descriptor.id, stored.id);
      const themedVariant = descriptor.role === "prop"
        ? themedVariantByPortableAssetId.get(descriptor.id)
        : undefined;
      let logicalId: string;
      if (descriptor.role === "room") {
        const sourceRoom = decoded.manifest.rooms.find((room) => room.roomAssetId === descriptor.id);
        const illustratedRoom = decoded.manifest.rooms.find(
          (room) => room.illustratedRoomAssetId === descriptor.id,
        );
        logicalId = sourceRoom
          ? roomIdMap.get(sourceRoom.id)!
          : illustratedRoom
            ? `${roomIdMap.get(illustratedRoom.id)!}:illustrated-v1`
            : `room-asset-${descriptor.id}`;
      } else if (descriptor.role === "prop") {
        logicalId = themedVariant
          ? `theme:${themedVariant.archetypeId}`
          : `prop-${String(++propIndex).padStart(3, "0")}`;
      } else if (
        descriptor.role === "music" &&
        descriptor.id === decoded.manifest.investigationThemeAssetId
      ) {
        logicalId = MANSION_MUSIC_ACTIVE_LOGICAL_ID_V1;
      } else if (descriptor.role === "sfx") {
        const cue = decoded.manifest.effects?.cues.find(
          (candidate) => candidate.packageAssetId === descriptor.id,
        );
        if (!cue) {
          throw new DebateMysteryMansionCodecError("Mansion effect clip has no cue reference.");
        }
        logicalId = mansionSfxLogicalIdV1(cue.cueId);
      } else {
        logicalId = descriptor.id;
      }
      const storedRole = descriptor.role === "preview" || descriptor.role === "presentation"
        ? "presentation"
        : descriptor.role === "ambience"
          ? "music"
          : descriptor.role;
      if (storedRole === "voice") {
        throw new DebateMysteryMansionCodecError("Mansion packages cannot install voice assets.");
      }
      if (descriptor.role === "ambience") {
        const reference = decoded.manifest.ambience?.assets.find(
          (candidate) => candidate.packageAssetId === descriptor.id,
        );
        if (!reference) {
          throw new DebateMysteryMansionCodecError("Mansion ambience asset has no semantic reference.");
        }
        logicalId = `ambience:${reference.id}`;
      }
      insertRef.run(bundleId, args.userId, stored.id, storedRole, logicalId, now);
      if (
        descriptor.id === decoded.manifest.previewAssetId &&
        storedRole !== "presentation"
      ) {
        insertRef.run(
          bundleId,
          args.userId,
          stored.id,
          "presentation",
          `package-preview:${descriptor.id}`,
          now,
        );
      }
      if (themedVariant) {
        insertPropVariant.run(
          args.userId,
          bundleId,
          themedVariant.archetypeId,
          themedVariant.displayName,
          themedVariant.appearanceDescription,
          stored.id,
          now,
          now,
        );
      }
    }
    const installedAmbience = decoded.manifest.ambience
      ? {
          ...decoded.manifest.ambience,
          assets: decoded.manifest.ambience.assets.map((reference) => ({
            ...reference,
            packageAssetId: reference.packageAssetId
              ? importedAssetIdByPortableId.get(reference.packageAssetId) ?? null
              : null,
          })),
          roomProfiles: decoded.manifest.ambience.roomProfiles.map((profile) => ({
            ...profile,
            roomId: roomIdMap.get(profile.roomId) ?? profile.roomId,
          })),
        }
      : null;
    const importedLayoutV2 = decoded.manifest.layoutV2
      ? (() => {
          const entityIdByPortableId = new Map(
            decoded.manifest.layoutV2.entities.map((entity) => [
              entity.id,
              roomIdMap.get(entity.id) ?? randomUUID(),
            ]),
          );
          const remapped = remapMansionLayoutV2Ids(
            decoded.manifest.layoutV2,
            (id) => entityIdByPortableId.get(id) ?? id,
            (id) => importedAssetIdByPortableId.get(id) ?? null,
          );
          return JSON.parse(canonicalMansionLayoutV2(remapped)) as MansionLayoutV2;
        })()
      : null;
    args.db.prepare(
      `UPDATE debate_mystery_mansion_bundles
          SET style_json = ?, layout_json = ?, library_metadata_json = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(
      JSON.stringify({ ...importedHouseStyle, ambience: installedAmbience }),
      importedLayoutV2 ? canonicalMansionLayoutV2(importedLayoutV2) : JSON.stringify(rooms),
      decoded.manifest.investigationThemeAssetId
        ? JSON.stringify({
            version: 1,
            title: null,
            description: null,
            thumbnailAssetId: null,
            music: {
              version: 1,
              activeTitle:
                decoded.manifest.investigationThemeTitle?.trim() ||
                `${decoded.manifest.title} investigation theme`,
              candidateTitle: null,
              candidateLens: null,
              previousTitle: null,
              activeLoop: decoded.manifest.investigationThemeLoop ?? null,
              candidateLoop: null,
              previousLoop: null,
              candidateValidation: null,
            },
          })
        : null,
      now,
      bundleId,
      args.userId,
    );
    for (const room of decoded.manifest.rooms) {
      if (room.roomAssetId && !assetByPortableId.has(room.roomAssetId)) {
        throw new DebateMysteryMansionCodecError(`Room ${room.id} references a missing asset.`);
      }
    }
    if (manageTransaction) args.db.exec("COMMIT");
  } catch (error) {
    if (manageTransaction && args.db.isTransaction) args.db.exec("ROLLBACK");
    throw error;
  }
  return { bundleId, roomIdMap, assetIdMap: importedAssetIdByPortableId };
}

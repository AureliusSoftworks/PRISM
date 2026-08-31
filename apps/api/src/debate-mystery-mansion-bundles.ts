import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  DEBATE_MYSTERY_ROOM_TEMPLATES,
  DEBATE_MYSTERY_MANSION_EXTERIOR_SUBJECT_ID_V1,
  MANSION_MUSIC_ACTIVE_LOGICAL_ID_V1,
  MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1,
  MANSION_MUSIC_PREVIOUS_LOGICAL_ID_V1,
  MANSION_ATMOSPHERE_ACTIVE_LOGICAL_ID_V1,
  MANSION_ATMOSPHERE_CANDIDATE_LOGICAL_ID_V1,
  MANSION_ATMOSPHERE_PREVIOUS_LOGICAL_ID_V1,
  autoDecorateMansionLayoutV2,
  canonicalMansionLayoutV2,
  canonicalPortablePackageJsonV1,
  createBlankMansionLayoutV2,
  createMysteryVenueProposalV1,
  debateMysteryAcousticThemePaletteV1,
  debateMysteryHouseStyleV2,
  deriveMansionMusicIdentityV1,
  normalizeMansionMusicIdentityV1,
  normalizeDebateMysteryAtmosphereContractV1,
  debateMysteryMansionBundleEligibleV2,
  resolveDebateMysteryMansionExteriorScaleClassV1,
  mansionLayoutV2EditorDerivativeFromLegacyRooms,
  mansionLayoutV2HousePlanFromLegacyRooms,
  mansionLayoutV2ToLegacyRooms,
  validateMansionLayoutV2,
  validateDebateMysteryMansionEditorTopologyV1,
  type DebateMysteryHouseStyleV2,
  type DebateMysteryMansionAssetV1,
  type DebateMysteryMansionLibraryPresentationV1,
  type DebateMysteryMansionDerivationV1,
  type DebateMysteryMansionBundleRoomV1,
  type DebateMysteryMansionBundleSummaryV1,
  type DebateMysteryMansionSnapshotV2,
  type MansionLayoutRoomV2,
  type MansionLayoutV2,
  type MysteryVenueProposalV1,
  type MansionMusicRefractLensV1,
  type MansionMusicLoopV1,
  type DebateWhodunnitFormatStateV2,
  type PortableMansionInstallationMetadataV1,
  type PortablePackageJsonValueV1,
} from "@localai/shared";
import sharp from "sharp";
import { getDebateSession } from "./debate.ts";
import { readGeneratedImageBytes } from "./image-storage.ts";
import { decryptBytes, encryptBytes } from "./security.ts";
import { HttpError } from "./utils.http.ts";
import {
  cleanupUnreferencedDebateMysteryMansionAssetsV1,
  cloneDebateMysteryMansionPropVariantsV1,
  getDebateMysteryMansionPropThemeStateV1,
} from "./debate-mystery-mansion-prop-variants.ts";
import { applyCuratedImportedMansionDecorationV1 } from "./debate-mystery-mansion-curated-decoration.ts";

interface MansionBundleRow {
  id: string;
  user_id: string;
  source_session_id: string | null;
  name: string;
  floors: number;
  total_rooms: number;
  suspect_count: number;
  style_json: string;
  layout_json: string;
  library_metadata_json: string | null;
  derivation_metadata_json: string | null;
  portable_metadata_json: string | null;
  portable_payload_sha256: string | null;
  created_at: string;
  updated_at: string;
}

function parseDerivationMetadata(
  value: string | null,
): DebateMysteryMansionDerivationV1 | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<DebateMysteryMansionDerivationV1>;
    if (
      parsed.version !== 1 ||
      (parsed.sourceBundleId !== null && typeof parsed.sourceBundleId !== "string") ||
      typeof parsed.sourceTitle !== "string" ||
      (parsed.sourcePackageId !== null && typeof parsed.sourcePackageId !== "string") ||
      (parsed.acceptedExteriorScaleClass !== "compact" &&
        parsed.acceptedExteriorScaleClass !== "standard" &&
        parsed.acceptedExteriorScaleClass !== "grand") ||
      typeof parsed.createdAt !== "string"
    ) return null;
    return parsed as DebateMysteryMansionDerivationV1;
  } catch {
    return null;
  }
}

interface SavedMansionLibraryMetadataV1 {
  version: 1;
  title: string | null;
  description: string | null;
  thumbnailAssetId: string | null;
  music: {
    version: 1;
    activeTitle: string | null;
    candidateTitle: string | null;
    candidateLens: MansionMusicRefractLensV1 | "signature" | null;
    previousTitle: string | null;
    activeLoop: MansionMusicLoopV1 | null;
    candidateLoop: MansionMusicLoopV1 | null;
    previousLoop: MansionMusicLoopV1 | null;
    candidateValidation: "pending" | "validated" | null;
  } | null;
  atmosphere: {
    version: 1;
    activeTitle: string | null;
    candidateTitle: string | null;
    previousTitle: string | null;
  } | null;
}

export interface UpdateDebateMysteryMansionLibraryInputV1 {
  title?: unknown;
  description?: unknown;
  thumbnailDataUrl?: unknown;
}

const MANSION_LIBRARY_THUMBNAIL_LOGICAL_ID = "library-thumbnail-override-v1";
const MANSION_LIBRARY_THUMBNAIL_MAX_SOURCE_BYTES = 8 * 1024 * 1024;

function parseMusicLoop(value: unknown): MansionMusicLoopV1 | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<MansionMusicLoopV1>;
  return input.version === 1 &&
    typeof input.loopStartMs === "number" && Number.isFinite(input.loopStartMs) &&
    typeof input.loopEndMs === "number" && Number.isFinite(input.loopEndMs) &&
    typeof input.crossfadeMs === "number" && Number.isFinite(input.crossfadeMs) &&
    typeof input.silenceRatio === "number" && Number.isFinite(input.silenceRatio)
      ? input as MansionMusicLoopV1
      : null;
}

function parseLibraryMetadata(value: string | null): SavedMansionLibraryMetadataV1 {
  if (!value) {
    return { version: 1, title: null, description: null, thumbnailAssetId: null, music: null, atmosphere: null };
  }
  try {
    const parsed = JSON.parse(value) as Partial<SavedMansionLibraryMetadataV1>;
    return {
      version: 1,
      title: typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim().slice(0, 180)
        : null,
      description: typeof parsed.description === "string" && parsed.description.trim()
        ? parsed.description.trim().slice(0, 1_200)
        : null,
      thumbnailAssetId:
        typeof parsed.thumbnailAssetId === "string" && parsed.thumbnailAssetId.trim()
          ? parsed.thumbnailAssetId.trim()
          : null,
      music: parsed.music && typeof parsed.music === "object" && parsed.music.version === 1
        ? {
            version: 1,
            activeTitle: typeof parsed.music.activeTitle === "string" && parsed.music.activeTitle.trim()
              ? parsed.music.activeTitle.trim().slice(0, 180) : null,
            candidateTitle: typeof parsed.music.candidateTitle === "string" && parsed.music.candidateTitle.trim()
              ? parsed.music.candidateTitle.trim().slice(0, 180) : null,
            candidateLens:
              parsed.music.candidateLens === "signature" ||
              parsed.music.candidateLens === "shadow" ||
              parsed.music.candidateLens === "pulse" ||
              parsed.music.candidateLens === "atmosphere"
                ? parsed.music.candidateLens : null,
            previousTitle: typeof parsed.music.previousTitle === "string" && parsed.music.previousTitle.trim()
              ? parsed.music.previousTitle.trim().slice(0, 180) : null,
            activeLoop: parseMusicLoop(parsed.music.activeLoop),
            candidateLoop: parseMusicLoop(parsed.music.candidateLoop),
            previousLoop: parseMusicLoop(parsed.music.previousLoop),
            candidateValidation:
              parsed.music.candidateValidation === "pending" || parsed.music.candidateValidation === "validated"
                ? parsed.music.candidateValidation
                : null,
          }
        : null,
      atmosphere: parsed.atmosphere && typeof parsed.atmosphere === "object" && parsed.atmosphere.version === 1
        ? {
            version: 1,
            activeTitle: typeof parsed.atmosphere.activeTitle === "string" && parsed.atmosphere.activeTitle.trim()
              ? parsed.atmosphere.activeTitle.trim().slice(0, 180) : null,
            candidateTitle: typeof parsed.atmosphere.candidateTitle === "string" && parsed.atmosphere.candidateTitle.trim()
              ? parsed.atmosphere.candidateTitle.trim().slice(0, 180) : null,
            previousTitle: typeof parsed.atmosphere.previousTitle === "string" && parsed.atmosphere.previousTitle.trim()
              ? parsed.atmosphere.previousTitle.trim().slice(0, 180) : null,
          }
        : null,
    };
  } catch {
    return { version: 1, title: null, description: null, thumbnailAssetId: null, music: null, atmosphere: null };
  }
}

function parsePortableMetadata(
  value: string | null,
): PortableMansionInstallationMetadataV1 | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as PortableMansionInstallationMetadataV1;
    return parsed && typeof parsed.packageId === "string" && typeof parsed.payloadSha256 === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function parseStyle(value: string): DebateMysteryHouseStyleV2 {
  const parsed = JSON.parse(value) as Partial<DebateMysteryHouseStyleV2>;
  if (
    parsed.version !== 1 ||
    typeof parsed.id !== "string" ||
    typeof parsed.label !== "string" ||
    typeof parsed.promptContract !== "string"
  ) {
    throw new Error("Saved mansion style is invalid.");
  }
  const atmosphere = normalizeDebateMysteryAtmosphereContractV1(
    parsed.atmosphere,
    `${parsed.label} ${parsed.promptContract}`,
  );
  const fallbackMusicIdentity = deriveMansionMusicIdentityV1({
    title: parsed.label,
    houseStyleLabel: parsed.label,
    houseStylePromptContract: parsed.promptContract,
    atmosphere,
  });
  return {
    version: 1,
    id: parsed.id,
    label: parsed.label,
    promptContract: parsed.promptContract,
    atmosphere,
    acousticThemePaletteId:
      typeof parsed.acousticThemePaletteId === "string" && parsed.acousticThemePaletteId.trim()
        ? parsed.acousticThemePaletteId.trim().slice(0, 200)
        : debateMysteryAcousticThemePaletteV1(`${parsed.label} ${parsed.promptContract}`),
    bespokeAmbienceRequested: parsed.bespokeAmbienceRequested === true,
    ambience:
      parsed.ambience && typeof parsed.ambience === "object" && parsed.ambience.version === 1
        ? parsed.ambience
        : null,
    musicIdentity: normalizeMansionMusicIdentityV1(parsed.musicIdentity, fallbackMusicIdentity),
  };
}

function parseLegacyRooms(parsed: unknown): DebateMysteryMansionBundleRoomV1[] {
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Saved mansion layout is invalid.");
  }
  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("Saved mansion room is invalid.");
    }
    const room = entry as Partial<DebateMysteryMansionBundleRoomV1>;
    const floor = room.floor;
    const x = room.x;
    const y = room.y;
    const width = room.width;
    const height = room.height;
    if (
      typeof room.id !== "string" ||
      typeof room.templateId !== "string" ||
      typeof room.name !== "string" ||
      typeof floor !== "number" || !Number.isInteger(floor) ||
      typeof x !== "number" || !Number.isFinite(x) ||
      typeof y !== "number" || !Number.isFinite(y) ||
      typeof width !== "number" || !Number.isFinite(width) ||
      typeof height !== "number" || !Number.isFinite(height) ||
      !Array.isArray(room.neighborIds) ||
      typeof room.emoji !== "string"
    ) {
      throw new Error("Saved mansion room contract is incomplete.");
    }
    return {
      id: room.id,
      templateId: room.templateId,
      name: room.name,
      floor,
      x,
      y,
      width,
      height,
      neighborIds: room.neighborIds.filter((id): id is string => typeof id === "string"),
      assignedSuspectSeatId:
        typeof room.assignedSuspectSeatId === "string"
          ? room.assignedSuspectSeatId
          : null,
      emoji: room.emoji,
      imageId: typeof room.imageId === "string" ? room.imageId : null,
      bundledAssetPath:
        typeof room.bundledAssetPath === "string"
          ? room.bundledAssetPath
          : null,
    };
  });
}

function parseLayoutV2(value: string): MansionLayoutV2 | null {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      (parsed as { version?: unknown }).version !== 2) return null;
  try {
    const layout = parsed as MansionLayoutV2;
    const errors = validateMansionLayoutV2(layout, { requireEditorFloors: true });
    if (errors.length > 0) throw new Error(errors.join("\n"));
    return layout;
  } catch (error) {
    throw new Error(
      `Saved MansionLayoutV2 is invalid: ${error instanceof Error ? error.message : "unknown layout error"}`,
    );
  }
}

function parseRooms(value: string): DebateMysteryMansionBundleRoomV1[] {
  const layoutV2 = parseLayoutV2(value);
  return layoutV2
    ? mansionLayoutV2ToLegacyRooms(layoutV2) as DebateMysteryMansionBundleRoomV1[]
    : parseLegacyRooms(JSON.parse(value) as unknown);
}

function aggregateAssets(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
): DebateMysteryMansionAssetV1[] {
  return (db.prepare(
    `SELECT assets.id, refs.role, refs.logical_id, assets.mime_type,
            assets.sha256, assets.byte_size, assets.duration_ms
       FROM debate_mystery_mansion_asset_refs AS refs
       JOIN debate_mystery_mansion_assets AS assets
         ON assets.id = refs.asset_id AND assets.user_id = refs.user_id
      WHERE refs.bundle_id = ? AND refs.user_id = ?
        AND refs.logical_id NOT LIKE 'case:%'
      ORDER BY refs.role, refs.logical_id, assets.id`,
  ).all(bundleId, userId) as unknown as Array<{
    id: string;
    role: DebateMysteryMansionAssetV1["role"];
    logical_id: string;
    mime_type: DebateMysteryMansionAssetV1["mimeType"];
    sha256: string;
    byte_size: number;
    duration_ms: number | null;
  }>).map((asset) => ({
    id: asset.id,
    role: asset.role,
    logicalId: asset.logical_id,
    mimeType: asset.mime_type,
    sha256: asset.sha256,
    byteLength: asset.byte_size,
    durationMs: asset.duration_ms,
  }));
}

function mansionLibraryPresentation(
  row: MansionBundleRow,
  style: DebateMysteryHouseStyleV2,
  assets: DebateMysteryMansionAssetV1[],
  portable: PortableMansionInstallationMetadataV1 | null,
): DebateMysteryMansionLibraryPresentationV1 {
  const saved = parseLibraryMetadata(row.library_metadata_json);
  const defaultThumbnailAssetId =
    assets.find(
      (asset) =>
        asset.role === "presentation" &&
        asset.logicalId !== MANSION_LIBRARY_THUMBNAIL_LOGICAL_ID,
    )?.id ?? null;
  const validThumbnailOverride = saved.thumbnailAssetId && assets.some(
    (asset) =>
      asset.id === saved.thumbnailAssetId &&
      asset.role === "presentation" &&
      asset.logicalId === MANSION_LIBRARY_THUMBNAIL_LOGICAL_ID,
  )
    ? saved.thumbnailAssetId
    : null;
  return {
    version: 1,
    defaults: {
      title: row.name,
      description:
        portable?.description?.trim() ||
        `${style.label.trim() || "Whodunnit"} mansion · ${row.floors} floor${row.floors === 1 ? "" : "s"} · ${row.total_rooms} rooms.`,
      thumbnailAssetId: defaultThumbnailAssetId,
    },
    overrides: {
      title: saved.title,
      description: saved.description,
      thumbnailAssetId: validThumbnailOverride,
    },
  };
}

function summary(
  db: DatabaseSync,
  row: MansionBundleRow,
): DebateMysteryMansionBundleSummaryV1 {
  const houseStyle = parseStyle(row.style_json);
  const assets = aggregateAssets(db, row.user_id, row.id);
  const portable = parsePortableMetadata(row.portable_metadata_json);
  const derivation = parseDerivationMetadata(row.derivation_metadata_json);
  const libraryMetadata = parseLibraryMetadata(row.library_metadata_json);
  const propThemeState = getDebateMysteryMansionPropThemeStateV1(db, row.user_id, row.id);
  const activeAsset = assets.find((asset) => asset.role === "music" && asset.logicalId === MANSION_MUSIC_ACTIVE_LOGICAL_ID_V1) ??
    assets.find((asset) => asset.role === "music" && !asset.logicalId.startsWith("ambience:") &&
      asset.logicalId !== MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1 &&
      asset.logicalId !== MANSION_MUSIC_PREVIOUS_LOGICAL_ID_V1) ?? null;
  const candidateAsset = assets.find(
    (asset) => asset.role === "music" && asset.logicalId === MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1,
  ) ?? null;
  const previousAsset = assets.find(
    (asset) => asset.role === "music" && asset.logicalId === MANSION_MUSIC_PREVIOUS_LOGICAL_ID_V1,
  ) ?? null;
  const activeAtmosphereAsset = assets.find(
    (asset) => asset.role === "music" && asset.logicalId === MANSION_ATMOSPHERE_ACTIVE_LOGICAL_ID_V1,
  ) ?? null;
  const candidateAtmosphereAsset = assets.find(
    (asset) => asset.role === "music" && asset.logicalId === MANSION_ATMOSPHERE_CANDIDATE_LOGICAL_ID_V1,
  ) ?? null;
  const previousAtmosphereAsset = assets.find(
    (asset) => asset.role === "music" && asset.logicalId === MANSION_ATMOSPHERE_PREVIOUS_LOGICAL_ID_V1,
  ) ?? null;
  const parsedLayoutV2 = parseLayoutV2(row.layout_json);
  return {
    version: 1,
    id: row.id,
    name: row.name,
    sourceSessionId: row.source_session_id,
    floors: row.floors,
    totalRooms: row.total_rooms,
    scaleClass: resolveDebateMysteryMansionExteriorScaleClassV1({
      floors: row.floors,
      totalRooms: row.total_rooms,
    }),
    suspectCount: row.suspect_count,
    houseStyle,
    rooms: parseRooms(row.layout_json),
    layoutV2: parsedLayoutV2
      ? migrateLegacyRoomArtRefsToLayoutV2(parsedLayoutV2, assets)
      : null,
    assets,
    portable,
    derivation,
    library: mansionLibraryPresentation(row, houseStyle, assets, portable),
    music: {
      version: 1,
      identity: houseStyle.musicIdentity!,
      active: activeAsset ? {
        assetId: activeAsset.id,
        title: libraryMetadata.music?.activeTitle ?? `${row.name} investigation theme`,
        loop: libraryMetadata.music?.activeLoop ?? null,
      } : null,
      candidate: candidateAsset ? {
        assetId: candidateAsset.id,
        title: libraryMetadata.music?.candidateTitle ?? `${row.name} refracted preview`,
        lens: libraryMetadata.music?.candidateLens ?? "signature",
        loop: libraryMetadata.music?.candidateLoop ?? null,
        validated: libraryMetadata.music?.candidateValidation !== "pending",
      } : null,
      previous: previousAsset ? {
        assetId: previousAsset.id,
        title: libraryMetadata.music?.previousTitle ?? `${row.name} previous theme`,
        loop: libraryMetadata.music?.previousLoop ?? null,
      } : null,
    },
    atmosphere: {
      version: 1,
      active: activeAtmosphereAsset ? {
        assetId: activeAtmosphereAsset.id,
        title: libraryMetadata.atmosphere?.activeTitle ?? `${row.name} atmosphere`,
      } : null,
      candidate: candidateAtmosphereAsset ? {
        assetId: candidateAtmosphereAsset.id,
        title: libraryMetadata.atmosphere?.candidateTitle ?? `${row.name} atmosphere preview`,
      } : null,
      previous: previousAtmosphereAsset ? {
        assetId: previousAtmosphereAsset.id,
        title: libraryMetadata.atmosphere?.previousTitle ?? `${row.name} previous atmosphere`,
      } : null,
    },
    propTheme: propThemeState.propTheme,
    propThemeProgress: propThemeState.progress,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function frozenMansionJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Captures the exact spoiler-safe mansion input used by one Case Forge run.
 * Callers persist this snapshot with the session before any asynchronous pass
 * can observe a later Library edit. */
export function freezeDebateMysteryMansionSnapshotV2(
  mansion: DebateMysteryMansionBundleSummaryV1,
  capturedAt = new Date().toISOString(),
): DebateMysteryMansionSnapshotV2 {
  const title = mansion.library?.overrides.title ??
    mansion.library?.defaults.title ?? mansion.name;
  const description = mansion.library?.overrides.description ??
    mansion.library?.defaults.description ?? "A reusable PRISM Whodunnit mansion.";
  const thumbnailAssetId = mansion.library?.overrides.thumbnailAssetId ??
    mansion.library?.defaults.thumbnailAssetId ?? null;
  const rooms = frozenMansionJson(mansion.rooms).map((room) => ({
    ...room,
    neighborIds: [...room.neighborIds].sort(),
  })).sort((left, right) => left.id.localeCompare(right.id));
  // Case Forge fills missing presentation metadata in its immutable projection.
  // The installed/imported source stays byte-for-byte unchanged, and existing
  // authored anchors or room lights remain authoritative.
  const decorationLineage = mansion.portable?.payloadSha256 ||
    mansion.portable?.packageId || mansion.id;
  const decorationSeed = `${mansion.houseStyle.id}:${decorationLineage}`;
  const legacyRoomAssetIdByRoomId = new Map(
    (mansion.assets ?? [])
      .filter((asset) => asset.role === "room" && rooms.some((room) => room.id === asset.logicalId))
      .map((asset) => [asset.logicalId, asset.id]),
  );
  const sourceLayoutV2 = mansion.layoutV2 ?? (() => {
    const projected = mansionLayoutV2HousePlanFromLegacyRooms(
      rooms,
      { seed: decorationSeed },
    );
    return {
      ...projected,
      entities: projected.entities.map((entity) => {
        if (entity.kind !== "room") return entity;
        const acceptedRoomAssetId = legacyRoomAssetIdByRoomId.get(entity.id);
        return acceptedRoomAssetId ? { ...entity, acceptedRoomAssetId } : entity;
      }),
    };
  })();
  const curatedLayoutV2 = applyCuratedImportedMansionDecorationV1(
    sourceLayoutV2,
    mansion.portable?.payloadSha256,
  );
  const decoratedLayoutV2 = autoDecorateMansionLayoutV2({
    ...curatedLayoutV2,
    // Candidates are mutable authoring previews. Only explicitly accepted
    // room art belongs to a Case snapshot and its canonical layout hash.
    roomArtCandidates: [],
  }, {
    seed: decorationSeed,
    sourceIdentity: decorationLineage,
  });
  const layoutV2 = JSON.parse(canonicalMansionLayoutV2(decoratedLayoutV2)) as MansionLayoutV2;
  const transientAssetIds = new Set([
    ...(mansion.layoutV2?.roomArtCandidates.flatMap((candidate) =>
      candidate.assetId ? [candidate.assetId] : []) ?? []),
    ...(mansion.music?.candidate ? [mansion.music.candidate.assetId] : []),
    ...(mansion.music?.previous ? [mansion.music.previous.assetId] : []),
    ...(mansion.atmosphere?.candidate ? [mansion.atmosphere.candidate.assetId] : []),
    ...(mansion.atmosphere?.previous ? [mansion.atmosphere.previous.assetId] : []),
  ]);
  const acceptedThemeAssetIds = new Set(
    mansion.propTheme?.variants.map((variant) => variant.packageAssetId) ?? [],
  );
  const presentation = {
    version: 2 as const,
    name: mansion.name,
    title,
    description,
    thumbnailAssetId,
    scaleClass: mansion.scaleClass,
    houseStyle: frozenMansionJson(mansion.houseStyle),
    investigationThemeLoop: frozenMansionJson(mansion.music?.active?.loop ?? null),
    propTheme: frozenMansionJson(mansion.propTheme ?? null),
    assets: frozenMansionJson(mansion.assets ?? [])
      .filter((asset) => !transientAssetIds.has(asset.id))
      .filter((asset) =>
        !asset.logicalId.startsWith("theme:") || acceptedThemeAssetIds.has(asset.id),
      )
      .sort(
      (left, right) => left.id.localeCompare(right.id),
      ),
  };
  const layoutCanonical = layoutV2
    ? canonicalMansionLayoutV2(layoutV2)
    : canonicalPortablePackageJsonV1(rooms as unknown as PortablePackageJsonValueV1);
  const presentationCanonical = canonicalPortablePackageJsonV1(
    presentation as unknown as PortablePackageJsonValueV1,
  );
  return {
    version: 2,
    sourceBundleId: mansion.id,
    rooms,
    layoutV2,
    layoutSha256: createHash("sha256").update(layoutCanonical).digest("hex"),
    presentation,
    presentationSha256: createHash("sha256").update(presentationCanonical).digest("hex"),
    capturedAt,
  };
}

/** Keeps every frozen presentation byte addressable for the life of the
 * source bundle/case without copying encrypted content or exposing the case
 * retention refs in Mansion Library summaries and exports. */
export function retainDebateMysteryMansionSnapshotAssetsV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  snapshot: DebateMysteryMansionSnapshotV2,
): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO debate_mystery_mansion_asset_refs
       (bundle_id, user_id, asset_id, role, logical_id, created_at)
     SELECT refs.bundle_id, refs.user_id, refs.asset_id, refs.role, ?, ?
       FROM debate_mystery_mansion_asset_refs AS refs
      WHERE refs.bundle_id = ? AND refs.user_id = ? AND refs.asset_id = ?
      LIMIT 1`,
  );
  const now = new Date().toISOString();
  for (const asset of snapshot.presentation.assets) {
    insert.run(
      `case:${sessionId}:${asset.role}:${asset.id}`,
      now,
      snapshot.sourceBundleId,
      userId,
      asset.id,
    );
  }
}

function bundleRow(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
): MansionBundleRow {
  const row = db.prepare(
    `SELECT id, user_id, source_session_id, name, floors, total_rooms,
            suspect_count, style_json, layout_json, library_metadata_json, derivation_metadata_json,
            portable_metadata_json,
            portable_payload_sha256, created_at, updated_at
       FROM debate_mystery_mansion_bundles
      WHERE id = ? AND user_id = ?`,
  ).get(bundleId, userId) as MansionBundleRow | undefined;
  if (!row) throw new HttpError(404, "That saved mansion was not found.");
  return row;
}

export function getDebateMysteryMansionBundleV2(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
): DebateMysteryMansionBundleSummaryV1 {
  return summary(db, bundleRow(db, userId, bundleId));
}

export function listDebateMysteryMansionBundlesV2(
  db: DatabaseSync,
  userId: string,
): DebateMysteryMansionBundleSummaryV1[] {
  const rows = db.prepare(
    `SELECT id, user_id, source_session_id, name, floors, total_rooms,
            suspect_count, style_json, layout_json, library_metadata_json, derivation_metadata_json,
            portable_metadata_json,
            portable_payload_sha256, created_at, updated_at
       FROM debate_mystery_mansion_bundles
      WHERE user_id = ?
      ORDER BY updated_at DESC, id`,
  ).all(userId) as unknown as MansionBundleRow[];
  return rows.map((row) => summary(db, row));
}

function normalizedMansionLibraryText(
  value: unknown,
  label: string,
  maxLength: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new HttpError(400, `${label} must be text or null.`);
  }
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) {
    throw new HttpError(400, `${label} cannot be blank. Use the file default instead.`);
  }
  if (normalized.length > maxLength) {
    throw new HttpError(400, `${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

async function normalizedMansionLibraryThumbnail(
  value: unknown,
): Promise<{ bytes: Buffer; sha256: string } | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new HttpError(400, "Mansion thumbnail must be an image data URL or null.");
  }
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/u.exec(value);
  if (!match) {
    throw new HttpError(400, "Choose a PNG, JPEG, or WebP mansion thumbnail.");
  }
  if (match[2]!.length > Math.ceil(MANSION_LIBRARY_THUMBNAIL_MAX_SOURCE_BYTES * 4 / 3) + 8) {
    throw new HttpError(413, "Mansion thumbnails must be 8 MB or smaller.");
  }
  const source = Buffer.from(match[2]!, "base64");
  if (source.byteLength === 0 || source.byteLength > MANSION_LIBRARY_THUMBNAIL_MAX_SOURCE_BYTES) {
    throw new HttpError(413, "Mansion thumbnails must be 8 MB or smaller.");
  }
  try {
    const bytes = await sharp(source, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(960, 540, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
    return {
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch {
    throw new HttpError(400, "That mansion thumbnail could not be decoded safely.");
  }
}

/** Updates local library presentation without mutating the mansion's source
 * name, portable description, package payload, or export defaults. */
export async function updateDebateMysteryMansionLibraryV1(
  db: DatabaseSync,
  userKey: Buffer,
  userId: string,
  bundleId: string,
  input: UpdateDebateMysteryMansionLibraryInputV1,
): Promise<DebateMysteryMansionBundleSummaryV1> {
  const row = bundleRow(db, userId, bundleId);
  if (
    input.title === undefined &&
    input.description === undefined &&
    input.thumbnailDataUrl === undefined
  ) {
    throw new HttpError(400, "Choose a mansion library detail to update.");
  }
  const title = normalizedMansionLibraryText(input.title, "Mansion title", 180);
  const description = normalizedMansionLibraryText(
    input.description,
    "Mansion description",
    1_200,
  );
  const thumbnail = await normalizedMansionLibraryThumbnail(input.thumbnailDataUrl);
  const current = parseLibraryMetadata(row.library_metadata_json);
  const currentDerivation = parseDerivationMetadata(row.derivation_metadata_json);
  const next: SavedMansionLibraryMetadataV1 = {
    version: 1,
    title: title === undefined ? current.title : title,
    description: description === undefined ? current.description : description,
    thumbnailAssetId: current.thumbnailAssetId,
    music: current.music,
    atmosphere: current.atmosphere,
  };
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    if (thumbnail !== undefined) {
      db.prepare(
        `DELETE FROM debate_mystery_mansion_asset_refs
          WHERE bundle_id = ? AND user_id = ? AND role = 'presentation'
            AND logical_id = ?`,
      ).run(bundleId, userId, MANSION_LIBRARY_THUMBNAIL_LOGICAL_ID);
      next.thumbnailAssetId = null;
      if (thumbnail) {
        const encrypted = encryptBytes(thumbnail.bytes, userKey);
        db.prepare(
          `INSERT INTO debate_mystery_mansion_assets
             (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
              mime_type, width, height, duration_ms, provider, model, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'image/webp', 960, 540, NULL,
                   'library-edit', 'local-thumbnail-v1', ?, ?)
           ON CONFLICT(user_id, sha256) DO UPDATE SET updated_at = excluded.updated_at`,
        ).run(
          randomUUID(),
          userId,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.tag,
          thumbnail.sha256,
          thumbnail.bytes.byteLength,
          now,
          now,
        );
        const stored = db.prepare(
          "SELECT id FROM debate_mystery_mansion_assets WHERE user_id = ? AND sha256 = ?",
        ).get(userId, thumbnail.sha256) as { id: string };
        db.prepare(
          `INSERT INTO debate_mystery_mansion_asset_refs
             (bundle_id, user_id, asset_id, role, logical_id, created_at)
           VALUES (?, ?, ?, 'presentation', ?, ?)`,
        ).run(bundleId, userId, stored.id, MANSION_LIBRARY_THUMBNAIL_LOGICAL_ID, now);
        next.thumbnailAssetId = stored.id;
      }
    }
    const metadataJson = next.title || next.description || next.thumbnailAssetId || next.music
      ? JSON.stringify(next)
      : null;
    const nextDerivation = thumbnail
      ? currentDerivation && {
          ...currentDerivation,
          acceptedExteriorScaleClass: resolveDebateMysteryMansionExteriorScaleClassV1({
            floors: row.floors,
            totalRooms: row.total_rooms,
          }),
        }
      : currentDerivation;
    db.prepare(
      `UPDATE debate_mystery_mansion_bundles
          SET library_metadata_json = ?, derivation_metadata_json = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(
      metadataJson,
      nextDerivation ? JSON.stringify(nextDerivation) : null,
      now,
      bundleId,
      userId,
    );
    cleanupUnreferencedDebateMysteryMansionAssetsV1(db, userId);
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
  return getDebateMysteryMansionBundleV2(db, userId, bundleId);
}

function copiedMansionTitle(db: DatabaseSync, userId: string, sourceTitle: string): string {
  const base = sourceTitle.replace(/\s+Copy(?:\s+\d+)?$/u, "").trim() || "Untitled Mansion";
  for (let copy = 1; copy < 1_000; copy += 1) {
    const suffix = copy === 1 ? " Copy" : ` Copy ${copy}`;
    const candidate = `${base.slice(0, 180 - suffix.length)}${suffix}`;
    const exists = db.prepare(
      "SELECT 1 FROM debate_mystery_mansion_bundles WHERE user_id = ? AND name = ? LIMIT 1",
    ).get(userId, candidate);
    if (!exists) return candidate;
  }
  return `${base.slice(0, 168)} ${randomUUID().slice(0, 8)}`;
}

function availableBlankMansionTitle(db: DatabaseSync, userId: string): string {
  const base = "Untitled Mansion";
  const available = (candidate: string): boolean => !db.prepare(
    "SELECT 1 FROM debate_mystery_mansion_bundles WHERE user_id = ? AND name = ? LIMIT 1",
  ).get(userId, candidate);
  if (available(base)) return base;
  for (let copy = 2; copy < 1_000; copy += 1) {
    const candidate = `${base} ${copy}`;
    if (available(candidate)) return candidate;
  }
  return `${base} ${randomUUID().slice(0, 8)}`;
}

/** Starts one editable tenant-owned house without creating or mutating an
 * installed source package. The initial plates derive local Pixel Art from
 * bundled sources, so
 * this path is deterministic and fully available in hard LOCAL mode. */
export function createBlankDebateMysteryMansionBundleV1(
  db: DatabaseSync,
  userId: string,
): DebateMysteryMansionBundleSummaryV1 {
  const id = randomUUID();
  const now = new Date().toISOString();
  const name = availableBlankMansionTitle(db, userId);
  const layout = createBlankMansionLayoutV2();
  const rooms = mansionLayoutV2ToLegacyRooms(layout);
  const houseStyle = debateMysteryHouseStyleV2("");
  const derivation: DebateMysteryMansionDerivationV1 = {
    version: 1,
    sourceBundleId: null,
    sourceTitle: "Blank slate",
    sourcePackageId: null,
    acceptedExteriorScaleClass: "compact",
    createdAt: now,
  };
  const library: SavedMansionLibraryMetadataV1 = {
    version: 1,
    title: null,
    description: "A tenant-owned mansion draft built in Mansion Editor.",
    thumbnailAssetId: null,
    music: null,
    atmosphere: null,
  };
  const errors = validateMansionLayoutV2(layout, {
    suspectCount: 4,
    requireEditorFloors: true,
  });
  if (errors.length > 0) throw new Error(`Blank Mansion Editor layout is invalid: ${errors.join(" ")}`);
  db.prepare(
    `INSERT INTO debate_mystery_mansion_bundles
       (id, user_id, source_session_id, name, floors, total_rooms,
        suspect_count, style_json, layout_json, library_metadata_json,
        derivation_metadata_json, portable_metadata_json, portable_payload_sha256,
        created_at, updated_at)
     VALUES (?, ?, NULL, ?, 2, ?, 4, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
  ).run(
    id,
    userId,
    name,
    rooms.length,
    JSON.stringify(houseStyle),
    canonicalMansionLayoutV2(layout),
    JSON.stringify(library),
    JSON.stringify(derivation),
    now,
    now,
  );
  return getDebateMysteryMansionBundleV2(db, userId, id);
}

/** Canonicalizes an accepted public proposal and uses its server-issued ID as
 * the bundle key, making retries idempotent without adding a database column. */
export function createDebateMysteryVenueBundleV1(
  db: DatabaseSync,
  userId: string,
  proposed: MysteryVenueProposalV1,
): DebateMysteryMansionBundleSummaryV1 {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(proposed.id)) {
    throw new HttpError(400, "Mystery Venue proposal ID is invalid.");
  }
  const existing = db.prepare(
    "SELECT user_id FROM debate_mystery_mansion_bundles WHERE id = ? LIMIT 1",
  ).get(proposed.id) as { user_id: string } | undefined;
  if (existing) {
    if (existing.user_id !== userId) throw new HttpError(409, "That venue proposal is no longer available.");
    return getDebateMysteryMansionBundleV2(db, userId, proposed.id);
  }
  const proposal = createMysteryVenueProposalV1({
    id: proposed.id,
    description: proposed.description,
    length: proposed.length,
    nonce: proposed.nonce,
    creativeDraft: proposed.creativeDraft,
  });
  const errors = validateMansionLayoutV2(proposal.layout, {
    suspectCount: proposal.length.suspects,
    requireEditorFloors: false,
  });
  if (errors.length > 0) throw new HttpError(400, `Mystery Venue proposal is invalid: ${errors.join(" ")}`);
  const now = new Date().toISOString();
  const rooms = mansionLayoutV2ToLegacyRooms(proposal.layout);
  const baseHouseStyle = debateMysteryHouseStyleV2(
    `${proposal.profile.kindLabel}. ${proposal.profile.environmentSummary} ${proposal.atmosphere}`,
  );
  const houseStyle: DebateMysteryHouseStyleV2 = {
    ...baseHouseStyle,
    label: proposal.profile.kindLabel,
    promptContract: baseHouseStyle.promptContract
      .replaceAll("One-house", "One-venue")
      .replaceAll("the same mansion", `the same ${proposal.profile.placeNoun}`)
      .replaceAll("this mansion", `this ${proposal.profile.placeNoun}`),
    atmosphere: {
      ...baseHouseStyle.atmosphere,
      exteriorSetting: proposal.profile.environmentSummary,
    },
  };
  const derivation: DebateMysteryMansionDerivationV1 = {
    version: 1,
    sourceBundleId: null,
    sourceTitle: "Mystery Venue proposal",
    sourcePackageId: null,
    acceptedExteriorScaleClass: resolveDebateMysteryMansionExteriorScaleClassV1({
      floors: proposal.length.tiers,
      totalRooms: proposal.length.rooms,
    }),
    createdAt: now,
  };
  const library: SavedMansionLibraryMetadataV1 = {
    version: 1,
    title: proposal.title,
    description: proposal.profile.environmentSummary,
    thumbnailAssetId: null,
    music: null,
    atmosphere: null,
  };
  db.prepare(
    `INSERT INTO debate_mystery_mansion_bundles
       (id, user_id, source_session_id, name, floors, total_rooms,
        suspect_count, style_json, layout_json, library_metadata_json,
        derivation_metadata_json, portable_metadata_json, portable_payload_sha256,
        created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
  ).run(
    proposal.id,
    userId,
    proposal.title,
    proposal.length.tiers,
    rooms.length,
    proposal.length.suspects,
    JSON.stringify(houseStyle),
    canonicalMansionLayoutV2(proposal.layout),
    JSON.stringify(library),
    JSON.stringify(derivation),
    now,
    now,
  );
  return getDebateMysteryMansionBundleV2(db, userId, proposal.id);
}

function migrateLegacyRoomArtRefsToLayoutV2(
  layout: MansionLayoutV2,
  assets: DebateMysteryMansionAssetV1[],
): MansionLayoutV2 {
  const roomAssetIdByLogicalId = new Map(
    assets
      .filter((asset) => asset.role === "room")
      .map((asset) => [asset.logicalId, asset.id]),
  );
  return {
    ...layout,
    entities: layout.entities.map((entity) => entity.kind === "room"
      ? {
          ...entity,
          // An accepted V2 plate is authoritative. The plain legacy ref is a
          // compatibility fallback; a candidate is deliberately never read.
          acceptedRoomAssetId:
            entity.acceptedRoomAssetId ??
            roomAssetIdByLogicalId.get(`${entity.id}:accepted-v2`) ??
            roomAssetIdByLogicalId.get(entity.id) ??
            null,
        }
      : entity),
  };
}

/** Creates a tenant-owned derivative. Aggregate assets remain content-addressed
 * and shared by reference, while the source row and portable provenance stay
 * immutable. */
export function cloneDebateMysteryMansionBundleV1(
  db: DatabaseSync,
  userId: string,
  sourceBundleId: string,
): DebateMysteryMansionBundleSummaryV1 {
  const source = bundleRow(db, userId, sourceBundleId);
  const sourceStyle = parseStyle(source.style_json);
  const sourceAssets = aggregateAssets(db, userId, sourceBundleId);
  const sourcePortable = parsePortableMetadata(source.portable_metadata_json);
  const sourcePresentation = mansionLibraryPresentation(
    source,
    sourceStyle,
    sourceAssets,
    sourcePortable,
  );
  const sourceTitle =
    sourcePresentation.overrides.title ?? sourcePresentation.defaults.title;
  const sourceDescription =
    sourcePresentation.overrides.description ?? sourcePresentation.defaults.description;
  const sourceThumbnail = sourcePresentation.overrides.thumbnailAssetId;
  const sourceLibraryMetadata = parseLibraryMetadata(source.library_metadata_json);
  const sourceRooms = parseRooms(source.layout_json);
  const sourceLayoutV2 = parseLayoutV2(source.layout_json);
  const migratedLayoutV2 = sourceLayoutV2 ??
    migrateLegacyRoomArtRefsToLayoutV2(
      mansionLayoutV2EditorDerivativeFromLegacyRooms(sourceRooms, {
        seed: `${sourceStyle.id}:${source.name}`,
      }),
      sourceAssets,
    );
  // A tiny legacy source may not contain enough semantic rooms to occupy two
  // floors. Keep that derivative in readable V1 form so the editor can present
  // the unresolved placement requirement and let the player add a room.
  const derivativeLayoutV2 = validateMansionLayoutV2(migratedLayoutV2, {
    suspectCount: source.suspect_count,
    requireEditorFloors: true,
  }).length === 0 ? migratedLayoutV2 : null;
  const derivativeRooms = derivativeLayoutV2
    ? mansionLayoutV2ToLegacyRooms(derivativeLayoutV2)
    : sourceRooms;
  const derivativeFloors = Math.max(...derivativeRooms.map((room) => room.floor));
  const id = randomUUID();
  const now = new Date().toISOString();
  const name = copiedMansionTitle(db, userId, sourceTitle);
  const derivation: DebateMysteryMansionDerivationV1 = {
    version: 1,
    sourceBundleId,
    sourceTitle,
    sourcePackageId: sourcePortable?.packageId ?? null,
    acceptedExteriorScaleClass: resolveDebateMysteryMansionExteriorScaleClassV1({
      floors: source.floors,
      totalRooms: source.total_rooms,
    }),
    createdAt: now,
  };
  const library: SavedMansionLibraryMetadataV1 = {
    version: 1,
    title: null,
    description: sourceDescription,
    thumbnailAssetId: sourceThumbnail,
    music: sourceLibraryMetadata.music,
    atmosphere: sourceLibraryMetadata.atmosphere,
  };

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO debate_mystery_mansion_bundles
         (id, user_id, source_session_id, name, floors, total_rooms,
          suspect_count, style_json, layout_json, library_metadata_json,
          derivation_metadata_json, portable_metadata_json, portable_payload_sha256,
          created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    ).run(
      id,
      userId,
      name,
      derivativeFloors,
      derivativeRooms.length,
      source.suspect_count,
      source.style_json,
      derivativeLayoutV2 ? canonicalMansionLayoutV2(derivativeLayoutV2) : source.layout_json,
      JSON.stringify(library),
      JSON.stringify(derivation),
      now,
      now,
    );
    db.prepare(
      `INSERT INTO debate_mystery_mansion_asset_refs
         (bundle_id, user_id, asset_id, role, logical_id, created_at)
       SELECT ?, user_id, asset_id, role, logical_id, ?
         FROM debate_mystery_mansion_asset_refs
        WHERE bundle_id = ? AND user_id = ?
          AND logical_id NOT LIKE 'case:%'`,
    ).run(id, now, sourceBundleId, userId);
    db.prepare(
      `INSERT INTO debate_mystery_mansion_bundle_assets
         (bundle_id, user_id, room_id, image_id, created_at)
       SELECT ?, user_id, room_id, image_id, ?
         FROM debate_mystery_mansion_bundle_assets
        WHERE bundle_id = ? AND user_id = ?`,
    ).run(id, now, sourceBundleId, userId);
    cloneDebateMysteryMansionPropVariantsV1(db, userId, sourceBundleId, id, now);
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
  return getDebateMysteryMansionBundleV2(db, userId, id);
}

export interface UpdateDebateMysteryMansionTopologyInputV1 {
  rooms?: unknown;
  layoutV2?: unknown;
}

function mansionEditorInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new HttpError(400, `${label} must be a whole number.`);
  }
  return value;
}

function normalizeMansionEditorRooms(
  input: unknown,
  existingRooms: DebateMysteryMansionBundleRoomV1[],
  suspectCount: number,
): DebateMysteryMansionBundleRoomV1[] {
  if (!Array.isArray(input)) throw new HttpError(400, "Mansion rooms are required.");
  const existingById = new Map(existingRooms.map((room) => [room.id, room]));
  const knownTemplates = new Map(DEBATE_MYSTERY_ROOM_TEMPLATES.map((template) => [template.id, template]));
  const rooms = input.map((entry, index): DebateMysteryMansionBundleRoomV1 => {
    if (!entry || typeof entry !== "object") throw new HttpError(400, `Room ${index + 1} is invalid.`);
    const candidate = entry as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const existing = existingById.get(id);
    if (!id || id.length > 200 || (!existing && !/^[A-Za-z0-9:_-]+$/u.test(id))) {
      throw new HttpError(400, `Room ${index + 1} has an invalid identity.`);
    }
    const templateId = typeof candidate.templateId === "string" ? candidate.templateId.trim() : "";
    const template = knownTemplates.get(templateId);
    if (!template && existing?.templateId !== templateId) {
      throw new HttpError(400, `Room ${index + 1} uses an unsupported room type.`);
    }
    const name = typeof candidate.name === "string"
      ? candidate.name.replace(/\s+/gu, " ").trim().slice(0, 80)
      : "";
    if (!name) throw new HttpError(400, `Room ${index + 1} needs a name.`);
    const neighborIds = Array.isArray(candidate.neighborIds)
      ? candidate.neighborIds.map((value) => typeof value === "string" ? value.trim() : "")
          .filter(Boolean)
      : [];
    const templateChanged = Boolean(existing && existing.templateId !== templateId);
    return {
      id,
      templateId,
      name,
      floor: mansionEditorInteger(candidate.floor, `${name} floor`),
      x: mansionEditorInteger(candidate.x, `${name} horizontal position`),
      y: mansionEditorInteger(candidate.y, `${name} vertical position`),
      width: mansionEditorInteger(candidate.width, `${name} width`),
      height: mansionEditorInteger(candidate.height, `${name} depth`),
      neighborIds,
      assignedSuspectSeatId: existing?.assignedSuspectSeatId ?? null,
      emoji: template?.emoji ?? existing?.emoji ?? "◇",
      imageId: templateChanged ? null : existing?.imageId ?? null,
      bundledAssetPath: templateChanged
        ? template?.bundledAssetPath ?? null
        : existing?.bundledAssetPath ?? template?.bundledAssetPath ?? null,
    };
  });
  const errors = validateDebateMysteryMansionEditorTopologyV1(rooms, suspectCount);
  if (errors.length > 0) throw new HttpError(400, errors.join("\n"));
  return rooms;
}

function normalizeMansionEditorLayoutV2(
  input: unknown,
  existingRooms: DebateMysteryMansionBundleRoomV1[],
  existingLayout: MansionLayoutV2 | null,
  suspectCount: number,
): MansionLayoutV2 {
  let source: MansionLayoutV2;
  try {
    source = JSON.parse(JSON.stringify(input)) as MansionLayoutV2;
    source = {
      ...source,
      entities: source.entities.map((entity) => entity.kind === "infill"
        ? { ...entity, kind: "corridor" as const }
        : entity),
    };
    const errors = validateMansionLayoutV2(source, {
      suspectCount,
      requireEditorFloors: true,
    });
    if (errors.length > 0) throw new Error(errors.join("\n"));
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error ? error.message : "MansionLayoutV2 is invalid.",
    );
  }
  const existingById = new Map(existingRooms.map((room) => [room.id, room]));
  const existingV2ById = new Map(
    (existingLayout?.entities ?? [])
      .filter((entity): entity is MansionLayoutRoomV2 => entity.kind === "room")
      .map((room) => [room.id, room]),
  );
  const knownTemplates = new Map(
    DEBATE_MYSTERY_ROOM_TEMPLATES.map((template) => [template.id, template]),
  );
  const entities = source.entities.map((entity) => {
    if (entity.kind !== "room") return { ...entity };
    const existing = existingById.get(entity.id);
    const existingV2 = existingV2ById.get(entity.id);
    const template = knownTemplates.get(entity.templateId);
    if (!source.venueProfile && !template && existing?.templateId !== entity.templateId) {
      throw new HttpError(400, `${entity.name || entity.id} uses an unsupported room type.`);
    }
    const name = entity.name.replace(/\s+/gu, " ").trim().slice(0, 80);
    if (!name) throw new HttpError(400, `${entity.id} needs a room name.`);
    const templateChanged = Boolean(existing && existing.templateId !== entity.templateId);
    return {
      ...entity,
      name,
      suspectSlotId: existingV2?.suspectSlotId ??
        (existing?.assignedSuspectSeatId ? `slot:${entity.id}` : null),
      emoji: template?.emoji ?? existing?.emoji ?? entity.emoji ?? "◇",
      imageId: templateChanged ? null : existing?.imageId ?? null,
      bundledAssetPath: templateChanged
        ? template?.bundledAssetPath ?? null
        : existing?.bundledAssetPath ?? template?.bundledAssetPath ?? null,
      acceptedRoomAssetId: templateChanged
        ? null
        : existingV2?.acceptedRoomAssetId ?? null,
    } satisfies MansionLayoutRoomV2;
  });
  const preservedCandidateIds = new Set(existingLayout?.roomArtCandidates.map((candidate) => candidate.id) ?? []);
  const normalized: MansionLayoutV2 = {
    ...source,
    envelope: { columns: 16, rows: 12 },
    entities,
    doors: source.doors.map((door) => ({ ...door })),
    verticalConnectors: source.verticalConnectors.map((connector) => ({ ...connector })),
    placementAnchors: source.placementAnchors.map((anchor) => ({
      ...anchor,
      name: anchor.name.replace(/\s+/gu, " ").trim().slice(0, 80),
      point: { ...anchor.point },
    })),
    lights: source.lights.map((light) => ({
      ...light,
      geometry: "points" in light.geometry
        ? { ...light.geometry, points: light.geometry.points.map((point) => ({ ...point })) }
        : { ...light.geometry },
      cuePermission: {
        version: 1,
        mode: "mansion_static",
        allowedCueIds: [...light.cuePermission.allowedCueIds],
      },
    })) as MansionLayoutV2["lights"],
    // Candidate lifecycle is server-owned. Topology saves cannot forge a
    // protected asset or accept a candidate by editing JSON.
    roomArtCandidates: (existingLayout?.roomArtCandidates ?? [])
      .filter((candidate) => preservedCandidateIds.has(candidate.id))
      .map((candidate) => ({ ...candidate })),
  };
  const errors = validateMansionLayoutV2(normalized, {
    suspectCount,
    requireEditorFloors: true,
  });
  if (errors.length > 0) throw new HttpError(400, errors.join("\n"));
  return normalized;
}

/** Saves only a previously cloned derivative; source packages and ordinary
 * installed mansions are deliberately read-only topology inputs. */
export function updateDebateMysteryMansionTopologyV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  input: UpdateDebateMysteryMansionTopologyInputV1,
): DebateMysteryMansionBundleSummaryV1 {
  const row = bundleRow(db, userId, bundleId);
  if (!parseDerivationMetadata(row.derivation_metadata_json)) {
    throw new HttpError(409, "Duplicate this mansion before editing its plan.");
  }
  if (input.rooms === undefined && input.layoutV2 === undefined) {
    throw new HttpError(400, "Choose a mansion plan to save.");
  }
  const existingRooms = parseRooms(row.layout_json);
  const existingLayoutV2 = parseLayoutV2(row.layout_json);
  const layoutV2 = input.layoutV2 === undefined
    ? null
    : normalizeMansionEditorLayoutV2(
        input.layoutV2,
        existingRooms,
        existingLayoutV2,
        row.suspect_count,
      );
  const rooms = layoutV2
    ? mansionLayoutV2ToLegacyRooms(layoutV2) as DebateMysteryMansionBundleRoomV1[]
    : normalizeMansionEditorRooms(input.rooms, existingRooms, row.suspect_count);
  const nextById = new Map(rooms.map((room) => [room.id, room]));
  const invalidatedRoomIds = existingRooms
    .filter((room) => !nextById.has(room.id) || nextById.get(room.id)?.templateId !== room.templateId)
    .map((room) => room.id);
  const floors = Math.max(...rooms.map((room) => room.floor));
  const now = new Date().toISOString();

  db.exec("BEGIN IMMEDIATE");
  try {
    const deleteProtectedRoomAsset = db.prepare(
      `DELETE FROM debate_mystery_mansion_asset_refs
        WHERE bundle_id = ? AND user_id = ? AND role = 'room'
          AND logical_id IN (?, ?)`,
    );
    const deleteLegacyRoomAsset = db.prepare(
      "DELETE FROM debate_mystery_mansion_bundle_assets WHERE bundle_id = ? AND user_id = ? AND room_id = ?",
    );
    for (const roomId of invalidatedRoomIds) {
      deleteProtectedRoomAsset.run(bundleId, userId, roomId, `${roomId}:illustrated-v1`);
      deleteLegacyRoomAsset.run(bundleId, userId, roomId);
    }
    db.prepare(
      `UPDATE debate_mystery_mansion_bundles
          SET floors = ?, total_rooms = ?, layout_json = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(
      floors,
      rooms.length,
      layoutV2 ? canonicalMansionLayoutV2(layoutV2) : JSON.stringify(rooms),
      now,
      bundleId,
      userId,
    );
    cleanupUnreferencedDebateMysteryMansionAssetsV1(db, userId);
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
  return getDebateMysteryMansionBundleV2(db, userId, bundleId);
}

export function deleteDebateMysteryMansionBundleV2(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
): void {
  bundleRow(db, userId, bundleId);
  const sessions = db.prepare(
    "SELECT session_json FROM debate_sessions WHERE user_id = ? AND status <> 'cancelled'",
  ).all(userId) as Array<{ session_json: string }>;
  const inUse = sessions.some((row) => {
    try {
      const session = JSON.parse(row.session_json) as {
        formatState?: { config?: { mansionBundleId?: string | null } };
      };
      return session.formatState?.config?.mansionBundleId === bundleId;
    } catch {
      return false;
    }
  });
  if (inUse) {
    throw new HttpError(409, "That mansion is still used by a Whodunnit in Archive.");
  }
  const ownsTransaction = !db.isTransaction;
  if (ownsTransaction) db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      "DELETE FROM debate_mystery_mansion_bundles WHERE id = ? AND user_id = ?",
    ).run(bundleId, userId);
    cleanupUnreferencedDebateMysteryMansionAssetsV1(db, userId);
    if (ownsTransaction) db.exec("COMMIT");
  } catch (error) {
    if (ownsTransaction && db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

export function getDebateMysteryMansionAssetFileV1(
  db: DatabaseSync,
  userKey: Buffer,
  userId: string,
  bundleId: string,
  assetId: string,
): { mimeType: DebateMysteryMansionAssetV1["mimeType"]; bytes: Buffer } {
  const row = db.prepare(
    `SELECT assets.mime_type, assets.ciphertext, assets.cipher_iv, assets.cipher_tag
       FROM debate_mystery_mansion_asset_refs AS refs
       JOIN debate_mystery_mansion_assets AS assets
         ON assets.id = refs.asset_id AND assets.user_id = refs.user_id
      WHERE refs.bundle_id = ? AND refs.user_id = ? AND assets.id = ?
      LIMIT 1`,
  ).get(bundleId, userId, assetId) as {
    mime_type: DebateMysteryMansionAssetV1["mimeType"];
    ciphertext: Buffer;
    cipher_iv: Buffer;
    cipher_tag: Buffer;
  } | undefined;
  if (!row) throw new HttpError(404, "That mansion asset was not found.");
  const bytes = decryptBytes({
    ciphertext: row.ciphertext,
    iv: row.cipher_iv,
    tag: row.cipher_tag,
  }, userKey);
  const mimeType = Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "OggS"
    ? "audio/ogg" as const
    : row.mime_type;
  return {
    mimeType,
    bytes,
  };
}

interface LegacyMansionRoomSourceRow {
  room_id: string;
  local_rel_path: string;
  provider: string;
  model: string;
}

function mansionImageMimeType(bytes: Buffer): "image/png" | "image/webp" | null {
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) return "image/png";
  if (
    bytes.byteLength >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) return "image/webp";
  return null;
}

/**
 * Makes a legacy saved mansion's room art portable without another provider
 * call. Cover art is deliberately not derived here: a mansion cover is a
 * dedicated exterior establishing shot, never a room plate or room mosaic.
 */
export async function ensureDebateMysteryMansionPortableRoomAssetsV1(
  db: DatabaseSync,
  userKey: Buffer,
  userId: string,
  bundleId: string,
): Promise<DebateMysteryMansionBundleSummaryV1> {
  const row = bundleRow(db, userId, bundleId);
  const rooms = parseRooms(row.layout_json);
  const roomIds = new Set(rooms.map((room) => room.id));
  const protectedRoomIds = new Set(
    (db.prepare(
      `SELECT logical_id FROM debate_mystery_mansion_asset_refs
        WHERE bundle_id = ? AND user_id = ? AND role = 'room'`,
    ).all(bundleId, userId) as unknown as Array<{ logical_id: string }>)
      .map((entry) => entry.logical_id),
  );
  const legacy = db.prepare(
    `SELECT mansion_assets.room_id, images.local_rel_path, images.provider, images.model
       FROM debate_mystery_mansion_bundle_assets AS mansion_assets
       JOIN images ON images.id = mansion_assets.image_id
                  AND images.user_id = mansion_assets.user_id
      WHERE mansion_assets.bundle_id = ? AND mansion_assets.user_id = ?
        AND TRIM(COALESCE(images.local_rel_path, '')) <> ''
      ORDER BY mansion_assets.room_id`,
  ).all(bundleId, userId) as unknown as LegacyMansionRoomSourceRow[];
  const promotable: Array<{
    roomId: string;
    bytes: Buffer;
    mimeType: "image/png" | "image/webp";
    sha256: string;
    width: number;
    height: number;
    provider: string;
    model: string;
  }> = [];
  for (const source of legacy) {
    if (!roomIds.has(source.room_id) || protectedRoomIds.has(source.room_id)) continue;
    try {
      const bytes = readGeneratedImageBytes(source.local_rel_path);
      const mimeType = mansionImageMimeType(bytes);
      if (!mimeType) continue;
      const metadata = await sharp(bytes, {
        failOn: "error",
        limitInputPixels: 40_000_000,
      }).metadata();
      if (!metadata.width || !metadata.height) continue;
      promotable.push({
        roomId: source.room_id,
        bytes,
        mimeType,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        width: metadata.width,
        height: metadata.height,
        provider: source.provider,
        model: source.model,
      });
    } catch {
      // A missing legacy gallery file must not make the mansion unusable.
    }
  }
  if (promotable.length > 0) {
    const now = new Date().toISOString();
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const source of promotable) {
        const encrypted = encryptBytes(source.bytes, userKey);
        db.prepare(
          `INSERT INTO debate_mystery_mansion_assets
             (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
              mime_type, width, height, duration_ms, provider, model, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
           ON CONFLICT(user_id, sha256) DO UPDATE SET
             width = COALESCE(debate_mystery_mansion_assets.width, excluded.width),
             height = COALESCE(debate_mystery_mansion_assets.height, excluded.height),
             updated_at = excluded.updated_at`,
        ).run(
          randomUUID(), userId, encrypted.ciphertext, encrypted.iv, encrypted.tag,
          source.sha256, source.bytes.byteLength, source.mimeType,
          source.width, source.height, source.provider, source.model, now, now,
        );
        const stored = db.prepare(
          "SELECT id FROM debate_mystery_mansion_assets WHERE user_id = ? AND sha256 = ?",
        ).get(userId, source.sha256) as { id: string };
        db.prepare(
          `INSERT INTO debate_mystery_mansion_asset_refs
             (bundle_id, user_id, asset_id, role, logical_id, created_at)
           VALUES (?, ?, ?, 'room', ?, ?)
           ON CONFLICT(bundle_id, role, logical_id) DO NOTHING`,
        ).run(bundleId, userId, stored.id, source.roomId, now);
      }
      db.exec("COMMIT");
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      throw error;
    }
  }

  return getDebateMysteryMansionBundleV2(db, userId, bundleId);
}

interface ReusableVaultAssetRow {
  subject_id: string;
  kind: "room" | "evidence";
  mime_type: "image/png" | "image/webp";
  ciphertext: Buffer;
  cipher_iv: Buffer;
  cipher_tag: Buffer;
  sha256: string;
  byte_size: number;
  provider: string | null;
  model: string | null;
  review_json: string;
}

function reusableVaultAssetDimensions(
  row: ReusableVaultAssetRow,
): { width: number; height: number } {
  try {
    const review = JSON.parse(row.review_json) as {
      pixels?: { width?: unknown; height?: unknown };
    };
    if (
      typeof review.pixels?.width === "number" &&
      Number.isInteger(review.pixels.width) &&
      typeof review.pixels.height === "number" &&
      Number.isInteger(review.pixels.height)
    ) {
      return { width: review.pixels.width, height: review.pixels.height };
    }
  } catch {
    // Legacy rows did not preserve inspected dimensions.
  }
  return row.kind === "room"
    ? row.subject_id.endsWith(":illustrated-v1")
      ? { width: 1600, height: 900 }
      : { width: 1536, height: 1024 }
    : { width: 1024, height: 1024 };
}

/** Replaces one bundle's protected asset references inside the caller's save
 * transaction. Content rows deduplicate per tenant by plaintext SHA-256. */
export function replaceProtectedDebateMysteryMansionAssetsV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  sessionId: string,
): void {
  const rows = db.prepare(
    `SELECT subject_id, kind, mime_type, ciphertext, cipher_iv, cipher_tag,
            sha256, byte_size, provider, model, review_json
       FROM debate_mystery_asset_vault
      WHERE user_id = ? AND session_id = ? AND status = 'ready'
        AND ciphertext IS NOT NULL AND cipher_iv IS NOT NULL
        AND cipher_tag IS NOT NULL AND sha256 IS NOT NULL AND byte_size > 0
      ORDER BY kind, subject_id`,
  ).all(userId, sessionId) as unknown as ReusableVaultAssetRow[];
  db.prepare(
    `DELETE FROM debate_mystery_mansion_asset_refs
      WHERE bundle_id = ? AND user_id = ?
        AND (role = 'room' OR
             (role = 'prop' AND logical_id NOT LIKE 'theme:%') OR
             (role = 'presentation' AND logical_id = ?))`,
  ).run(bundleId, userId, DEBATE_MYSTERY_MANSION_EXTERIOR_SUBJECT_ID_V1);
  const insertAsset = db.prepare(
    `INSERT INTO debate_mystery_mansion_assets
       (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
        mime_type, width, height, duration_ms, provider, model, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
     ON CONFLICT(user_id, sha256) DO UPDATE SET
       width = COALESCE(debate_mystery_mansion_assets.width, excluded.width),
       height = COALESCE(debate_mystery_mansion_assets.height, excluded.height),
       updated_at = excluded.updated_at`,
  );
  const assetId = db.prepare(
    "SELECT id FROM debate_mystery_mansion_assets WHERE user_id = ? AND sha256 = ?",
  );
  const insertRef = db.prepare(
    `INSERT INTO debate_mystery_mansion_asset_refs
       (bundle_id, user_id, asset_id, role, logical_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const now = new Date().toISOString();
  let propIndex = 0;
  for (const row of rows) {
    const dimensions = reusableVaultAssetDimensions(row);
    insertAsset.run(
      randomUUID(),
      userId,
      row.ciphertext,
      row.cipher_iv,
      row.cipher_tag,
      row.sha256,
      row.byte_size,
      row.mime_type,
      dimensions.width,
      dimensions.height,
      row.provider,
      row.model,
      now,
      now,
    );
    const stored = assetId.get(userId, row.sha256) as { id: string };
    const isMansionExterior = row.kind === "room" &&
      row.subject_id === DEBATE_MYSTERY_MANSION_EXTERIOR_SUBJECT_ID_V1;
    const role = isMansionExterior ? "presentation" : row.kind === "room" ? "room" : "prop";
    const logicalId = row.kind === "room"
      ? row.subject_id
      : `prop-${String(++propIndex).padStart(3, "0")}`;
    insertRef.run(bundleId, userId, stored.id, role, logicalId, now);
  }
  cleanupUnreferencedDebateMysteryMansionAssetsV1(db, userId);
}

function bundleRoomsFromState(
  state: DebateWhodunnitFormatStateV2,
  roomImageIdById: Readonly<Record<string, string>> = {},
): DebateMysteryMansionBundleRoomV1[] {
  return state.rooms.map((room) => ({
    id: room.id,
    templateId: room.templateId?.trim() || room.id,
    name: room.name,
    floor: room.floor,
    x: room.x ?? 0,
    y: room.y ?? 0,
    width: room.width ?? 1,
    height: room.height ?? 1,
    neighborIds: [...(room.neighborIds ?? [])],
    assignedSuspectSeatId:
      state.suspects.find((suspect) => suspect.roomId === room.id)?.seatId ?? null,
    emoji: room.emoji,
    imageId: roomImageIdById[room.id] ?? room.imageId,
    bundledAssetPath: room.bundledAssetPath,
  }));
}

/**
 * Saves layout, room assets, and house style as one tenant-owned aggregate.
 * Re-saving the same source refreshes that aggregate atomically.
 */
export function saveDebateMysteryMansionBundleV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  roomImageIdById: Readonly<Record<string, string>> = {},
): DebateMysteryMansionBundleSummaryV1 {
  const session = getDebateSession(db, userId, sessionId);
  if (session.status === "cancelled") {
    throw new HttpError(409, "That case is no longer available.");
  }
  const state = session.formatState;
  if (state.format !== "whodunnit" || state.version !== 2) {
    throw new HttpError(409, "Reusable mansions are available for Whodunnit V2 cases only.");
  }
  if (!debateMysteryMansionBundleEligibleV2(state)) {
    throw new HttpError(
      409,
      "Visit every room and review every examination point before saving this mansion.",
    );
  }
  const rooms = bundleRoomsFromState(state, roomImageIdById);
  const layoutV2 = mansionLayoutV2HousePlanFromLegacyRooms(rooms, {
    seed: `${state.config.houseStyle.id}:${state.config.houseStyle.label}`,
  });
  const imageIds = [...new Set(rooms.flatMap((room) => room.imageId ? [room.imageId] : []))];
  if (imageIds.length > 0) {
    const owned = db.prepare(
      `SELECT id FROM images
        WHERE user_id = ? AND id IN (${imageIds.map(() => "?").join(", ")})`,
    ).all(userId, ...imageIds) as unknown as Array<{ id: string }>;
    if (owned.length !== imageIds.length) {
      throw new HttpError(409, "One or more mansion room assets are unavailable.");
    }
  }
  const existing = db.prepare(
    `SELECT id, created_at FROM debate_mystery_mansion_bundles
      WHERE user_id = ? AND source_session_id = ?`,
  ).get(userId, sessionId) as { id: string; created_at: string } | undefined;
  const id = existing?.id ?? randomUUID();
  const now = new Date().toISOString();
  const createdAt = existing?.created_at ?? now;
  const name = `${state.config.houseStyle.label.trim() || "Whodunnit"} mansion`.slice(0, 180);
  const floors = Math.max(...rooms.map((room) => room.floor), 1);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO debate_mystery_mansion_bundles
         (id, user_id, source_session_id, name, floors, total_rooms,
          suspect_count, style_json, layout_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         floors = excluded.floors,
         total_rooms = excluded.total_rooms,
         suspect_count = excluded.suspect_count,
         style_json = excluded.style_json,
         layout_json = excluded.layout_json,
         updated_at = excluded.updated_at
       WHERE debate_mystery_mansion_bundles.user_id = excluded.user_id`,
    ).run(
      id,
      userId,
      sessionId,
      name,
      floors,
      rooms.length,
      state.suspects.length,
      JSON.stringify(state.config.houseStyle),
      canonicalMansionLayoutV2(layoutV2),
      createdAt,
      now,
    );
    db.prepare(
      "DELETE FROM debate_mystery_mansion_bundle_assets WHERE bundle_id = ? AND user_id = ?",
    ).run(id, userId);
    const insertAsset = db.prepare(
      `INSERT INTO debate_mystery_mansion_bundle_assets
         (bundle_id, user_id, room_id, image_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const room of rooms) {
      if (room.imageId) insertAsset.run(id, userId, room.id, room.imageId, now);
    }
    replaceProtectedDebateMysteryMansionAssetsV1(db, userId, id, sessionId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getDebateMysteryMansionBundleV2(db, userId, id);
}

import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  canonicalMansionLayoutV2,
  validateMansionLayoutV2,
  type MansionLayoutRoomV2,
  type MansionLayoutV2,
  type MansionRoomArtCandidateV2,
} from "@localai/shared";
import sharp from "sharp";
import { generateImage } from "./image-provider.ts";
import { encryptBytes } from "./security.ts";
import { HttpError } from "./utils.http.ts";

export const MANSION_ROOM_ART_CANDIDATE_LOGICAL_SUFFIX_V2 = "candidate-v2";
export const MANSION_ROOM_ART_ACCEPTED_LOGICAL_SUFFIX_V2 = "accepted-v2";
const MANSION_ROOM_ART_MAX_PROVIDER_BYTES_V2 = 24 * 1024 * 1024;
const MANSION_ROOM_ART_MAX_STORED_BYTES_V2 = 12 * 1024 * 1024;

interface MansionRoomArtBundleRowV2 {
  name: string;
  style_json: string;
  layout_json: string;
  derivation_metadata_json: string | null;
}

export interface GeneratedMansionRoomArtV2 {
  bytes: Buffer;
  provider: string;
  model: string;
}

export interface StageMansionRoomArtCandidateV2Args {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  bundleId: string;
  roomId: string;
  responseMode: "local" | "online";
  apiKey: string | null;
  model?: string | null;
  fetchImpl?: typeof fetch;
  generate?: (prompt: string) => Promise<GeneratedMansionRoomArtV2>;
}

const generationsInFlight = new Set<string>();

function candidateLogicalId(roomId: string): string {
  return `${roomId}:${MANSION_ROOM_ART_CANDIDATE_LOGICAL_SUFFIX_V2}`;
}

function acceptedLogicalId(roomId: string): string {
  return `${roomId}:${MANSION_ROOM_ART_ACCEPTED_LOGICAL_SUFFIX_V2}`;
}

function readBundle(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
): MansionRoomArtBundleRowV2 {
  const row = db.prepare(
    `SELECT name, style_json, layout_json, derivation_metadata_json
       FROM debate_mystery_mansion_bundles
      WHERE id = ? AND user_id = ?`,
  ).get(bundleId, userId) as MansionRoomArtBundleRowV2 | undefined;
  if (!row) throw new HttpError(404, "That saved mansion was not found.");
  if (!row.derivation_metadata_json) {
    throw new HttpError(409, "Duplicate this mansion before generating editable room art.");
  }
  return row;
}

function parseLayout(row: MansionRoomArtBundleRowV2): MansionLayoutV2 {
  let layout: MansionLayoutV2;
  try {
    layout = JSON.parse(row.layout_json) as MansionLayoutV2;
  } catch {
    throw new HttpError(409, "Save this mansion in Mansion Editor V2 before generating room art.");
  }
  const errors = validateMansionLayoutV2(layout, { requireEditorFloors: true });
  if (errors.length > 0) {
    throw new HttpError(409, "Save a valid Mansion Editor V2 plan before generating room art.");
  }
  return layout;
}

function roomFromLayout(layout: MansionLayoutV2, roomId: string): MansionLayoutRoomV2 {
  const room = layout.entities.find(
    (entity): entity is MansionLayoutRoomV2 => entity.kind === "room" && entity.id === roomId,
  );
  if (!room) throw new HttpError(404, "That mansion room was not found.");
  return room;
}

function styleDirection(styleJson: string): string {
  try {
    const style = JSON.parse(styleJson) as Record<string, unknown>;
    return [style.label, style.promptContract]
      .filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
      .join(". ")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 1_200);
  } catch {
    return "A restrained, coherent PRISM mystery mansion interior.";
  }
}

export function buildMansionRoomArtCandidatePromptV2(args: {
  mansionName: string;
  styleJson: string;
  room: MansionLayoutRoomV2;
  layout: MansionLayoutV2;
}): string {
  const anchors = args.layout.placementAnchors
    .filter((anchor) => anchor.roomId === args.room.id)
    .map((anchor) => `${anchor.relation} ${anchor.name} at normalized (${anchor.point.x.toFixed(2)}, ${anchor.point.y.toFixed(2)})`)
    .join("; ");
  return [
    `Create an unoccupied 16:9 establishing plate for the ${args.room.name} in ${args.mansionName}.`,
    styleDirection(args.styleJson),
    `Room type: ${args.room.templateId}.`,
    anchors ? `Spoiler-free authoring anchors: ${anchors}.` : "Keep the composition spacious and usable for later authoring.",
    "Use a fixed room-art silhouette with clear walls, doors, circulation openings, furniture masses, foreground, middle ground, and background.",
    "Do not include people, characters, bodies, clues, evidence, blood, weapons, readable text, logos, symbols, or case-specific facts.",
    "This is mansion-owned presentation art, not a hotspot map. Preserve navigable negative space and return one polished room plate.",
  ].join(" ");
}

function candidateMetadata(
  layout: MansionLayoutV2,
  roomId: string,
  prompt: string,
  status: MansionRoomArtCandidateV2["status"],
  assetId: string | null,
  now: string,
): MansionRoomArtCandidateV2 {
  const existing = layout.roomArtCandidates.find((candidate) => candidate.roomId === roomId);
  return {
    id: existing?.id ?? `room-art-candidate:${randomUUID()}`,
    roomId,
    status,
    prompt,
    promptSha256: createHash("sha256").update(prompt).digest("hex"),
    assetId,
    createdAt: now,
  };
}

function withCandidate(
  layout: MansionLayoutV2,
  candidate: MansionRoomArtCandidateV2 | null,
  roomId: string,
): MansionLayoutV2 {
  return {
    ...layout,
    roomArtCandidates: [
      ...layout.roomArtCandidates.filter((entry) => entry.roomId !== roomId),
      ...(candidate ? [candidate] : []),
    ],
  };
}

function persistLayout(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  layout: MansionLayoutV2,
  now: string,
): void {
  db.prepare(
    `UPDATE debate_mystery_mansion_bundles
        SET layout_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(canonicalMansionLayoutV2(layout), now, bundleId, userId);
}

function cleanupUnreferencedRoomArt(db: DatabaseSync, userId: string): void {
  db.prepare(
    `DELETE FROM debate_mystery_mansion_assets
      WHERE user_id = ? AND mime_type LIKE 'image/%' AND NOT EXISTS (
        SELECT 1 FROM debate_mystery_mansion_asset_refs AS refs
         WHERE refs.user_id = debate_mystery_mansion_assets.user_id
           AND refs.asset_id = debate_mystery_mansion_assets.id
      )`,
  ).run(userId);
}

async function defaultGenerate(
  args: StageMansionRoomArtCandidateV2Args,
  prompt: string,
): Promise<GeneratedMansionRoomArtV2> {
  const generated = await generateImage(prompt, args.apiKey ?? undefined, {
    model: args.model?.trim() || undefined,
    size: "1536x1024",
    quality: "low",
    background: "opaque",
    fetchImpl: args.fetchImpl,
  });
  let bytes = generated.imageBytes;
  if (!bytes && generated.url) {
    const response = await (args.fetchImpl ?? fetch)(generated.url);
    if (!response.ok) throw new Error(`Generated room art could not be downloaded (${response.status}).`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (!bytes?.length || bytes.byteLength > MANSION_ROOM_ART_MAX_PROVIDER_BYTES_V2) {
    throw new Error("Generated room art is outside the supported source-size boundary.");
  }
  return { bytes, provider: "openai", model: generated.model };
}

async function normalizeGeneratedRoomArt(bytes: Buffer): Promise<Buffer> {
  const normalized = await sharp(bytes, { failOn: "error" })
    .rotate()
    .flatten({ background: "#080d16" })
    .resize(1600, 900, { fit: "cover", position: "centre" })
    .webp({ quality: 92, effort: 5 })
    .toBuffer();
  if (!normalized.length || normalized.byteLength > MANSION_ROOM_ART_MAX_STORED_BYTES_V2) {
    throw new Error("Generated room art is outside the protected storage boundary.");
  }
  return normalized;
}

function storeReadyCandidate(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  bundleId: string;
  roomId: string;
  prompt: string;
  generated: GeneratedMansionRoomArtV2;
  bytes: Buffer;
}): MansionRoomArtCandidateV2 {
  const now = new Date().toISOString();
  const sha256 = createHash("sha256").update(args.bytes).digest("hex");
  const encrypted = encryptBytes(args.bytes, args.userKey);
  const proposedAssetId = randomUUID();
  args.db.exec("BEGIN IMMEDIATE");
  try {
    const row = readBundle(args.db, args.userId, args.bundleId);
    const layout = parseLayout(row);
    roomFromLayout(layout, args.roomId);
    args.db.prepare(
      `INSERT INTO debate_mystery_mansion_assets
         (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
          mime_type, width, height, duration_ms, provider, model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'image/webp', 1600, 900, NULL, ?, ?, ?, ?)
       ON CONFLICT(user_id, sha256) DO UPDATE SET updated_at = excluded.updated_at`,
    ).run(
      proposedAssetId,
      args.userId,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      sha256,
      args.bytes.byteLength,
      args.generated.provider,
      args.generated.model,
      now,
      now,
    );
    const stored = args.db.prepare(
      "SELECT id FROM debate_mystery_mansion_assets WHERE user_id = ? AND sha256 = ?",
    ).get(args.userId, sha256) as { id: string };
    args.db.prepare(
      `INSERT INTO debate_mystery_mansion_asset_refs
         (bundle_id, user_id, asset_id, role, logical_id, created_at)
       VALUES (?, ?, ?, 'room', ?, ?)
       ON CONFLICT(bundle_id, role, logical_id) DO UPDATE SET
         asset_id = excluded.asset_id,
         created_at = excluded.created_at`,
    ).run(args.bundleId, args.userId, stored.id, candidateLogicalId(args.roomId), now);
    const candidate = candidateMetadata(layout, args.roomId, args.prompt, "ready", stored.id, now);
    persistLayout(args.db, args.userId, args.bundleId, withCandidate(layout, candidate, args.roomId), now);
    cleanupUnreferencedRoomArt(args.db, args.userId);
    args.db.exec("COMMIT");
    return candidate;
  } catch (error) {
    if (args.db.isTransaction) args.db.exec("ROLLBACK");
    throw error;
  }
}

function persistCandidateFailure(
  args: StageMansionRoomArtCandidateV2Args,
  prompt: string,
): void {
  const row = readBundle(args.db, args.userId, args.bundleId);
  const layout = parseLayout(row);
  roomFromLayout(layout, args.roomId);
  const now = new Date().toISOString();
  const failed = candidateMetadata(layout, args.roomId, prompt, "failed", null, now);
  args.db.exec("BEGIN IMMEDIATE");
  try {
    args.db.prepare(
      `DELETE FROM debate_mystery_mansion_asset_refs
        WHERE bundle_id = ? AND user_id = ? AND role = 'room' AND logical_id = ?`,
    ).run(args.bundleId, args.userId, candidateLogicalId(args.roomId));
    persistLayout(args.db, args.userId, args.bundleId, withCandidate(layout, failed, args.roomId), now);
    cleanupUnreferencedRoomArt(args.db, args.userId);
    args.db.exec("COMMIT");
  } catch (error) {
    if (args.db.isTransaction) args.db.exec("ROLLBACK");
    throw error;
  }
}

export async function stageMansionRoomArtCandidateV2(
  args: StageMansionRoomArtCandidateV2Args,
): Promise<MansionRoomArtCandidateV2> {
  if (args.responseMode !== "online") {
    throw new HttpError(409, "Mansion room-art generation is ONLINE only. LOCAL remains fully offline.");
  }
  if (!args.apiKey?.trim() && !args.generate) {
    throw new HttpError(409, "Connect OpenAI before generating mansion room art.");
  }
  const row = readBundle(args.db, args.userId, args.bundleId);
  const layout = parseLayout(row);
  const room = roomFromLayout(layout, args.roomId);
  const prompt = buildMansionRoomArtCandidatePromptV2({
    mansionName: row.name,
    styleJson: row.style_json,
    room,
    layout,
  });
  const generationKey = `${args.userId}:${args.bundleId}:${args.roomId}`;
  if (generationsInFlight.has(generationKey)) {
    throw new HttpError(409, "Room-art generation is already in progress for this room.");
  }
  generationsInFlight.add(generationKey);
  try {
    const generated = await (args.generate
      ? args.generate(prompt)
      : defaultGenerate(args, prompt));
    const bytes = await normalizeGeneratedRoomArt(generated.bytes);
    return storeReadyCandidate({ ...args, prompt, generated, bytes });
  } catch (error) {
    try {
      persistCandidateFailure(args, prompt);
    } catch {
      // Preserve the provider error; a later retry can reconcile stale metadata.
    }
    throw error;
  } finally {
    generationsInFlight.delete(generationKey);
  }
}

export function acceptMansionRoomArtCandidateV2(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  roomId: string,
): void {
  const row = readBundle(db, userId, bundleId);
  const layout = parseLayout(row);
  roomFromLayout(layout, roomId);
  const candidate = layout.roomArtCandidates.find((entry) => entry.roomId === roomId);
  if (candidate?.status !== "ready" || !candidate.assetId) {
    throw new HttpError(409, "Generate a ready room-art candidate before accepting it.");
  }
  const candidateRef = db.prepare(
    `SELECT asset_id FROM debate_mystery_mansion_asset_refs
      WHERE bundle_id = ? AND user_id = ? AND role = 'room' AND logical_id = ?`,
  ).get(bundleId, userId, candidateLogicalId(roomId)) as { asset_id: string } | undefined;
  if (candidateRef?.asset_id !== candidate.assetId) {
    throw new HttpError(409, "That room-art candidate is no longer available.");
  }
  const next: MansionLayoutV2 = {
    ...withCandidate(layout, null, roomId),
    entities: layout.entities.map((entity) => entity.id === roomId && entity.kind === "room"
      ? { ...entity, acceptedRoomAssetId: candidate.assetId }
      : entity),
  };
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO debate_mystery_mansion_asset_refs
         (bundle_id, user_id, asset_id, role, logical_id, created_at)
       VALUES (?, ?, ?, 'room', ?, ?)
       ON CONFLICT(bundle_id, role, logical_id) DO UPDATE SET
         asset_id = excluded.asset_id,
         created_at = excluded.created_at`,
    ).run(bundleId, userId, candidate.assetId, acceptedLogicalId(roomId), now);
    db.prepare(
      `DELETE FROM debate_mystery_mansion_asset_refs
        WHERE bundle_id = ? AND user_id = ? AND role = 'room' AND logical_id = ?`,
    ).run(bundleId, userId, candidateLogicalId(roomId));
    persistLayout(db, userId, bundleId, next, now);
    cleanupUnreferencedRoomArt(db, userId);
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

export function discardMansionRoomArtCandidateV2(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  roomId: string,
): void {
  const row = readBundle(db, userId, bundleId);
  const layout = parseLayout(row);
  roomFromLayout(layout, roomId);
  if (!layout.roomArtCandidates.some((candidate) => candidate.roomId === roomId)) {
    throw new HttpError(409, "That room has no staged art candidate.");
  }
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `DELETE FROM debate_mystery_mansion_asset_refs
        WHERE bundle_id = ? AND user_id = ? AND role = 'room' AND logical_id = ?`,
    ).run(bundleId, userId, candidateLogicalId(roomId));
    persistLayout(db, userId, bundleId, withCandidate(layout, null, roomId), now);
    cleanupUnreferencedRoomArt(db, userId);
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

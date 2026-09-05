import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { assertRefractionActive } from "./refraction-cancellation.ts";
import {
  MANSION_ATMOSPHERE_ACTIVE_LOGICAL_ID_V1,
  MANSION_ATMOSPHERE_CANDIDATE_LOGICAL_ID_V1,
  MANSION_ATMOSPHERE_PREVIOUS_LOGICAL_ID_V1,
  PRISM_MANSION_ACOUSTIC_ASSETS_V1,
  buildMansionAmbienceManifestV1,
} from "@localai/shared";
import { getDebateMysteryMansionBundleV2 } from "./debate-mystery-mansion-bundles.ts";
import {
  SIGNAL_ELEVENLABS_ATMOSPHERE_MODEL,
  requestSignalElevenLabsAtmosphere,
} from "./elevenlabs-sound.ts";
import { portableMp3DurationMsV1 } from "./debate-mystery-package-safety.ts";
import { encryptBytes } from "./security.ts";
import { HttpError } from "./utils.http.ts";

const MANSION_ATMOSPHERE_MAX_BYTES_V1 = 4 * 1024 * 1024;
const mansionAtmosphereGenerationsInFlightV1 = new Set<string>();

interface MansionAtmosphereMetadataV1 {
  version: 1;
  activeTitle: string | null;
  candidateTitle: string | null;
  previousTitle: string | null;
}

function compact(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/\s+/gu, " ").trim().slice(0, maxLength) || fallback
    : fallback;
}

function metadata(value: string | null): {
  root: Record<string, unknown>;
  atmosphere: MansionAtmosphereMetadataV1;
} {
  let root: Record<string, unknown> = {};
  try {
    const parsed = value ? JSON.parse(value) as unknown : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) root = { ...(parsed as Record<string, unknown>) };
  } catch {
    root = {};
  }
  const raw = root.atmosphere && typeof root.atmosphere === "object" && !Array.isArray(root.atmosphere)
    ? root.atmosphere as Record<string, unknown>
    : {};
  return {
    root,
    atmosphere: {
      version: 1,
      activeTitle: compact(raw.activeTitle, "", 180) || null,
      candidateTitle: compact(raw.candidateTitle, "", 180) || null,
      previousTitle: compact(raw.previousTitle, "", 180) || null,
    },
  };
}

function writeMetadata(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  source: string | null,
  next: MansionAtmosphereMetadataV1,
  now: string,
): void {
  const parsed = metadata(source);
  parsed.root.version = 1;
  parsed.root.atmosphere = next;
  db.prepare(
    `UPDATE debate_mystery_mansion_bundles SET library_metadata_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(JSON.stringify(parsed.root), now, bundleId, userId);
}

function bundleRow(db: DatabaseSync, userId: string, bundleId: string): {
  name: string;
  style_json: string;
  library_metadata_json: string | null;
} {
  const row = db.prepare(
    `SELECT name, style_json, library_metadata_json FROM debate_mystery_mansion_bundles
      WHERE id = ? AND user_id = ?`,
  ).get(bundleId, userId) as { name: string; style_json: string; library_metadata_json: string | null } | undefined;
  if (!row) throw new HttpError(404, "That mansion is unavailable.");
  return row;
}

function atmosphereRef(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  logicalId: string,
): { id: string; sha256: string } | null {
  return db.prepare(
    `SELECT assets.id, assets.sha256 FROM debate_mystery_mansion_asset_refs AS refs
       JOIN debate_mystery_mansion_assets AS assets
         ON assets.id = refs.asset_id AND assets.user_id = refs.user_id
      WHERE refs.bundle_id = ? AND refs.user_id = ? AND refs.role = 'music'
        AND refs.logical_id = ? LIMIT 1`,
  ).get(bundleId, userId, logicalId) as { id: string; sha256: string } | undefined ?? null;
}

function atmosphereFamily(value: string): "spacecraft" | "jungle" | "gothic" {
  if (/spacecraft|space|orbital|observatory/iu.test(value)) return "spacecraft";
  if (/jungle|banyan|botanical|expedition/iu.test(value)) return "jungle";
  return "gothic";
}

export function buildDebateMysteryMansionAtmospherePromptV1(args: {
  acousticThemePaletteId: string;
  styleId: string;
  weather: string;
  timeOfDay: string;
  /** The player's Refract direction for this pass. Blank keeps the canonical
   * prompt byte-identical, so an undirected resynthesis never drifts. */
  direction?: string | null;
}): string {
  const family = atmosphereFamily(`${args.acousticThemePaletteId} ${args.styleId}`);
  const layers = family === "spacecraft"
    ? "steady life-support airflow, subdued ventilation, low electrical hum, and sparse neutral structural settling"
    : family === "jungle"
      ? "soft interior room tone, light weather on roof and broad leaves, restrained timber settling, and distant natural air movement"
      : "soft interior room tone, restrained timber settling, distant exterior air movement, and gentle weather against roof and windows";
  return [
    "Create a seamless environmental room-tone loop for quiet mystery investigation.",
    `Sound sources: ${layers}.`,
    `Weather state: ${compact(args.weather, "clear", 40)}. Time of day: ${compact(args.timeOfDay, "unknown", 40)}.`,
    // The direction colors the bed; it never redefines it. It sits ahead of the
    // closing sentence so that sentence still bounds the loop and speech space.
    ...(compact(args.direction, "", 300)
      ? [`Creative direction for this pass: ${compact(args.direction, "", 300)}`]
      : []),
    "Use stable low energy, softened high frequencies, sparse neutral detail, broad speech space, and a smooth unchanged loop boundary.",
  ].join(" ");
}

function storeCandidate(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  bundleId: string;
  bytes: Buffer;
  contentType: string;
  title: string;
}): string {
  if (args.contentType !== "audio/mpeg") throw new Error("Atmosphere audio must be MP3.");
  if (args.bytes.byteLength < 1 || args.bytes.byteLength > MANSION_ATMOSPHERE_MAX_BYTES_V1) {
    throw new Error("Atmosphere audio is outside the supported file-size boundary.");
  }
  const durationMs = portableMp3DurationMsV1(args.bytes);
  if (durationMs < 25_000 || durationMs > 35_000) {
    throw new Error("Atmosphere duration is outside the expected seamless-loop boundary.");
  }
  const sha256 = createHash("sha256").update(args.bytes).digest("hex");
  const encrypted = encryptBytes(args.bytes, args.userKey);
  const now = new Date().toISOString();
  const id = randomUUID();
  const row = bundleRow(args.db, args.userId, args.bundleId);
  args.db.exec("BEGIN IMMEDIATE");
  try {
    args.db.prepare(
      `INSERT INTO debate_mystery_mansion_assets
         (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
          mime_type, width, height, duration_ms, provider, model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'audio/mpeg', NULL, NULL, ?, 'elevenlabs', ?, ?, ?)
       ON CONFLICT(user_id, sha256) DO UPDATE SET duration_ms = excluded.duration_ms, updated_at = excluded.updated_at`,
    ).run(
      id, args.userId, encrypted.ciphertext, encrypted.iv, encrypted.tag,
      sha256, args.bytes.byteLength, durationMs,
      SIGNAL_ELEVENLABS_ATMOSPHERE_MODEL, now, now,
    );
    const stored = args.db.prepare(
      "SELECT id FROM debate_mystery_mansion_assets WHERE user_id = ? AND sha256 = ?",
    ).get(args.userId, sha256) as { id: string };
    args.db.prepare(
      `INSERT INTO debate_mystery_mansion_asset_refs
         (bundle_id, user_id, asset_id, role, logical_id, created_at)
       VALUES (?, ?, ?, 'music', ?, ?)
       ON CONFLICT(bundle_id, role, logical_id) DO UPDATE SET asset_id = excluded.asset_id, created_at = excluded.created_at`,
    ).run(args.bundleId, args.userId, stored.id, MANSION_ATMOSPHERE_CANDIDATE_LOGICAL_ID_V1, now);
    const parsed = metadata(row.library_metadata_json);
    parsed.atmosphere.candidateTitle = args.title;
    writeMetadata(args.db, args.userId, args.bundleId, row.library_metadata_json, parsed.atmosphere, now);
    args.db.exec("COMMIT");
    return stored.id;
  } catch (error) {
    if (args.db.isTransaction) args.db.exec("ROLLBACK");
    throw error;
  }
}

export async function stageDebateMysteryMansionAtmosphereV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  bundleId: string;
  responseMode: "local" | "online";
  apiKey: string | null;
  /** Optional player Refract direction for this synthesis pass. */
  direction?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<{ assetId: string; title: string }> {
  if (args.responseMode !== "online") {
    throw new HttpError(409, "Atmosphere synthesis requires ONLINE mode. LOCAL remains fully offline.");
  }
  if (!args.apiKey?.trim()) throw new HttpError(409, "Connect ElevenLabs before synthesizing mansion atmosphere.");
  const key = `${args.userId}:${args.bundleId}`;
  if (mansionAtmosphereGenerationsInFlightV1.has(key)) {
    throw new HttpError(409, "Mansion atmosphere generation is already in progress.");
  }
  mansionAtmosphereGenerationsInFlightV1.add(key);
  try {
    const mansion = getDebateMysteryMansionBundleV2(args.db, args.userId, args.bundleId);
    const generated = await requestSignalElevenLabsAtmosphere({
      apiKey: args.apiKey,
      prompt: buildDebateMysteryMansionAtmospherePromptV1({
        acousticThemePaletteId: mansion.houseStyle.acousticThemePaletteId,
        styleId: mansion.houseStyle.id,
        weather: mansion.houseStyle.atmosphere.weather,
        timeOfDay: mansion.houseStyle.atmosphere.timeOfDay,
        direction: args.direction,
      }),
      fetchImpl: args.fetchImpl,
    });
    assertRefractionActive();
    const title = `${mansion.name} Atmosphere`.slice(0, 180);
    const assetId = storeCandidate({ ...args, bytes: generated.audioBytes, contentType: generated.contentType, title });
    return { assetId, title };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, error instanceof Error ? error.message : "Mansion atmosphere generation failed.");
  } finally {
    mansionAtmosphereGenerationsInFlightV1.delete(key);
  }
}

function installActiveManifest(db: DatabaseSync, userId: string, bundleId: string): void {
  const active = atmosphereRef(db, userId, bundleId, MANSION_ATMOSPHERE_ACTIVE_LOGICAL_ID_V1);
  if (!active) return;
  const mansion = getDebateMysteryMansionBundleV2(db, userId, bundleId);
  const generated = buildMansionAmbienceManifestV1({
    houseStyle: mansion.houseStyle,
    rooms: mansion.rooms,
    promptContractHash: createHash("sha256").update(mansion.houseStyle.promptContract).digest("hex"),
    variationSeed: mansion.houseStyle.id,
  });
  const source = mansion.houseStyle.ambience ?? generated;
  const worldBed = {
    id: "world-bed",
    semanticRole: "world_bed" as const,
    scope: "mansion" as const,
    sharedAssetId: null,
    packageAssetId: active.id,
    contentSha256: active.sha256,
    fallbackSharedAssetId: PRISM_MANSION_ACOUSTIC_ASSETS_V1.indoorRoomTone.id,
    generation: {
      source: "generated" as const,
      provider: "elevenlabs",
      model: SIGNAL_ELEVENLABS_ATMOSPHERE_MODEL,
    },
  };
  const ambience = {
    ...source,
    bespokeSynthesisRequested: true,
    assets: [worldBed, ...source.assets.filter((asset) => asset.semanticRole !== "world_bed")],
  };
  const row = bundleRow(db, userId, bundleId);
  const style = JSON.parse(row.style_json) as Record<string, unknown>;
  db.prepare(
    `UPDATE debate_mystery_mansion_bundles SET style_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(
    JSON.stringify({ ...style, bespokeAmbienceRequested: true, ambience }),
    new Date().toISOString(),
    bundleId,
    userId,
  );
}

function mutateAtmosphere(args: {
  db: DatabaseSync;
  userId: string;
  bundleId: string;
  action: "accept" | "discard" | "undo";
}): void {
  const row = bundleRow(args.db, args.userId, args.bundleId);
  const parsed = metadata(row.library_metadata_json);
  const active = atmosphereRef(args.db, args.userId, args.bundleId, MANSION_ATMOSPHERE_ACTIVE_LOGICAL_ID_V1);
  const candidate = atmosphereRef(args.db, args.userId, args.bundleId, MANSION_ATMOSPHERE_CANDIDATE_LOGICAL_ID_V1);
  const previous = atmosphereRef(args.db, args.userId, args.bundleId, MANSION_ATMOSPHERE_PREVIOUS_LOGICAL_ID_V1);
  if (args.action === "accept" && !candidate) throw new HttpError(409, "Generate an atmosphere preview before accepting it.");
  if (args.action === "undo" && candidate) throw new HttpError(409, "Use or discard the atmosphere preview before undoing.");
  if (args.action === "undo" && !previous) throw new HttpError(409, "There is no previous mansion atmosphere to restore.");
  const now = new Date().toISOString();
  args.db.exec("BEGIN IMMEDIATE");
  try {
    const update = args.db.prepare(
      `UPDATE debate_mystery_mansion_asset_refs SET logical_id = ?, created_at = ?
        WHERE bundle_id = ? AND user_id = ? AND role = 'music' AND logical_id = ?`,
    );
    if (args.action === "discard") {
      args.db.prepare(
        `DELETE FROM debate_mystery_mansion_asset_refs WHERE bundle_id = ? AND user_id = ?
          AND role = 'music' AND logical_id = ?`,
      ).run(args.bundleId, args.userId, MANSION_ATMOSPHERE_CANDIDATE_LOGICAL_ID_V1);
      parsed.atmosphere.candidateTitle = null;
    } else if (args.action === "accept") {
      args.db.prepare(
        `DELETE FROM debate_mystery_mansion_asset_refs WHERE bundle_id = ? AND user_id = ?
          AND role = 'music' AND logical_id = ?`,
      ).run(args.bundleId, args.userId, MANSION_ATMOSPHERE_PREVIOUS_LOGICAL_ID_V1);
      if (active) update.run(MANSION_ATMOSPHERE_PREVIOUS_LOGICAL_ID_V1, now, args.bundleId, args.userId, MANSION_ATMOSPHERE_ACTIVE_LOGICAL_ID_V1);
      update.run(MANSION_ATMOSPHERE_ACTIVE_LOGICAL_ID_V1, now, args.bundleId, args.userId, MANSION_ATMOSPHERE_CANDIDATE_LOGICAL_ID_V1);
      parsed.atmosphere.previousTitle = active ? parsed.atmosphere.activeTitle : null;
      parsed.atmosphere.activeTitle = parsed.atmosphere.candidateTitle;
      parsed.atmosphere.candidateTitle = null;
    } else {
      const swap = "ambience:world-bed-swap-v1";
      if (active) update.run(swap, now, args.bundleId, args.userId, MANSION_ATMOSPHERE_ACTIVE_LOGICAL_ID_V1);
      update.run(MANSION_ATMOSPHERE_ACTIVE_LOGICAL_ID_V1, now, args.bundleId, args.userId, MANSION_ATMOSPHERE_PREVIOUS_LOGICAL_ID_V1);
      if (active) update.run(MANSION_ATMOSPHERE_PREVIOUS_LOGICAL_ID_V1, now, args.bundleId, args.userId, swap);
      const title = parsed.atmosphere.activeTitle;
      parsed.atmosphere.activeTitle = parsed.atmosphere.previousTitle;
      parsed.atmosphere.previousTitle = active ? title : null;
    }
    writeMetadata(args.db, args.userId, args.bundleId, row.library_metadata_json, parsed.atmosphere, now);
    args.db.exec("COMMIT");
  } catch (error) {
    if (args.db.isTransaction) args.db.exec("ROLLBACK");
    throw error;
  }
  if (args.action !== "discard") installActiveManifest(args.db, args.userId, args.bundleId);
}

export function acceptDebateMysteryMansionAtmosphereV1(db: DatabaseSync, userId: string, bundleId: string): void {
  mutateAtmosphere({ db, userId, bundleId, action: "accept" });
}

export function discardDebateMysteryMansionAtmosphereV1(db: DatabaseSync, userId: string, bundleId: string): void {
  mutateAtmosphere({ db, userId, bundleId, action: "discard" });
}

export function undoDebateMysteryMansionAtmosphereV1(db: DatabaseSync, userId: string, bundleId: string): void {
  mutateAtmosphere({ db, userId, bundleId, action: "undo" });
}

export function undoDebateMysteryMansionAtmosphereFieldRepairV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  hadActiveAtmosphere: boolean,
): void {
  if (hadActiveAtmosphere) {
    mutateAtmosphere({ db, userId, bundleId, action: "undo" });
    return;
  }
  const row = bundleRow(db, userId, bundleId);
  const parsed = metadata(row.library_metadata_json);
  db.prepare(
    `DELETE FROM debate_mystery_mansion_asset_refs
      WHERE bundle_id = ? AND user_id = ? AND role = 'music' AND logical_id = ?`,
  ).run(bundleId, userId, MANSION_ATMOSPHERE_ACTIVE_LOGICAL_ID_V1);
  parsed.atmosphere.activeTitle = null;
  parsed.atmosphere.previousTitle = null;
  writeMetadata(
    db,
    userId,
    bundleId,
    row.library_metadata_json,
    parsed.atmosphere,
    new Date().toISOString(),
  );
}

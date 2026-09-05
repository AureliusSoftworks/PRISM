import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  WHODUNNIT_SFX_CUES_V1,
  mansionSfxLogicalIdV1,
  type DebateMysteryHouseStyleV2,
  type WhodunnitSfxCueIdV1,
} from "@localai/shared";
import { assertRefractionActive } from "./refraction-cancellation.ts";
import { getDebateMysteryMansionBundleV2 } from "./debate-mystery-mansion-bundles.ts";
import { requestWhodunnitVenueSfxClip } from "./elevenlabs-sound.ts";
import { portableMp3DurationMsV1 } from "./debate-mystery-package-safety.ts";
import { encryptBytes } from "./security.ts";
import { HttpError } from "./utils.http.ts";

/**
 * Venue effects pack: one short clip per Whodunnit cue, owned by the venue.
 *
 * Synthesis always lands on the candidate lane so the venue changes only when
 * the author saves. Accept moves candidate → active (keeping the replaced clip
 * as previous), Discard drops the candidate, Undo swaps previous back in. The
 * shape mirrors venue music and atmosphere, with role `sfx` and logical ids
 * `cue:<cueId>[:candidate|:previous]`.
 */
const MANSION_SFX_MAX_BYTES_V1 = 1024 * 1024;
const MANSION_SFX_MODEL_V1 = "eleven_text_to_sound_v2";
const mansionSfxGenerationsInFlightV1 = new Set<string>();

function compact(value: string, maxLength: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

function sfxRef(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  logicalId: string,
): { id: string } | null {
  return db.prepare(
    `SELECT assets.id FROM debate_mystery_mansion_asset_refs AS refs
       JOIN debate_mystery_mansion_assets AS assets
         ON assets.id = refs.asset_id AND assets.user_id = refs.user_id
      WHERE refs.bundle_id = ? AND refs.user_id = ? AND refs.role = 'sfx'
        AND refs.logical_id = ? LIMIT 1`,
  ).get(bundleId, userId, logicalId) as { id: string } | undefined ?? null;
}

/** Drops clips nothing references any more; prop sprites are guarded separately. */
function cleanupUnreferencedSfxAssets(db: DatabaseSync, userId: string): void {
  const hasPropVariantTable = Boolean(
    db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'debate_mystery_mansion_prop_variants'",
    ).get(),
  );
  db.prepare(
    `DELETE FROM debate_mystery_mansion_assets
      WHERE user_id = ?
        AND mime_type LIKE 'audio/%'
        AND NOT EXISTS (
          SELECT 1 FROM debate_mystery_mansion_asset_refs AS refs
           WHERE refs.user_id = debate_mystery_mansion_assets.user_id
             AND refs.asset_id = debate_mystery_mansion_assets.id
        )${hasPropVariantTable ? `
        AND NOT EXISTS (
          SELECT 1 FROM debate_mystery_mansion_prop_variants AS variants
           WHERE variants.user_id = debate_mystery_mansion_assets.user_id
             AND (variants.asset_id = debate_mystery_mansion_assets.id
               OR variants.candidate_asset_id = debate_mystery_mansion_assets.id)
        )` : ""}`,
  ).run(userId);
}

/** The cue's bundled intent, then the venue's world so the clip sounds like it
 * belongs there: an airlock hisses where a manor door creaks. */
export function buildDebateMysteryMansionSfxPromptV1(args: {
  cueId: WhodunnitSfxCueIdV1;
  houseStyle: Pick<DebateMysteryHouseStyleV2, "label" | "promptContract" | "acousticThemePaletteId">;
  /** The player's Refract direction for this pass. Blank keeps the canonical
   * prompt byte-identical, so an undirected resynthesis never drifts. */
  direction?: string | null;
}): string {
  const cue = WHODUNNIT_SFX_CUES_V1[args.cueId];
  const direction = compact(typeof args.direction === "string" ? args.direction : "", 300);
  return [
    cue.prompt,
    `Setting: ${compact(args.houseStyle.label, 60) || "a mystery venue"}.`,
    `Materials and era: ${compact(args.houseStyle.promptContract, 150)}.`,
    // The direction colors the cue; it never redefines it. It sits ahead of the
    // closing constraint so that sentence still bounds every clip to one short
    // dry one-shot, whatever the player asked for.
    ...(direction ? [`Creative direction for this pass: ${direction}`] : []),
    "One short dry user-interface sound effect, close and clean, quick start, natural tail, no music bed, no voices, no room reverb wash.",
  ].join(" ");
}

function storeCandidate(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  bundleId: string;
  cueId: WhodunnitSfxCueIdV1;
  bytes: Buffer;
  contentType: string;
}): string {
  if (args.contentType !== "audio/mpeg") throw new Error("Venue effect audio must be MP3.");
  if (args.bytes.byteLength < 1 || args.bytes.byteLength > MANSION_SFX_MAX_BYTES_V1) {
    throw new Error("Venue effect audio is outside the supported file-size boundary.");
  }
  const durationMs = portableMp3DurationMsV1(args.bytes);
  if (durationMs < 200 || durationMs > 6_000) {
    throw new Error("Venue effect duration is outside the short one-shot boundary.");
  }
  const sha256 = createHash("sha256").update(args.bytes).digest("hex");
  const encrypted = encryptBytes(args.bytes, args.userKey);
  const now = new Date().toISOString();
  args.db.exec("BEGIN IMMEDIATE");
  try {
    args.db.prepare(
      `INSERT INTO debate_mystery_mansion_assets
         (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
          mime_type, width, height, duration_ms, provider, model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'audio/mpeg', NULL, NULL, ?, 'elevenlabs', ?, ?, ?)
       ON CONFLICT(user_id, sha256) DO UPDATE SET duration_ms = excluded.duration_ms, updated_at = excluded.updated_at`,
    ).run(
      randomUUID(), args.userId, encrypted.ciphertext, encrypted.iv, encrypted.tag,
      sha256, args.bytes.byteLength, durationMs, MANSION_SFX_MODEL_V1, now, now,
    );
    const stored = args.db.prepare(
      "SELECT id FROM debate_mystery_mansion_assets WHERE user_id = ? AND sha256 = ?",
    ).get(args.userId, sha256) as { id: string };
    args.db.prepare(
      `INSERT INTO debate_mystery_mansion_asset_refs
         (bundle_id, user_id, asset_id, role, logical_id, created_at)
       VALUES (?, ?, ?, 'sfx', ?, ?)
       ON CONFLICT(bundle_id, role, logical_id) DO UPDATE SET asset_id = excluded.asset_id, created_at = excluded.created_at`,
    ).run(args.bundleId, args.userId, stored.id, mansionSfxLogicalIdV1(args.cueId, "candidate"), now);
    args.db.prepare(
      `UPDATE debate_mystery_mansion_bundles SET updated_at = ? WHERE id = ? AND user_id = ?`,
    ).run(now, args.bundleId, args.userId);
    args.db.exec("COMMIT");
    return stored.id;
  } catch (error) {
    if (args.db.isTransaction) args.db.exec("ROLLBACK");
    throw error;
  }
}

/** Synthesizes one cue for the venue as a candidate. ONLINE only, like every
 * other venue sound; LOCAL keeps the bundled palette. */
export async function stageDebateMysteryMansionSfxCueV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  bundleId: string;
  cueId: WhodunnitSfxCueIdV1;
  responseMode: "local" | "online";
  apiKey: string | null;
  /** Optional player Refract direction for this synthesis pass. */
  direction?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<{ assetId: string; cueId: WhodunnitSfxCueIdV1 }> {
  if (args.responseMode !== "online") {
    throw new HttpError(409, "Effect synthesis requires ONLINE mode. LOCAL remains fully offline.");
  }
  if (!args.apiKey?.trim()) throw new HttpError(409, "Connect ElevenLabs before synthesizing venue effects.");
  const key = `${args.userId}:${args.bundleId}:${args.cueId}`;
  if (mansionSfxGenerationsInFlightV1.has(key)) {
    throw new HttpError(409, "That venue effect is already being synthesized.");
  }
  mansionSfxGenerationsInFlightV1.add(key);
  try {
    const mansion = getDebateMysteryMansionBundleV2(args.db, args.userId, args.bundleId);
    const generated = await requestWhodunnitVenueSfxClip({
      apiKey: args.apiKey,
      prompt: buildDebateMysteryMansionSfxPromptV1({
        cueId: args.cueId,
        houseStyle: mansion.houseStyle,
        direction: args.direction,
      }),
      durationSeconds: WHODUNNIT_SFX_CUES_V1[args.cueId].durationSeconds,
      fetchImpl: args.fetchImpl,
    });
    assertRefractionActive();
    const assetId = storeCandidate({
      ...args,
      bytes: generated.audioBytes,
      contentType: generated.contentType,
    });
    return { assetId, cueId: args.cueId };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, error instanceof Error ? error.message : "Venue effect synthesis failed.");
  } finally {
    mansionSfxGenerationsInFlightV1.delete(key);
  }
}

function mutateSfx(args: {
  db: DatabaseSync;
  userId: string;
  bundleId: string;
  cueId: WhodunnitSfxCueIdV1;
  action: "accept" | "discard" | "undo";
}): void {
  const activeId = mansionSfxLogicalIdV1(args.cueId, "active");
  const candidateId = mansionSfxLogicalIdV1(args.cueId, "candidate");
  const previousId = mansionSfxLogicalIdV1(args.cueId, "previous");
  const active = sfxRef(args.db, args.userId, args.bundleId, activeId);
  const candidate = sfxRef(args.db, args.userId, args.bundleId, candidateId);
  const previous = sfxRef(args.db, args.userId, args.bundleId, previousId);
  if (args.action === "accept" && !candidate) throw new HttpError(409, "Synthesize an effect preview before accepting it.");
  if (args.action === "undo" && candidate) throw new HttpError(409, "Use or discard the effect preview before undoing.");
  if (args.action === "undo" && !previous) throw new HttpError(409, "There is no previous clip for this effect.");
  if (args.action === "discard" && !candidate) return;
  const now = new Date().toISOString();
  args.db.exec("BEGIN IMMEDIATE");
  try {
    const rename = args.db.prepare(
      `UPDATE debate_mystery_mansion_asset_refs SET logical_id = ?, created_at = ?
        WHERE bundle_id = ? AND user_id = ? AND role = 'sfx' AND logical_id = ?`,
    );
    const remove = args.db.prepare(
      `DELETE FROM debate_mystery_mansion_asset_refs
        WHERE bundle_id = ? AND user_id = ? AND role = 'sfx' AND logical_id = ?`,
    );
    if (args.action === "discard") {
      remove.run(args.bundleId, args.userId, candidateId);
    } else if (args.action === "accept") {
      remove.run(args.bundleId, args.userId, previousId);
      if (active) rename.run(previousId, now, args.bundleId, args.userId, activeId);
      rename.run(activeId, now, args.bundleId, args.userId, candidateId);
    } else {
      const swap = `${activeId}:swap`;
      if (active) rename.run(swap, now, args.bundleId, args.userId, activeId);
      rename.run(activeId, now, args.bundleId, args.userId, previousId);
      if (active) rename.run(previousId, now, args.bundleId, args.userId, swap);
    }
    args.db.prepare(
      `UPDATE debate_mystery_mansion_bundles SET updated_at = ? WHERE id = ? AND user_id = ?`,
    ).run(now, args.bundleId, args.userId);
    args.db.exec("COMMIT");
  } catch (error) {
    if (args.db.isTransaction) args.db.exec("ROLLBACK");
    throw error;
  }
  cleanupUnreferencedSfxAssets(args.db, args.userId);
}

export function acceptDebateMysteryMansionSfxCueV1(
  db: DatabaseSync, userId: string, bundleId: string, cueId: WhodunnitSfxCueIdV1,
): void {
  mutateSfx({ db, userId, bundleId, cueId, action: "accept" });
}

export function discardDebateMysteryMansionSfxCueV1(
  db: DatabaseSync, userId: string, bundleId: string, cueId: WhodunnitSfxCueIdV1,
): void {
  mutateSfx({ db, userId, bundleId, cueId, action: "discard" });
}

export function undoDebateMysteryMansionSfxCueV1(
  db: DatabaseSync, userId: string, bundleId: string, cueId: WhodunnitSfxCueIdV1,
): void {
  mutateSfx({ db, userId, bundleId, cueId, action: "undo" });
}

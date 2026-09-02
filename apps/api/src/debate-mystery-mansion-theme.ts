import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  MANSION_MUSIC_ACTIVE_LOGICAL_ID_V1,
  MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1,
  MANSION_MUSIC_PREVIOUS_LOGICAL_ID_V1,
  MANSION_MUSIC_REFRACT_LENSES_V1,
  deriveMansionMusicIdentityV1,
  normalizeDebateMysteryAtmosphereContractV1,
  normalizeMansionMusicIdentityV1,
  validateMansionMusicLoopV1,
  type MansionMusicIdentityV1,
  type MansionMusicLoopV1,
  type MansionMusicRefractLensV1,
} from "@localai/shared";
import {
  MANSION_SOUNDTRACK_DURATION_MS,
  MANSION_SOUNDTRACK_MAX_BYTES,
  requestCoffeeGroupElevenLabsMusic,
} from "./elevenlabs-music.ts";
import { portableMp3DurationMsV1 } from "./debate-mystery-package-safety.ts";
import { encryptBytes } from "./security.ts";
import { HttpError } from "./utils.http.ts";

export const DEBATE_MYSTERY_MANSION_THEME_MODEL_V1 = "music_v2";

const mansionThemeGenerationsInFlightV1 = new Set<string>();

export interface DebateMysteryMansionThemeResultV1 {
  source: "generated" | "existing" | "bundled_fallback";
  assetId: string | null;
  title?: string | null;
  lens?: MansionMusicRefractLensV1 | "signature" | null;
  failure: string | null;
}

interface MansionThemeBundleRowV1 {
  name: string;
  style_json: string;
  library_metadata_json: string | null;
}

interface MansionMusicMetadataV1 {
  version: 1;
  activeTitle: string | null;
  candidateTitle: string | null;
  candidateLens: MansionMusicRefractLensV1 | "signature" | null;
  previousTitle: string | null;
  activeLoop: MansionMusicLoopV1 | null;
  candidateLoop: MansionMusicLoopV1 | null;
  previousLoop: MansionMusicLoopV1 | null;
  candidateValidation: "pending" | "validated" | null;
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function compact(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/\s+/gu, " ").trim().slice(0, maxLength) || fallback
    : fallback;
}

function musicLoopMetadata(value: unknown): MansionMusicLoopV1 | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<MansionMusicLoopV1>;
  return input.version === 1 &&
    typeof input.loopStartMs === "number" && Number.isFinite(input.loopStartMs) &&
    typeof input.loopEndMs === "number" && Number.isFinite(input.loopEndMs) &&
    typeof input.crossfadeMs === "number" && Number.isFinite(input.crossfadeMs) &&
    typeof input.silenceRatio === "number" && Number.isFinite(input.silenceRatio)
      ? {
          version: 1,
          loopStartMs: input.loopStartMs,
          loopEndMs: input.loopEndMs,
          crossfadeMs: input.crossfadeMs,
          silenceRatio: input.silenceRatio,
        }
      : null;
}

function readBundle(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
): MansionThemeBundleRowV1 {
  const bundle = db.prepare(
    `SELECT name, style_json, library_metadata_json
       FROM debate_mystery_mansion_bundles
      WHERE id = ? AND user_id = ?`,
  ).get(bundleId, userId) as MansionThemeBundleRowV1 | undefined;
  if (!bundle) throw new HttpError(404, "That mansion is unavailable.");
  return bundle;
}

function musicMetadata(value: string | null): {
  root: Record<string, unknown>;
  music: MansionMusicMetadataV1;
} {
  let root: Record<string, unknown> = {};
  try {
    const parsed = value ? JSON.parse(value) as unknown : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      root = { ...(parsed as Record<string, unknown>) };
    }
  } catch {
    root = {};
  }
  const raw = root.music && typeof root.music === "object" && !Array.isArray(root.music)
    ? root.music as Record<string, unknown>
    : {};
  const lens = raw.candidateLens;
  return {
    root,
    music: {
      version: 1,
      activeTitle: compact(raw.activeTitle, "", 180) || null,
      candidateTitle: compact(raw.candidateTitle, "", 180) || null,
      candidateLens:
        lens === "signature" || MANSION_MUSIC_REFRACT_LENSES_V1.includes(lens as MansionMusicRefractLensV1)
          ? lens as MansionMusicRefractLensV1 | "signature" : null,
      previousTitle: compact(raw.previousTitle, "", 180) || null,
      activeLoop: musicLoopMetadata(raw.activeLoop),
      candidateLoop: musicLoopMetadata(raw.candidateLoop),
      previousLoop: musicLoopMetadata(raw.previousLoop),
      candidateValidation:
        raw.candidateValidation === "pending" || raw.candidateValidation === "validated"
          ? raw.candidateValidation
          : null,
    },
  };
}

function writeMusicMetadata(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  source: string | null,
  music: MansionMusicMetadataV1,
  now: string,
): void {
  const parsed = musicMetadata(source);
  parsed.root.version = 1;
  parsed.root.music = music;
  db.prepare(
    `UPDATE debate_mystery_mansion_bundles
        SET library_metadata_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(JSON.stringify(parsed.root), now, bundleId, userId);
}

export function resolveDebateMysteryMansionMusicIdentityV1(args: {
  title: string;
  styleJson: string;
}): MansionMusicIdentityV1 {
  let style: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(args.styleJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      style = parsed as Record<string, unknown>;
    }
  } catch {
    style = {};
  }
  const label = compact(style.label, "Whodunnit mansion", 120);
  const promptContract = compact(style.promptContract, "Restrained mystery atmosphere.", 600);
  const atmosphere = normalizeDebateMysteryAtmosphereContractV1(
    style.atmosphere,
    `${label} ${promptContract}`,
  );
  const fallback = deriveMansionMusicIdentityV1({
    title: args.title,
    houseStyleLabel: label,
    houseStylePromptContract: promptContract,
    atmosphere,
  });
  const normalized = normalizeMansionMusicIdentityV1(style.musicIdentity, fallback);
  // Imported V1 identity prose remains readable, but never reaches a provider
  // when it names environmental or semantic audio sources. Generation falls
  // back field-by-field to PRISM's family palette instead.
  const environmentalSource = /\b(?:ambience|atmosphere|rain|wind|storm|thunder|weather|window|roof|fireplace|flame|insect|wildlife|bird|animal|waterfall|stream|footstep|door|alarm|gunshot|scream|voice|vocal|speech|clue|weapon|character|case event|hull|machinery|ventilation|airflow|electrical hum|room tone|sound effect)\b/iu;
  const safeText = (value: string, safeFallback: string, absoluteFallback: string): string => {
    const selected = environmentalSource.test(value) ? safeFallback : value;
    return environmentalSource.test(selected) ? absoluteFallback : selected;
  };
  const safeList = (value: string[], safeFallback: string[], absoluteFallback: string[]): string[] => {
    const safe = value.filter((entry) => !environmentalSource.test(entry));
    if (safe.length >= 2) return safe;
    const safeFamily = safeFallback.filter((entry) => !environmentalSource.test(entry));
    return safeFamily.length >= 2 ? safeFamily : absoluteFallback;
  };
  return {
    ...normalized,
    noirSubgenre: safeText(normalized.noirSubgenre, fallback.noirSubgenre, "chamber detective noir"),
    instrumentation: safeList(normalized.instrumentation, fallback.instrumentation, ["felt piano", "bass clarinet"]),
    harmonicCharacter: safeList(normalized.harmonicCharacter, fallback.harmonicCharacter, ["suspended harmony", "quiet unresolved tension"]),
    styleBoundaries: safeList(normalized.styleBoundaries, fallback.styleBoundaries, ["furniture music", "quiet investigative restraint"]),
  };
}

export function buildDebateMysteryMansionThemePromptV1(args: {
  title: string;
  identity?: MansionMusicIdentityV1;
  /** Legacy prompt inputs remain accepted for existing callers and fixtures. */
  houseStyleLabel?: string;
  houseStylePromptContract?: string;
}): string {
  const identity = args.identity ?? deriveMansionMusicIdentityV1({
    title: args.title,
    houseStyleLabel: args.houseStyleLabel ?? "Whodunnit mansion",
    houseStylePromptContract: args.houseStylePromptContract ?? "Restrained mystery atmosphere.",
  });
  const tempo = Math.round((identity.tempoBpm.min + identity.tempoBpm.max) / 2);
  return [
    `Compose wholly original instrumental ${identity.noirSubgenre} as quiet furniture music for a mystery investigation loop.`,
    `The sole sound sources are these musical instruments: ${identity.instrumentation.join(", ")}.`,
    `Harmony: ${identity.harmonicCharacter.join(", ")}.`,
    `Tempo: approximately ${tempo} BPM within ${identity.tempoBpm.min}-${identity.tempoBpm.max} BPM.`,
    `Character: ${identity.styleBoundaries.join(", ")}.`,
    `Use isolated ${identity.phraseDurationSeconds.min}-${identity.phraseDurationSeconds.max} second musical phrases separated by ${identity.quietIntervalSeconds.min}-${identity.quietIntervalSeconds.max} second quiet intervals.`,
    `Keep approximately ${Math.round((identity.silenceRatio?.min ?? 0.45) * 100)}-${Math.round((identity.silenceRatio?.max ?? 0.65) * 100)} percent of the complete composition at rest or near-silence, with foreground risk below ${(identity.foregroundRiskCeiling ?? 0.18).toFixed(2)}.`,
    `Begin and end inside matching low-energy quiet windows at least ${identity.loopBoundary.quietWindowSeconds.toFixed(1)} seconds long so an equal-power ${identity.loopBoundary.crossfadeSeconds.toFixed(1)} second loop returns imperceptibly.`,
    "Maintain a dialogue-safe level, soft attacks, generous midrange space, infrequent motifs, unresolved crime-scene tension, and quiet dramatic restraint from beginning to end.",
  ].join(" ");
}

function candidateTitle(name: string): string {
  return `${name} Investigation Theme`.slice(0, 180);
}

function themeRef(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  logicalId: string,
): { id: string } | undefined {
  return db.prepare(
    `SELECT assets.id FROM debate_mystery_mansion_asset_refs AS refs
       JOIN debate_mystery_mansion_assets AS assets
         ON assets.id = refs.asset_id AND assets.user_id = refs.user_id
      WHERE refs.bundle_id = ? AND refs.user_id = ? AND refs.role = 'music'
        AND refs.logical_id = ?
      LIMIT 1`,
  ).get(bundleId, userId, logicalId) as { id: string } | undefined;
}

function cleanupUnreferencedMusicAssets(db: DatabaseSync, userId: string): void {
  db.prepare(
    `DELETE FROM debate_mystery_mansion_assets
      WHERE user_id = ? AND mime_type LIKE 'audio/%' AND NOT EXISTS (
        SELECT 1 FROM debate_mystery_mansion_asset_refs AS refs
         WHERE refs.user_id = debate_mystery_mansion_assets.user_id
           AND refs.asset_id = debate_mystery_mansion_assets.id
      )`,
  ).run(userId);
}

function storeTheme(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  bundleId: string;
  bundle: MansionThemeBundleRowV1;
  audioBytes: Buffer;
  contentType: string;
  logicalId: string;
  title: string;
  identity: MansionMusicIdentityV1;
}): string {
  if (args.contentType !== "audio/mpeg") throw new Error("Theme audio must be MP3.");
  if (args.audioBytes.byteLength === 0 || args.audioBytes.byteLength > MANSION_SOUNDTRACK_MAX_BYTES) {
    throw new Error("Theme audio is outside the supported file-size boundary.");
  }
  const durationMs = portableMp3DurationMsV1(args.audioBytes);
  if (durationMs < 110_000 || durationMs > 130_000) {
    throw new Error("Theme duration is outside the expected two-minute loop boundary.");
  }
  const sha256 = digest(args.audioBytes);
  const encrypted = encryptBytes(args.audioBytes, args.userKey);
  const assetId = randomUUID();
  const now = new Date().toISOString();
  args.db.exec("BEGIN IMMEDIATE");
  try {
    args.db.prepare(
      `INSERT INTO debate_mystery_mansion_assets
         (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
          mime_type, width, height, duration_ms, provider, model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'audio/mpeg', NULL, NULL, ?,
               'elevenlabs', ?, ?, ?)
       ON CONFLICT(user_id, sha256) DO UPDATE SET
         duration_ms = excluded.duration_ms,
         updated_at = excluded.updated_at`,
    ).run(
      assetId, args.userId, encrypted.ciphertext, encrypted.iv, encrypted.tag,
      sha256, args.audioBytes.byteLength, durationMs,
      DEBATE_MYSTERY_MANSION_THEME_MODEL_V1, now, now,
    );
    const stored = args.db.prepare(
      "SELECT id FROM debate_mystery_mansion_assets WHERE user_id = ? AND sha256 = ?",
    ).get(args.userId, sha256) as { id: string };
    args.db.prepare(
      `INSERT INTO debate_mystery_mansion_asset_refs
         (bundle_id, user_id, asset_id, role, logical_id, created_at)
       VALUES (?, ?, ?, 'music', ?, ?)
       ON CONFLICT(bundle_id, role, logical_id) DO UPDATE SET
         asset_id = excluded.asset_id,
         created_at = excluded.created_at`,
    ).run(args.bundleId, args.userId, stored.id, args.logicalId, now);
    const metadata = musicMetadata(args.bundle.library_metadata_json);
    if (args.logicalId === MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1) {
      metadata.music.candidateTitle = args.title;
      metadata.music.candidateLens = "signature";
      metadata.music.candidateLoop = null;
      metadata.music.candidateValidation = "pending";
    } else {
      metadata.music.activeTitle = args.title;
    }
    writeMusicMetadata(
      args.db, args.userId, args.bundleId,
      args.bundle.library_metadata_json, metadata.music, now,
    );
    const rawStyle = JSON.parse(args.bundle.style_json) as Record<string, unknown>;
    rawStyle.musicIdentity = args.identity;
    args.db.prepare(
      `UPDATE debate_mystery_mansion_bundles SET style_json = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(JSON.stringify(rawStyle), now, args.bundleId, args.userId);
    cleanupUnreferencedMusicAssets(args.db, args.userId);
    args.db.exec("COMMIT");
    return stored.id;
  } catch (error) {
    if (args.db.isTransaction) args.db.exec("ROLLBACK");
    throw error;
  }
}

async function generateTheme(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  bundleId: string;
  apiKey: string;
  logicalId: string;
  fetchImpl?: typeof fetch;
}): Promise<{ assetId: string; title: string }> {
  const generationKey = `${args.userId}:${args.bundleId}`;
  if (mansionThemeGenerationsInFlightV1.has(generationKey)) {
    throw new HttpError(409, "Mansion music generation is already in progress.");
  }
  mansionThemeGenerationsInFlightV1.add(generationKey);
  try {
    const bundle = readBundle(args.db, args.userId, args.bundleId);
    const identity = resolveDebateMysteryMansionMusicIdentityV1({
      title: bundle.name,
      styleJson: bundle.style_json,
    });
    const generated = await requestCoffeeGroupElevenLabsMusic({
      apiKey: args.apiKey,
      prompt: buildDebateMysteryMansionThemePromptV1({ title: bundle.name, identity }),
      durationMs: MANSION_SOUNDTRACK_DURATION_MS,
      maxBytes: MANSION_SOUNDTRACK_MAX_BYTES,
      unavailableMessage: "ElevenLabs Music is unavailable; the current mansion music is unchanged.",
      fetchImpl: args.fetchImpl,
    });
    const title = candidateTitle(bundle.name);
    const assetId = storeTheme({
      ...args,
      bundle,
      audioBytes: generated.audioBytes,
      contentType: generated.contentType,
      title,
      identity,
    });
    return { assetId, title };
  } finally {
    mansionThemeGenerationsInFlightV1.delete(generationKey);
  }
}

/** Case Forge may prepare a signature candidate, but decoded validation and
 * explicit player acceptance are always required before it becomes active. */
export async function ensureDebateMysteryMansionThemeV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  bundleId: string;
  requested: boolean;
  responseMode: "local" | "online";
  apiKey: string | null;
  fetchImpl?: typeof fetch;
}): Promise<DebateMysteryMansionThemeResultV1> {
  try {
    readBundle(args.db, args.userId, args.bundleId);
  } catch {
    return { source: "bundled_fallback", assetId: null, failure: "Mansion unavailable." };
  }
  const existing = themeRef(args.db, args.userId, args.bundleId, MANSION_MUSIC_ACTIVE_LOGICAL_ID_V1);
  if (existing) return { source: "existing", assetId: existing.id, failure: null };
  const pending = themeRef(args.db, args.userId, args.bundleId, MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1);
  if (pending) return { source: "existing", assetId: pending.id, lens: "signature", failure: null };
  if (!args.requested || args.responseMode !== "online" || !args.apiKey?.trim()) {
    return { source: "bundled_fallback", assetId: null, failure: null };
  }
  try {
    const generated = await generateTheme({
      ...args,
      apiKey: args.apiKey,
      logicalId: MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1,
    });
    return { source: "generated", ...generated, lens: "signature", failure: null };
  } catch (error) {
    return {
      source: "bundled_fallback",
      assetId: null,
      failure: error instanceof Error ? error.message : "Theme generation failed.",
    };
  }
}

export async function stageDebateMysteryMansionThemeV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  bundleId: string;
  responseMode: "local" | "online";
  apiKey: string | null;
  fetchImpl?: typeof fetch;
}): Promise<DebateMysteryMansionThemeResultV1> {
  if (args.responseMode !== "online") {
    throw new HttpError(409, "Music synthesis requires ONLINE mode. LOCAL remains fully offline.");
  }
  if (!args.apiKey?.trim()) {
    throw new HttpError(409, "Connect ElevenLabs before synthesizing mansion music.");
  }
  try {
    const generated = await generateTheme({
      ...args,
      apiKey: args.apiKey,
      logicalId: MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1,
    });
    return { source: "generated", ...generated, lens: "signature", failure: null };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, error instanceof Error ? error.message : "Mansion music generation failed.");
  }
}

export function validateDebateMysteryMansionThemeCandidateV1(args: {
  db: DatabaseSync;
  userId: string;
  bundleId: string;
  loop: unknown;
}): MansionMusicLoopV1 {
  const bundle = readBundle(args.db, args.userId, args.bundleId);
  const candidate = args.db.prepare(
    `SELECT assets.duration_ms FROM debate_mystery_mansion_asset_refs AS refs
       JOIN debate_mystery_mansion_assets AS assets
         ON assets.id = refs.asset_id AND assets.user_id = refs.user_id
      WHERE refs.bundle_id = ? AND refs.user_id = ? AND refs.role = 'music'
        AND refs.logical_id = ? LIMIT 1`,
  ).get(
    args.bundleId,
    args.userId,
    MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1,
  ) as { duration_ms: number | bigint | null } | undefined;
  if (!candidate?.duration_ms) throw new HttpError(409, "Generate a music preview before validating it.");
  const identity = resolveDebateMysteryMansionMusicIdentityV1({
    title: bundle.name,
    styleJson: bundle.style_json,
  });
  const loop = musicLoopMetadata(args.loop);
  const errors = validateMansionMusicLoopV1(loop, Number(candidate.duration_ms), identity);
  if (!loop || errors.length > 0) {
    throw new HttpError(422, errors.join(" ") || "Music loop validation failed.");
  }
  const metadata = musicMetadata(bundle.library_metadata_json);
  metadata.music.candidateLoop = loop;
  metadata.music.candidateValidation = "validated";
  writeMusicMetadata(
    args.db,
    args.userId,
    args.bundleId,
    bundle.library_metadata_json,
    metadata.music,
    new Date().toISOString(),
  );
  return loop;
}

function mutateThemeRefs(args: {
  db: DatabaseSync;
  userId: string;
  bundleId: string;
  action: "accept" | "discard" | "undo";
}): void {
  const bundle = readBundle(args.db, args.userId, args.bundleId);
  const metadata = musicMetadata(bundle.library_metadata_json);
  const now = new Date().toISOString();
  const active = themeRef(args.db, args.userId, args.bundleId, MANSION_MUSIC_ACTIVE_LOGICAL_ID_V1);
  const candidate = themeRef(args.db, args.userId, args.bundleId, MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1);
  const previous = themeRef(args.db, args.userId, args.bundleId, MANSION_MUSIC_PREVIOUS_LOGICAL_ID_V1);
  if (args.action === "accept" && !candidate) throw new HttpError(409, "Generate a preview before accepting it.");
  if (args.action === "accept" && metadata.music.candidateValidation === "pending") {
    throw new HttpError(409, "Validate the decoded music preview before accepting it.");
  }
  if (args.action === "undo" && candidate) throw new HttpError(409, "Use or discard the current preview before undoing.");
  if (args.action === "undo" && !previous) throw new HttpError(409, "There is no previous mansion theme to restore.");
  args.db.exec("BEGIN IMMEDIATE");
  try {
    const updateLogicalId = args.db.prepare(
      `UPDATE debate_mystery_mansion_asset_refs SET logical_id = ?, created_at = ?
        WHERE bundle_id = ? AND user_id = ? AND role = 'music' AND logical_id = ?`,
    );
    if (args.action === "discard") {
      args.db.prepare(
        `DELETE FROM debate_mystery_mansion_asset_refs
          WHERE bundle_id = ? AND user_id = ? AND role = 'music' AND logical_id = ?`,
      ).run(args.bundleId, args.userId, MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1);
      metadata.music.candidateTitle = null;
      metadata.music.candidateLens = null;
      metadata.music.candidateLoop = null;
      metadata.music.candidateValidation = null;
    } else if (args.action === "accept") {
      args.db.prepare(
        `DELETE FROM debate_mystery_mansion_asset_refs
          WHERE bundle_id = ? AND user_id = ? AND role = 'music' AND logical_id = ?`,
      ).run(args.bundleId, args.userId, MANSION_MUSIC_PREVIOUS_LOGICAL_ID_V1);
      if (active) {
        updateLogicalId.run(
          MANSION_MUSIC_PREVIOUS_LOGICAL_ID_V1, now,
          args.bundleId, args.userId, MANSION_MUSIC_ACTIVE_LOGICAL_ID_V1,
        );
      }
      updateLogicalId.run(
        MANSION_MUSIC_ACTIVE_LOGICAL_ID_V1, now,
        args.bundleId, args.userId, MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1,
      );
      metadata.music.previousTitle = active ? metadata.music.activeTitle : null;
      metadata.music.previousLoop = active ? metadata.music.activeLoop : null;
      metadata.music.activeTitle = metadata.music.candidateTitle;
      metadata.music.activeLoop = metadata.music.candidateLoop;
      metadata.music.candidateTitle = null;
      metadata.music.candidateLens = null;
      metadata.music.candidateLoop = null;
      metadata.music.candidateValidation = null;
    } else {
      const swapId = "investigation-theme-swap-v1";
      if (active) updateLogicalId.run(swapId, now, args.bundleId, args.userId, MANSION_MUSIC_ACTIVE_LOGICAL_ID_V1);
      updateLogicalId.run(
        MANSION_MUSIC_ACTIVE_LOGICAL_ID_V1, now,
        args.bundleId, args.userId, MANSION_MUSIC_PREVIOUS_LOGICAL_ID_V1,
      );
      if (active) updateLogicalId.run(MANSION_MUSIC_PREVIOUS_LOGICAL_ID_V1, now, args.bundleId, args.userId, swapId);
      const activeTitle = metadata.music.activeTitle;
      const activeLoop = metadata.music.activeLoop;
      metadata.music.activeTitle = metadata.music.previousTitle;
      metadata.music.activeLoop = metadata.music.previousLoop;
      metadata.music.previousTitle = active ? activeTitle : null;
      metadata.music.previousLoop = active ? activeLoop : null;
    }
    writeMusicMetadata(args.db, args.userId, args.bundleId, bundle.library_metadata_json, metadata.music, now);
    cleanupUnreferencedMusicAssets(args.db, args.userId);
    args.db.exec("COMMIT");
  } catch (error) {
    if (args.db.isTransaction) args.db.exec("ROLLBACK");
    throw error;
  }
}

export function acceptDebateMysteryMansionThemeV1(db: DatabaseSync, userId: string, bundleId: string): void {
  mutateThemeRefs({ db, userId, bundleId, action: "accept" });
}

/** Field repair deliberately reveals no audio preview. The generated track
 * still passes the provider, duration, byte-size, and MIME gates above; it is
 * accepted without browser-only decoded-loop analysis and plays as a normal
 * whole-file background loop until the venue is edited in the Library. */
export function acceptDebateMysteryMansionThemeFieldRepairV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
): void {
  const bundle = readBundle(db, userId, bundleId);
  const parsed = musicMetadata(bundle.library_metadata_json);
  if (!themeRef(db, userId, bundleId, MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1)) {
    throw new HttpError(409, "Generate replacement music before accepting it.");
  }
  parsed.music.candidateValidation = null;
  parsed.music.candidateLoop = null;
  writeMusicMetadata(
    db,
    userId,
    bundleId,
    bundle.library_metadata_json,
    parsed.music,
    new Date().toISOString(),
  );
  mutateThemeRefs({ db, userId, bundleId, action: "accept" });
}

export function undoDebateMysteryMansionThemeFieldRepairV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  hadActiveTheme: boolean,
): void {
  if (hadActiveTheme) {
    mutateThemeRefs({ db, userId, bundleId, action: "undo" });
    return;
  }
  const bundle = readBundle(db, userId, bundleId);
  const parsed = musicMetadata(bundle.library_metadata_json);
  db.prepare(
    `DELETE FROM debate_mystery_mansion_asset_refs
      WHERE bundle_id = ? AND user_id = ? AND role = 'music' AND logical_id = ?`,
  ).run(bundleId, userId, MANSION_MUSIC_ACTIVE_LOGICAL_ID_V1);
  parsed.music.activeTitle = null;
  parsed.music.activeLoop = null;
  parsed.music.previousTitle = null;
  parsed.music.previousLoop = null;
  writeMusicMetadata(
    db,
    userId,
    bundleId,
    bundle.library_metadata_json,
    parsed.music,
    new Date().toISOString(),
  );
  cleanupUnreferencedMusicAssets(db, userId);
}

export function discardDebateMysteryMansionThemeV1(db: DatabaseSync, userId: string, bundleId: string): void {
  mutateThemeRefs({ db, userId, bundleId, action: "discard" });
}

export function undoDebateMysteryMansionThemeV1(db: DatabaseSync, userId: string, bundleId: string): void {
  mutateThemeRefs({ db, userId, bundleId, action: "undo" });
}

import type { DatabaseSync } from "node:sqlite";
import {
  SLATE_MIRROR_SCHEMA_VERSION,
  slateMirrorSampleEligibility,
  slateSha256,
  type SlateDocumentAnchor,
  type SlateMirrorBinding,
  type SlateMirrorOverlay,
  type SlateMirrorProfile,
  type SlateMirrorProfileVersion,
  type SlateMirrorSample,
  type SlateMirrorSampleProvenance,
  type SlateMirrorSampleSourceKind,
  type SlateMirrorVoiceCard,
} from "@localai/shared";
import { randomId } from "./security.ts";

const PROFILE_NAME_MAX = 160;
const PEN_NAME_MAX = 160;
const SAMPLE_TEXT_MAX = 120_000;
const VOICE_CARD_ITEM_MAX = 1_200;
const VOICE_CARD_ITEMS_MAX = 40;
const OVERLAY_DIRECTION_MAX = 8_000;
const OVERLAY_LABEL_MAX = 160;

interface ProfileRow {
  id: string;
  user_id: string;
  name: string;
  pen_name: string | null;
  frozen: number;
  created_at: string;
  updated_at: string;
}

interface VersionRow {
  id: string;
  profile_id: string;
  version: number;
  voice_card_json: string;
  eligibility_summary_json: string;
  created_at: string;
}

interface SampleRow {
  id: string;
  user_id: string;
  profile_id: string;
  project_id: string | null;
  section_id: string | null;
  kind: string;
  eligibility: string;
  source_hash: string;
  sample_text: string;
  provenance_json: string;
  created_at: string;
}

interface BindingRow {
  project_id: string;
  user_id: string;
  profile_version_id: string;
  project_overlay_json: string;
  pov_overlays_json: string;
  created_at: string;
  updated_at: string;
}

interface VersionMetadata {
  schemaVersion: 1;
  parentVersionId: string | null;
  status: "published";
  sampleIds: string[];
  sourceFingerprint: string;
  eligibleSampleCount: number;
  excludedSampleCount: number;
  publishedAt: string;
}

export interface SlateMirrorSampleInput {
  sourceKind: SlateMirrorSampleSourceKind;
  text: unknown;
  explicitlyIncluded: unknown;
  writerOwnsRights: unknown;
  containsThirdPartyMaterial?: unknown;
  humanRewriteConfirmed?: unknown;
  projectId?: unknown;
  sectionId?: unknown;
  sectionRevision?: unknown;
  anchor?: unknown;
  originatingOperationId?: unknown;
}

export interface SlateMirrorOverlayInput {
  id?: unknown;
  label: unknown;
  direction: unknown;
  povCharacterId?: unknown;
}

export interface SlateMirrorProjectBindingDetail {
  binding: SlateMirrorBinding;
  profile: SlateMirrorProfile;
  profileVersion: SlateMirrorProfileVersion;
}

export class SlateMirrorError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = "slate_mirror") {
    super(message);
    this.name = "SlateMirrorError";
    this.status = status;
    this.code = code;
  }
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedText(
  value: unknown,
  label: string,
  maximum: number,
  required = true,
): string {
  if (typeof value !== "string") {
    if (required) throw new SlateMirrorError(`${label} is required.`);
    return "";
  }
  const normalized = value.normalize("NFKC").trim();
  if (required && !normalized) {
    throw new SlateMirrorError(`${label} is required.`);
  }
  if (normalized.length > maximum) {
    throw new SlateMirrorError(`${label} is too long.`);
  }
  return normalized;
}

function optionalId(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  return boundedText(value, label, 240);
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function finiteRevision(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

function normalizeStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new SlateMirrorError(`${label} must be a list.`);
  }
  if (value.length > VOICE_CARD_ITEMS_MAX) {
    throw new SlateMirrorError(`${label} contains too many items.`);
  }
  return value.map((item, index) =>
    boundedText(
      item,
      `${label} item ${index + 1}`,
      VOICE_CARD_ITEM_MAX,
    ),
  );
}

/**
 * Keeps Mirror deliberately narrow: only voice and density traits survive
 * normalization. Word targets and operation scope belong to the Composer.
 */
export function normalizeSlateMirrorVoiceCard(
  value: unknown,
): SlateMirrorVoiceCard {
  const input = record(value);
  if (!input) throw new SlateMirrorError("Mirror Voice Card is required.");
  return {
    narrativeDistance: boundedText(
      input.narrativeDistance,
      "Narrative distance",
      VOICE_CARD_ITEM_MAX,
    ),
    diction: normalizeStringList(input.diction, "Diction"),
    rhythm: normalizeStringList(input.rhythm, "Rhythm"),
    imagery: normalizeStringList(input.imagery, "Imagery"),
    dialogueHabits: normalizeStringList(
      input.dialogueHabits,
      "Dialogue habits",
    ),
    exposition: normalizeStringList(input.exposition, "Exposition"),
    humor: normalizeStringList(input.humor, "Humor"),
    density: normalizeStringList(input.density, "Density"),
    preferences: normalizeStringList(input.preferences, "Preferences"),
    avoidances: normalizeStringList(input.avoidances, "Avoidances"),
    exemplars: normalizeStringList(input.exemplars, "Exemplars"),
  };
}

function profileRow(
  db: DatabaseSync,
  userId: string,
  profileId: string,
): ProfileRow {
  const row = db
    .prepare(
      `SELECT id, user_id, name, pen_name, frozen, created_at, updated_at
         FROM slate_mirror_profiles
        WHERE id = ? AND user_id = ?`,
    )
    .get(profileId, userId) as ProfileRow | undefined;
  if (!row) {
    throw new SlateMirrorError(
      "Mirror profile not found.",
      404,
      "slate_mirror_profile_not_found",
    );
  }
  return row;
}

function latestVersionRow(
  db: DatabaseSync,
  userId: string,
  profileId: string,
): VersionRow | null {
  return (
    (db
      .prepare(
        `SELECT id, profile_id, version, voice_card_json,
                eligibility_summary_json, created_at
           FROM slate_mirror_profile_versions
          WHERE user_id = ? AND profile_id = ?
          ORDER BY version DESC
          LIMIT 1`,
      )
      .get(userId, profileId) as VersionRow | undefined) ?? null
  );
}

function profileFromRow(
  db: DatabaseSync,
  row: ProfileRow,
): SlateMirrorProfile {
  return {
    schemaVersion: SLATE_MIRROR_SCHEMA_VERSION,
    id: row.id,
    userId: row.user_id,
    name: row.name,
    penName: row.pen_name,
    currentVersionId: latestVersionRow(db, row.user_id, row.id)?.id ?? null,
    frozen: row.frozen === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function metadataFromVersionRow(row: VersionRow): VersionMetadata {
  const parsed = parseJson<Partial<VersionMetadata>>(
    row.eligibility_summary_json,
    {},
  );
  const voice = parseJson<unknown>(row.voice_card_json, {});
  return {
    schemaVersion: 1,
    parentVersionId:
      typeof parsed.parentVersionId === "string"
        ? parsed.parentVersionId
        : null,
    status: "published",
    sampleIds: Array.isArray(parsed.sampleIds)
      ? parsed.sampleIds.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    sourceFingerprint:
      typeof parsed.sourceFingerprint === "string" &&
      parsed.sourceFingerprint.trim()
        ? parsed.sourceFingerprint
        : slateSha256(JSON.stringify(voice)),
    eligibleSampleCount:
      typeof parsed.eligibleSampleCount === "number"
        ? Math.max(0, Math.trunc(parsed.eligibleSampleCount))
        : 0,
    excludedSampleCount:
      typeof parsed.excludedSampleCount === "number"
        ? Math.max(0, Math.trunc(parsed.excludedSampleCount))
        : 0,
    publishedAt:
      typeof parsed.publishedAt === "string" && parsed.publishedAt
        ? parsed.publishedAt
        : row.created_at,
  };
}

function versionFromRow(row: VersionRow): SlateMirrorProfileVersion {
  const metadata = metadataFromVersionRow(row);
  return {
    schemaVersion: SLATE_MIRROR_SCHEMA_VERSION,
    id: row.id,
    profileId: row.profile_id,
    version: row.version,
    parentVersionId: metadata.parentVersionId,
    status: "published",
    voiceCard: normalizeSlateMirrorVoiceCard(
      parseJson<unknown>(row.voice_card_json, {}),
    ),
    sampleIds: metadata.sampleIds,
    sourceFingerprint: metadata.sourceFingerprint,
    createdAt: row.created_at,
    publishedAt: metadata.publishedAt,
  };
}

function versionRow(
  db: DatabaseSync,
  userId: string,
  versionId: string,
): VersionRow {
  const row = db
    .prepare(
      `SELECT versions.id, versions.profile_id, versions.version,
              versions.voice_card_json, versions.eligibility_summary_json,
              versions.created_at
         FROM slate_mirror_profile_versions versions
         JOIN slate_mirror_profiles profiles
           ON profiles.id = versions.profile_id
          AND profiles.user_id = versions.user_id
        WHERE versions.id = ? AND versions.user_id = ?`,
    )
    .get(versionId, userId) as VersionRow | undefined;
  if (!row) {
    throw new SlateMirrorError(
      "Mirror profile version not found.",
      404,
      "slate_mirror_version_not_found",
    );
  }
  return row;
}

export function listSlateMirrorProfiles(
  db: DatabaseSync,
  userId: string,
): SlateMirrorProfile[] {
  const rows = db
    .prepare(
      `SELECT id, user_id, name, pen_name, frozen, created_at, updated_at
         FROM slate_mirror_profiles
        WHERE user_id = ?
        ORDER BY updated_at DESC, rowid DESC`,
    )
    .all(userId) as unknown as ProfileRow[];
  return rows.map((row) => profileFromRow(db, row));
}

export function createSlateMirrorProfile(
  db: DatabaseSync,
  userId: string,
  input: { name: unknown; penName?: unknown },
): SlateMirrorProfile {
  const id = randomId();
  const now = new Date().toISOString();
  const name = boundedText(input.name, "Mirror profile name", PROFILE_NAME_MAX);
  const penName =
    input.penName === undefined || input.penName === null || input.penName === ""
      ? null
      : boundedText(input.penName, "Pen name", PEN_NAME_MAX);
  db.prepare(
    `INSERT INTO slate_mirror_profiles
      (id, user_id, name, pen_name, frozen, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
  ).run(id, userId, name, penName, now, now);
  return getSlateMirrorProfile(db, userId, id);
}

export function getSlateMirrorProfile(
  db: DatabaseSync,
  userId: string,
  profileId: string,
): SlateMirrorProfile {
  return profileFromRow(db, profileRow(db, userId, profileId));
}

export function listSlateMirrorProfileVersions(
  db: DatabaseSync,
  userId: string,
  profileId: string,
): SlateMirrorProfileVersion[] {
  profileRow(db, userId, profileId);
  const rows = db
    .prepare(
      `SELECT id, profile_id, version, voice_card_json,
              eligibility_summary_json, created_at
         FROM slate_mirror_profile_versions
        WHERE user_id = ? AND profile_id = ?
        ORDER BY version DESC`,
    )
    .all(userId, profileId) as unknown as VersionRow[];
  return rows.map(versionFromRow);
}

export function getSlateMirrorProfileVersion(
  db: DatabaseSync,
  userId: string,
  versionId: string,
): SlateMirrorProfileVersion {
  return versionFromRow(versionRow(db, userId, versionId));
}

function sourceKind(value: unknown): SlateMirrorSampleSourceKind {
  if (
    value === "writer_owned_sample" ||
    value === "description_exercise" ||
    value === "dialogue_exercise" ||
    value === "interiority_action_exercise" ||
    value === "direct_human_prose" ||
    value === "substantially_rewritten_prose" ||
    value === "direction" ||
    value === "research" ||
    value === "quotation" ||
    value === "import" ||
    value === "untouched_ai_prose"
  ) {
    return value;
  }
  throw new SlateMirrorError("Mirror sample source kind is invalid.");
}

function normalizeAnchor(value: unknown): SlateDocumentAnchor | null {
  if (value === undefined || value === null) return null;
  const input = record(value);
  if (
    !input ||
    typeof input.sourceId !== "string" ||
    typeof input.start !== "number" ||
    typeof input.end !== "number" ||
    typeof input.quoteHash !== "string"
  ) {
    throw new SlateMirrorError("Mirror sample anchor is invalid.");
  }
  return structuredClone(value) as SlateDocumentAnchor;
}

function validateSampleReferences(
  db: DatabaseSync,
  userId: string,
  provenance: SlateMirrorSampleProvenance,
): void {
  if (provenance.projectId) {
    const project = db
      .prepare("SELECT id FROM slate_projects WHERE id = ? AND user_id = ?")
      .get(provenance.projectId, userId);
    if (!project) {
      throw new SlateMirrorError(
        "Mirror sample project not found.",
        404,
        "slate_mirror_sample_project_not_found",
      );
    }
  }
  if (provenance.sectionId) {
    const section = db
      .prepare(
        `SELECT id FROM slate_sections
          WHERE id = ? AND user_id = ?
            AND (? IS NULL OR project_id = ?)`,
      )
      .get(
        provenance.sectionId,
        userId,
        provenance.projectId,
        provenance.projectId,
      );
    if (!section) {
      throw new SlateMirrorError(
        "Mirror sample section not found.",
        404,
        "slate_mirror_sample_section_not_found",
      );
    }
  }
  if (provenance.originatingOperationId) {
    const operation = db
      .prepare(
        `SELECT id FROM slate_writing_operations
          WHERE id = ? AND user_id = ?
            AND (? IS NULL OR project_id = ?)`,
      )
      .get(
        provenance.originatingOperationId,
        userId,
        provenance.projectId,
        provenance.projectId,
      );
    if (!operation) {
      throw new SlateMirrorError(
        "Mirror sample writing operation not found.",
        404,
        "slate_mirror_sample_operation_not_found",
      );
    }
  }
}

interface PreparedSlateMirrorSample {
  kind: SlateMirrorSampleSourceKind;
  text: string;
  textHash: string;
  provenance: SlateMirrorSampleProvenance;
  explicitlyIncluded: boolean;
  eligibilityReason: SlateMirrorSample["eligibilityReason"];
}

function prepareSample(
  db: DatabaseSync,
  userId: string,
  input: SlateMirrorSampleInput,
): PreparedSlateMirrorSample {
  const kind = sourceKind(input.sourceKind);
  const text = boundedText(input.text, "Mirror sample", SAMPLE_TEXT_MAX);
  const provenance: SlateMirrorSampleProvenance = {
    sourceKind: kind,
    projectId: optionalId(input.projectId, "Project id"),
    sectionId: optionalId(input.sectionId, "Section id"),
    sectionRevision: finiteRevision(input.sectionRevision),
    anchor: normalizeAnchor(input.anchor),
    originatingOperationId: optionalId(
      input.originatingOperationId,
      "Writing operation id",
    ),
    writerOwnsRights: booleanValue(input.writerOwnsRights),
    containsThirdPartyMaterial: booleanValue(input.containsThirdPartyMaterial),
    humanRewriteConfirmed: booleanValue(input.humanRewriteConfirmed),
  };
  validateSampleReferences(db, userId, provenance);
  const explicitlyIncluded = booleanValue(input.explicitlyIncluded);
  return {
    kind,
    text,
    textHash: slateSha256(text),
    provenance,
    explicitlyIncluded,
    eligibilityReason: slateMirrorSampleEligibility({
      explicitlyIncluded,
      provenance,
    }).reason,
  };
}

/**
 * Returns only writer-authorized source text that Mirror may send to its
 * synthesizer. Directions, imports, research, quotations, and untouched AI
 * prose never cross this boundary.
 */
export function slateMirrorEligibleSamplesForSynthesis(
  db: DatabaseSync,
  userId: string,
  inputs: readonly SlateMirrorSampleInput[],
): Array<{ sourceKind: SlateMirrorSampleSourceKind; text: string }> {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new SlateMirrorError(
      "A Mirror Voice Card needs at least one source sample.",
    );
  }
  if (inputs.length > 80) {
    throw new SlateMirrorError("Too many Mirror samples were provided.");
  }
  const eligible = inputs
    .map((input) => prepareSample(db, userId, input))
    .filter((sample) => sample.eligibilityReason === "eligible")
    .map((sample) => ({
      sourceKind: sample.kind,
      text: sample.text,
    }));
  if (eligible.length === 0) {
    throw new SlateMirrorError(
      "No eligible writer-owned samples were provided.",
      422,
      "slate_mirror_no_eligible_samples",
    );
  }
  return eligible;
}

function storeSample(
  db: DatabaseSync,
  userId: string,
  profileId: string,
  input: SlateMirrorSampleInput,
  now: string,
): SlateMirrorSample {
  const prepared = prepareSample(db, userId, input);
  const {
    kind,
    text,
    textHash,
    provenance,
    explicitlyIncluded,
    eligibilityReason,
  } = prepared;
  const id = randomId();
  db.prepare(
    `INSERT INTO slate_mirror_samples
      (id, user_id, profile_id, project_id, section_id, kind, eligibility,
       source_hash, sample_text, provenance_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    profileId,
    provenance.projectId,
    provenance.sectionId,
    kind,
    eligibilityReason,
    textHash,
    text,
    JSON.stringify({ ...provenance, explicitlyIncluded }),
    now,
  );
  return {
    schemaVersion: SLATE_MIRROR_SCHEMA_VERSION,
    id,
    userId,
    profileId,
    text,
    textHash,
    provenance,
    explicitlyIncluded,
    eligibilityReason,
    createdAt: now,
  };
}

export function publishSlateMirrorProfileVersion(
  db: DatabaseSync,
  userId: string,
  profileId: string,
  input: {
    voiceCard: unknown;
    samples: readonly SlateMirrorSampleInput[];
  },
): {
  profile: SlateMirrorProfile;
  version: SlateMirrorProfileVersion;
  samples: SlateMirrorSample[];
} {
  const voiceCard = normalizeSlateMirrorVoiceCard(input.voiceCard);
  if (!Array.isArray(input.samples) || input.samples.length === 0) {
    throw new SlateMirrorError(
      "A published Mirror version needs at least one source sample.",
    );
  }
  if (input.samples.length > 80) {
    throw new SlateMirrorError("Too many Mirror samples were provided.");
  }

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const profile = profileRow(db, userId, profileId);
    if (profile.frozen === 1) {
      throw new SlateMirrorError(
        "This Mirror profile is frozen. Unfreeze it before publishing a new version.",
        409,
        "slate_mirror_profile_frozen",
      );
    }
    const previous = latestVersionRow(db, userId, profileId);
    const now = new Date().toISOString();
    const samples = input.samples.map((sample) =>
      storeSample(db, userId, profileId, sample, now),
    );
    const eligible = samples.filter(
      (sample) => sample.eligibilityReason === "eligible",
    );
    if (eligible.length === 0) {
      throw new SlateMirrorError(
        "No eligible writer-owned samples were provided.",
        422,
        "slate_mirror_no_eligible_samples",
      );
    }
    const version = (previous?.version ?? 0) + 1;
    const id = randomId();
    const sourceFingerprint = slateSha256(
      JSON.stringify({
        schemaVersion: SLATE_MIRROR_SCHEMA_VERSION,
        sampleHashes: eligible
          .map((sample) => sample.textHash)
          .sort((a, b) => a.localeCompare(b)),
        voiceCard,
      }),
    );
    const metadata: VersionMetadata = {
      schemaVersion: 1,
      parentVersionId: previous?.id ?? null,
      status: "published",
      sampleIds: eligible.map((sample) => sample.id),
      sourceFingerprint,
      eligibleSampleCount: eligible.length,
      excludedSampleCount: samples.length - eligible.length,
      publishedAt: now,
    };
    db.prepare(
      `INSERT INTO slate_mirror_profile_versions
        (id, user_id, profile_id, version, voice_card_json,
         eligibility_summary_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      userId,
      profileId,
      version,
      JSON.stringify(voiceCard),
      JSON.stringify(metadata),
      now,
    );
    db.prepare(
      `UPDATE slate_mirror_profiles SET updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(now, profileId, userId);
    db.exec("COMMIT");
    return {
      profile: getSlateMirrorProfile(db, userId, profileId),
      version: getSlateMirrorProfileVersion(db, userId, id),
      samples,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function setSlateMirrorProfileFrozen(
  db: DatabaseSync,
  userId: string,
  profileId: string,
  frozen: boolean,
): SlateMirrorProfile {
  profileRow(db, userId, profileId);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE slate_mirror_profiles
        SET frozen = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(frozen ? 1 : 0, now, profileId, userId);
  return getSlateMirrorProfile(db, userId, profileId);
}

function normalizeOverlay(
  kind: "project" | "pov",
  value: SlateMirrorOverlayInput | null | undefined,
  previous: SlateMirrorOverlay | null,
  now: string,
): SlateMirrorOverlay | null {
  if (!value) return null;
  const id = optionalId(value.id, "Mirror overlay id") ?? previous?.id ?? randomId();
  const povCharacterId =
    kind === "pov"
      ? optionalId(value.povCharacterId, "POV character id")
      : null;
  if (kind === "pov" && !povCharacterId) {
    throw new SlateMirrorError("A POV overlay needs a character id.");
  }
  return {
    id,
    kind,
    label: boundedText(value.label, "Mirror overlay label", OVERLAY_LABEL_MAX),
    povCharacterId,
    direction: boundedText(
      value.direction,
      "Mirror overlay direction",
      OVERLAY_DIRECTION_MAX,
    ),
    createdAt: previous?.id === id ? previous.createdAt : now,
    updatedAt: now,
  };
}

function parseOverlay(value: string): SlateMirrorOverlay | null {
  const parsed = parseJson<unknown>(value, null);
  return record(parsed) ? (parsed as unknown as SlateMirrorOverlay) : null;
}

function parsePovOverlays(value: string): SlateMirrorOverlay[] {
  const parsed = parseJson<unknown>(value, []);
  const parsedRecord = record(parsed);
  const values = Array.isArray(parsed)
    ? parsed
    : parsedRecord
      ? Object.values(parsedRecord)
      : [];
  return values.filter(
    (candidate): candidate is SlateMirrorOverlay =>
      Boolean(record(candidate)) &&
      (candidate as SlateMirrorOverlay).kind === "pov",
  );
}

function bindingFromRow(
  db: DatabaseSync,
  userId: string,
  row: BindingRow,
): SlateMirrorProjectBindingDetail {
  const version = getSlateMirrorProfileVersion(
    db,
    userId,
    row.profile_version_id,
  );
  return {
    binding: {
      schemaVersion: SLATE_MIRROR_SCHEMA_VERSION,
      id: row.project_id,
      projectId: row.project_id,
      profileId: version.profileId,
      profileVersionId: row.profile_version_id,
      projectOverlay: parseOverlay(row.project_overlay_json),
      povOverlays: parsePovOverlays(row.pov_overlays_json),
      pinnedAt: row.created_at,
      updatedAt: row.updated_at,
    },
    profile: getSlateMirrorProfile(db, userId, version.profileId),
    profileVersion: version,
  };
}

function bindingRow(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): BindingRow | null {
  return (
    (db
      .prepare(
        `SELECT project_id, user_id, profile_version_id,
                project_overlay_json, pov_overlays_json, created_at, updated_at
           FROM slate_project_mirror_bindings
          WHERE project_id = ? AND user_id = ?`,
      )
      .get(projectId, userId) as BindingRow | undefined) ?? null
  );
}

export function getSlateMirrorProjectBinding(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateMirrorProjectBindingDetail | null {
  const project = db
    .prepare("SELECT id FROM slate_projects WHERE id = ? AND user_id = ?")
    .get(projectId, userId);
  if (!project) {
    throw new SlateMirrorError(
      "Slate project not found.",
      404,
      "slate_project_not_found",
    );
  }
  const row = bindingRow(db, userId, projectId);
  return row ? bindingFromRow(db, userId, row) : null;
}

/**
 * Pins a concrete immutable profile version. A different version requires an
 * explicit repin plus the caller's observed current version.
 */
export function bindSlateMirrorToProject(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  input: {
    profileVersionId: unknown;
    projectOverlay?: SlateMirrorOverlayInput | null;
    povOverlays?: readonly SlateMirrorOverlayInput[];
    repin?: unknown;
    expectedCurrentVersionId?: unknown;
  },
): SlateMirrorProjectBindingDetail {
  const project = db
    .prepare("SELECT id FROM slate_projects WHERE id = ? AND user_id = ?")
    .get(projectId, userId);
  if (!project) {
    throw new SlateMirrorError(
      "Slate project not found.",
      404,
      "slate_project_not_found",
    );
  }
  const profileVersionId = boundedText(
    input.profileVersionId,
    "Mirror profile version id",
    240,
  );
  versionRow(db, userId, profileVersionId);
  const current = bindingRow(db, userId, projectId);
  if (current && current.profile_version_id !== profileVersionId) {
    const expected = optionalId(
      input.expectedCurrentVersionId,
      "Expected current Mirror version id",
    );
    if (input.repin !== true || expected !== current.profile_version_id) {
      throw new SlateMirrorError(
        "Mirror will not silently repin this project. Confirm the current pinned version first.",
        409,
        "slate_mirror_repin_confirmation_required",
      );
    }
  }
  const now = new Date().toISOString();
  const previousProjectOverlay = current
    ? parseOverlay(current.project_overlay_json)
    : null;
  const previousPovOverlays = current
    ? parsePovOverlays(current.pov_overlays_json)
    : [];
  const projectOverlay =
    input.projectOverlay === undefined
      ? previousProjectOverlay
      : normalizeOverlay(
          "project",
          input.projectOverlay,
          previousProjectOverlay,
          now,
        );
  const povOverlays =
    input.povOverlays === undefined
      ? previousPovOverlays
      : input.povOverlays.map((overlay) => {
          const id = optionalId(overlay.id, "POV overlay id");
          return normalizeOverlay(
            "pov",
            overlay,
            previousPovOverlays.find((candidate) => candidate.id === id) ?? null,
            now,
          )!;
        });

  if (current) {
    db.prepare(
      `UPDATE slate_project_mirror_bindings
          SET profile_version_id = ?, project_overlay_json = ?,
              pov_overlays_json = ?, updated_at = ?
        WHERE project_id = ? AND user_id = ?`,
    ).run(
      profileVersionId,
      projectOverlay ? JSON.stringify(projectOverlay) : "{}",
      JSON.stringify(povOverlays),
      now,
      projectId,
      userId,
    );
  } else {
    db.prepare(
      `INSERT INTO slate_project_mirror_bindings
        (project_id, user_id, profile_version_id, project_overlay_json,
         pov_overlays_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      projectId,
      userId,
      profileVersionId,
      projectOverlay ? JSON.stringify(projectOverlay) : "{}",
      JSON.stringify(povOverlays),
      now,
      now,
    );
  }
  return bindingFromRow(db, userId, bindingRow(db, userId, projectId)!);
}

export function listSlateMirrorSamples(
  db: DatabaseSync,
  userId: string,
  profileId: string,
): SlateMirrorSample[] {
  profileRow(db, userId, profileId);
  const rows = db
    .prepare(
      `SELECT id, user_id, profile_id, project_id, section_id, kind,
              eligibility, source_hash, sample_text, provenance_json, created_at
         FROM slate_mirror_samples
        WHERE user_id = ? AND profile_id = ?
        ORDER BY created_at DESC, rowid DESC`,
    )
    .all(userId, profileId) as unknown as SampleRow[];
  return rows.map((row) => {
    const stored = parseJson<
      SlateMirrorSampleProvenance & { explicitlyIncluded?: boolean }
    >(row.provenance_json, {
      sourceKind: sourceKind(row.kind),
      projectId: row.project_id,
      sectionId: row.section_id,
      sectionRevision: null,
      anchor: null,
      originatingOperationId: null,
      writerOwnsRights: false,
      containsThirdPartyMaterial: false,
      humanRewriteConfirmed: false,
    });
    const { explicitlyIncluded = false, ...provenance } = stored;
    return {
      schemaVersion: SLATE_MIRROR_SCHEMA_VERSION,
      id: row.id,
      userId: row.user_id,
      profileId: row.profile_id,
      text: row.sample_text,
      textHash: row.source_hash,
      provenance,
      explicitlyIncluded,
      eligibilityReason:
        row.eligibility as SlateMirrorSample["eligibilityReason"],
      createdAt: row.created_at,
    };
  });
}

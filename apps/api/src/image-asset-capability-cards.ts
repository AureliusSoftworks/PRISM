import type { DatabaseSync } from "node:sqlite";
import {
  ITEM_CAPABILITY_CARD_STATUSES_V1,
  isWhodunnitPropArchetypeIdV1,
  type ImageAssetKind,
  type ItemCapabilityAnalysisProvenanceV1,
  type ItemCapabilityCardStatusV1,
  type ItemCapabilityCardV1,
  type ItemCapabilityV1,
  type WhodunnitPropArchetypeIdV1,
} from "@localai/shared";

export const ITEM_CAPABILITY_READY_CONFIDENCE_MIN_V1 = 0.68;
export const ITEM_CAPABILITY_ANALYSIS_PROMPT_VERSION_V1 =
  "item-capability-card-v1";

const ELIGIBLE_KINDS = new Set<ImageAssetKind>(["item", "debate_exhibit"]);

interface ItemCapabilityCardRow {
  asset_set_id: string;
  status: string;
  exact_identity: string;
  what_it_does: string;
  primary_archetype: string | null;
  capabilities_json: string;
  limitations_json: string;
  setting_tags_json: string;
  genre_tags_json: string;
  confidence: number;
  provenance_json: string | null;
  player_edited: number | bigint;
  created_at: string;
  updated_at: string;
}

interface EligibleAssetRow {
  asset_set_id: string;
  kind: ImageAssetKind;
  title: string;
  source_context_json: string;
  image_id: string;
  image_url: string;
  local_rel_path: string | null;
  content_sha256: string | null;
  prompt: string;
  revised_prompt: string | null;
}

export interface ItemCapabilityAnalysisInputV1 {
  assetSetId: string;
  kind: "item" | "debate_exhibit";
  name: string;
  prompt: string;
  appletContext: Record<string, unknown>;
  image: {
    id: string;
    url: string;
    localRelPath: string | null;
    contentSha256: string | null;
  };
}

export interface ItemCapabilityAnalysisDraftV1 {
  exactIdentity: string;
  whatItDoes: string;
  primaryArchetype: WhodunnitPropArchetypeIdV1;
  capabilities: ItemCapabilityV1[];
  limitations: string[];
  settingTags: string[];
  genreTags: string[];
  confidence: number;
}

/** Provider adapters are injected by the caller; this service never calls one. */
export interface ItemCapabilityAnalyzerV1 {
  lane: "local" | "online";
  analyzerId: string;
  model?: string | null;
  analyze(input: ItemCapabilityAnalysisInputV1): Promise<unknown>;
}

export interface AnalyzeItemCapabilityCardOptionsV1 {
  lane: "local" | "online";
  analyzer?: ItemCapabilityAnalyzerV1 | null;
  now?: string;
  overwritePlayerEdits?: boolean;
}

export interface AnalyzeItemCapabilityCardResultV1 {
  card: ItemCapabilityCardV1;
  attempted: boolean;
  reason:
    | "ready"
    | "needs_review"
    | "analyzer_unavailable"
    | "analysis_failed"
    | "player_edit_preserved"
    | "disabled";
}

export interface UpdateItemCapabilityCardInputV1 {
  exactIdentity?: unknown;
  whatItDoes?: unknown;
  primaryArchetype?: unknown;
  capabilities?: unknown;
  limitations?: unknown;
  settingTags?: unknown;
  genreTags?: unknown;
  status?: unknown;
}

export interface ReadyWhodunnitItemCapabilityCandidateV1 {
  assetSetId: string;
  kind: "item" | "debate_exhibit";
  imageId: string;
  localRelPath: string;
  title: string;
  prompt: string;
  revisedPrompt: string | null;
  sourceContext: Record<string, unknown>;
  card: ItemCapabilityCardV1;
}

export class ItemCapabilityCardError extends Error {
  readonly code: "not_found" | "invalid" | "privacy_lane";

  constructor(code: ItemCapabilityCardError["code"], message: string) {
    super(message);
    this.name = "ItemCapabilityCardError";
    this.code = code;
  }
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function parseRecord(raw: string | null): Record<string, unknown> {
  const parsed = parseJson(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function compactText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/gu, " ").slice(0, maxLength)
    : "";
}

function normalizedStrings(
  value: unknown,
  maxCount: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((entry) => compactText(entry, maxLength))
        .filter(Boolean),
    ),
  ].slice(0, maxCount);
}

function normalizedCapabilities(value: unknown): ItemCapabilityV1[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, ItemCapabilityV1>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const id = compactText(record.id, 64)
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "_")
      .replace(/^_+|_+$/gu, "");
    const description = compactText(record.description, 240);
    if (!id || !description || byId.has(id)) continue;
    byId.set(id, { id, description });
    if (byId.size >= 12) break;
  }
  return [...byId.values()];
}

function boundedConfidence(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0;
}

function normalizedStatus(value: unknown): ItemCapabilityCardStatusV1 {
  return typeof value === "string" &&
    (ITEM_CAPABILITY_CARD_STATUSES_V1 as readonly string[]).includes(value)
    ? (value as ItemCapabilityCardStatusV1)
    : "pending";
}

function normalizedProvenance(
  value: unknown,
): ItemCapabilityAnalysisProvenanceV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const source = record.source === "player_edit" ? "player_edit" : "analysis";
  const lane =
    record.lane === "local" ||
    record.lane === "online" ||
    record.lane === "player"
      ? record.lane
      : source === "player_edit"
        ? "player"
        : "local";
  return {
    source,
    lane,
    analyzerId: compactText(record.analyzerId, 120),
    model: compactText(record.model, 160) || null,
    promptVersion: compactText(record.promptVersion, 80) || null,
    inputImageId: compactText(record.inputImageId, 160) || null,
    inputContentSha256:
      typeof record.inputContentSha256 === "string" &&
      /^[a-f0-9]{64}$/u.test(record.inputContentSha256)
        ? record.inputContentSha256
        : null,
    analyzedAt:
      compactText(record.analyzedAt, 48) || new Date(0).toISOString(),
  };
}

function rowToCard(row: ItemCapabilityCardRow): ItemCapabilityCardV1 {
  const primaryArchetype = isWhodunnitPropArchetypeIdV1(row.primary_archetype)
    ? row.primary_archetype
    : null;
  return {
    version: 1,
    assetSetId: row.asset_set_id,
    status: normalizedStatus(row.status),
    exactIdentity: compactText(row.exact_identity, 160),
    whatItDoes: compactText(row.what_it_does, 800),
    primaryArchetype,
    capabilities: normalizedCapabilities(parseJson(row.capabilities_json)),
    limitations: normalizedStrings(parseJson(row.limitations_json), 12, 240),
    settingTags: normalizedStrings(parseJson(row.setting_tags_json), 16, 64),
    genreTags: normalizedStrings(parseJson(row.genre_tags_json), 16, 64),
    confidence: boundedConfidence(row.confidence),
    provenance: normalizedProvenance(parseJson(row.provenance_json)),
    playerEdited: Number(row.player_edited) > 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function ensureItemCapabilityCardSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS image_asset_item_capability_cards (
      asset_set_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'ready', 'needs_review', 'disabled')),
      exact_identity TEXT NOT NULL DEFAULT '',
      what_it_does TEXT NOT NULL DEFAULT '',
      primary_archetype TEXT,
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      limitations_json TEXT NOT NULL DEFAULT '[]',
      setting_tags_json TEXT NOT NULL DEFAULT '[]',
      genre_tags_json TEXT NOT NULL DEFAULT '[]',
      confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
      provenance_json TEXT,
      player_edited INTEGER NOT NULL DEFAULT 0 CHECK (player_edited IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(asset_set_id) REFERENCES image_asset_sets(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_image_asset_capability_cards_user_status
      ON image_asset_item_capability_cards(user_id, status, primary_archetype);
    CREATE TRIGGER IF NOT EXISTS image_asset_capability_card_owner_insert
    BEFORE INSERT ON image_asset_item_capability_cards
    WHEN NOT EXISTS (
      SELECT 1 FROM image_asset_sets
       WHERE id = NEW.asset_set_id
         AND user_id = NEW.user_id
         AND kind IN ('item', 'debate_exhibit')
    )
    BEGIN
      SELECT RAISE(ABORT, 'item capability card tenant or kind mismatch');
    END;
    CREATE TRIGGER IF NOT EXISTS image_asset_capability_card_owner_update
    BEFORE UPDATE OF asset_set_id, user_id ON image_asset_item_capability_cards
    WHEN NOT EXISTS (
      SELECT 1 FROM image_asset_sets
       WHERE id = NEW.asset_set_id
         AND user_id = NEW.user_id
         AND kind IN ('item', 'debate_exhibit')
    )
    BEGIN
      SELECT RAISE(ABORT, 'item capability card tenant or kind mismatch');
    END;
  `);
}

function eligibleAsset(
  db: DatabaseSync,
  userId: string,
  assetSetId: string,
): EligibleAssetRow | null {
  const row = db
    .prepare(
      `SELECT sets.id AS asset_set_id, sets.kind, sets.title,
              sets.source_context_json, images.id AS image_id,
              images.url AS image_url, images.local_rel_path,
              images.content_sha256, images.prompt, images.revised_prompt
         FROM image_asset_sets sets
         JOIN image_asset_set_items items
           ON items.set_id = sets.id AND items.role = 'primary'
         JOIN images
           ON images.id = items.image_id AND images.user_id = sets.user_id
        WHERE sets.id = ?
          AND sets.user_id = ?
          AND sets.kind IN ('item', 'debate_exhibit')
        LIMIT 1`,
    )
    .get(assetSetId, userId) as unknown as EligibleAssetRow | undefined;
  return row ?? null;
}

function existingCard(
  db: DatabaseSync,
  userId: string,
  assetSetId: string,
): ItemCapabilityCardV1 | null {
  const row = db
    .prepare(
      `SELECT * FROM image_asset_item_capability_cards
        WHERE asset_set_id = ? AND user_id = ?`,
    )
    .get(assetSetId, userId) as unknown as ItemCapabilityCardRow | undefined;
  return row ? rowToCard(row) : null;
}

export function ensurePendingItemCapabilityCard(
  db: DatabaseSync,
  userId: string,
  assetSetId: string,
  now = new Date().toISOString(),
): ItemCapabilityCardV1 {
  ensureItemCapabilityCardSchema(db);
  const asset = eligibleAsset(db, userId, assetSetId);
  if (!asset) {
    throw new ItemCapabilityCardError(
      "not_found",
      "An owned Item or Debate exhibit asset set is required.",
    );
  }
  db.prepare(
    `INSERT OR IGNORE INTO image_asset_item_capability_cards
       (asset_set_id, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
  ).run(assetSetId, userId, now, now);
  return existingCard(db, userId, assetSetId)!;
}

export function itemCapabilityCardsForAssetSets(
  db: DatabaseSync,
  userId: string,
  sets: readonly { id: string; kind: ImageAssetKind }[],
): Map<string, ItemCapabilityCardV1> {
  ensureItemCapabilityCardSchema(db);
  const eligible = sets.filter((set) => ELIGIBLE_KINDS.has(set.kind));
  if (eligible.length === 0) return new Map();
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO image_asset_item_capability_cards
       (asset_set_id, user_id, created_at, updated_at)
     SELECT id, user_id, ?, ? FROM image_asset_sets
      WHERE id = ? AND user_id = ? AND kind IN ('item', 'debate_exhibit')`,
  );
  for (const set of eligible) insert.run(now, now, set.id, userId);
  const ids = eligible.map((set) => set.id);
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT * FROM image_asset_item_capability_cards
        WHERE user_id = ? AND asset_set_id IN (${placeholders})`,
    )
    .all(userId, ...ids) as unknown as ItemCapabilityCardRow[];
  return new Map(rows.map((row) => [row.asset_set_id, rowToCard(row)]));
}

export function getItemCapabilityCard(
  db: DatabaseSync,
  userId: string,
  assetSetId: string,
  options: { createPending?: boolean } = {},
): ItemCapabilityCardV1 | null {
  ensureItemCapabilityCardSchema(db);
  const current = existingCard(db, userId, assetSetId);
  if (current || options.createPending === false) return current;
  return ensurePendingItemCapabilityCard(db, userId, assetSetId);
}

function completeCardFields(fields: {
  exactIdentity: string;
  whatItDoes: string;
  primaryArchetype: WhodunnitPropArchetypeIdV1 | null;
  capabilities: readonly ItemCapabilityV1[];
}): boolean {
  return Boolean(
    fields.exactIdentity &&
      fields.whatItDoes &&
      fields.primaryArchetype &&
      fields.capabilities.length > 0,
  );
}

function persistCardFields(
  db: DatabaseSync,
  userId: string,
  assetSetId: string,
  fields: {
    status: ItemCapabilityCardStatusV1;
    exactIdentity: string;
    whatItDoes: string;
    primaryArchetype: WhodunnitPropArchetypeIdV1 | null;
    capabilities: ItemCapabilityV1[];
    limitations: string[];
    settingTags: string[];
    genreTags: string[];
    confidence: number;
    provenance: ItemCapabilityAnalysisProvenanceV1 | null;
    playerEdited: boolean;
    updatedAt: string;
  },
): ItemCapabilityCardV1 {
  const result = db
    .prepare(
      `UPDATE image_asset_item_capability_cards
          SET status = ?, exact_identity = ?, what_it_does = ?,
              primary_archetype = ?, capabilities_json = ?, limitations_json = ?,
              setting_tags_json = ?, genre_tags_json = ?, confidence = ?,
              provenance_json = ?, player_edited = ?, updated_at = ?
        WHERE asset_set_id = ? AND user_id = ?`,
    )
    .run(
      fields.status,
      fields.exactIdentity,
      fields.whatItDoes,
      fields.primaryArchetype,
      JSON.stringify(fields.capabilities),
      JSON.stringify(fields.limitations),
      JSON.stringify(fields.settingTags),
      JSON.stringify(fields.genreTags),
      fields.confidence,
      fields.provenance ? JSON.stringify(fields.provenance) : null,
      fields.playerEdited ? 1 : 0,
      fields.updatedAt,
      assetSetId,
      userId,
    );
  if (Number(result.changes) !== 1) {
    throw new ItemCapabilityCardError("not_found", "Capability card not found.");
  }
  return existingCard(db, userId, assetSetId)!;
}

export function updateItemCapabilityCard(
  db: DatabaseSync,
  userId: string,
  assetSetId: string,
  patch: UpdateItemCapabilityCardInputV1,
  now = new Date().toISOString(),
): ItemCapabilityCardV1 {
  const current = ensurePendingItemCapabilityCard(db, userId, assetSetId, now);
  const exactIdentity =
    patch.exactIdentity === undefined
      ? current.exactIdentity
      : compactText(patch.exactIdentity, 160);
  const whatItDoes =
    patch.whatItDoes === undefined
      ? current.whatItDoes
      : compactText(patch.whatItDoes, 800);
  const primaryArchetype =
    patch.primaryArchetype === undefined
      ? current.primaryArchetype
      : isWhodunnitPropArchetypeIdV1(patch.primaryArchetype)
        ? patch.primaryArchetype
        : null;
  const capabilities =
    patch.capabilities === undefined
      ? current.capabilities
      : normalizedCapabilities(patch.capabilities);
  const limitations =
    patch.limitations === undefined
      ? current.limitations
      : normalizedStrings(patch.limitations, 12, 240);
  const settingTags =
    patch.settingTags === undefined
      ? current.settingTags
      : normalizedStrings(patch.settingTags, 16, 64);
  const genreTags =
    patch.genreTags === undefined
      ? current.genreTags
      : normalizedStrings(patch.genreTags, 16, 64);
  const requestedStatus = normalizedStatus(patch.status);
  const status =
    requestedStatus === "disabled"
      ? "disabled"
      : completeCardFields({
            exactIdentity,
            whatItDoes,
            primaryArchetype,
            capabilities,
          })
        ? "ready"
        : "needs_review";
  const provenance: ItemCapabilityAnalysisProvenanceV1 = {
    source: "player_edit",
    lane: "player",
    analyzerId: "player",
    model: null,
    promptVersion: null,
    inputImageId: current.provenance?.inputImageId ?? null,
    inputContentSha256: current.provenance?.inputContentSha256 ?? null,
    analyzedAt: now,
  };
  return persistCardFields(db, userId, assetSetId, {
    status,
    exactIdentity,
    whatItDoes,
    primaryArchetype,
    capabilities,
    limitations,
    settingTags,
    genreTags,
    confidence: status === "ready" ? 1 : current.confidence,
    provenance,
    playerEdited: true,
    updatedAt: now,
  });
}

export function disableItemCapabilityCard(
  db: DatabaseSync,
  userId: string,
  assetSetId: string,
  now = new Date().toISOString(),
): ItemCapabilityCardV1 {
  const current = ensurePendingItemCapabilityCard(db, userId, assetSetId, now);
  return persistCardFields(db, userId, assetSetId, {
    ...current,
    status: "disabled",
    playerEdited: true,
    updatedAt: now,
  });
}

function analysisDraft(value: unknown): ItemCapabilityAnalysisDraftV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const exactIdentity = compactText(record.exactIdentity, 160);
  const whatItDoes = compactText(record.whatItDoes, 800);
  const primaryArchetype = isWhodunnitPropArchetypeIdV1(record.primaryArchetype)
    ? record.primaryArchetype
    : null;
  const capabilities = normalizedCapabilities(record.capabilities);
  if (
    !completeCardFields({
      exactIdentity,
      whatItDoes,
      primaryArchetype,
      capabilities,
    })
  ) {
    return null;
  }
  return {
    exactIdentity,
    whatItDoes,
    primaryArchetype: primaryArchetype!,
    capabilities,
    limitations: normalizedStrings(record.limitations, 12, 240),
    settingTags: normalizedStrings(record.settingTags, 16, 64),
    genreTags: normalizedStrings(record.genreTags, 16, 64),
    confidence: boundedConfidence(record.confidence),
  };
}

function analysisInput(asset: EligibleAssetRow): ItemCapabilityAnalysisInputV1 {
  return {
    assetSetId: asset.asset_set_id,
    kind: asset.kind as "item" | "debate_exhibit",
    name: asset.title,
    prompt: asset.revised_prompt?.trim() || asset.prompt,
    appletContext: parseRecord(asset.source_context_json),
    image: {
      id: asset.image_id,
      url: asset.image_url,
      localRelPath: asset.local_rel_path,
      contentSha256: asset.content_sha256,
    },
  };
}

export async function analyzeItemCapabilityCard(
  db: DatabaseSync,
  userId: string,
  assetSetId: string,
  options: AnalyzeItemCapabilityCardOptionsV1,
): Promise<AnalyzeItemCapabilityCardResultV1> {
  const now = options.now ?? new Date().toISOString();
  const current = ensurePendingItemCapabilityCard(db, userId, assetSetId, now);
  if (current.status === "disabled") {
    return { card: current, attempted: false, reason: "disabled" };
  }
  if (current.playerEdited && !options.overwritePlayerEdits) {
    return {
      card: current,
      attempted: false,
      reason: "player_edit_preserved",
    };
  }
  if (!options.analyzer) {
    return {
      card: current,
      attempted: false,
      reason: "analyzer_unavailable",
    };
  }
  if (options.analyzer.lane !== options.lane) {
    throw new ItemCapabilityCardError(
      "privacy_lane",
      options.lane === "local"
        ? "LOCAL capability analysis requires an injected LOCAL analyzer."
        : "Capability analysis must remain in its originating privacy lane.",
    );
  }
  const asset = eligibleAsset(db, userId, assetSetId);
  if (!asset) {
    throw new ItemCapabilityCardError(
      "not_found",
      "An owned Item or Debate exhibit asset set is required.",
    );
  }
  let raw: unknown;
  try {
    raw = await options.analyzer.analyze(analysisInput(asset));
  } catch {
    return { card: current, attempted: true, reason: "analysis_failed" };
  }
  const draft = analysisDraft(raw);
  const provenance: ItemCapabilityAnalysisProvenanceV1 = {
    source: "analysis",
    lane: options.lane,
    analyzerId: compactText(options.analyzer.analyzerId, 120) || "unknown",
    model: compactText(options.analyzer.model, 160) || null,
    promptVersion: ITEM_CAPABILITY_ANALYSIS_PROMPT_VERSION_V1,
    inputImageId: asset.image_id,
    inputContentSha256:
      asset.content_sha256 && /^[a-f0-9]{64}$/u.test(asset.content_sha256)
        ? asset.content_sha256
        : null,
    analyzedAt: now,
  };
  if (!draft) {
    const card = persistCardFields(db, userId, assetSetId, {
      ...current,
      status: "needs_review",
      confidence: 0,
      provenance,
      playerEdited: false,
      updatedAt: now,
    });
    return { card, attempted: true, reason: "needs_review" };
  }
  const status =
    draft.confidence >= ITEM_CAPABILITY_READY_CONFIDENCE_MIN_V1
      ? "ready"
      : "needs_review";
  const card = persistCardFields(db, userId, assetSetId, {
    status,
    ...draft,
    provenance,
    playerEdited: false,
    updatedAt: now,
  });
  return {
    card,
    attempted: true,
    reason: status === "ready" ? "ready" : "needs_review",
  };
}

export async function retryItemCapabilityCard(
  db: DatabaseSync,
  userId: string,
  assetSetId: string,
  options: Omit<AnalyzeItemCapabilityCardOptionsV1, "overwritePlayerEdits">,
): Promise<AnalyzeItemCapabilityCardResultV1> {
  return analyzeItemCapabilityCard(db, userId, assetSetId, {
    ...options,
    overwritePlayerEdits: true,
  });
}

export function listReadyWhodunnitItemCapabilityCandidates(
  db: DatabaseSync,
  userId: string,
  limit = 80,
): ReadyWhodunnitItemCapabilityCandidateV1[] {
  ensureItemCapabilityCardSchema(db);
  const boundedLimit = Math.min(160, Math.max(1, Math.floor(limit)));
  const rows = db
    .prepare(
      `SELECT sets.id AS asset_set_id, sets.kind, sets.title,
              sets.source_context_json, images.id AS image_id,
              images.local_rel_path, images.prompt, images.revised_prompt,
              cards.*
         FROM image_asset_item_capability_cards cards
         JOIN image_asset_sets sets
           ON sets.id = cards.asset_set_id AND sets.user_id = cards.user_id
         JOIN image_asset_set_items items
           ON items.set_id = sets.id AND items.role = 'primary'
         JOIN images
           ON images.id = items.image_id AND images.user_id = sets.user_id
        WHERE cards.user_id = ?
          AND cards.status = 'ready'
          AND cards.confidence >= ?
          AND cards.primary_archetype IS NOT NULL
          AND sets.status = 'ready'
          AND sets.kind IN ('item', 'debate_exhibit')
          AND TRIM(COALESCE(images.local_rel_path, '')) <> ''
        ORDER BY sets.updated_at DESC, sets.id DESC
        LIMIT ?`,
    )
    .all(
      userId,
      ITEM_CAPABILITY_READY_CONFIDENCE_MIN_V1,
      boundedLimit,
    ) as unknown as Array<
    ItemCapabilityCardRow & {
      asset_set_id: string;
      kind: "item" | "debate_exhibit";
      title: string;
      source_context_json: string;
      image_id: string;
      local_rel_path: string;
      prompt: string;
      revised_prompt: string | null;
    }
  >;
  return rows.map((row) => ({
    assetSetId: row.asset_set_id,
    kind: row.kind,
    imageId: row.image_id,
    localRelPath: row.local_rel_path,
    title: row.title,
    prompt: row.prompt,
    revisedPrompt: row.revised_prompt,
    sourceContext: parseRecord(row.source_context_json),
    card: rowToCard(row),
  }));
}

import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  SLATE_CREATIVE_STUDIOS_SCHEMA_VERSION,
  type PrismReviewArtifactV1,
  type PrismReviewerSnapshotV1,
  type SlateReviewCircleGuest,
  type SlateReviewCircleRoomNote,
  type SlateReviewCircleSession,
  type SlateReviewCircleVerdict,
  type SlateSourceShelfItem,
  type SlateSourceShelfKind,
  type SlateVisualReference,
  type SlateVisualReferenceKind,
} from "@localai/shared";
import { createSlateContinuitySource } from "./slate-continuity.ts";
import type { LlmProvider } from "./providers.ts";
import { runPrismReviewV1 } from "./reviews.ts";
import { randomId } from "./security.ts";

const SOURCE_TITLE_MAX = 240;
const SOURCE_CONTENT_MAX = 200_000;
const VISUAL_PROMPT_MAX = 12_000;
const REVIEW_GUEST_BRIEF_MAX = 4_000;

interface ProjectStudioRow {
  id: string;
  series_id: string;
  title: string;
  prose_mode: string;
  continuity_active_version: string;
  continuity_active_generation: number;
}

interface SourceShelfRow {
  id: string;
  project_id: string;
  title: string;
  kind: string;
  content: string;
  metadata_json: string;
  promoted_source_id: string | null;
  mirror_eligible: number;
  created_at: string;
  updated_at: string;
}

interface VisualRow {
  id: string;
  project_id: string;
  section_id: string | null;
  kind: string;
  status: string;
  image_id: string | null;
  prompt: string;
  reference_state_json: string;
  provider: string;
  model: string;
  created_at: string;
  pinned_at: string | null;
  series_id: string;
  active_generation: number;
}

interface ReviewSessionRow {
  id: string;
  project_id: string;
  section_id: string;
  artifact_json: string;
  section_revisions_json: string;
  continuity_version: string;
  continuity_generation: number;
  provider: string;
  model: string | null;
  created_at: string;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function boundedText(
  value: unknown,
  label: string,
  maximum: number,
  required = false,
): string {
  if (typeof value !== "string") {
    if (required) throw new Error(`${label} is required.`);
    return "";
  }
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maximum) {
    throw new Error(`${label} must be ${maximum.toLocaleString()} characters or fewer.`);
  }
  return normalized;
}

function studioProject(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): ProjectStudioRow {
  const row = db
    .prepare(
      `SELECT id, series_id, title, prose_mode, continuity_active_version,
              continuity_active_generation
         FROM slate_projects
        WHERE id = ? AND user_id = ?`,
    )
    .get(projectId, userId) as ProjectStudioRow | undefined;
  if (!row) throw new Error("Slate project not found.");
  return row;
}

function sourceKind(value: unknown): SlateSourceShelfKind {
  if (value === "note" || value === "research") return value;
  throw new Error('Source kind must be "note" or "research".');
}

function sourceMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        (entry): entry is [string, string] =>
          entry[0].trim().length > 0 && typeof entry[1] === "string",
      )
      .slice(0, 30)
      .map(([key, item]) => [
        key.trim().slice(0, 120),
        item.trim().slice(0, 2_000),
      ]),
  );
}

function sourceShelfItem(row: SourceShelfRow): SlateSourceShelfItem {
  return {
    schemaVersion: SLATE_CREATIVE_STUDIOS_SCHEMA_VERSION,
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    kind: sourceKind(row.kind),
    content: row.content,
    metadata: sourceMetadata(parseJson(row.metadata_json, {})),
    promotedSourceId: row.promoted_source_id,
    mirrorEligible: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSlateSourceShelfItems(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateSourceShelfItem[] {
  studioProject(db, userId, projectId);
  return (
    db
      .prepare(
        `SELECT *
           FROM slate_source_shelf_items
          WHERE user_id = ? AND project_id = ?
          ORDER BY updated_at DESC, created_at DESC`,
      )
      .all(userId, projectId) as unknown as SourceShelfRow[]
  ).map(sourceShelfItem);
}

export function createSlateSourceShelfItem(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  input: {
    title: unknown;
    kind: unknown;
    content?: unknown;
    metadata?: unknown;
  },
): SlateSourceShelfItem {
  studioProject(db, userId, projectId);
  const id = randomId();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO slate_source_shelf_items
      (id, user_id, project_id, title, kind, content, metadata_json,
       promoted_source_id, mirror_eligible, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)`,
  ).run(
    id,
    userId,
    projectId,
    boundedText(input.title, "Source title", SOURCE_TITLE_MAX, true),
    sourceKind(input.kind),
    boundedText(input.content, "Source content", SOURCE_CONTENT_MAX),
    JSON.stringify(sourceMetadata(input.metadata)),
    now,
    now,
  );
  return sourceShelfItem(
    db
      .prepare(
        "SELECT * FROM slate_source_shelf_items WHERE id = ? AND user_id = ?",
      )
      .get(id, userId) as unknown as SourceShelfRow,
  );
}

export function updateSlateSourceShelfItem(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  itemId: string,
  input: {
    title?: unknown;
    kind?: unknown;
    content?: unknown;
    metadata?: unknown;
  },
): SlateSourceShelfItem {
  studioProject(db, userId, projectId);
  const current = db
    .prepare(
      `SELECT * FROM slate_source_shelf_items
        WHERE id = ? AND user_id = ? AND project_id = ?`,
    )
    .get(itemId, userId, projectId) as SourceShelfRow | undefined;
  if (!current) throw new Error("Source Shelf item not found.");
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE slate_source_shelf_items
        SET title = ?, kind = ?, content = ?, metadata_json = ?,
            promoted_source_id = NULL, mirror_eligible = 0, updated_at = ?
      WHERE id = ? AND user_id = ? AND project_id = ?`,
  ).run(
    input.title === undefined
      ? current.title
      : boundedText(input.title, "Source title", SOURCE_TITLE_MAX, true),
    input.kind === undefined ? sourceKind(current.kind) : sourceKind(input.kind),
    input.content === undefined
      ? current.content
      : boundedText(input.content, "Source content", SOURCE_CONTENT_MAX),
    input.metadata === undefined
      ? JSON.stringify(sourceMetadata(parseJson(current.metadata_json, {})))
      : JSON.stringify(sourceMetadata(input.metadata)),
    now,
    itemId,
    userId,
    projectId,
  );
  return sourceShelfItem(
    db
      .prepare(
        "SELECT * FROM slate_source_shelf_items WHERE id = ? AND user_id = ?",
      )
      .get(itemId, userId) as unknown as SourceShelfRow,
  );
}

export function deleteSlateSourceShelfItem(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  itemId: string,
): void {
  studioProject(db, userId, projectId);
  const result = db
    .prepare(
      `DELETE FROM slate_source_shelf_items
        WHERE id = ? AND user_id = ? AND project_id = ?`,
    )
    .run(itemId, userId, projectId);
  if (result.changes === 0) throw new Error("Source Shelf item not found.");
}

export function promoteSlateSourceShelfItem(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  itemId: string,
): SlateSourceShelfItem {
  const project = studioProject(db, userId, projectId);
  const current = db
    .prepare(
      `SELECT * FROM slate_source_shelf_items
        WHERE id = ? AND user_id = ? AND project_id = ?`,
    )
    .get(itemId, userId, projectId) as SourceShelfRow | undefined;
  if (!current) throw new Error("Source Shelf item not found.");
  if (current.promoted_source_id) return sourceShelfItem(current);
  const now = new Date().toISOString();
  const revision = Number(
    (
      db
        .prepare(
          `SELECT COALESCE(MAX(source_revision), -1) + 1 AS revision
             FROM slate_continuity_sources
            WHERE user_id = ? AND project_id = ? AND kind = 'source_shelf'`,
        )
        .get(userId, projectId) as { revision: number }
    ).revision ?? 0,
  );
  const content = `${current.title}\n\n${current.content}`;
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const source = createSlateContinuitySource(db, {
      userId,
      seriesId: project.series_id,
      projectId,
      sectionId: null,
      scopeKind: "book",
      kind: "source_shelf",
      sourceRevision: revision,
      content,
      authority: "human",
    });
    const fingerprint = createHash("sha256")
      .update(
        `${projectId}\u0000source_shelf\u0000${revision}\u0000${source.contentHash}`,
      )
      .digest("hex");
    db.prepare(
      `INSERT OR IGNORE INTO slate_continuity_jobs
        (id, user_id, series_id, project_id, section_id, source_id,
         source_revision, kind, status, attempts, input_fingerprint,
         available_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, 'extract_source', 'queued', 0,
               ?, ?, ?, ?)`,
    ).run(
      randomId(),
      userId,
      project.series_id,
      projectId,
      source.id,
      revision,
      fingerprint,
      now,
      now,
      now,
    );
    db.prepare(
      `UPDATE slate_source_shelf_items
          SET promoted_source_id = ?, mirror_eligible = 0, updated_at = ?
        WHERE id = ? AND user_id = ? AND project_id = ?`,
    ).run(source.id, now, itemId, userId, projectId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return sourceShelfItem(
    db
      .prepare(
        "SELECT * FROM slate_source_shelf_items WHERE id = ? AND user_id = ?",
      )
      .get(itemId, userId) as unknown as SourceShelfRow,
  );
}

const VISUAL_KINDS = new Set<SlateVisualReferenceKind>([
  "character_study",
  "expression",
  "costume",
  "location",
  "prop",
  "motif",
  "scene_keyframe",
  "blocking",
]);

function visualKind(value: unknown): SlateVisualReferenceKind {
  if (
    typeof value === "string" &&
    VISUAL_KINDS.has(value as SlateVisualReferenceKind)
  ) {
    return value as SlateVisualReferenceKind;
  }
  throw new Error("Visual study kind is invalid.");
}

function visualReference(row: VisualRow): SlateVisualReference {
  const state = parseJson<Record<string, unknown>>(row.reference_state_json, {});
  const provider =
    row.provider === "openai" || row.provider === "anthropic"
      ? row.provider
      : row.provider === "comfyui"
        ? "comfyui"
        : "local";
  return {
    schemaVersion: SLATE_CREATIVE_STUDIOS_SCHEMA_VERSION,
    id: row.id,
    seriesId: row.series_id,
    projectId: row.project_id,
    sectionId: row.section_id,
    kind: visualKind(row.kind),
    status:
      row.status === "pinned" || row.status === "rejected"
        ? row.status
        : "study",
    assetId: row.image_id ?? "",
    prompt: row.prompt,
    negativePrompt:
      typeof state.negativePrompt === "string" ? state.negativePrompt : null,
    referenceAssetIds: Array.isArray(state.referenceAssetIds)
      ? state.referenceAssetIds.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    passageAnchor:
      state.passageAnchor &&
      typeof state.passageAnchor === "object" &&
      !Array.isArray(state.passageAnchor)
        ? (state.passageAnchor as SlateVisualReference["passageAnchor"])
        : null,
    entityStates: Array.isArray(state.entityStates)
      ? (state.entityStates as SlateVisualReference["entityStates"])
      : [],
    continuityGeneration:
      typeof state.continuityGeneration === "number"
        ? state.continuityGeneration
        : row.active_generation,
    visualStyleVersionId:
      typeof state.visualStyleVersionId === "string"
        ? state.visualStyleVersionId
        : "default-v1",
    provider,
    model: row.model,
    seed: typeof state.seed === "string" ? state.seed : null,
    textualCanonSourceId: null,
    createdAt: row.created_at,
    pinnedAt: row.pinned_at,
  };
}

function visualSelect(): string {
  return `SELECT refs.*, projects.series_id,
                 projects.continuity_active_generation AS active_generation
            FROM slate_visual_references refs
            JOIN slate_projects projects
              ON projects.id = refs.project_id AND projects.user_id = refs.user_id`;
}

export function listSlateVisualReferences(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateVisualReference[] {
  studioProject(db, userId, projectId);
  return (
    db
      .prepare(
        `${visualSelect()}
          WHERE refs.user_id = ? AND refs.project_id = ?
          ORDER BY refs.created_at DESC`,
      )
      .all(userId, projectId) as unknown as VisualRow[]
  ).map(visualReference);
}

/**
 * Records an image already produced by the guarded PRISM image pipeline.
 * This never accepts textual-canon promotion.
 */
export function recordSlateVisualStudy(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  input: {
    imageId: unknown;
    sectionId?: unknown;
    kind: unknown;
    prompt: unknown;
    negativePrompt?: unknown;
    referenceAssetIds?: unknown;
    passageAnchor?: unknown;
    entityStates?: unknown;
    visualStyleVersionId?: unknown;
    provider: unknown;
    model: unknown;
    seed?: unknown;
  },
): SlateVisualReference {
  const project = studioProject(db, userId, projectId);
  const imageId = boundedText(input.imageId, "Generated image", 240, true);
  const image = db
    .prepare("SELECT id FROM images WHERE id = ? AND user_id = ?")
    .get(imageId, userId) as { id: string } | undefined;
  if (!image) throw new Error("Generated image not found.");
  const sectionId =
    typeof input.sectionId === "string" && input.sectionId.trim()
      ? input.sectionId.trim()
      : null;
  if (sectionId) {
    const section = db
      .prepare(
        `SELECT id FROM slate_sections
          WHERE id = ? AND project_id = ? AND user_id = ?`,
      )
      .get(sectionId, projectId, userId);
    if (!section) throw new Error("Slate section not found.");
  }
  const provider =
    input.provider === "openai" ||
    input.provider === "anthropic" ||
    input.provider === "comfyui" ||
    input.provider === "local"
      ? input.provider
      : "local";
  if (project.prose_mode === "offline" && provider !== "local" && provider !== "comfyui") {
    throw new Error("OFFLINE Slate projects cannot register online visual studies.");
  }
  const id = randomId();
  const createdAt = new Date().toISOString();
  const state = {
    negativePrompt:
      typeof input.negativePrompt === "string"
        ? input.negativePrompt.trim().slice(0, VISUAL_PROMPT_MAX)
        : null,
    referenceAssetIds: Array.isArray(input.referenceAssetIds)
      ? input.referenceAssetIds
          .filter((item): item is string => typeof item === "string")
          .slice(0, 20)
      : [],
    passageAnchor:
      input.passageAnchor &&
      typeof input.passageAnchor === "object" &&
      !Array.isArray(input.passageAnchor)
        ? input.passageAnchor
        : null,
    entityStates: Array.isArray(input.entityStates)
      ? input.entityStates.slice(0, 40)
      : [],
    continuityGeneration: project.continuity_active_generation,
    visualStyleVersionId:
      typeof input.visualStyleVersionId === "string" &&
      input.visualStyleVersionId.trim()
        ? input.visualStyleVersionId.trim().slice(0, 240)
        : "default-v1",
    seed:
      typeof input.seed === "string" && input.seed.trim()
        ? input.seed.trim().slice(0, 240)
        : null,
  };
  db.prepare(
    `INSERT INTO slate_visual_references
      (id, user_id, project_id, section_id, entity_id, kind, status,
       image_id, prompt, reference_state_json, visual_style_version,
       provider, model, created_at, pinned_at)
     VALUES (?, ?, ?, ?, NULL, ?, 'study', ?, ?, ?, ?, ?, ?, ?, NULL)`,
  ).run(
    id,
    userId,
    projectId,
    sectionId,
    visualKind(input.kind),
    imageId,
    boundedText(input.prompt, "Visual prompt", VISUAL_PROMPT_MAX, true),
    JSON.stringify(state),
    state.visualStyleVersionId,
    provider,
    boundedText(input.model, "Image model", 240, true),
    createdAt,
  );
  return visualReference(
    db
      .prepare(`${visualSelect()} WHERE refs.id = ? AND refs.user_id = ?`)
      .get(id, userId) as unknown as VisualRow,
  );
}

export function resolveSlateVisualReference(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  referenceId: string,
  resolution: "pin" | "reject",
): SlateVisualReference {
  studioProject(db, userId, projectId);
  const status = resolution === "pin" ? "pinned" : "rejected";
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE slate_visual_references
          SET status = ?, pinned_at = ?
        WHERE id = ? AND user_id = ? AND project_id = ? AND status = 'study'`,
    )
    .run(
      status,
      resolution === "pin" ? now : null,
      referenceId,
      userId,
      projectId,
    );
  if (result.changes === 0) {
    throw new Error("Only an unresolved visual study can be pinned or rejected.");
  }
  return visualReference(
    db
      .prepare(`${visualSelect()} WHERE refs.id = ? AND refs.user_id = ?`)
      .get(referenceId, userId) as unknown as VisualRow,
  );
}

function jsonObject(raw: string): Record<string, unknown> | null {
  const fenced = raw
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
  try {
    const value = JSON.parse(fenced) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function reviewVerdict(raw: string): SlateReviewCircleVerdict | null {
  const value = jsonObject(raw);
  if (!value) return null;
  const verdict =
    value.verdict === "ready" ||
    value.verdict === "promising" ||
    value.verdict === "needs_attention"
      ? value.verdict
      : null;
  if (!verdict) return null;
  const fields = [
    "headline",
    "strongestElement",
    "primaryConcern",
    "nextMove",
  ] as const;
  if (fields.some((field) => typeof value[field] !== "string")) return null;
  return {
    verdict,
    headline: boundedText(value.headline, "Review headline", 500, true),
    strongestElement: boundedText(
      value.strongestElement,
      "Strongest element",
      2_000,
      true,
    ),
    primaryConcern: boundedText(
      value.primaryConcern,
      "Primary concern",
      2_000,
      true,
    ),
    nextMove: boundedText(value.nextMove, "Next move", 2_000, true),
  };
}

const SLATE_REVIEW_RUBRIC = {
  id: "slate.reader-room-note",
  version: 1,
  instructions: [
    "Read as an invited subjective fiction reader, not as Continuity.",
    "Judge only the supplied accepted manuscript evidence.",
    "Lead with a clear verdict and preserve the writer's authorship.",
  ],
  outputInstruction:
    'Return strict JSON: {"verdict":"ready|promising|needs_attention","headline":"...","strongestElement":"...","primaryConcern":"...","nextMove":"..."}.',
  parse: reviewVerdict,
} as const;

function roomNote(
  raw: string,
  reviews: SlateReviewCircleSession["reviews"],
): SlateReviewCircleRoomNote {
  const value = jsonObject(raw);
  if (
    value &&
    (value.verdict === "ready" ||
      value.verdict === "promising" ||
      value.verdict === "needs_attention") &&
    typeof value.headline === "string" &&
    typeof value.consensus === "string" &&
    Array.isArray(value.tensions) &&
    typeof value.nextMove === "string"
  ) {
    return {
      verdict: value.verdict,
      headline: boundedText(value.headline, "Room Note headline", 500, true),
      consensus: boundedText(
        value.consensus,
        "Room Note consensus",
        3_000,
        true,
      ),
      tensions: value.tensions
        .filter((item): item is string => typeof item === "string")
        .slice(0, 6)
        .map((item) => item.trim().slice(0, 1_000)),
      nextMove: boundedText(value.nextMove, "Room Note next move", 2_000, true),
    };
  }
  const verdicts = reviews.map((review) => review.output.verdict);
  const verdict =
    verdicts.every((item) => item === "ready")
      ? "ready"
      : verdicts.some((item) => item === "needs_attention")
        ? "needs_attention"
        : "promising";
  return {
    verdict,
    headline: "The room has notes.",
    consensus: reviews.map((review) => review.output.headline).join(" "),
    tensions: reviews.map((review) => review.output.primaryConcern),
    nextMove: reviews[0]?.output.nextMove ?? "Choose the note that serves the story.",
  };
}

function reviewerSnapshots(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  botIds: string[],
  guest?: SlateReviewCircleGuest | null,
): PrismReviewerSnapshotV1[] {
  const uniqueBotIds = [...new Set(botIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueBotIds.length > 3) {
    throw new Error("Review Circle supports up to three project reviewers.");
  }
  const snapshots = uniqueBotIds.map((botId) => {
    const row = db
      .prepare(
        `SELECT id, name, system_prompt FROM bots
          WHERE id = ? AND user_id = ?`,
      )
      .get(botId, userId) as
      | { id: string; name: string; system_prompt: string }
      | undefined;
    if (!row) throw new Error("Review Circle reviewer not found.");
    return {
      version: 1 as const,
      reviewerId: row.id,
      reviewerName: row.name,
      systemPrompt: row.system_prompt,
    };
  });
  if (guest) {
    snapshots.push({
      version: 1,
      reviewerId: `guest:${sessionId}`,
      reviewerName: boundedText(guest.name, "Guest name", 120, true),
      systemPrompt: boundedText(
        guest.readerBrief,
        "Guest reader brief",
        REVIEW_GUEST_BRIEF_MAX,
        true,
      ),
    });
  }
  if (snapshots.length === 0) {
    throw new Error("Choose at least one Review Circle reader.");
  }
  return snapshots;
}

export async function runSlateReviewCircle(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  input: {
    sectionId: string;
    reviewerBotIds: string[];
    guest?: SlateReviewCircleGuest | null;
    provider: LlmProvider;
    model?: string;
    now?: () => string;
  },
): Promise<SlateReviewCircleSession> {
  const project = studioProject(db, userId, projectId);
  const section = db
    .prepare(
      `SELECT id, title, prose, revision, content_hash
         FROM slate_sections
        WHERE id = ? AND project_id = ? AND user_id = ?`,
    )
    .get(input.sectionId, projectId, userId) as
    | {
        id: string;
        title: string;
        prose: string;
        revision: number;
        content_hash: string;
      }
    | undefined;
  if (!section) throw new Error("Slate section not found.");
  if (!section.prose.trim()) {
    throw new Error("Review Circle needs accepted manuscript prose.");
  }
  const sessionId = randomId();
  const createdAt = input.now?.() ?? new Date().toISOString();
  const artifact: PrismReviewArtifactV1 = {
    version: 1,
    appletId: "slate",
    subjectId: section.id,
    subjectTitle: `${project.title} · ${section.title}`,
    perspective: "reader",
    perspectiveLabel: "Invited fiction reader",
    context: {
      projectId,
      sectionRevision: section.revision,
      continuityVersion: project.continuity_active_version,
      continuityGeneration: project.continuity_active_generation,
    },
    evidence: [
      {
        id: `section:${section.id}:revision:${section.revision}`,
        channel: "text",
        label: section.title,
        content: section.prose,
      },
    ],
    createdAt,
  };
  const snapshots = reviewerSnapshots(
    db,
    userId,
    sessionId,
    input.reviewerBotIds,
    input.guest,
  );
  const reviews = [];
  for (const reviewer of snapshots) {
    const result = await runPrismReviewV1({
      artifact,
      reviewer,
      rubric: SLATE_REVIEW_RUBRIC,
      provider: input.provider,
      model: input.model,
      now: input.now,
    });
    if (!result) {
      throw new Error(`${reviewer.reviewerName} returned an unreadable review.`);
    }
    reviews.push(result);
  }
  const synthesisRaw = await input.provider.generateResponse(
    [
      {
        role: "system",
        content:
          "Synthesize the independent fiction-reader verdicts into one brief verdict-first Room Note. Do not invent manuscript facts, average away disagreement, or issue edits as commands.",
      },
      {
        role: "user",
        content: `${JSON.stringify(
          reviews.map((review) => ({
            reader: review.reviewerSnapshot.reviewerName,
            verdict: review.output,
          })),
        )}\n\nReturn strict JSON: {"verdict":"ready|promising|needs_attention","headline":"...","consensus":"...","tensions":["..."],"nextMove":"..."}.`,
      },
    ],
    { ...(input.model ? { model: input.model } : {}) },
  );
  const note = roomNote(synthesisRaw, reviews);

  const unchanged = db
    .prepare(
      `SELECT revision, content_hash FROM slate_sections
        WHERE id = ? AND project_id = ? AND user_id = ?`,
    )
    .get(section.id, projectId, userId) as
    | { revision: number; content_hash: string }
    | undefined;
  const currentProject = studioProject(db, userId, projectId);
  if (
    !unchanged ||
    unchanged.revision !== section.revision ||
    unchanged.content_hash !== section.content_hash ||
    currentProject.continuity_active_version !==
      project.continuity_active_version ||
    currentProject.continuity_active_generation !==
      project.continuity_active_generation
  ) {
    throw new Error("Review inputs changed while the room was reading. Start a fresh room.");
  }

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    db.prepare(
      `INSERT INTO slate_review_circle_sessions
        (id, user_id, project_id, section_id, artifact_json,
         section_revisions_json, continuity_version, continuity_generation,
         provider, model, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      sessionId,
      userId,
      projectId,
      section.id,
      JSON.stringify(artifact),
      JSON.stringify({ [section.id]: section.revision }),
      project.continuity_active_version,
      project.continuity_active_generation,
      input.provider.name,
      input.model ?? null,
      createdAt,
    );
    reviews.forEach((review, ordinal) => {
      db.prepare(
        `INSERT INTO slate_review_circle_results
          (id, session_id, user_id, ordinal, reviewer_id,
           reviewer_snapshot_json, result_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        randomId(),
        sessionId,
        userId,
        ordinal,
        review.reviewerSnapshot.reviewerId,
        JSON.stringify(review.reviewerSnapshot),
        JSON.stringify(review),
        createdAt,
      );
    });
    db.prepare(
      `INSERT INTO slate_review_circle_room_notes
        (session_id, user_id, room_note_json, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(sessionId, userId, JSON.stringify(note), createdAt);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getSlateReviewCircleSession(db, userId, projectId, sessionId);
}

export function getSlateReviewCircleSession(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  sessionId: string,
): SlateReviewCircleSession {
  studioProject(db, userId, projectId);
  const row = db
    .prepare(
      `SELECT * FROM slate_review_circle_sessions
        WHERE id = ? AND user_id = ? AND project_id = ?`,
    )
    .get(sessionId, userId, projectId) as ReviewSessionRow | undefined;
  if (!row) throw new Error("Review Circle room not found.");
  const resultRows = db
    .prepare(
      `SELECT reviewer_snapshot_json, result_json
         FROM slate_review_circle_results
        WHERE session_id = ? AND user_id = ?
        ORDER BY ordinal ASC`,
    )
    .all(sessionId, userId) as unknown as Array<{
    reviewer_snapshot_json: string;
    result_json: string;
  }>;
  const note = db
    .prepare(
      `SELECT room_note_json FROM slate_review_circle_room_notes
        WHERE session_id = ? AND user_id = ?`,
    )
    .get(sessionId, userId) as { room_note_json: string } | undefined;
  return {
    schemaVersion: SLATE_CREATIVE_STUDIOS_SCHEMA_VERSION,
    id: row.id,
    projectId: row.project_id,
    sectionId: row.section_id,
    artifact: parseJson(row.artifact_json, {} as PrismReviewArtifactV1),
    sectionRevisions: parseJson(row.section_revisions_json, {}),
    continuityVersion: row.continuity_version,
    continuityGeneration: row.continuity_generation,
    reviewerSnapshots: resultRows.map((result) =>
      parseJson(result.reviewer_snapshot_json, {} as PrismReviewerSnapshotV1),
    ),
    reviews: resultRows.map((result) =>
      parseJson(
        result.result_json,
        {} as SlateReviewCircleSession["reviews"][number],
      ),
    ),
    roomNote: parseJson(
      note?.room_note_json ?? "{}",
      {} as SlateReviewCircleRoomNote,
    ),
    provider: row.provider,
    model: row.model,
    createdAt: row.created_at,
  };
}

export function listSlateReviewCircleSessions(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateReviewCircleSession[] {
  studioProject(db, userId, projectId);
  const ids = db
    .prepare(
      `SELECT id FROM slate_review_circle_sessions
        WHERE user_id = ? AND project_id = ?
        ORDER BY created_at DESC`,
    )
    .all(userId, projectId) as unknown as Array<{ id: string }>;
  return ids.map((row) =>
    getSlateReviewCircleSession(db, userId, projectId, row.id),
  );
}

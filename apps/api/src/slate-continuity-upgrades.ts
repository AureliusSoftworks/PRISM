import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  currentContinuityProducerVersions,
  type ContinuityProducerVersions,
  type SlateContinuityGeneration,
} from "@localai/shared";

const INTERNAL_VERSION_KEYS = [
  "schema",
  "extraction",
  "reconciliation",
  "contextCompilation",
  "recap",
  "atmosphere",
] as const;

type InternalVersionKey = (typeof INTERNAL_VERSION_KEYS)[number];

export type SlateContinuityVersionComparisonStatus =
  | "current"
  | "upgrade_required"
  | "unsupported_future"
  | "invalid";

export interface SlateContinuityVersionDelta {
  component: keyof ContinuityProducerVersions;
  installed: string | number;
  target: string | number;
  relation: "older" | "equal" | "newer";
}

export interface SlateContinuityVersionComparison {
  status: SlateContinuityVersionComparisonStatus;
  compatible: boolean;
  installed: ContinuityProducerVersions | null;
  target: ContinuityProducerVersions;
  deltas: SlateContinuityVersionDelta[];
}

export interface SlateContinuityVersionRegistryEntry {
  id: string;
  producerVersions: Readonly<ContinuityProducerVersions>;
  minimumReadableVersions: Readonly<ContinuityProducerVersions>;
}

const CURRENT_PRODUCER_VERSIONS = Object.freeze(
  currentContinuityProducerVersions(),
);

/**
 * The executable Continuity registry lives separately from Slate's visible
 * applet version. Add an entry before advancing a producer version so older
 * generations remain explainable and upgrades can stay source-driven.
 */
export const SLATE_CONTINUITY_VERSION_REGISTRY = Object.freeze<
  readonly SlateContinuityVersionRegistryEntry[]
>([
  Object.freeze({
    id: `continuity-${CURRENT_PRODUCER_VERSIONS.continuity}-schema-${CURRENT_PRODUCER_VERSIONS.schema}`,
    producerVersions: CURRENT_PRODUCER_VERSIONS,
    minimumReadableVersions: Object.freeze({
      continuity: "0.0",
      schema: 0,
      extraction: 0,
      reconciliation: 0,
      contextCompilation: 0,
      recap: 0,
      atmosphere: 0,
    }),
  }),
]);

export function currentSlateContinuityRegistryEntry(): SlateContinuityVersionRegistryEntry {
  return SLATE_CONTINUITY_VERSION_REGISTRY.at(-1)!;
}

function parseFrameworkVersion(value: string): number[] | null {
  if (!/^\d+(?:\.\d+){1,2}$/.test(value)) return null;
  return value.split(".").map(Number);
}

function compareFrameworkVersions(left: string, right: string): number | null {
  const leftParts = parseFrameworkVersion(left);
  const rightParts = parseFrameworkVersion(right);
  if (!leftParts || !rightParts) return null;
  const width = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < width; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function parseProducerVersions(value: unknown): ContinuityProducerVersions | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.continuity !== "string") return null;
  if (!parseFrameworkVersion(record.continuity)) return null;
  for (const key of INTERNAL_VERSION_KEYS) {
    if (
      typeof record[key] !== "number" ||
      !Number.isSafeInteger(record[key]) ||
      record[key] < 0
    ) {
      return null;
    }
  }
  return {
    continuity: record.continuity,
    schema: record.schema as number,
    extraction: record.extraction as number,
    reconciliation: record.reconciliation as number,
    contextCompilation: record.contextCompilation as number,
    recap: record.recap as number,
    atmosphere: record.atmosphere as number,
  };
}

function relationFromComparison(value: number): "older" | "equal" | "newer" {
  return value < 0 ? "older" : value > 0 ? "newer" : "equal";
}

export function compareSlateContinuityProducerVersions(
  installedValue: unknown,
  targetValue: ContinuityProducerVersions = currentContinuityProducerVersions(),
): SlateContinuityVersionComparison {
  const installed = parseProducerVersions(installedValue);
  const target = parseProducerVersions(targetValue);
  if (!target) {
    throw new Error("The target Continuity producer versions are invalid.");
  }
  if (!installed) {
    return {
      status: "invalid",
      compatible: false,
      installed: null,
      target,
      deltas: [],
    };
  }

  const frameworkComparison = compareFrameworkVersions(
    installed.continuity,
    target.continuity,
  )!;
  const deltas: SlateContinuityVersionDelta[] = [
    {
      component: "continuity",
      installed: installed.continuity,
      target: target.continuity,
      relation: relationFromComparison(frameworkComparison),
    },
    ...INTERNAL_VERSION_KEYS.map((component) => ({
      component,
      installed: installed[component],
      target: target[component],
      relation: relationFromComparison(
        installed[component] - target[component],
      ),
    })),
  ];
  const hasFutureComponent = deltas.some((delta) => delta.relation === "newer");
  const hasOlderComponent = deltas.some((delta) => delta.relation === "older");
  return {
    status: hasFutureComponent
      ? "unsupported_future"
      : hasOlderComponent
        ? "upgrade_required"
        : "current",
    compatible: !hasFutureComponent,
    installed,
    target,
    deltas,
  };
}

interface ProjectUpgradeRow {
  id: string;
  continuity_active_version: string;
  continuity_target_version: string;
  continuity_active_generation: number;
  continuity_previous_generation: number | null;
  continuity_upgrade_status: string;
  continuity_last_success_at: string | null;
}

interface GenerationRow {
  id: string;
  user_id: string;
  project_id: string;
  generation: number;
  status: string;
  target_version: string;
  source_fingerprint: string;
  comparison_summary: string | null;
  producer_versions_json: string;
  created_at: string;
  completed_at: string | null;
}

export interface SlateContinuityUpgradeState {
  projectId: string;
  activeVersion: string;
  targetVersion: string;
  activeGeneration: number;
  previousGeneration: number | null;
  status: "current" | "building" | "review" | "deferred" | "failed";
  lastSuccessfulAt: string | null;
}

export interface SlateContinuityShadowBuild {
  generation: SlateContinuityGeneration;
  activeComparison: SlateContinuityVersionComparison;
}

function transaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function projectRow(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): ProjectUpgradeRow {
  const row = db
    .prepare(
      `SELECT id, continuity_active_version, continuity_target_version,
              continuity_active_generation, continuity_previous_generation,
              continuity_upgrade_status, continuity_last_success_at
         FROM slate_projects
        WHERE id = ? AND user_id = ?`,
    )
    .get(projectId, userId) as ProjectUpgradeRow | undefined;
  if (!row) throw new Error("Slate project not found.");
  return row;
}

function generationRow(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  generation: number,
): GenerationRow {
  const row = db
    .prepare(
      `SELECT * FROM slate_continuity_generations
        WHERE user_id = ? AND project_id = ? AND generation = ?`,
    )
    .get(userId, projectId, generation) as GenerationRow | undefined;
  if (!row) throw new Error("Continuity generation not found.");
  return row;
}

function producerVersionsFromRow(row: GenerationRow): ContinuityProducerVersions {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.producer_versions_json);
  } catch {
    throw new Error("Continuity generation producer versions are invalid.");
  }
  const versions = parseProducerVersions(parsed);
  if (!versions) {
    throw new Error("Continuity generation producer versions are invalid.");
  }
  return versions;
}

function generationFromRow(row: GenerationRow): SlateContinuityGeneration {
  if (
    row.status !== "building" &&
    row.status !== "ready" &&
    row.status !== "active" &&
    row.status !== "deferred" &&
    row.status !== "failed" &&
    row.status !== "superseded"
  ) {
    throw new Error("Continuity generation status is invalid.");
  }
  return {
    id: row.id,
    projectId: row.project_id,
    generation: Number(row.generation),
    status: row.status,
    targetVersion: row.target_version,
    sourceFingerprint: row.source_fingerprint,
    comparisonSummary: row.comparison_summary,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    producerVersions: producerVersionsFromRow(row),
  };
}

function upgradeStatus(value: string): SlateContinuityUpgradeState["status"] {
  return value === "building" ||
    value === "review" ||
    value === "deferred" ||
    value === "failed"
    ? value
    : "current";
}

function stateFromRow(row: ProjectUpgradeRow): SlateContinuityUpgradeState {
  return {
    projectId: row.id,
    activeVersion: row.continuity_active_version,
    targetVersion: row.continuity_target_version,
    activeGeneration: Number(row.continuity_active_generation),
    previousGeneration:
      row.continuity_previous_generation === null
        ? null
        : Number(row.continuity_previous_generation),
    status: upgradeStatus(row.continuity_upgrade_status),
    lastSuccessfulAt: row.continuity_last_success_at,
  };
}

function legacyProducerVersions(activeVersion: string): ContinuityProducerVersions {
  return {
    continuity: activeVersion,
    schema: 0,
    extraction: 0,
    reconciliation: 0,
    contextCompilation: 0,
    recap: 0,
    atmosphere: 0,
  };
}

function activeProducerVersions(
  db: DatabaseSync,
  userId: string,
  project: ProjectUpgradeRow,
): ContinuityProducerVersions {
  if (Number(project.continuity_active_generation) <= 0) {
    return legacyProducerVersions(project.continuity_active_version);
  }
  return producerVersionsFromRow(
    generationRow(
      db,
      userId,
      project.id,
      Number(project.continuity_active_generation),
    ),
  );
}

function nonEmptyText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  if (value.length > maxLength) throw new Error(`${label} is too long.`);
  return value;
}

export function getSlateContinuityUpgradeState(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateContinuityUpgradeState {
  return stateFromRow(projectRow(db, userId, projectId));
}

export function listSlateContinuityGenerations(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateContinuityGeneration[] {
  projectRow(db, userId, projectId);
  return (
    db
      .prepare(
        `SELECT * FROM slate_continuity_generations
          WHERE user_id = ? AND project_id = ?
          ORDER BY generation ASC`,
      )
      .all(userId, projectId) as unknown as GenerationRow[]
  ).map(generationFromRow);
}

/**
 * Registers a source-derived shadow generation. It deliberately does not
 * mutate the active ledger or any manuscript/source row.
 */
export function buildSlateContinuityShadowGeneration(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  input: { sourceFingerprint: string },
): SlateContinuityShadowBuild {
  const sourceFingerprint = nonEmptyText(
    input.sourceFingerprint,
    "Source fingerprint",
    512,
  );
  return transaction(db, () => {
    const project = projectRow(db, userId, projectId);
    const pending = db
      .prepare(
        `SELECT generation FROM slate_continuity_generations
          WHERE user_id = ? AND project_id = ?
            AND status IN ('building', 'ready')
          LIMIT 1`,
      )
      .get(userId, projectId) as { generation: number } | undefined;
    if (pending) {
      throw new Error(
        `Continuity generation ${pending.generation} is already in progress.`,
      );
    }

    const target = currentSlateContinuityRegistryEntry().producerVersions;
    const activeComparison = compareSlateContinuityProducerVersions(
      activeProducerVersions(db, userId, project),
      target as ContinuityProducerVersions,
    );
    if (!activeComparison.compatible) {
      throw new Error(
        "The active Continuity generation was produced by a newer unsupported runtime.",
      );
    }
    const maximum = db
      .prepare(
        `SELECT COALESCE(MAX(generation), 0) AS generation
           FROM slate_continuity_generations
          WHERE user_id = ? AND project_id = ?`,
      )
      .get(userId, projectId) as { generation: number };
    const generation = Number(maximum.generation) + 1;
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO slate_continuity_generations
        (id, user_id, project_id, generation, status, target_version,
         source_fingerprint, comparison_summary, producer_versions_json,
         created_at, completed_at)
       VALUES (?, ?, ?, ?, 'building', ?, ?, NULL, ?, ?, NULL)`,
    ).run(
      id,
      userId,
      projectId,
      generation,
      target.continuity,
      sourceFingerprint,
      JSON.stringify(target),
      now,
    );
    db.prepare(
      `UPDATE slate_projects
          SET continuity_target_version = ?, continuity_upgrade_status = 'building'
        WHERE id = ? AND user_id = ?`,
    ).run(target.continuity, projectId, userId);
    return {
      generation: generationFromRow(
        generationRow(db, userId, projectId, generation),
      ),
      activeComparison,
    };
  });
}

export function completeSlateContinuityShadowGeneration(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  generation: number,
  comparisonSummary: string,
): SlateContinuityGeneration {
  const summary = nonEmptyText(comparisonSummary, "Comparison summary", 32_000);
  return transaction(db, () => {
    projectRow(db, userId, projectId);
    generationRow(db, userId, projectId, generation);
    const now = new Date().toISOString();
    const result = db.prepare(
      `UPDATE slate_continuity_generations
          SET status = 'ready', comparison_summary = ?, completed_at = ?
        WHERE user_id = ? AND project_id = ? AND generation = ?
          AND status = 'building'`,
    ).run(summary, now, userId, projectId, generation);
    if (Number(result.changes) !== 1) {
      throw new Error("Only a building Continuity generation can become ready.");
    }
    db.prepare(
      `UPDATE slate_projects
          SET continuity_upgrade_status = 'review'
        WHERE id = ? AND user_id = ?`,
    ).run(projectId, userId);
    return generationFromRow(generationRow(db, userId, projectId, generation));
  });
}

function finishWithoutActivation(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  generation: number,
  status: "deferred" | "failed",
  explanation: string,
): SlateContinuityGeneration {
  const summary = nonEmptyText(explanation, "Upgrade explanation", 32_000);
  return transaction(db, () => {
    projectRow(db, userId, projectId);
    generationRow(db, userId, projectId, generation);
    const now = new Date().toISOString();
    const result = db.prepare(
      `UPDATE slate_continuity_generations
          SET status = ?, comparison_summary = ?, completed_at = ?
        WHERE user_id = ? AND project_id = ? AND generation = ?
          AND status IN ('building', 'ready')`,
    ).run(status, summary, now, userId, projectId, generation);
    if (Number(result.changes) !== 1) {
      throw new Error(
        `Only a building or ready Continuity generation can be ${status}.`,
      );
    }
    db.prepare(
      `UPDATE slate_projects
          SET continuity_upgrade_status = ?
        WHERE id = ? AND user_id = ?`,
    ).run(status, projectId, userId);
    return generationFromRow(generationRow(db, userId, projectId, generation));
  });
}

export function deferSlateContinuityShadowGeneration(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  generation: number,
  explanation: string,
): SlateContinuityGeneration {
  return finishWithoutActivation(
    db,
    userId,
    projectId,
    generation,
    "deferred",
    explanation,
  );
}

export function failSlateContinuityShadowGeneration(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  generation: number,
  explanation: string,
): SlateContinuityGeneration {
  return finishWithoutActivation(
    db,
    userId,
    projectId,
    generation,
    "failed",
    explanation,
  );
}

export function activateSlateContinuityGeneration(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  generation: number,
): SlateContinuityUpgradeState {
  return transaction(db, () => {
    const project = projectRow(db, userId, projectId);
    const candidate = generationRow(db, userId, projectId, generation);
    if (candidate.status !== "ready") {
      throw new Error("Only a ready Continuity generation can be activated.");
    }
    const candidateVersions = producerVersionsFromRow(candidate);
    const runtimeComparison = compareSlateContinuityProducerVersions(
      candidateVersions,
      currentContinuityProducerVersions(),
    );
    if (!runtimeComparison.compatible) {
      throw new Error(
        "This Continuity generation requires a newer runtime and cannot be activated.",
      );
    }
    const activeVersions = activeProducerVersions(db, userId, project);
    const progression = compareSlateContinuityProducerVersions(
      activeVersions,
      candidateVersions,
    );
    if (!progression.compatible) {
      throw new Error(
        "Continuity activation cannot downgrade the active producer versions; use rollback instead.",
      );
    }

    const oldActiveGeneration = Number(project.continuity_active_generation);
    if (oldActiveGeneration > 0) {
      const oldActive = generationRow(
        db,
        userId,
        projectId,
        oldActiveGeneration,
      );
      if (oldActive.status !== "active") {
        throw new Error("The active Continuity generation pointer is inconsistent.");
      }
      db.prepare(
        `UPDATE slate_continuity_generations
            SET status = 'superseded'
          WHERE user_id = ? AND project_id = ? AND generation = ?
            AND status = 'active'`,
      ).run(userId, projectId, oldActiveGeneration);
    }

    const now = new Date().toISOString();
    const candidateUpdate = db.prepare(
      `UPDATE slate_continuity_generations
          SET status = 'active', completed_at = COALESCE(completed_at, ?)
        WHERE user_id = ? AND project_id = ? AND generation = ?
          AND status = 'ready'`,
    ).run(now, userId, projectId, generation);
    if (Number(candidateUpdate.changes) !== 1) {
      throw new Error("Continuity generation activation lost its ready state.");
    }
    const projectUpdate = db.prepare(
      `UPDATE slate_projects
          SET continuity_previous_generation = ?,
              continuity_active_generation = ?,
              continuity_active_version = ?,
              continuity_target_version = ?,
              continuity_upgrade_status = 'current',
              continuity_last_success_at = ?
        WHERE id = ? AND user_id = ? AND continuity_active_generation = ?`,
    ).run(
      oldActiveGeneration > 0 ? oldActiveGeneration : null,
      generation,
      candidate.target_version,
      candidate.target_version,
      now,
      projectId,
      userId,
      oldActiveGeneration,
    );
    if (Number(projectUpdate.changes) !== 1) {
      throw new Error("Continuity activation lost the active generation race.");
    }
    return stateFromRow(projectRow(db, userId, projectId));
  });
}

/** Atomically swaps the active and immediately previous ledger generations. */
export function rollbackSlateContinuityGeneration(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateContinuityUpgradeState {
  return transaction(db, () => {
    const project = projectRow(db, userId, projectId);
    const activeGeneration = Number(project.continuity_active_generation);
    const previousGeneration =
      project.continuity_previous_generation === null
        ? null
        : Number(project.continuity_previous_generation);
    if (activeGeneration <= 0 || previousGeneration === null) {
      throw new Error("There is no previous Continuity generation to restore.");
    }
    const active = generationRow(db, userId, projectId, activeGeneration);
    const previous = generationRow(db, userId, projectId, previousGeneration);
    if (active.status !== "active" || previous.status !== "superseded") {
      throw new Error("Continuity rollback pointers are inconsistent.");
    }
    const previousRuntimeComparison = compareSlateContinuityProducerVersions(
      producerVersionsFromRow(previous),
      currentContinuityProducerVersions(),
    );
    if (!previousRuntimeComparison.compatible) {
      throw new Error(
        "The previous Continuity generation requires a newer runtime.",
      );
    }

    db.prepare(
      `UPDATE slate_continuity_generations
          SET status = 'superseded'
        WHERE user_id = ? AND project_id = ? AND generation = ?
          AND status = 'active'`,
    ).run(userId, projectId, activeGeneration);
    db.prepare(
      `UPDATE slate_continuity_generations
          SET status = 'active'
        WHERE user_id = ? AND project_id = ? AND generation = ?
          AND status = 'superseded'`,
    ).run(userId, projectId, previousGeneration);
    const now = new Date().toISOString();
    const projectUpdate = db.prepare(
      `UPDATE slate_projects
          SET continuity_previous_generation = ?,
              continuity_active_generation = ?,
              continuity_active_version = ?,
              continuity_target_version = ?,
              continuity_upgrade_status = 'current',
              continuity_last_success_at = ?
        WHERE id = ? AND user_id = ? AND continuity_active_generation = ?
          AND continuity_previous_generation = ?`,
    ).run(
      activeGeneration,
      previousGeneration,
      previous.target_version,
      previous.target_version,
      now,
      projectId,
      userId,
      activeGeneration,
      previousGeneration,
    );
    if (Number(projectUpdate.changes) !== 1) {
      throw new Error("Continuity rollback lost the generation race.");
    }
    return stateFromRow(projectRow(db, userId, projectId));
  });
}

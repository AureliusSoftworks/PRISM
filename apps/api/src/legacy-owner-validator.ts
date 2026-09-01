import { createHmac, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  inspectAccountContentOwnerRelations,
  type AccountContentOwnerRelation,
} from "./account-owner-boundaries.ts";

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

function quoteIdentifier(identifier: string): string {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error("Legacy owner validation encountered an invalid identifier.");
  }
  return `"${identifier}"`;
}

interface PrimaryKeyColumn {
  name: string;
  pk: number;
}

export interface LegacyOwnerViolationSummary {
  table: string;
  count: number;
  opaqueRowIds: readonly string[];
}

export interface LegacyOwnerValidationReport {
  version: 1;
  scannedTableCount: number;
  scannedRelationCount: number;
  violationCount: number;
  violations: readonly LegacyOwnerViolationSummary[];
}

export class LegacyOwnerValidationError extends Error {
  readonly code = "legacy_owner_validation_failed";
  readonly report: LegacyOwnerValidationReport;

  constructor(report: LegacyOwnerValidationReport) {
    super("Legacy account ownership validation failed.");
    this.name = "LegacyOwnerValidationError";
    this.report = report;
  }
}

function tableNames(db: DatabaseSync): string[] {
  return db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = ? AND name NOT LIKE ? ORDER BY name",
    )
    .all("table", "sqlite_%")
    .map((row) => String((row as { name: unknown }).name));
}

function columnsForTable(db: DatabaseSync, table: string): PrimaryKeyColumn[] {
  return db
    .prepare(`PRAGMA table_xinfo(${quoteIdentifier(table)})`)
    .all()
    .map((row) => {
      const value = row as Record<string, unknown>;
      return { name: String(value.name), pk: Number(value.pk) };
    });
}

function identityColumns(db: DatabaseSync, table: string): string[] {
  const columns = columnsForTable(db, table);
  const primary = columns
    .filter((column) => column.pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map((column) => column.name);
  if (primary.length > 0) return primary;
  if (columns.some((column) => column.name === "id")) return ["id"];
  return ["rowid"];
}

function opaqueRowId(
  key: Uint8Array,
  table: string,
  identity: readonly unknown[],
): string {
  const digest = createHmac("sha256", key)
    .update(table)
    .update("\0")
    .update(
      JSON.stringify(
        identity.map((value) =>
          Buffer.isBuffer(value) ? value.toString("base64") : String(value ?? ""),
        ),
      ),
    )
    .digest("hex")
    .slice(0, 24);
  return `row:${digest}`;
}

function countQuery(db: DatabaseSync, sql: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM (${sql})`).get() as
    | { count?: number | bigint }
    | undefined;
  return Number(row?.count ?? 0);
}

function sampleOpaqueIds(args: {
  db: DatabaseSync;
  table: string;
  whereSql: string;
  key: Uint8Array;
  limit: number;
}): string[] {
  const identity = identityColumns(args.db, args.table);
  const projections = identity.map((column, index) =>
    column === "rowid"
      ? `child.rowid AS ${quoteIdentifier(`identity_${index}`)}`
      : `child.${quoteIdentifier(column)} AS ${quoteIdentifier(`identity_${index}`)}`,
  );
  const rows = args.db
    .prepare(
      `SELECT ${projections.join(", ")} FROM ${quoteIdentifier(args.table)} AS child WHERE ${args.whereSql} LIMIT ?`,
    )
    .all(args.limit) as Array<Record<string, unknown>>;
  return rows.map((row) =>
    opaqueRowId(
      args.key,
      args.table,
      identity.map((_column, index) => row[`identity_${index}`]),
    ),
  );
}

interface MutableViolation {
  count: number;
  opaqueRowIds: Set<string>;
}

function recordViolation(args: {
  db: DatabaseSync;
  table: string;
  whereSql: string;
  key: Uint8Array;
  maxOpaqueIdsPerTable: number;
  violations: Map<string, MutableViolation>;
}): void {
  const count = countQuery(
    args.db,
    `SELECT 1 FROM ${quoteIdentifier(args.table)} AS child WHERE ${args.whereSql}`,
  );
  if (count === 0) return;
  const current = args.violations.get(args.table) ?? {
    count: 0,
    opaqueRowIds: new Set<string>(),
  };
  current.count += count;
  const remaining = Math.max(
    0,
    args.maxOpaqueIdsPerTable - current.opaqueRowIds.size,
  );
  if (remaining > 0) {
    for (const id of sampleOpaqueIds({
      db: args.db,
      table: args.table,
      whereSql: args.whereSql,
      key: args.key,
      limit: remaining,
    })) {
      current.opaqueRowIds.add(id);
    }
  }
  args.violations.set(args.table, current);
}

function directRelationViolationSql(
  relation: AccountContentOwnerRelation,
): string {
  if (relation.enforcement === "polymorphic-owner-trigger") {
    const childColumn = quoteIdentifier(relation.childColumns[0]!);
    const parentColumn = quoteIdentifier(relation.parentColumns[0]!);
    const alternatives = relation.parentAlternatives ?? [relation.parentTable];
    const parentMatches = alternatives
      .map(
        (table) =>
          `EXISTS (SELECT 1 FROM ${quoteIdentifier(table)} AS parent WHERE parent.${quoteIdentifier(relation.parentOwnerColumn!)} = child.${quoteIdentifier(relation.childOwnerColumn!)} AND parent.${parentColumn} = child.${childColumn})`,
      )
      .join(" OR ");
    return `child.${childColumn} IS NOT NULL AND NOT (${parentMatches})`;
  }
  if (relation.enforcement === "json-array-owner-trigger") {
    const childColumn = quoteIdentifier(relation.childColumns[0]!);
    const parentColumn = quoteIdentifier(relation.parentColumns[0]!);
    return `(CASE
      WHEN child.${childColumn} IS NULL THEN 0
      WHEN json_valid(child.${childColumn}) = 0 THEN 1
      WHEN json_type(child.${childColumn}) <> 'array' THEN 1
      WHEN EXISTS (
        SELECT 1
          FROM json_each(child.${childColumn}) AS owner_ref
         WHERE owner_ref.type NOT IN ('text', 'null')
            OR (owner_ref.type = 'text' AND (
              trim(CAST(owner_ref.value AS TEXT)) = ''
              OR NOT EXISTS (
                SELECT 1
                  FROM ${quoteIdentifier(relation.parentTable)} AS parent
                 WHERE parent.${quoteIdentifier(relation.parentOwnerColumn!)} = child.${quoteIdentifier(relation.childOwnerColumn!)}
                   AND parent.${parentColumn} = CAST(owner_ref.value AS TEXT)
              )
            ))
      ) THEN 1
      ELSE 0
    END) = 1`;
  }
  const referencesPresent = relation.childColumns
    .map((column) => `child.${quoteIdentifier(column)} IS NOT NULL`)
    .join(" AND ");
  const referenceMatch = relation.childColumns
    .map(
      (column, index) =>
        `parent.${quoteIdentifier(relation.parentColumns[index]!)} = child.${quoteIdentifier(column)}`,
    )
    .join(" AND ");
  const when = relation.when
    ? `child.${quoteIdentifier(relation.when.column)} ${
        relation.when.operator === "not-equals" ? "<>" : "="
      } '${relation.when.equals.replaceAll("'", "''")}'`
    : "1";
  const allowedChildValue = relation.allowedChildValues?.length
    ? relation.allowedChildValues
        .map(
          (value) =>
            `child.${quoteIdentifier(relation.childColumns[0]!)} = '${value.replaceAll("'", "''")}'`,
        )
        .join(" OR ")
    : "0";
  return `(${when}) AND (${referencesPresent}) AND NOT ((${allowedChildValue}) OR EXISTS (SELECT 1 FROM ${quoteIdentifier(relation.parentTable)} AS parent WHERE parent.${quoteIdentifier(relation.parentOwnerColumn!)} = child.${quoteIdentifier(relation.childOwnerColumn!)} AND ${referenceMatch}))`;
}

/**
 * Preflight for later Vault migration. It only observes ownership metadata and
 * stable ids, emits keyed opaque ids, and never infers or rewrites an owner.
 */
export function validateLegacyAccountOwners(
  db: DatabaseSync,
  options: {
    opaqueIdKey?: Uint8Array;
    maxOpaqueIdsPerTable?: number;
  } = {},
): LegacyOwnerValidationReport {
  const key = options.opaqueIdKey ?? randomBytes(32);
  const maxOpaqueIdsPerTable = Math.max(
    1,
    Math.min(50, Math.trunc(options.maxOpaqueIdsPerTable ?? 8)),
  );
  const names = tableNames(db);
  const directOwnerTables = names.filter((table) =>
    columnsForTable(db, table).some((column) => column.name === "user_id"),
  );
  const relations = inspectAccountContentOwnerRelations(db);
  const violations = new Map<string, MutableViolation>();

  for (const table of directOwnerTables) {
    recordViolation({
      db,
      table,
      whereSql:
        "child.user_id IS NULL OR trim(CAST(child.user_id AS TEXT)) = '' OR NOT EXISTS (SELECT 1 FROM users AS owner WHERE owner.id = child.user_id)",
      key,
      maxOpaqueIdsPerTable,
      violations,
    });
  }

  for (const relation of relations) {
    if (
      relation.parentOwnerColumn === null ||
      relation.childOwnerColumn === null ||
      relation.enforcement === "native-owner-foreign-key"
    ) {
      continue;
    }
    recordViolation({
      db,
      table: relation.childTable,
      whereSql: directRelationViolationSql(relation),
      key,
      maxOpaqueIdsPerTable,
      violations,
    });
  }

  recordViolation({
    db,
    table: "image_asset_set_items",
    whereSql: `NOT EXISTS (
      SELECT 1
        FROM image_asset_sets AS asset_set
        JOIN images AS image
          ON image.id = child.image_id
         AND image.user_id = asset_set.user_id
       WHERE asset_set.id = child.set_id
    )`,
    key,
    maxOpaqueIdsPerTable,
    violations,
  });
  recordViolation({
    db,
    table: "image_asset_magenta_revision_items",
    whereSql: `NOT EXISTS (
      SELECT 1
        FROM image_asset_magenta_revisions AS revision
        JOIN image_asset_sets AS asset_set ON asset_set.id = revision.set_id
        JOIN images AS image
          ON image.id = child.image_id
         AND image.user_id = revision.user_id
         AND image.user_id = asset_set.user_id
       WHERE revision.id = child.revision_id
    )`,
    key,
    maxOpaqueIdsPerTable,
    violations,
  });

  const summaries = Array.from(violations, ([table, violation]) =>
    Object.freeze({
      table,
      count: violation.count,
      opaqueRowIds: Object.freeze([...violation.opaqueRowIds].sort()),
    }),
  ).sort((left, right) => left.table.localeCompare(right.table));
  return Object.freeze({
    version: 1 as const,
    scannedTableCount: directOwnerTables.length,
    scannedRelationCount: relations.length,
    violationCount: summaries.reduce((sum, violation) => sum + violation.count, 0),
    violations: Object.freeze(summaries),
  });
}

export function assertLegacyAccountOwnersValid(
  db: DatabaseSync,
  options: Parameters<typeof validateLegacyAccountOwners>[1] = {},
): LegacyOwnerValidationReport {
  const report = validateLegacyAccountOwners(db, options);
  if (report.violationCount > 0) {
    throw new LegacyOwnerValidationError(report);
  }
  return report;
}

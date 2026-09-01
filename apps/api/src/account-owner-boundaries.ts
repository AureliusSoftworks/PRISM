import type { DatabaseSync } from "node:sqlite";

export const OWNER_CONSTRAINT_ERROR = "owner_constraint_violation";

type OwnerRelationSource =
  | "sqlite-foreign-key"
  | "logical-scalar-reference"
  | "serialized-reference-set"
  | "derived-owner-reference";

export type OwnerRelationEnforcement =
  | "native-owner-foreign-key"
  | "native-composite-owner-foreign-key"
  | "trigger-backed-composite-owner-check"
  | "json-array-owner-trigger"
  | "polymorphic-owner-trigger"
  | "derived-owner-trigger"
  | "validator-only-owner-check";

export interface OwnerRelationPredicate {
  column: string;
  equals: string;
  operator?: "equals" | "not-equals";
}

export interface AccountContentOwnerRelation {
  key: string;
  source: OwnerRelationSource;
  childTable: string;
  childOwnerColumn: string | null;
  childColumns: readonly string[];
  parentTable: string;
  parentOwnerColumn: string | null;
  parentColumns: readonly string[];
  parentAlternatives?: readonly string[];
  allowedChildValues?: readonly string[];
  enforcement: OwnerRelationEnforcement;
  when?: OwnerRelationPredicate;
  /**
   * A trigger is safe for an additive migration, but a future table rebuild
   * should replace it with a native composite FK. Keeping that debt attached
   * to each relation prevents a trigger-backed boundary being misreported as
   * final native coverage.
   */
  followUp: string | null;
}

interface TableColumn {
  name: string;
  notnull: number;
  pk: number;
}

interface ForeignKeyRow {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string | null;
}

interface UniqueIndexRow {
  name: string;
  unique: number;
  partial: number;
}

interface LogicalOwnerRelation {
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn?: string;
  when?: OwnerRelationPredicate;
  allowedChildValues?: readonly string[];
}

interface NonParentIdColumnDeclaration {
  table: string;
  column: string;
  reason: string;
}

/**
 * Every scalar *_id/id column on an owner table must either participate in an
 * owner relation or be declared here as a deliberately non-relational token.
 * This prevents a newly added parent pointer from silently bypassing the
 * owner-parent registry merely because SQLite has no FK for it yet.
 */
export const ACCOUNT_CONTENT_NON_PARENT_ID_COLUMNS: readonly NonParentIdColumnDeclaration[] =
  Object.freeze([
    { table: "action_sfx_pack_clips", column: "pack_generation_id", reason: "Opaque generation batch token." },
    { table: "applet_transcript_frame_samples", column: "entry_id", reason: "Client transcript entry key, not a persisted parent row." },
    { table: "botcast_episode_image_proxies", column: "image_id", reason: "Episode-owned replay proxy token, not an Image Library row." },
    { table: "bot_presence_beats", column: "response_id", reason: "Response correlation token whose source may be ephemeral." },
    { table: "coffee_directional_irritation", column: "last_transition_id", reason: "Idempotency token retained independently of ledger history." },
    { table: "coffee_directional_irritation_ledger", column: "transition_id", reason: "Ledger-local idempotency token." },
    { table: "conversations", column: "archive_batch_id", reason: "Recoverable archive operation token." },
    { table: "debate_mystery_asset_vault", column: "subject_id", reason: "Case-graph subject key inside the sealed case payload." },
    { table: "debate_mystery_audio_refs", column: "line_id", reason: "Case dialogue line key inside the sealed case payload." },
    { table: "debate_mystery_mansion_asset_refs", column: "logical_id", reason: "Portable bundle logical slot key." },
    { table: "debate_mystery_mansion_bundle_assets", column: "room_id", reason: "Portable room key embedded in the bundle manifest." },
    { table: "debate_mystery_mansion_prop_variants", column: "archetype_id", reason: "Closed system archetype identifier." },
    { table: "debate_mystery_v2_cases", column: "case_family_id", reason: "Stable family token that intentionally survives deletion of the source run." },
    { table: "debate_sessions", column: "player_side_id", reason: "Closed debate-side enum value." },
    { table: "debate_sessions", column: "winner_side_id", reason: "Closed debate-side enum value." },
    { table: "developer_transcript_events", column: "request_id", reason: "Diagnostic request correlation token." },
    { table: "legal_acceptances", column: "document_id", reason: "Immutable system legal-document identifier." },
    { table: "library_groups", column: "marketplace_theme_id", reason: "Immutable bundled Marketplace catalog identifier." },
    { table: "model_reasoning_effort_preferences", column: "model_id", reason: "System/provider model catalog identifier." },
    { table: "model_turbo_preferences", column: "model_id", reason: "System/provider model catalog identifier." },
    { table: "memories", column: "source_message_ids", reason: "Detached evidence provenance that may survive source-message deletion." },
    { table: "premium_voice_library", column: "source_voice_id", reason: "External voice-provider catalog identifier." },
    { table: "premium_voice_library", column: "provider_voice_id", reason: "External voice-provider catalog identifier." },
    { table: "premium_voice_library", column: "public_owner_id", reason: "External provider owner label, not a PRISM account id." },
    { table: "prism_action_proposals", column: "capability_id", reason: "Immutable system capability registry identifier." },
    { table: "prism_action_runs", column: "capability_id", reason: "Immutable system capability registry identifier." },
    { table: "prism_quarantine", column: "entity_id", reason: "Opaque quarantined entity label that must not be dereferenced." },
    { table: "replay_voice_takes", column: "source_message_id", reason: "Detached replay provenance token retained after source deletion." },
    { table: "replay_voice_takes", column: "source_event_id", reason: "Detached replay provenance token retained after source deletion." },
    { table: "slate_clarification_requests", column: "answer_choice_id", reason: "Choice key embedded in the request choices payload." },
    { table: "slate_narrative_edges", column: "branch_id", reason: "Narrative branch key embedded in Story Bible structures." },
    { table: "slate_review_circle_results", column: "reviewer_id", reason: "Reviewer snapshot identity retained without a live parent row." },
    { table: "slate_revisions", column: "structure_item_id", reason: "Structure key embedded in the project document." },
    { table: "slate_section_annotations", column: "block_id", reason: "Document block key embedded in the section document." },
    { table: "slate_sections", column: "structure_item_id", reason: "Structure key embedded in the project document." },
    { table: "slate_sections", column: "last_mutation_id", reason: "Idempotency token for the last applied mutation." },
    { table: "story_sessions", column: "theme_id", reason: "Immutable system Story theme identifier." },
    { table: "usage_events", column: "request_id", reason: "Request correlation token." },
    { table: "user_vault_keys", column: "key_id", reason: "Cryptographic key identifier scoped by the owner keyring." },
  ]);

const LOGICAL_OWNER_RELATIONS: readonly LogicalOwnerRelation[] = Object.freeze([
  {
    childTable: "action_sfx_pack_clips",
    childColumn: "owner_id",
    parentTable: "bots",
    when: { column: "owner_kind", equals: "bot" },
  },
  {
    childTable: "english_pacing_profiles",
    childColumn: "owner_id",
    parentTable: "bots",
    when: { column: "owner_kind", equals: "bot" },
  },
  ...[
    "applet_main_thread_census_samples",
    "applet_session_notes",
    "applet_transcript_frame_samples",
  ].flatMap((childTable): LogicalOwnerRelation[] => [
    {
      childTable,
      childColumn: "session_id",
      parentTable: "conversations",
      when: { column: "surface", equals: "coffee" },
    },
    {
      childTable,
      childColumn: "session_id",
      parentTable: "botcast_episodes",
      when: { column: "surface", equals: "signal" },
    },
    {
      childTable,
      childColumn: "session_id",
      parentTable: "debate_sessions",
      when: { column: "surface", equals: "debate" },
    },
    {
      childTable,
      childColumn: "session_id",
      parentTable: "story_sessions",
      when: { column: "surface", equals: "story" },
    },
  ]),
  {
    childTable: "audio_asset_usages",
    childColumn: "owner_id",
    parentTable: "botcast_shows",
    when: { column: "owner_type", equals: "signal-show" },
  },
  {
    childTable: "audio_asset_usages",
    childColumn: "owner_id",
    parentTable: "conversations",
    when: { column: "owner_type", equals: "coffee-session" },
  },
  {
    childTable: "audio_asset_usages",
    childColumn: "owner_id",
    parentTable: "coffee_groups",
    when: { column: "owner_type", equals: "coffee-group" },
  },
  ...["chat", "zen", "sandbox", "coffee"].map(
    (surface): LogicalOwnerRelation => ({
      childTable: "bot_presence_beats",
      childColumn: "session_id",
      parentTable: "conversations",
      when: { column: "surface", equals: surface },
    }),
  ),
  {
    childTable: "bot_presence_beats",
    childColumn: "session_id",
    parentTable: "botcast_episodes",
    when: { column: "surface", equals: "signal" },
  },
  {
    childTable: "bot_presence_beats",
    childColumn: "session_id",
    parentTable: "debate_sessions",
    when: { column: "surface", equals: "debate" },
  },
  { childTable: "bot_presence_beats", childColumn: "speaker_bot_id", parentTable: "bots" },
  { childTable: "bots", childColumn: "clone_family_id", parentTable: "bots" },
  { childTable: "bots", childColumn: "profile_picture_image_id", parentTable: "images" },
  { childTable: "bots", childColumn: "chat_atmosphere_image_id", parentTable: "images" },
  { childTable: "conversations", childColumn: "bot_id", parentTable: "bots" },
  { childTable: "conversations", childColumn: "parent_id", parentTable: "conversations" },
  { childTable: "conversations", childColumn: "fork_message_id", parentTable: "messages" },
  { childTable: "conversations", childColumn: "coffee_group_id", parentTable: "coffee_groups" },
  { childTable: "conversations", childColumn: "coffee_preset_id", parentTable: "coffee_presets" },
  { childTable: "conversations", childColumn: "zen_wallpaper_image_id", parentTable: "images" },
  { childTable: "messages", childColumn: "bot_id", parentTable: "bots" },
  { childTable: "memories", childColumn: "bot_id", parentTable: "bots" },
  { childTable: "memories", childColumn: "target_bot_id", parentTable: "bots" },
  { childTable: "memory_summaries", childColumn: "conversation_id", parentTable: "conversations" },
  { childTable: "zen_session_memories", childColumn: "conversation_id", parentTable: "conversations" },
  { childTable: "zen_session_memories", childColumn: "bot_id", parentTable: "bots" },
  { childTable: "images", childColumn: "conversation_id", parentTable: "conversations" },
  { childTable: "images", childColumn: "bot_id", parentTable: "bots" },
  { childTable: "library_groups", childColumn: "leader_bot_id", parentTable: "bots" },
  {
    childTable: "coffee_groups",
    childColumn: "library_group_id",
    parentTable: "library_groups",
    when: {
      column: "library_group_id",
      equals: "builtin:ungrouped",
      operator: "not-equals",
    },
  },
  { childTable: "coffee_group_seats", childColumn: "bot_id", parentTable: "bots" },
  { childTable: "coffee_bot_social_state", childColumn: "bot_id", parentTable: "bots" },
  { childTable: "coffee_cup_top_offs", childColumn: "bot_id", parentTable: "bots" },
  { childTable: "coffee_directional_irritation", childColumn: "subject_bot_id", parentTable: "bots" },
  { childTable: "coffee_directional_irritation", childColumn: "target_bot_id", parentTable: "bots" },
  { childTable: "coffee_directional_irritation_ledger", childColumn: "subject_bot_id", parentTable: "bots" },
  { childTable: "coffee_directional_irritation_ledger", childColumn: "target_bot_id", parentTable: "bots" },
  { childTable: "coffee_poll_votes", childColumn: "bot_id", parentTable: "bots" },
  {
    childTable: "coffee_context_sparks",
    childColumn: "source_session_id",
    parentTable: "conversations",
    when: { column: "source_applet", equals: "coffee" },
  },
  {
    childTable: "coffee_context_sparks",
    childColumn: "source_session_id",
    parentTable: "botcast_episodes",
    when: { column: "source_applet", equals: "signal" },
  },
  {
    childTable: "coffee_context_sparks",
    childColumn: "source_session_id",
    parentTable: "debate_sessions",
    when: { column: "source_applet", equals: "debate" },
  },
  { childTable: "session_opinions", childColumn: "bot_id", parentTable: "bots" },
  { childTable: "bot_opinions", childColumn: "bot_id", parentTable: "bots" },
  { childTable: "bot_relationships", childColumn: "source_bot_id", parentTable: "bots" },
  { childTable: "bot_relationships", childColumn: "target_bot_id", parentTable: "bots" },
  { childTable: "botcast_shows", childColumn: "host_bot_id", parentTable: "bots" },
  { childTable: "botcast_episodes", childColumn: "host_bot_id", parentTable: "bots" },
  {
    childTable: "botcast_episodes",
    childColumn: "guest_bot_id",
    parentTable: "bots",
    when: { column: "guest_kind", equals: "bot" },
  },
  { childTable: "botcast_episodes", childColumn: "persona_reviewer_bot_id", parentTable: "bots" },
  {
    childTable: "botcast_messages",
    childColumn: "bot_id",
    parentTable: "bots",
    allowedChildValues: Object.freeze(["__signal_producer_guest__"]),
  },
  { childTable: "botcast_host_recovery_candidates", childColumn: "bot_id", parentTable: "bots" },
  { childTable: "conversation_exports", childColumn: "bot_id", parentTable: "bots" },
  { childTable: "memory_acquisition_receipts", childColumn: "learner_bot_id", parentTable: "bots" },
  { childTable: "memory_acquisition_receipts", childColumn: "target_bot_id", parentTable: "bots" },
  { childTable: "memory_relationship_projections", childColumn: "source_bot_id", parentTable: "bots" },
  { childTable: "memory_relationship_projections", childColumn: "target_bot_id", parentTable: "bots" },
  { childTable: "prism_action_proposals", childColumn: "executed_run_id", parentTable: "prism_action_runs" },
  {
    childTable: "replay_recordings",
    childColumn: "source_id",
    parentTable: "botcast_episodes",
    when: { column: "surface", equals: "signal" },
  },
  {
    childTable: "replay_recordings",
    childColumn: "source_id",
    parentTable: "conversations",
    when: { column: "surface", equals: "coffee" },
  },
  {
    childTable: "slate_clarification_requests",
    childColumn: "mirror_profile_version_id",
    parentTable: "slate_mirror_profile_versions",
  },
  {
    childTable: "slate_writing_operations",
    childColumn: "mirror_profile_version_id",
    parentTable: "slate_mirror_profile_versions",
  },
  { childTable: "slate_handoffs", childColumn: "source_conversation_id", parentTable: "conversations" },
  { childTable: "slate_handoffs", childColumn: "source_message_id", parentTable: "messages" },
  { childTable: "slate_handoffs", childColumn: "source_project_id", parentTable: "slate_projects" },
  { childTable: "slate_handoffs", childColumn: "source_section_id", parentTable: "slate_sections" },
  { childTable: "slate_handoffs", childColumn: "target_project_id", parentTable: "slate_projects" },
  ...["chat", "zen", "coffee"].map(
    (surface): LogicalOwnerRelation => ({
      childTable: "live_session_focus_events",
      childColumn: "session_id",
      parentTable: "conversations",
      when: { column: "surface", equals: surface },
    }),
  ),
  {
    childTable: "live_session_focus_events",
    childColumn: "session_id",
    parentTable: "botcast_episodes",
    when: { column: "surface", equals: "signal" },
  },
  {
    childTable: "live_session_focus_events",
    childColumn: "session_id",
    parentTable: "debate_sessions",
    when: { column: "surface", equals: "debate" },
  },
  {
    childTable: "live_session_focus_events",
    childColumn: "session_id",
    parentTable: "story_sessions",
    when: { column: "surface", equals: "story" },
  },
]);

interface SerializedOwnerRelation {
  childTable: string;
  childColumn: string;
  parentTable: string;
}

const SERIALIZED_OWNER_RELATIONS: readonly SerializedOwnerRelation[] =
  Object.freeze([
    {
      childTable: "coffee_context_sparks",
      childColumn: "source_participant_bot_ids",
      parentTable: "bots",
    },
    {
      childTable: "conversation_sweep_batches",
      childColumn: "archived_conversation_ids",
      parentTable: "conversations",
    },
    {
      childTable: "conversation_sweep_batches",
      childColumn: "summary_conversation_ids",
      parentTable: "conversations",
    },
    {
      childTable: "conversations",
      childColumn: "bot_group_ids",
      parentTable: "bots",
    },
    {
      childTable: "conversations",
      childColumn: "coffee_absent_bot_ids",
      parentTable: "bots",
    },
    {
      childTable: "images",
      childColumn: "related_bot_ids",
      parentTable: "bots",
    },
    {
      childTable: "messages",
      childColumn: "coffee_audience_bot_ids",
      parentTable: "bots",
    },
    {
      childTable: "story_sessions",
      childColumn: "bot_ids",
      parentTable: "bots",
    },
  ]);

const DERIVED_OWNER_RELATIONS: readonly AccountContentOwnerRelation[] = Object.freeze([
  Object.freeze({
    key: "derived:image_asset_set_items.image_id->images.id",
    source: "derived-owner-reference" as const,
    childTable: "image_asset_set_items",
    childOwnerColumn: null,
    childColumns: Object.freeze(["set_id", "image_id"]),
    parentTable: "images",
    parentOwnerColumn: "user_id",
    parentColumns: Object.freeze(["id"]),
    enforcement: "derived-owner-trigger" as const,
    followUp:
      "Rebuild image_asset_set_items with user_id and composite owner FKs to image_asset_sets and images.",
  }),
  Object.freeze({
    key: "derived:image_asset_magenta_revision_items.image_id->images.id",
    source: "derived-owner-reference" as const,
    childTable: "image_asset_magenta_revision_items",
    childOwnerColumn: null,
    childColumns: Object.freeze(["revision_id", "image_id"]),
    parentTable: "images",
    parentOwnerColumn: "user_id",
    parentColumns: Object.freeze(["id"]),
    enforcement: "derived-owner-trigger" as const,
    followUp:
      "Rebuild image_asset_magenta_revision_items with user_id and composite owner FKs to its revision and image.",
  }),
  Object.freeze({
    key: "derived:image_asset_search.set_id->image_asset_sets.id",
    source: "derived-owner-reference" as const,
    childTable: "image_asset_search",
    childOwnerColumn: "user_id",
    childColumns: Object.freeze(["set_id"]),
    parentTable: "image_asset_sets",
    parentOwnerColumn: "user_id",
    parentColumns: Object.freeze(["id"]),
    enforcement: "validator-only-owner-check" as const,
    followUp:
      "FTS5 forbids table triggers; keep catalog writes owner-first and rebuild this derived index only after legacy-owner validation.",
  }),
  Object.freeze({
    key: "derived:memories.conversation_id->account-session-union.id",
    source: "derived-owner-reference" as const,
    childTable: "memories",
    childOwnerColumn: "user_id",
    childColumns: Object.freeze(["conversation_id"]),
    parentTable: "conversations",
    parentAlternatives: Object.freeze([
      "conversations",
      "botcast_episodes",
      "debate_sessions",
      "story_sessions",
    ]),
    parentOwnerColumn: "user_id",
    parentColumns: Object.freeze(["id"]),
    enforcement: "polymorphic-owner-trigger" as const,
    followUp:
      "Add an explicit session kind and native owner-bound parent tables before Vault migration of memory session provenance.",
  }),
  Object.freeze({
    key: "derived:memory_acquisition_receipts.conversation_id->account-session-union.id",
    source: "derived-owner-reference" as const,
    childTable: "memory_acquisition_receipts",
    childOwnerColumn: "user_id",
    childColumns: Object.freeze(["conversation_id"]),
    parentTable: "conversations",
    parentAlternatives: Object.freeze([
      "conversations",
      "botcast_episodes",
      "debate_sessions",
      "story_sessions",
    ]),
    parentOwnerColumn: "user_id",
    parentColumns: Object.freeze(["id"]),
    enforcement: "polymorphic-owner-trigger" as const,
    followUp:
      "Add an explicit session kind and native owner-bound parent tables before Vault migration of acquisition-receipt provenance.",
  }),
]);

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

function quoteIdentifier(identifier: string): string {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error("Account owner relation contains an invalid SQL identifier.");
  }
  return `"${identifier}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function tableColumns(db: DatabaseSync, table: string): TableColumn[] {
  return db
    .prepare(`PRAGMA table_xinfo(${quoteIdentifier(table)})`)
    .all()
    .map((row) => {
      const value = row as Record<string, unknown>;
      return {
        name: String(value.name),
        notnull: Number(value.notnull),
        pk: Number(value.pk),
      };
    });
}

function tableNames(db: DatabaseSync): string[] {
  return db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = ? AND name NOT LIKE ? ORDER BY name",
    )
    .all("table", "sqlite_%")
    .map((row) => String((row as { name: unknown }).name));
}

function directOwnerTableNames(db: DatabaseSync): string[] {
  return tableNames(db).filter((table) =>
    tableColumns(db, table).some((column) => column.name === "user_id"),
  );
}

function virtualTableNames(db: DatabaseSync): ReadonlySet<string> {
  return new Set(
    db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type = ? AND upper(ltrim(sql)) LIKE ?",
      )
      .all("table", "CREATE VIRTUAL TABLE%")
      .map((row) => String((row as { name: unknown }).name)),
  );
}

function triggerableDirectOwnerTableNames(db: DatabaseSync): string[] {
  const virtualTables = virtualTableNames(db);
  return directOwnerTableNames(db).filter((table) => !virtualTables.has(table));
}

function ownerIndependentUniqueKeys(
  db: DatabaseSync,
  table: string,
): readonly (readonly string[])[] {
  const keys: string[][] = [];
  const primaryKey = tableColumns(db, table)
    .filter((column) => column.pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map((column) => column.name);
  if (primaryKey.length > 0 && !primaryKey.includes("user_id")) {
    keys.push(primaryKey);
  }
  const indexes = db
    .prepare(`PRAGMA index_list(${quoteIdentifier(table)})`)
    .all()
    .map((row) => {
      const value = row as Record<string, unknown>;
      return {
        name: String(value.name),
        unique: Number(value.unique),
        partial: Number(value.partial),
      } satisfies UniqueIndexRow;
    });
  for (const index of indexes) {
    if (index.unique !== 1 || index.partial === 1) continue;
    const columns = db
      .prepare(`PRAGMA index_info(${quoteIdentifier(index.name)})`)
      .all()
      .map((row) => (row as { name?: unknown }).name)
      .filter((name): name is string => typeof name === "string" && name.length > 0);
    if (columns.length === 0 || columns.includes("user_id")) continue;
    keys.push(columns);
  }
  const seen = new Set<string>();
  return Object.freeze(
    keys.flatMap((columns) => {
      const key = columns.join("\0");
      if (seen.has(key)) return [];
      seen.add(key);
      return [Object.freeze(columns)];
    }),
  );
}

function relationKey(
  source: OwnerRelationSource,
  childTable: string,
  childColumns: readonly string[],
  parentTable: string,
  parentColumns: readonly string[],
  when?: OwnerRelationPredicate,
): string {
  return [
    source,
    `${childTable}.${childColumns.join("+")}`,
    `${parentTable}.${parentColumns.join("+")}`,
    when
      ? `${when.column}${when.operator === "not-equals" ? "!=" : "="}${when.equals}`
      : "always",
  ].join(":");
}

function nativeRelations(db: DatabaseSync): AccountContentOwnerRelation[] {
  const names = tableNames(db);
  const columnsByTable = new Map(
    names.map((table) => [table, tableColumns(db, table)] as const),
  );
  const directOwnerTables = new Set(
    names.filter((table) =>
      columnsByTable.get(table)?.some((column) => column.name === "user_id"),
    ),
  );
  const relations: AccountContentOwnerRelation[] = [];

  for (const childTable of names) {
    if (!directOwnerTables.has(childTable)) continue;
    const rows = db
      .prepare(`PRAGMA foreign_key_list(${quoteIdentifier(childTable)})`)
      .all()
      .map((row) => {
        const value = row as Record<string, unknown>;
        return {
          id: Number(value.id),
          seq: Number(value.seq),
          table: String(value.table),
          from: String(value.from),
          to: typeof value.to === "string" ? value.to : null,
        } satisfies ForeignKeyRow;
      });
    const groups = new Map<number, ForeignKeyRow[]>();
    for (const row of rows) {
      const group = groups.get(row.id) ?? [];
      group.push(row);
      groups.set(row.id, group);
    }
    for (const group of groups.values()) {
      group.sort((a, b) => a.seq - b.seq);
      const parentTable = group[0]?.table;
      if (!parentTable) continue;
      if (parentTable === "users") {
        relations.push(
          Object.freeze({
            key: relationKey(
              "sqlite-foreign-key",
              childTable,
              group.map((row) => row.from),
              parentTable,
              group.map((row) => row.to ?? "id"),
            ),
            source: "sqlite-foreign-key",
            childTable,
            childOwnerColumn: "user_id",
            childColumns: Object.freeze(group.map((row) => row.from)),
            parentTable,
            parentOwnerColumn: null,
            parentColumns: Object.freeze(group.map((row) => row.to ?? "id")),
            enforcement: "native-owner-foreign-key",
            followUp: null,
          }),
        );
        continue;
      }
      if (!directOwnerTables.has(parentTable)) continue;
      const ownerPair = group.find(
        (row) => row.from === "user_id" && row.to === "user_id",
      );
      const referencePairs = group.filter((row) => row !== ownerPair);
      if (referencePairs.length === 0) continue;
      const childColumns = Object.freeze(referencePairs.map((row) => row.from));
      const parentColumns = Object.freeze(
        referencePairs.map((row) => row.to ?? "id"),
      );
      const enforcement = ownerPair
        ? "native-composite-owner-foreign-key"
        : "trigger-backed-composite-owner-check";
      relations.push(
        Object.freeze({
          key: relationKey(
            "sqlite-foreign-key",
            childTable,
            childColumns,
            parentTable,
            parentColumns,
          ),
          source: "sqlite-foreign-key",
          childTable,
          childOwnerColumn: "user_id",
          childColumns,
          parentTable,
          parentOwnerColumn: "user_id",
          parentColumns,
          enforcement,
          followUp: ownerPair
            ? null
            : `Rebuild ${childTable} with FOREIGN KEY(user_id, ${childColumns.join(", ")}) REFERENCES ${parentTable}(user_id, ${parentColumns.join(", ")}).`,
        }),
      );
    }
  }
  return relations;
}

function logicalRelations(db: DatabaseSync): AccountContentOwnerRelation[] {
  const columnsByTable = new Map(
    tableNames(db).map((table) => [
      table,
      new Set(tableColumns(db, table).map((column) => column.name)),
    ] as const),
  );
  return LOGICAL_OWNER_RELATIONS.map((relation) => {
    const parentColumn = relation.parentColumn ?? "id";
    const childColumns = columnsByTable.get(relation.childTable);
    const parentColumns = columnsByTable.get(relation.parentTable);
    if (
      !childColumns?.has("user_id") ||
      !childColumns.has(relation.childColumn) ||
      !parentColumns?.has("user_id") ||
      !parentColumns.has(parentColumn) ||
      (relation.when && !childColumns.has(relation.when.column))
    ) {
      throw new Error("A declared logical owner relation no longer matches the schema.");
    }
    return Object.freeze({
      key: relationKey(
        "logical-scalar-reference",
        relation.childTable,
        [relation.childColumn],
        relation.parentTable,
        [parentColumn],
        relation.when,
      ),
      source: "logical-scalar-reference" as const,
      childTable: relation.childTable,
      childOwnerColumn: "user_id",
      childColumns: Object.freeze([relation.childColumn]),
      parentTable: relation.parentTable,
      parentOwnerColumn: "user_id",
      parentColumns: Object.freeze([parentColumn]),
      enforcement: "trigger-backed-composite-owner-check" as const,
      ...(relation.when ? { when: Object.freeze(relation.when) } : {}),
      ...(relation.allowedChildValues
        ? { allowedChildValues: Object.freeze([...relation.allowedChildValues]) }
        : {}),
      followUp: `Rebuild ${relation.childTable} with a native composite owner FK for ${relation.childColumn}.`,
    });
  });
}

function serializedRelations(db: DatabaseSync): AccountContentOwnerRelation[] {
  const columnsByTable = new Map(
    tableNames(db).map((table) => [
      table,
      new Set(tableColumns(db, table).map((column) => column.name)),
    ] as const),
  );
  return SERIALIZED_OWNER_RELATIONS.map((relation) => {
    if (
      !columnsByTable.get(relation.childTable)?.has("user_id") ||
      !columnsByTable.get(relation.childTable)?.has(relation.childColumn) ||
      !columnsByTable.get(relation.parentTable)?.has("user_id") ||
      !columnsByTable.get(relation.parentTable)?.has("id")
    ) {
      throw new Error("A declared serialized owner relation no longer matches the schema.");
    }
    return Object.freeze({
      key: relationKey(
        "serialized-reference-set",
        relation.childTable,
        [relation.childColumn],
        relation.parentTable,
        ["id"],
      ),
      source: "serialized-reference-set" as const,
      childTable: relation.childTable,
      childOwnerColumn: "user_id",
      childColumns: Object.freeze([relation.childColumn]),
      parentTable: relation.parentTable,
      parentOwnerColumn: "user_id",
      parentColumns: Object.freeze(["id"]),
      enforcement: "json-array-owner-trigger" as const,
      followUp: `Normalize ${relation.childTable}.${relation.childColumn} into an owner-bound child table with a native composite FK.`,
    });
  });
}

export function inspectAccountContentOwnerRelations(
  db: DatabaseSync,
): readonly AccountContentOwnerRelation[] {
  const relations = [
    ...nativeRelations(db),
    ...logicalRelations(db),
    ...serializedRelations(db),
    ...DERIVED_OWNER_RELATIONS,
  ];
  const keys = new Set<string>();
  for (const relation of relations) {
    if (keys.has(relation.key)) {
      throw new Error("Duplicate account owner relation declaration.");
    }
    keys.add(relation.key);
  }
  return Object.freeze(relations);
}

export interface AccountContentIdColumnInventoryEntry {
  table: string;
  column: string;
  classification: "owner-relation" | "non-parent-id";
  relationKeys: readonly string[];
  reason: string | null;
}

export interface AccountContentIdColumnCoverage {
  idColumnCount: number;
  relationalIdColumnCount: number;
  nonParentIdColumnCount: number;
}

function accountContentIdColumnInventory(
  db: DatabaseSync,
  relations: readonly AccountContentOwnerRelation[],
): readonly AccountContentIdColumnInventoryEntry[] {
  const relationKeysByColumn = new Map<string, string[]>();
  for (const relation of relations) {
    if (relation.childOwnerColumn !== "user_id") continue;
    for (const column of relation.childColumns) {
      const key = `${relation.childTable}.${column}`;
      const keys = relationKeysByColumn.get(key) ?? [];
      keys.push(relation.key);
      relationKeysByColumn.set(key, keys);
    }
  }
  const declaredNonParents = new Map<string, NonParentIdColumnDeclaration>();
  for (const declaration of ACCOUNT_CONTENT_NON_PARENT_ID_COLUMNS) {
    const key = `${declaration.table}.${declaration.column}`;
    if (declaredNonParents.has(key)) {
      throw new Error("Duplicate non-parent account-content id declaration.");
    }
    declaredNonParents.set(key, declaration);
  }

  const entries: AccountContentIdColumnInventoryEntry[] = [];
  const observedKeys = new Set<string>();
  for (const table of directOwnerTableNames(db)) {
    for (const column of tableColumns(db, table)) {
      if (
        column.name === "id" ||
        column.name === "user_id" ||
        !/(?:^|_)ids?$/u.test(column.name)
      ) {
        continue;
      }
      const key = `${table}.${column.name}`;
      observedKeys.add(key);
      const relationKeys = relationKeysByColumn.get(key) ?? [];
      const nonParent = declaredNonParents.get(key);
      if ((relationKeys.length > 0) === Boolean(nonParent)) {
        throw new Error(
          "An account-content id column is unclassified or ambiguously classified.",
        );
      }
      entries.push(
        Object.freeze({
          table,
          column: column.name,
          classification:
            relationKeys.length > 0 ? "owner-relation" : "non-parent-id",
          relationKeys: Object.freeze([...relationKeys].sort()),
          reason: nonParent?.reason ?? null,
        }),
      );
    }
  }
  for (const key of declaredNonParents.keys()) {
    if (!observedKeys.has(key)) {
      throw new Error("A non-parent account-content id declaration is stale.");
    }
  }
  return Object.freeze(
    entries.sort((left, right) =>
      `${left.table}.${left.column}`.localeCompare(`${right.table}.${right.column}`),
    ),
  );
}

export function inspectAccountContentIdColumns(
  db: DatabaseSync,
): readonly AccountContentIdColumnInventoryEntry[] {
  return accountContentIdColumnInventory(db, inspectAccountContentOwnerRelations(db));
}

export function assertAccountContentIdColumnCoverage(
  db: DatabaseSync,
): AccountContentIdColumnCoverage {
  const entries = inspectAccountContentIdColumns(db);
  return Object.freeze({
    idColumnCount: entries.length,
    relationalIdColumnCount: entries.filter(
      (entry) => entry.classification === "owner-relation",
    ).length,
    nonParentIdColumnCount: entries.filter(
      (entry) => entry.classification === "non-parent-id",
    ).length,
  });
}

function triggerPredicate(relation: AccountContentOwnerRelation): string {
  if (relation.enforcement === "polymorphic-owner-trigger") {
    const childColumn = quoteIdentifier(relation.childColumns[0]!);
    const parentColumn = quoteIdentifier(relation.parentColumns[0]!);
    const alternatives = relation.parentAlternatives ?? [relation.parentTable];
    const parentMatches = alternatives
      .map(
        (table) =>
          `EXISTS (SELECT 1 FROM ${quoteIdentifier(table)} AS parent WHERE parent.${quoteIdentifier(relation.parentOwnerColumn!)} = NEW.${quoteIdentifier(relation.childOwnerColumn!)} AND parent.${parentColumn} = NEW.${childColumn})`,
      )
      .join(" OR ");
    return `NEW.${childColumn} IS NOT NULL AND NOT (${parentMatches})`;
  }
  if (relation.enforcement === "json-array-owner-trigger") {
    const childColumn = quoteIdentifier(relation.childColumns[0]!);
    const parentColumn = quoteIdentifier(relation.parentColumns[0]!);
    return `(CASE
      WHEN NEW.${childColumn} IS NULL THEN 0
      WHEN typeof(NEW.${childColumn}) = 'blob'
        AND ${quoteLiteral(`${relation.childTable}.${relation.childColumns[0]}`)} = 'coffee_context_sparks.source_participant_bot_ids'
        THEN 0
      WHEN json_valid(NEW.${childColumn}) = 0 THEN 1
      WHEN json_type(NEW.${childColumn}) <> 'array' THEN 1
      WHEN EXISTS (
        SELECT 1
          FROM json_each(NEW.${childColumn}) AS owner_ref
         WHERE owner_ref.type NOT IN ('text', 'null')
            OR (owner_ref.type = 'text' AND (
              trim(CAST(owner_ref.value AS TEXT)) = ''
              OR NOT EXISTS (
                SELECT 1
                  FROM ${quoteIdentifier(relation.parentTable)} AS parent
                 WHERE parent.${quoteIdentifier(relation.parentOwnerColumn!)} = NEW.${quoteIdentifier(relation.childOwnerColumn!)}
                   AND parent.${parentColumn} = CAST(owner_ref.value AS TEXT)
              )
            ))
      ) THEN 1
      ELSE 0
    END) = 1`;
  }
  const referencesPresent = relation.childColumns
    .map((column) => `NEW.${quoteIdentifier(column)} IS NOT NULL`)
    .join(" AND ");
  const parentMatch = relation.childColumns
    .map(
      (column, index) =>
        `parent.${quoteIdentifier(relation.parentColumns[index]!)} = NEW.${quoteIdentifier(column)}`,
    )
    .join(" AND ");
  const when = relation.when
    ? `NEW.${quoteIdentifier(relation.when.column)} ${
        relation.when.operator === "not-equals" ? "<>" : "="
      } ${quoteLiteral(relation.when.equals)}`
    : "1";
  const allowedChildValue = relation.allowedChildValues?.length
    ? relation.allowedChildValues
        .map(
          (value) =>
            `NEW.${quoteIdentifier(relation.childColumns[0]!)} = ${quoteLiteral(value)}`,
        )
        .join(" OR ")
    : "0";
  return `(${when}) AND (${referencesPresent}) AND NOT ((${allowedChildValue}) OR EXISTS (SELECT 1 FROM ${quoteIdentifier(relation.parentTable)} AS parent WHERE parent.${quoteIdentifier(relation.parentOwnerColumn!)} = NEW.${quoteIdentifier(relation.childOwnerColumn!)} AND ${parentMatch}))`;
}

function ensureDirectOwnerTriggers(
  db: DatabaseSync,
  relations: readonly AccountContentOwnerRelation[],
): void {
  const guarded = relations.filter(
    (relation) =>
      (relation.enforcement === "trigger-backed-composite-owner-check" ||
        relation.enforcement === "json-array-owner-trigger" ||
        relation.enforcement === "polymorphic-owner-trigger") &&
      relation.childOwnerColumn !== null &&
      relation.parentOwnerColumn !== null,
  );
  for (const relation of guarded) {
    for (const parentTable of relation.parentAlternatives ?? [relation.parentTable]) {
      const indexName = `owner_pair_${parentTable}_${relation.parentColumns.join("_")}`;
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdentifier(indexName)} ON ${quoteIdentifier(parentTable)} (${quoteIdentifier(relation.parentOwnerColumn!)}, ${relation.parentColumns.map(quoteIdentifier).join(", ")});`,
      );
    }
  }
  const byChild = new Map<string, AccountContentOwnerRelation[]>();
  for (const relation of guarded) {
    const group = byChild.get(relation.childTable) ?? [];
    group.push(relation);
    byChild.set(relation.childTable, group);
  }
  for (const [childTable, childRelations] of byChild) {
    const checks = childRelations
      .map(
        (relation) =>
          `/* owner-relation ${relation.key} */
          SELECT CASE WHEN ${triggerPredicate(relation)} THEN RAISE(ABORT, '${OWNER_CONSTRAINT_ERROR}') END;`,
      )
      .join("\n");
    const updateColumns = Array.from(
      new Set(
        childRelations.flatMap((relation) => [
          relation.childOwnerColumn!,
          ...relation.childColumns,
          ...(relation.when ? [relation.when.column] : []),
        ]),
      ),
    );
    db.exec(`
      DROP TRIGGER IF EXISTS ${quoteIdentifier(`owner_guard_${childTable}_insert`)};
      DROP TRIGGER IF EXISTS ${quoteIdentifier(`owner_guard_${childTable}_update`)};
      CREATE TRIGGER ${quoteIdentifier(`owner_guard_${childTable}_insert`)}
      BEFORE INSERT ON ${quoteIdentifier(childTable)}
      BEGIN
        ${checks}
      END;
      CREATE TRIGGER ${quoteIdentifier(`owner_guard_${childTable}_update`)}
      BEFORE UPDATE OF ${updateColumns.map(quoteIdentifier).join(", ")} ON ${quoteIdentifier(childTable)}
      BEGIN
        ${checks}
      END;
    `);
  }
}

function ensureDerivedOwnerTriggers(db: DatabaseSync): void {
  db.exec(`
    DROP TRIGGER IF EXISTS owner_guard_image_asset_set_items_insert;
    DROP TRIGGER IF EXISTS owner_guard_image_asset_set_items_update;
    DROP TRIGGER IF EXISTS owner_guard_image_asset_magenta_revision_items_insert;
    DROP TRIGGER IF EXISTS owner_guard_image_asset_magenta_revision_items_update;
    CREATE TRIGGER owner_guard_image_asset_set_items_insert
    BEFORE INSERT ON image_asset_set_items
    WHEN NOT EXISTS (
      SELECT 1
        FROM image_asset_sets AS asset_set
        JOIN images AS image
          ON image.id = NEW.image_id
         AND image.user_id = asset_set.user_id
       WHERE asset_set.id = NEW.set_id
    )
    BEGIN
      SELECT RAISE(ABORT, '${OWNER_CONSTRAINT_ERROR}');
    END;
    CREATE TRIGGER owner_guard_image_asset_set_items_update
    BEFORE UPDATE OF set_id, image_id ON image_asset_set_items
    WHEN NOT EXISTS (
      SELECT 1
        FROM image_asset_sets AS asset_set
        JOIN images AS image
          ON image.id = NEW.image_id
         AND image.user_id = asset_set.user_id
       WHERE asset_set.id = NEW.set_id
    )
    BEGIN
      SELECT RAISE(ABORT, '${OWNER_CONSTRAINT_ERROR}');
    END;
    CREATE TRIGGER owner_guard_image_asset_magenta_revision_items_insert
    BEFORE INSERT ON image_asset_magenta_revision_items
    WHEN NOT EXISTS (
      SELECT 1
        FROM image_asset_magenta_revisions AS revision
        JOIN image_asset_sets AS asset_set ON asset_set.id = revision.set_id
        JOIN images AS image
          ON image.id = NEW.image_id
         AND image.user_id = revision.user_id
         AND image.user_id = asset_set.user_id
       WHERE revision.id = NEW.revision_id
    )
    BEGIN
      SELECT RAISE(ABORT, '${OWNER_CONSTRAINT_ERROR}');
    END;
    CREATE TRIGGER owner_guard_image_asset_magenta_revision_items_update
    BEFORE UPDATE OF revision_id, image_id ON image_asset_magenta_revision_items
    WHEN NOT EXISTS (
      SELECT 1
        FROM image_asset_magenta_revisions AS revision
        JOIN image_asset_sets AS asset_set ON asset_set.id = revision.set_id
        JOIN images AS image
          ON image.id = NEW.image_id
         AND image.user_id = revision.user_id
         AND image.user_id = asset_set.user_id
       WHERE revision.id = NEW.revision_id
    )
    BEGIN
      SELECT RAISE(ABORT, '${OWNER_CONSTRAINT_ERROR}');
    END;
  `);
}

/**
 * Prevents owner reassignment and INSERT OR REPLACE from taking over a
 * globally unique legacy id. This is intentionally additive: existing rows
 * are left untouched for the fail-closed legacy validator.
 */
function ensureOwnerRowIdentityTriggers(db: DatabaseSync): void {
  for (const table of triggerableDirectOwnerTableNames(db)) {
    const collisionChecks = ownerIndependentUniqueKeys(db, table)
      .map((columns) => {
        const valuesPresent = columns
          .map((column) => `NEW.${quoteIdentifier(column)} IS NOT NULL`)
          .join(" AND ");
        const identityMatch = columns
          .map(
            (column) =>
              `existing.${quoteIdentifier(column)} = NEW.${quoteIdentifier(column)}`,
          )
          .join(" AND ");
        return `SELECT CASE WHEN (${valuesPresent}) AND EXISTS (SELECT 1 FROM ${quoteIdentifier(table)} AS existing WHERE existing.user_id <> NEW.user_id AND ${identityMatch}) THEN RAISE(ABORT, '${OWNER_CONSTRAINT_ERROR}') END;`;
      })
      .join("\n");
    db.exec(`
      DROP TRIGGER IF EXISTS ${quoteIdentifier(`owner_row_guard_${table}_insert`)};
      DROP TRIGGER IF EXISTS ${quoteIdentifier(`owner_row_guard_${table}_update`)};
      CREATE TRIGGER ${quoteIdentifier(`owner_row_guard_${table}_insert`)}
      BEFORE INSERT ON ${quoteIdentifier(table)}
      BEGIN
        SELECT CASE WHEN NEW.user_id IS NULL OR trim(CAST(NEW.user_id AS TEXT)) = '' OR NOT EXISTS (SELECT 1 FROM users AS owner WHERE owner.id = NEW.user_id) THEN RAISE(ABORT, '${OWNER_CONSTRAINT_ERROR}') END;
        ${collisionChecks}
      END;
      CREATE TRIGGER ${quoteIdentifier(`owner_row_guard_${table}_update`)}
      BEFORE UPDATE OF user_id ON ${quoteIdentifier(table)}
      BEGIN
        SELECT CASE WHEN NEW.user_id IS NULL OR trim(CAST(NEW.user_id AS TEXT)) = '' OR NOT EXISTS (SELECT 1 FROM users AS owner WHERE owner.id = NEW.user_id) OR OLD.user_id IS NOT NEW.user_id THEN RAISE(ABORT, '${OWNER_CONSTRAINT_ERROR}') END;
      END;
    `);
  }
}

/**
 * Additive enforcement for legacy SQLite tables. Native composite FKs require
 * table rebuilds, so this child installs equivalent owner checks and records a
 * per-relation rebuild follow-up instead of rewriting account content in place.
 */
export function ensureAccountOwnerBoundarySchema(db: DatabaseSync): void {
  const relations = inspectAccountContentOwnerRelations(db);
  ensureOwnerRowIdentityTriggers(db);
  ensureDirectOwnerTriggers(db, relations);
  ensureDerivedOwnerTriggers(db);
}

export interface AccountOwnerRelationCoverage {
  relationCount: number;
  ownerAnchorCount: number;
  ownerRowGuardCount: number;
  ownerValidatorOnlyCount: number;
  nativeCompositeCount: number;
  triggerBackedCount: number;
  serializedOwnerCount: number;
  polymorphicOwnerCount: number;
  derivedOwnerCount: number;
  validatorOnlyRelationCount: number;
  followUpCount: number;
  idColumnCount: number;
  relationalIdColumnCount: number;
  nonParentIdColumnCount: number;
}

export function assertAccountOwnerRelationCoverage(
  db: DatabaseSync,
): AccountOwnerRelationCoverage {
  const relations = inspectAccountContentOwnerRelations(db);
  const idColumnCoverage = accountContentIdColumnInventory(db, relations);
  const ownerTables = triggerableDirectOwnerTableNames(db);
  const ownerValidatorOnlyCount =
    directOwnerTableNames(db).length - ownerTables.length;
  const triggerSqlByName = new Map(
    db
      .prepare("SELECT name, sql FROM sqlite_schema WHERE type = ?")
      .all("trigger")
      .map((row) => {
        const value = row as { name: unknown; sql?: unknown };
        return [
          String(value.name),
          typeof value.sql === "string" ? value.sql : "",
        ] as const;
      }),
  );
  for (const relation of relations) {
    if (
      relation.enforcement === "trigger-backed-composite-owner-check" ||
      relation.enforcement === "json-array-owner-trigger" ||
      relation.enforcement === "polymorphic-owner-trigger"
    ) {
      for (const operation of ["insert", "update"] as const) {
        const sql = triggerSqlByName.get(
          `owner_guard_${relation.childTable}_${operation}`,
        );
        if (!sql || !sql.includes(`owner-relation ${relation.key}`)) {
          throw new Error("An account owner relation is declared but not enforced.");
        }
      }
    }
    if (relation.enforcement === "derived-owner-trigger") {
      for (const operation of ["insert", "update"] as const) {
        if (!triggerSqlByName.has(`owner_guard_${relation.childTable}_${operation}`)) {
          throw new Error("A derived owner relation is declared but not enforced.");
        }
      }
    }
  }
  for (const table of ownerTables) {
    for (const operation of ["insert", "update"] as const) {
      if (!triggerSqlByName.has(`owner_row_guard_${table}_${operation}`)) {
        throw new Error("An account-content table is missing its owner row guard.");
      }
    }
  }
  return Object.freeze({
    relationCount: relations.length,
    ownerAnchorCount: relations.filter(
      (relation) => relation.enforcement === "native-owner-foreign-key",
    ).length,
    ownerRowGuardCount: ownerTables.length,
    ownerValidatorOnlyCount,
    nativeCompositeCount: relations.filter(
      (relation) => relation.enforcement === "native-composite-owner-foreign-key",
    ).length,
    triggerBackedCount: relations.filter(
      (relation) => relation.enforcement === "trigger-backed-composite-owner-check",
    ).length,
    serializedOwnerCount: relations.filter(
      (relation) => relation.enforcement === "json-array-owner-trigger",
    ).length,
    polymorphicOwnerCount: relations.filter(
      (relation) => relation.enforcement === "polymorphic-owner-trigger",
    ).length,
    derivedOwnerCount: relations.filter(
      (relation) => relation.enforcement === "derived-owner-trigger",
    ).length,
    validatorOnlyRelationCount: relations.filter(
      (relation) => relation.enforcement === "validator-only-owner-check",
    ).length,
    followUpCount: relations.filter((relation) => relation.followUp !== null).length,
    idColumnCount: idColumnCoverage.length,
    relationalIdColumnCount: idColumnCoverage.filter(
      (entry) => entry.classification === "owner-relation",
    ).length,
    nonParentIdColumnCount: idColumnCoverage.filter(
      (entry) => entry.classification === "non-parent-id",
    ).length,
  });
}

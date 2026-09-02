import type { DatabaseSync, StatementSync } from "node:sqlite";
import { createHash } from "node:crypto";
import {
  decryptJson,
  decryptText,
  deriveMasterKey,
  encryptJson,
} from "./security.ts";
import {
  VAULT_KEYRING_MIGRATION_CONTEXT_V2,
  decryptUserVaultContentForMigrationV2,
  decryptUserVaultContentV2,
  deriveVaultMasterKeyContextV2,
  encryptUserVaultContentV2,
  importLegacyUserDekIntoVaultKeyringV2,
  listUserVaultKeysV2,
  resolveActiveUserVaultKeyV2,
  type UserVaultKeyMetadataV2,
  type VaultMasterKeyContextV2,
} from "./user-vault-keyring.ts";
import {
  VaultEnvelopeMalformedError,
  VaultKeyLifecycleError,
  parseVaultEnvelopeV2,
} from "./vault-envelope-v2.ts";

// Contract 2 was the PRISM-6s6ed.2.5 core family. Contract 3 adds the
// PRISM-6s6ed.2.6 memory/context family, so a database already certified under
// contract 2 must pass through the explicit migrator before the expanded views
// are installed. Existing Vault V2 envelopes are verified in place while the
// newly covered legacy scalars are sealed.
export const CORE_CONTENT_VAULT_CONTRACT_VERSION = 3 as const;

export type CoreContentVaultColumnDisposition = "encrypted" | "operational";

export interface CoreContentVaultColumnContract {
  disposition: CoreContentVaultColumnDisposition;
  reason: string;
}

export interface CoreContentVaultTableContract {
  table: string;
  ownerColumn: "user_id";
  stableRowColumns: readonly string[];
  columns: Readonly<Record<string, CoreContentVaultColumnContract>>;
}

const CONTENT_REASON =
  "Account-authored content, a private setting, or directly derived text.";
const OWNER_REASON = "Authenticated owner required before content is opened.";
const ROW_REASON = "Stable nonsecret row locator used by Vault AAD.";
const RELATION_REASON =
  "Owner-checked relational locator required for integrity and deletion.";
const LIFECYCLE_REASON =
  "Bounded lifecycle or privacy metadata required before content is opened.";
const TIME_REASON = "Nonsecret lifecycle timestamp used for ordering or expiry.";
const OPAQUE_REASON =
  "Opaque identifier or digest that contains no account-authored plaintext.";
const CRYPTO_REASON = "Legacy inner-envelope authentication metadata; no plaintext.";

function classifiedColumns(
  encrypted: readonly string[],
  operational: Readonly<Record<string, string>>,
): Readonly<Record<string, CoreContentVaultColumnContract>> {
  const columns: Record<string, CoreContentVaultColumnContract> = {};
  for (const column of encrypted) {
    columns[column] = Object.freeze({
      disposition: "encrypted",
      reason: CONTENT_REASON,
    });
  }
  for (const [column, reason] of Object.entries(operational)) {
    if (columns[column]) {
      throw new TypeError(`Duplicate core Vault column contract: ${column}`);
    }
    columns[column] = Object.freeze({ disposition: "operational", reason });
  }
  return Object.freeze(columns);
}

function tableContract(
  table: string,
  encrypted: readonly string[],
  operational: Readonly<Record<string, string>>,
): CoreContentVaultTableContract {
  return compositeTableContract(table, ["id"], encrypted, operational);
}

function compositeTableContract(
  table: string,
  stableRowColumns: readonly string[],
  encrypted: readonly string[],
  operational: Readonly<Record<string, string>>,
): CoreContentVaultTableContract {
  if (stableRowColumns.length === 0 || new Set(stableRowColumns).size !== stableRowColumns.length) {
    throw new TypeError(`Core Vault stable-row contract is invalid for ${table}.`);
  }
  return Object.freeze({
    table,
    ownerColumn: "user_id" as const,
    stableRowColumns: Object.freeze([...stableRowColumns]),
    columns: classifiedColumns(encrypted, operational),
  });
}

/**
 * Exhaustive storage contract for this Bead. Any schema drift fails startup
 * and the contract test until the new column is deliberately classified.
 *
 * "Operational" is intentionally narrow: owner/row/foreign identifiers,
 * bounded lifecycle state, timestamps, opaque hashes, and crypto metadata.
 * User-visible text, prompts, JSON, model choices, visual/voice controls, and
 * numeric settings are encrypted even when SQLite declared them non-TEXT.
 */
const BASE_CORE_CONTENT_VAULT_TABLES: readonly CoreContentVaultTableContract[] =
  Object.freeze([
    tableContract(
      "prism_action_proposals",
      ["input_json", "preview_json"],
      {
        id: ROW_REASON,
        user_id: OWNER_REASON,
        capability_id: OPAQUE_REASON,
        capability_version: LIFECYCLE_REASON,
        risk: LIFECYCLE_REASON,
        confirmation_policy: LIFECYCLE_REASON,
        status: LIFECYCLE_REASON,
        created_at: TIME_REASON,
        expires_at: TIME_REASON,
        executed_run_id: RELATION_REASON,
      },
    ),
    tableContract(
      "prism_action_runs",
      [
        "input_json",
        "result_json",
        "affected_entities_json",
        "inverse_ciphertext",
        "non_reversible_json",
        "error",
      ],
      {
        id: ROW_REASON,
        user_id: OWNER_REASON,
        parent_run_id: RELATION_REASON,
        capability_id: OPAQUE_REASON,
        capability_version: LIFECYCLE_REASON,
        source: LIFECYCLE_REASON,
        status: LIFECYCLE_REASON,
        idempotency_key: OPAQUE_REASON,
        inverse_iv: CRYPTO_REASON,
        inverse_tag: CRYPTO_REASON,
        cost_micro_usd: LIFECYCLE_REASON,
        created_at: TIME_REASON,
        committed_at: TIME_REASON,
        undone_at: TIME_REASON,
        undo_expires_at: TIME_REASON,
      },
    ),
    tableContract(
      "prism_context_tokens",
      ["purpose", "entities_json"],
      {
        id: ROW_REASON,
        user_id: OWNER_REASON,
        created_at: TIME_REASON,
        expires_at: TIME_REASON,
      },
    ),
    tableContract(
      "prism_quarantine",
      ["payload_ciphertext"],
      {
        id: ROW_REASON,
        user_id: OWNER_REASON,
        run_id: RELATION_REASON,
        entity_type: LIFECYCLE_REASON,
        entity_id: OPAQUE_REASON,
        payload_iv: CRYPTO_REASON,
        payload_tag: CRYPTO_REASON,
        created_at: TIME_REASON,
        expires_at: TIME_REASON,
        restored_at: TIME_REASON,
      },
    ),
    tableContract(
      "conversations",
      [
        "title",
        "coffee_settings",
        "coffee_duration_minutes",
        "coffee_topic",
        "coffee_team_mode_json",
        "coffee_meeting_summary",
        "coffee_meeting_summary_message_count",
        "coffee_power_plan_json",
        "zen_wallpaper_enabled",
        "zen_wallpaper_prompt_seed",
        "zen_wallpaper_message_count",
        "zen_wallpaper_history",
      ],
      {
        id: ROW_REASON,
        user_id: OWNER_REASON,
        conversation_mode: LIFECYCLE_REASON,
        bot_id: RELATION_REASON,
        bot_group_ids: RELATION_REASON,
        coffee_session_state: LIFECYCLE_REASON,
        parent_id: RELATION_REASON,
        fork_message_id: RELATION_REASON,
        archived_at: TIME_REASON,
        archive_batch_id: OPAQUE_REASON,
        incognito: LIFECYCLE_REASON,
        coffee_group_id: RELATION_REASON,
        coffee_preset_id: RELATION_REASON,
        coffee_absent_bot_ids: RELATION_REASON,
        coffee_meeting_summary_updated_at: TIME_REASON,
        zen_wallpaper_image_id: RELATION_REASON,
        zen_wallpaper_status: LIFECYCLE_REASON,
        created_at: TIME_REASON,
        updated_at: TIME_REASON,
      },
    ),
    tableContract(
      "messages",
      [
        "content",
        "provider",
        "model",
        "tool_payload",
      ],
      {
        id: ROW_REASON,
        conversation_id: RELATION_REASON,
        user_id: OWNER_REASON,
        role: LIFECYCLE_REASON,
        bot_id: RELATION_REASON,
        coffee_audience_bot_ids: RELATION_REASON,
        created_at: TIME_REASON,
      },
    ),
    tableContract(
      "bots",
      [
        "name",
        "name_pronunciation",
        "self_referral",
        "system_prompt",
        "voice_preview_line",
        "semantic_facets",
        "powers_json",
        "model",
        "local_model",
        "online_model",
        "local_image_model",
        "openai_image_model",
        "temperature",
        "max_tokens",
        "top_p",
        "top_k",
        "repetition_penalty",
        "color",
        "accent_color",
        "glyph",
        "avatar_details_json",
        "face_eyes_font",
        "face_eye_character",
        "face_eye_animation",
        "face_mouth_font",
        "face_mouth_character",
        "face_mouth_animation",
        "face_mouth_speech_poses",
        "face_mouth_coffee_pucker",
        "face_font_weight",
        "face_eye_scale",
        "face_eye_offset_x",
        "face_eye_offset_y",
        "face_eye_rotation_deg",
        "face_eye_count",
        "face_eye_spacing",
        "face_mouth_scale",
        "face_mouth_offset_x",
        "face_mouth_offset_y",
        "face_mouth_rotation_deg",
        "face_blink_bar",
        "face_blink_count",
        "face_blink_scale",
        "face_blink_offset_x",
        "face_blink_offset_y",
        "face_blink_rotation_deg",
        "face_thinking_frames",
        "face_thinking_scale",
        "face_thinking_offset_x",
        "face_thinking_offset_y",
        "authored_audio_voice_profile",
        "audio_voice_profile_override",
        "chat_atmosphere_generated_on",
        "chat_enabled",
        "online_enabled",
        "delete_protected",
        "flirt_enabled",
        "visibility",
      ],
      {
        id: ROW_REASON,
        user_id: OWNER_REASON,
        clone_family_id: RELATION_REASON,
        export_hash: OPAQUE_REASON,
        semantic_facets_source_hash: OPAQUE_REASON,
        semantic_facets_updated_at: TIME_REASON,
        profile_picture_image_id: RELATION_REASON,
        chat_atmosphere_image_id: RELATION_REASON,
        created_at: TIME_REASON,
        updated_at: TIME_REASON,
      },
    ),
    tableContract(
      "conversation_exports",
      ["markdown"],
      {
        id: ROW_REASON,
        user_id: OWNER_REASON,
        conversation_id: RELATION_REASON,
        bot_id: RELATION_REASON,
        created_at: TIME_REASON,
      },
    ),
  ]);

/**
 * Exact assigned family for PRISM-6s6ed.2.6. Opinion and Coffee social-state
 * rows are canonical relationship/mood derivatives, not transcripts, so they
 * belong beside memories rather than the Coffee/Signal transcript child.
 */
export const MEMORY_CONTENT_VAULT_TABLES: readonly CoreContentVaultTableContract[] =
  Object.freeze([
    tableContract(
      "memories",
      [
        "ciphertext",
        "iv",
        "tag",
        "confidence",
        "category",
        "tier",
        "durability",
        "source",
        "certainty",
        "source_message_ids",
        "base_confidence",
        "lifecycle",
        "evidence_lineage_known",
      ],
      {
        id: ROW_REASON,
        user_id: OWNER_REASON,
        conversation_id: RELATION_REASON,
        bot_id: RELATION_REASON,
        target_bot_id: RELATION_REASON,
        last_reinforced_at: TIME_REASON,
        created_at: TIME_REASON,
      },
    ),
    tableContract(
      "memory_summaries",
      ["summary"],
      {
        id: ROW_REASON,
        user_id: OWNER_REASON,
        conversation_id: RELATION_REASON,
        created_at: TIME_REASON,
      },
    ),
    tableContract(
      "zen_session_memories",
      ["ciphertext", "iv", "tag"],
      {
        id: ROW_REASON,
        user_id: OWNER_REASON,
        conversation_id: RELATION_REASON,
        bot_id: RELATION_REASON,
        created_at: TIME_REASON,
        expires_at: TIME_REASON,
      },
    ),
    tableContract(
      "user_notes",
      ["title", "ciphertext", "iv", "tag"],
      {
        id: ROW_REASON,
        user_id: OWNER_REASON,
        created_at: TIME_REASON,
        updated_at: TIME_REASON,
      },
    ),
    compositeTableContract(
      "memory_evidence_links",
      ["inferred_memory_id", "evidence_memory_id"],
      [],
      {
        user_id: OWNER_REASON,
        inferred_memory_id: RELATION_REASON,
        evidence_memory_id: RELATION_REASON,
        created_at: TIME_REASON,
      },
    ),
    tableContract(
      "memory_acquisition_receipts",
      ["kind"],
      {
        id: ROW_REASON,
        user_id: OWNER_REASON,
        memory_id: RELATION_REASON,
        learner_bot_id: RELATION_REASON,
        target_bot_id: RELATION_REASON,
        conversation_id: RELATION_REASON,
        created_at: TIME_REASON,
        read_at: TIME_REASON,
      },
    ),
    compositeTableContract(
      "memory_relationship_projections",
      ["source_bot_id", "target_bot_id"],
      ["base_score"],
      {
        user_id: OWNER_REASON,
        source_bot_id: RELATION_REASON,
        target_bot_id: RELATION_REASON,
        updated_at: TIME_REASON,
      },
    ),
    compositeTableContract(
      "bot_relationships",
      ["source_bot_id", "target_bot_id"],
      ["score", "band", "mood_key", "trend", "last_reason", "recent_reasons"],
      {
        user_id: OWNER_REASON,
        source_bot_id: RELATION_REASON,
        target_bot_id: RELATION_REASON,
        updated_at: TIME_REASON,
      },
    ),
    compositeTableContract(
      "applet_session_notes",
      ["surface", "session_id"],
      ["body", "captures_json"],
      {
        user_id: OWNER_REASON,
        surface: RELATION_REASON,
        session_id: RELATION_REASON,
        created_at: TIME_REASON,
        updated_at: TIME_REASON,
      },
    ),
    tableContract(
      "coffee_context_sparks",
      ["source_title", "source_role", "source_participant_bot_ids", "display_prompt"],
      {
        id: ROW_REASON,
        user_id: OWNER_REASON,
        conversation_id: RELATION_REASON,
        source_applet: RELATION_REASON,
        source_session_id: RELATION_REASON,
        source_date: TIME_REASON,
        inspired_bot_id: RELATION_REASON,
        state: LIFECYCLE_REASON,
        created_at: TIME_REASON,
        consumed_at: TIME_REASON,
        updated_at: TIME_REASON,
      },
    ),
    compositeTableContract(
      "coffee_context_spark_runs",
      ["conversation_id"],
      [],
      {
        user_id: OWNER_REASON,
        conversation_id: RELATION_REASON,
        generated_at: TIME_REASON,
      },
    ),
    compositeTableContract(
      "bot_global_moods",
      ["bot_id"],
      ["mood_key", "source"],
      {
        user_id: OWNER_REASON,
        bot_id: RELATION_REASON,
        updated_at: TIME_REASON,
      },
    ),
    compositeTableContract(
      "prism_mood_state",
      ["conversation_id", "mode"],
      [
        "mood_key",
        "confidence",
        "annoyance",
        "warmth",
        "engagement",
        "restraint",
        "recent_deltas",
        "ignore_cooldown_ms",
        "ignore_forgiveness_chance",
        "ignore_penalty_level",
        "frozen",
      ],
      {
        user_id: OWNER_REASON,
        conversation_id: RELATION_REASON,
        mode: RELATION_REASON,
        ignore_until: TIME_REASON,
        updated_at: TIME_REASON,
      },
    ),
    compositeTableContract(
      "prism_mood_events",
      ["conversation_id", "message_id", "event_type"],
      ["payload_json"],
      {
        user_id: OWNER_REASON,
        conversation_id: RELATION_REASON,
        message_id: RELATION_REASON,
        event_type: RELATION_REASON,
        created_at: TIME_REASON,
      },
    ),
    compositeTableContract(
      "session_opinions",
      ["conversation_id", "bot_scope_key"],
      ["score", "band", "trend", "last_reason", "recent_reasons"],
      {
        user_id: OWNER_REASON,
        conversation_id: RELATION_REASON,
        bot_scope_key: RELATION_REASON,
        bot_id: RELATION_REASON,
        updated_at: TIME_REASON,
      },
    ),
    compositeTableContract(
      "bot_opinions",
      ["bot_scope_key"],
      [
        "score",
        "band",
        "boundary_level",
        "trend",
        "last_reason",
        "recent_reasons",
        "repair_count",
      ],
      {
        user_id: OWNER_REASON,
        bot_scope_key: RELATION_REASON,
        bot_id: RELATION_REASON,
        updated_at: TIME_REASON,
      },
    ),
    compositeTableContract(
      "coffee_bot_social_state",
      ["conversation_id", "bot_id"],
      ["disposition", "values_friction", "restraint", "engagement", "leave_pressure"],
      {
        user_id: OWNER_REASON,
        conversation_id: RELATION_REASON,
        bot_id: RELATION_REASON,
        updated_at: TIME_REASON,
      },
    ),
    compositeTableContract(
      "coffee_directional_irritation",
      ["conversation_id", "subject_bot_id", "target_bot_id"],
      ["intensity"],
      {
        user_id: OWNER_REASON,
        conversation_id: RELATION_REASON,
        subject_bot_id: RELATION_REASON,
        target_bot_id: RELATION_REASON,
        updated_at: TIME_REASON,
        last_transition_id: OPAQUE_REASON,
      },
    ),
    compositeTableContract(
      "coffee_directional_irritation_ledger",
      ["conversation_id", "transition_id"],
      ["reason", "before_intensity", "after_intensity"],
      {
        user_id: OWNER_REASON,
        conversation_id: RELATION_REASON,
        transition_id: OPAQUE_REASON,
        subject_bot_id: RELATION_REASON,
        target_bot_id: RELATION_REASON,
        occurred_at: TIME_REASON,
      },
    ),
    compositeTableContract(
      "coffee_cup_top_offs",
      ["conversation_id", "bot_id"],
      ["progress_before", "progress_after"],
      {
        user_id: OWNER_REASON,
        conversation_id: RELATION_REASON,
        bot_id: RELATION_REASON,
        topped_off_at: TIME_REASON,
        updated_at: TIME_REASON,
      },
    ),
  ]);

export const CORE_CONTENT_VAULT_TABLES: readonly CoreContentVaultTableContract[] =
  Object.freeze([
    ...BASE_CORE_CONTENT_VAULT_TABLES,
    ...MEMORY_CONTENT_VAULT_TABLES,
  ]);

const CONTRACT_BY_TABLE = new Map(
  CORE_CONTENT_VAULT_TABLES.map((contract) => [contract.table, contract]),
);
const SQLITE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const VALUE_PREFIX = Buffer.from("PRISM\0VAULT-SQL-VALUE\0V1\0", "utf8");
const VALUE_TEXT = 1;
const VALUE_NUMBER = 2;
const VALUE_BYTES = 3;
const PRISM_ACTION_IDEMPOTENCY_DIGEST = /^pi2_[a-f0-9]{64}$/u;
const VAULT_OPEN_FUNCTION = "prism_core_vault_open_v2";
const VAULT_ROW_FUNCTION = "prism_core_vault_row_v2";
const VAULT_SEAL_FUNCTION = "prism_core_vault_seal_v2";
const VAULT_MUTATE_FUNCTION = "prism_core_vault_mutate_v2";

type SqliteValue = null | string | number | bigint | Uint8Array;

interface TableColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface CoreVaultRuntime {
  context: VaultMasterKeyContextV2;
  functionsRegistered: boolean;
  physicalPrepare: ((sql: string) => StatementSync) | null;
  physicalMutations: Map<string, {
    argumentCount: number;
    statement: StatementSync;
  }>;
  prepareWrapped: boolean;
  viewsInstalled: boolean;
}

export interface CoreContentVaultMigrationReport {
  contractVersion: typeof CORE_CONTENT_VAULT_CONTRACT_VERSION;
  ownerCount: number;
  encryptedCellCount: number;
  verifiedCellCount: number;
}

const RUNTIMES = new WeakMap<DatabaseSync, CoreVaultRuntime>();

export function prismActionIdempotencyDigestV2(
  ownerUserId: string,
  idempotencyKey: string,
): string {
  if (
    typeof ownerUserId !== "string" ||
    ownerUserId.length === 0 ||
    typeof idempotencyKey !== "string" ||
    idempotencyKey.length === 0 ||
    Buffer.byteLength(idempotencyKey, "utf8") > 16 * 1024
  ) {
    throw new VaultKeyLifecycleError("invalid_content_binding");
  }
  return `pi2_${createHash("sha256")
    .update("PRISM\0ACTION-IDEMPOTENCY\0V2\0", "utf8")
    .update(ownerUserId, "utf8")
    .update("\0", "utf8")
    .update(idempotencyKey, "utf8")
    .digest("hex")}`;
}

function quoteIdentifier(identifier: string): string {
  if (!SQLITE_IDENTIFIER.test(identifier)) {
    throw new TypeError("Core Vault identifier is invalid.");
  }
  return `"${identifier}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function tableColumns(db: DatabaseSync, table: string): TableColumnInfo[] {
  return db
    .prepare(`PRAGMA main.table_info(${quoteIdentifier(table)})`)
    .all() as unknown as TableColumnInfo[];
}

/**
 * Vault envelopes use SQLite BLOB storage. The legacy global-mood CHECKs only
 * admitted cleartext enum values, so an old database needs one bounded table
 * rebuild before migration/views activate. Existing indexes and owner guards
 * are captured and restored in the same transaction.
 */
export function ensureCoreContentVaultStorageSchemaV2(db: DatabaseSync): boolean {
  if (RUNTIMES.has(db)) {
    throw new VaultKeyLifecycleError("transaction_conflict");
  }
  const table = db
    .prepare(
      "SELECT sql FROM main.sqlite_master WHERE type = 'table' AND name = 'bot_global_moods'",
    )
    .get() as { sql?: string } | undefined;
  let rebuilt = false;
  if (table?.sql && !table.sql.includes("typeof(mood_key) = 'blob'")) {
    const schemaObjects = db
      .prepare(
        `SELECT sql
           FROM main.sqlite_master
          WHERE tbl_name = 'bot_global_moods'
            AND type IN ('index', 'trigger')
            AND sql IS NOT NULL
          ORDER BY CASE type WHEN 'index' THEN 0 ELSE 1 END, name`,
      )
      .all() as Array<{ sql: string }>;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`
        ALTER TABLE main.bot_global_moods
          RENAME TO __core_vault_bot_global_moods_legacy;
        CREATE TABLE main.bot_global_moods (
          user_id TEXT NOT NULL,
          bot_id TEXT NOT NULL,
          mood_key TEXT NOT NULL DEFAULT 'neutral'
            CHECK (typeof(mood_key) = 'blob' OR mood_key IN ('joyful', 'warm', 'neutral', 'guarded', 'strained')),
          source TEXT NOT NULL DEFAULT 'signal_feedback'
            CHECK (typeof(source) = 'blob' OR source IN ('signal_feedback', 'backup_restore')),
          updated_at TEXT NOT NULL,
          PRIMARY KEY (user_id, bot_id),
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY(bot_id) REFERENCES bots(id) ON DELETE CASCADE
        );
        INSERT INTO main.bot_global_moods
          (user_id, bot_id, mood_key, source, updated_at)
        SELECT user_id, bot_id, mood_key, source, updated_at
          FROM main.__core_vault_bot_global_moods_legacy;
        DROP TABLE main.__core_vault_bot_global_moods_legacy;
      `);
      for (const object of schemaObjects) db.exec(object.sql);
      db.exec("COMMIT");
      rebuilt = true;
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      throw error;
    }
  }

  // These indexes are normally added by later schema normalizers. Creating
  // them in main before TEMP views activate lets reopened encrypted databases
  // run the same normalizers without SQLite trying to index a view.
  db.exec(`
    CREATE INDEX IF NOT EXISTS main.idx_zen_session_memories_user_bot_created
      ON zen_session_memories(user_id, bot_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS main.idx_memory_evidence_inferred
      ON memory_evidence_links(user_id, inferred_memory_id);
    CREATE INDEX IF NOT EXISTS main.idx_memory_evidence_source
      ON memory_evidence_links(user_id, evidence_memory_id);
    CREATE INDEX IF NOT EXISTS main.idx_memory_receipts_unread_bot
      ON memory_acquisition_receipts(user_id, learner_bot_id, read_at, created_at DESC);
    CREATE INDEX IF NOT EXISTS main.idx_memory_receipts_conversation
      ON memory_acquisition_receipts(user_id, conversation_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS main.idx_session_opinions_user_conversation
      ON session_opinions(user_id, conversation_id);
    CREATE INDEX IF NOT EXISTS main.idx_session_opinions_user_bot
      ON session_opinions(user_id, bot_id);
    CREATE INDEX IF NOT EXISTS main.idx_bot_opinions_user_bot
      ON bot_opinions(user_id, bot_id);
    CREATE INDEX IF NOT EXISTS main.idx_bot_global_moods_user_bot
      ON bot_global_moods(user_id, bot_id);
    CREATE INDEX IF NOT EXISTS main.idx_bot_relationships_user_source
      ON bot_relationships(user_id, source_bot_id);
    CREATE INDEX IF NOT EXISTS main.idx_bot_relationships_user_target
      ON bot_relationships(user_id, target_bot_id);
    CREATE INDEX IF NOT EXISTS main.idx_coffee_social_user_conversation
      ON coffee_bot_social_state(user_id, conversation_id);
    CREATE INDEX IF NOT EXISTS main.idx_coffee_directional_irritation_user_conversation
      ON coffee_directional_irritation(user_id, conversation_id);
    CREATE INDEX IF NOT EXISTS main.idx_coffee_directional_irritation_ledger_user_conversation
      ON coffee_directional_irritation_ledger(user_id, conversation_id);
    CREATE INDEX IF NOT EXISTS main.idx_coffee_cup_top_offs_user_conversation
      ON coffee_cup_top_offs(user_id, conversation_id);
    CREATE INDEX IF NOT EXISTS main.idx_prism_mood_user_conversation
      ON prism_mood_state(user_id, conversation_id);
    CREATE INDEX IF NOT EXISTS main.idx_prism_mood_events_user_conversation
      ON prism_mood_events(user_id, conversation_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS main.idx_memories_user_created
      ON memories(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS main.idx_memories_user_pair_created
      ON memories(user_id, bot_id, target_bot_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS main.idx_user_notes_user_updated
      ON user_notes(user_id, updated_at DESC);
  `);
  return rebuilt;
}

export function assertCoreContentVaultContract(
  db: DatabaseSync,
): { tableCount: number; columnCount: number; encryptedColumnCount: number } {
  let columnCount = 0;
  let encryptedColumnCount = 0;
  for (const contract of CORE_CONTENT_VAULT_TABLES) {
    const schemaColumns = tableColumns(db, contract.table).map(
      (column) => column.name,
    );
    const classified = Object.keys(contract.columns);
    if (
      schemaColumns.length === 0 ||
      schemaColumns.length !== classified.length ||
      schemaColumns.some((column) => !contract.columns[column]) ||
      classified.some((column) => !schemaColumns.includes(column))
    ) {
      throw new Error(
        `Core Vault schema contract is incomplete for ${contract.table}.`,
      );
    }
    if (
      !schemaColumns.includes(contract.ownerColumn) ||
      contract.stableRowColumns.some(
        (column) =>
          !schemaColumns.includes(column) ||
          column === contract.ownerColumn ||
          contract.columns[column]?.disposition !== "operational",
      )
    ) {
      throw new Error(`Core Vault owner binding is incomplete for ${contract.table}.`);
    }
    columnCount += schemaColumns.length;
    encryptedColumnCount += Object.values(contract.columns).filter(
      (column) => column.disposition === "encrypted",
    ).length;
  }
  return Object.freeze({
    tableCount: CORE_CONTENT_VAULT_TABLES.length,
    columnCount,
    encryptedColumnCount,
  });
}

export function coreContentVaultContractIsCompleteV2(
  db: DatabaseSync,
): boolean {
  try {
    assertCoreContentVaultContract(db);
    return true;
  } catch {
    return false;
  }
}

function encodeSqliteValue(value: Exclude<SqliteValue, null>): Buffer {
  if (typeof value === "string") {
    return Buffer.concat([VALUE_PREFIX, Buffer.from([VALUE_TEXT]), Buffer.from(value, "utf8")]);
  }
  if (typeof value === "number" || typeof value === "bigint") {
    const normalized = typeof value === "bigint" ? Number(value) : value;
    if (!Number.isFinite(normalized)) {
      throw new TypeError("Core Vault numeric value is invalid.");
    }
    return Buffer.concat([
      VALUE_PREFIX,
      Buffer.from([VALUE_NUMBER]),
      Buffer.from(JSON.stringify(normalized), "utf8"),
    ]);
  }
  if (value instanceof Uint8Array) {
    return Buffer.concat([VALUE_PREFIX, Buffer.from([VALUE_BYTES]), Buffer.from(value)]);
  }
  throw new TypeError("Core Vault value type is unsupported.");
}

function decodeSqliteValue(plaintext: Uint8Array): SqliteValue {
  const bytes = Buffer.from(plaintext);
  if (
    bytes.length <= VALUE_PREFIX.length ||
    !bytes.subarray(0, VALUE_PREFIX.length).equals(VALUE_PREFIX)
  ) {
    throw new VaultEnvelopeMalformedError("invalid_input");
  }
  const tag = bytes[VALUE_PREFIX.length];
  const payload = bytes.subarray(VALUE_PREFIX.length + 1);
  if (tag === VALUE_TEXT) {
    const value = payload.toString("utf8");
    if (!Buffer.from(value, "utf8").equals(payload)) {
      throw new VaultEnvelopeMalformedError("invalid_input");
    }
    return value;
  }
  if (tag === VALUE_NUMBER) {
    const value = Number(payload.toString("utf8"));
    if (!Number.isFinite(value)) {
      throw new VaultEnvelopeMalformedError("invalid_input");
    }
    return value;
  }
  if (tag === VALUE_BYTES) return Buffer.from(payload);
  throw new VaultEnvelopeMalformedError("invalid_input");
}

function stableRowPart(value: unknown): readonly ["s" | "n" | "i", string] {
  if (typeof value === "string") return ["s", value];
  if (typeof value === "number" && Number.isFinite(value)) {
    return ["n", Object.is(value, -0) ? "0" : String(value)];
  }
  if (typeof value === "bigint") return ["i", value.toString(10)];
  throw new VaultKeyLifecycleError("invalid_content_binding");
}

/**
 * Encodes composite locators as typed JSON tuples with explicit column names.
 * JSON escaping and array boundaries make ["ab", "c"] distinct from
 * ["a", "bc"] without relying on a delimiter that can appear in an id.
 * Single-column bindings retain their V1 value so existing Vault rows remain
 * decryptable when this contract version is resumed.
 */
export function coreContentVaultStableRowIdV2(
  table: string,
  values: readonly unknown[],
): string {
  const contract = CONTRACT_BY_TABLE.get(table);
  if (!contract || values.length !== contract.stableRowColumns.length) {
    throw new VaultKeyLifecycleError("invalid_content_binding");
  }
  if (values.length === 1 && typeof values[0] === "string") return values[0];
  return `crv2:${JSON.stringify(
    contract.stableRowColumns.map((column, index) => [
      column,
      ...stableRowPart(values[index]),
    ]),
  )}`;
}

function checkedBinding(
  ownerUserId: unknown,
  table: unknown,
  column: unknown,
  stableRowId: unknown,
): {
  ownerUserId: string;
  table: string;
  column: string;
  stableRowId: string;
} {
  if (
    typeof ownerUserId !== "string" ||
    typeof table !== "string" ||
    typeof column !== "string" ||
    typeof stableRowId !== "string"
  ) {
    throw new VaultKeyLifecycleError("invalid_content_binding");
  }
  const contract = CONTRACT_BY_TABLE.get(table);
  if (contract?.columns[column]?.disposition !== "encrypted") {
    throw new VaultKeyLifecycleError("invalid_content_binding");
  }
  return { ownerUserId, table, column, stableRowId };
}

function sealValue(
  db: DatabaseSync,
  runtime: CoreVaultRuntime,
  ownerUserId: unknown,
  table: unknown,
  column: unknown,
  stableRowId: unknown,
  value: SqliteValue,
): Buffer | null {
  if (value === null) return null;
  const binding = checkedBinding(ownerUserId, table, column, stableRowId);
  return encryptUserVaultContentV2({
    db,
    ownerUserId: binding.ownerUserId,
    context: runtime.context,
    logicalTable: binding.table,
    logicalColumn: binding.column,
    stableRowId: binding.stableRowId,
    plaintext: encodeSqliteValue(value),
  });
}

function openValue(
  db: DatabaseSync,
  runtime: CoreVaultRuntime,
  ownerUserId: unknown,
  table: unknown,
  column: unknown,
  stableRowId: unknown,
  envelope: SqliteValue,
): SqliteValue {
  if (envelope === null) return null;
  if (!(envelope instanceof Uint8Array)) {
    // Ordinary reads never accept pre-V2 plaintext. Only migrateCoreRows below
    // owns the explicit legacy boundary.
    throw new VaultEnvelopeMalformedError("invalid_input");
  }
  const binding = checkedBinding(ownerUserId, table, column, stableRowId);
  return decodeSqliteValue(
    decryptUserVaultContentV2({
      db,
      ownerUserId: binding.ownerUserId,
      context: runtime.context,
      logicalTable: binding.table,
      logicalColumn: binding.column,
      stableRowId: binding.stableRowId,
      serializedEnvelope: envelope,
    }),
  );
}

function registerVaultFunctions(db: DatabaseSync, runtime: CoreVaultRuntime): void {
  if (runtime.functionsRegistered) return;
  runtime.physicalPrepare = db.prepare.bind(db);
  db.function(
    VAULT_ROW_FUNCTION,
    { deterministic: true, varargs: true },
    (table: SqliteValue, ...values: SqliteValue[]) => {
      if (typeof table !== "string") {
        throw new VaultKeyLifecycleError("invalid_content_binding");
      }
      return coreContentVaultStableRowIdV2(table, values);
    },
  );
  db.function(
    VAULT_SEAL_FUNCTION,
    (
      ownerUserId: SqliteValue,
      table: SqliteValue,
      column: SqliteValue,
      stableRowId: SqliteValue,
      value: SqliteValue,
    ) => sealValue(db, runtime, ownerUserId, table, column, stableRowId, value),
  );
  db.function(
    VAULT_OPEN_FUNCTION,
    (
      ownerUserId: SqliteValue,
      table: SqliteValue,
      column: SqliteValue,
      stableRowId: SqliteValue,
      value: SqliteValue,
    ) => openValue(db, runtime, ownerUserId, table, column, stableRowId, value),
  );
  db.function(
    VAULT_MUTATE_FUNCTION,
    { varargs: true },
    (action: SqliteValue, table: SqliteValue, ...values: SqliteValue[]) => {
      if (typeof action !== "string" || typeof table !== "string") {
        throw new VaultKeyLifecycleError("invalid_content_binding");
      }
      const mutation = runtime.physicalMutations.get(`${action}:${table}`);
      if (!mutation || mutation.argumentCount !== values.length) {
        throw new VaultKeyLifecycleError("invalid_content_binding");
      }
      return Number(mutation.statement.run(...values).changes);
    },
  );
  runtime.functionsRegistered = true;
}

function refreshPhysicalMutationStatements(
  db: DatabaseSync,
  runtime: CoreVaultRuntime,
): void {
  const prepare = runtime.physicalPrepare;
  if (!prepare) {
    throw new VaultKeyLifecycleError("transaction_conflict");
  }
  const mutations = new Map<string, {
    argumentCount: number;
    statement: StatementSync;
  }>();
  for (const contract of CORE_CONTENT_VAULT_TABLES) {
    const columns = tableColumns(db, contract.table);
    const columnList = columns
      .map((column) => quoteIdentifier(column.name))
      .join(", ");
    const placeholders = columns.map(() => "?").join(", ");
    mutations.set(`insert:${contract.table}`, {
      argumentCount: columns.length,
      statement: prepare(
        `INSERT INTO main.${quoteIdentifier(contract.table)} (${columnList}) VALUES (${placeholders})`,
      ),
    });

    const assignments = columns
      .map((column) => `${quoteIdentifier(column.name)} = ?`)
      .join(", ");
    const ownerAndRowPredicate = [
      `${quoteIdentifier(contract.ownerColumn)} = ?`,
      ...contract.stableRowColumns.map(
        (column) => `${quoteIdentifier(column)} IS ?`,
      ),
    ].join(" AND ");
    mutations.set(`update:${contract.table}`, {
      argumentCount: columns.length + 1 + contract.stableRowColumns.length,
      statement: prepare(
        `UPDATE main.${quoteIdentifier(contract.table)} SET ${assignments} WHERE ${ownerAndRowPredicate}`,
      ),
    });
    mutations.set(`delete:${contract.table}`, {
      argumentCount: 1 + contract.stableRowColumns.length,
      statement: prepare(
        `DELETE FROM main.${quoteIdentifier(contract.table)} WHERE ${ownerAndRowPredicate}`,
      ),
    });
  }
  runtime.physicalMutations = mutations;
}

function installChangeCountCompatibility(
  db: DatabaseSync,
  runtime: CoreVaultRuntime,
): void {
  if (runtime.prepareWrapped) return;
  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS core_vault_change_counter (
      singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
      value INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO core_vault_change_counter (singleton, value)
    VALUES (1, 0);
  `);
  const originalPrepare = db.prepare.bind(db);
  const reset = originalPrepare(
    "UPDATE temp.core_vault_change_counter SET value = 0 WHERE singleton = 1",
  );
  const read = originalPrepare(
    "SELECT value FROM temp.core_vault_change_counter WHERE singleton = 1",
  );
  const wrappedPrepare = (sql: string): StatementSync => {
    const statement = originalPrepare(sql);
    return new Proxy(statement, {
      get(target, property) {
        if (property === "run") {
          return (...params: Parameters<StatementSync["run"]>) => {
            reset.run();
            const result = target.run(...params);
            const counted = read.get() as { value: number };
            return counted.value > 0
              ? { ...result, changes: counted.value }
              : result;
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function"
          ? value.bind(target)
          : value;
      },
    });
  };
  Object.defineProperty(db, "prepare", {
    configurable: true,
    value: wrappedPrepare,
    writable: false,
  });
  runtime.prepareWrapped = true;
}

function triggerName(table: string, action: "insert" | "update" | "delete"): string {
  return `core_vault_${table}_${action}`;
}

export function suspendCoreContentVaultViewsV2(db: DatabaseSync): boolean {
  const runtime = RUNTIMES.get(db);
  if (!runtime?.viewsInstalled) return false;
  for (const contract of [...CORE_CONTENT_VAULT_TABLES].reverse()) {
    for (const action of ["insert", "update", "delete"] as const) {
      db.exec(`DROP TRIGGER IF EXISTS temp.${quoteIdentifier(triggerName(contract.table, action))}`);
    }
    db.exec(`DROP VIEW IF EXISTS temp.${quoteIdentifier(contract.table)}`);
  }
  runtime.viewsInstalled = false;
  return true;
}

function stableRowExpression(
  contract: CoreContentVaultTableContract,
  qualifier?: "NEW" | "OLD",
): string {
  const values = contract.stableRowColumns.map((column) =>
    qualifier
      ? `${qualifier}.${quoteIdentifier(column)}`
      : quoteIdentifier(column),
  );
  if (values.length === 1) return values[0];
  return `${VAULT_ROW_FUNCTION}(${quoteLiteral(contract.table)}, ${values.join(", ")})`;
}

function viewOwnerValidationStatements(
  contract: CoreContentVaultTableContract,
): string {
  if (contract.table !== "coffee_context_sparks") return "";
  return `
    SELECT CASE WHEN
      NEW."source_participant_bot_ids" IS NULL
      OR json_valid(NEW."source_participant_bot_ids") = 0
      OR json_type(NEW."source_participant_bot_ids") <> 'array'
      OR EXISTS (
        SELECT 1
          FROM json_each(NEW."source_participant_bot_ids") AS owner_ref
         WHERE owner_ref.type NOT IN ('text', 'null')
            OR (owner_ref.type = 'text' AND (
              trim(CAST(owner_ref.value AS TEXT)) = ''
              OR NOT EXISTS (
                SELECT 1
                  FROM main.bots AS parent
                 WHERE parent.user_id = NEW.user_id
                   AND parent.id = CAST(owner_ref.value AS TEXT)
              )
            ))
      )
      THEN RAISE(ABORT, 'owner_constraint_violation')
    END;
  `;
}

function insertExpression(
  contract: CoreContentVaultTableContract,
  column: TableColumnInfo,
): string {
  let value = `NEW.${quoteIdentifier(column.name)}`;
  if (column.dflt_value !== null) {
    value = `COALESCE(${value}, ${column.dflt_value})`;
  }
  if (contract.columns[column.name].disposition !== "encrypted") return value;
  return `${VAULT_SEAL_FUNCTION}(NEW.${quoteIdentifier(contract.ownerColumn)}, ${quoteLiteral(contract.table)}, ${quoteLiteral(column.name)}, ${stableRowExpression(contract, "NEW")}, ${value})`;
}

function updateExpression(
  contract: CoreContentVaultTableContract,
  column: TableColumnInfo,
): string {
  if (
    column.name === contract.ownerColumn ||
    contract.stableRowColumns.includes(column.name)
  ) {
    return `OLD.${quoteIdentifier(column.name)}`;
  }
  const value = `NEW.${quoteIdentifier(column.name)}`;
  if (contract.columns[column.name].disposition !== "encrypted") return value;
  return `${VAULT_SEAL_FUNCTION}(OLD.${quoteIdentifier(contract.ownerColumn)}, ${quoteLiteral(contract.table)}, ${quoteLiteral(column.name)}, ${stableRowExpression(contract, "OLD")}, ${value})`;
}

export function installCoreContentVaultViewsV2(db: DatabaseSync): void {
  const runtime = RUNTIMES.get(db);
  if (!runtime) {
    throw new VaultKeyLifecycleError("invalid_master_key_context");
  }
  if (runtime.viewsInstalled) return;
  assertCoreContentVaultContract(db);
  registerVaultFunctions(db, runtime);
  refreshPhysicalMutationStatements(db, runtime);
  installChangeCountCompatibility(db, runtime);

  for (const contract of CORE_CONTENT_VAULT_TABLES) {
    const columns = tableColumns(db, contract.table);
    const projection = columns
      .map((column) => {
        const name = quoteIdentifier(column.name);
        if (contract.columns[column.name].disposition !== "encrypted") return name;
        return `${VAULT_OPEN_FUNCTION}(${quoteIdentifier(contract.ownerColumn)}, ${quoteLiteral(contract.table)}, ${quoteLiteral(column.name)}, ${stableRowExpression(contract)}, ${name}) AS ${name}`;
      })
      .join(", ");
    const rowIdProjection =
      contract.table === "messages"
        ? `main.${quoteIdentifier(contract.table)}.rowid AS rowid, `
        : "";
    db.exec(
      `CREATE TEMP VIEW ${quoteIdentifier(contract.table)} AS SELECT ${rowIdProjection}${projection} FROM main.${quoteIdentifier(contract.table)}`,
    );

    const insertValues = columns
      .map((column) => insertExpression(contract, column))
      .join(", ");
    db.exec(`
      CREATE TEMP TRIGGER ${quoteIdentifier(triggerName(contract.table, "insert"))}
      INSTEAD OF INSERT ON ${quoteIdentifier(contract.table)}
      BEGIN
        ${viewOwnerValidationStatements(contract)}
        SELECT ${VAULT_MUTATE_FUNCTION}(
          'insert',
          ${quoteLiteral(contract.table)},
          ${insertValues}
        );
        UPDATE core_vault_change_counter SET value = value + changes() WHERE singleton = 1;
      END
    `);

    const updateValues = columns
      .map((column) => updateExpression(contract, column))
      .join(", ");
    db.exec(`
      CREATE TEMP TRIGGER ${quoteIdentifier(triggerName(contract.table, "update"))}
      INSTEAD OF UPDATE ON ${quoteIdentifier(contract.table)}
      BEGIN
        ${viewOwnerValidationStatements(contract)}
        SELECT CASE
          WHEN NEW.${quoteIdentifier(contract.ownerColumn)} IS NOT OLD.${quoteIdentifier(contract.ownerColumn)}
            OR ${contract.stableRowColumns
              .map(
                (column) =>
                  `NEW.${quoteIdentifier(column)} IS NOT OLD.${quoteIdentifier(column)}`,
              )
              .join(" OR ")}
          THEN RAISE(ABORT, 'Account content not found.')
        END;
        SELECT ${VAULT_MUTATE_FUNCTION}(
          'update',
          ${quoteLiteral(contract.table)},
          ${updateValues},
          OLD.${quoteIdentifier(contract.ownerColumn)},
          ${contract.stableRowColumns
            .map((column) => `OLD.${quoteIdentifier(column)}`)
            .join(", ")}
        );
        UPDATE core_vault_change_counter SET value = value + changes() WHERE singleton = 1;
      END
    `);

    db.exec(`
      CREATE TEMP TRIGGER ${quoteIdentifier(triggerName(contract.table, "delete"))}
      INSTEAD OF DELETE ON ${quoteIdentifier(contract.table)}
      BEGIN
        SELECT ${VAULT_MUTATE_FUNCTION}(
          'delete',
          ${quoteLiteral(contract.table)},
          OLD.${quoteIdentifier(contract.ownerColumn)},
          ${contract.stableRowColumns
            .map((column) => `OLD.${quoteIdentifier(column)}`)
            .join(", ")}
        );
        UPDATE core_vault_change_counter SET value = value + changes() WHERE singleton = 1;
      END
    `);
  }
  runtime.viewsInstalled = true;
}

function ensureMigrationStateSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS core_content_vault_migrations (
      user_id TEXT NOT NULL,
      contract_version INTEGER NOT NULL,
      phase TEXT NOT NULL CHECK(phase IN ('migrating', 'blocked', 'complete')),
      completed_units INTEGER NOT NULL DEFAULT 0,
      total_units INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, contract_version),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    ) WITHOUT ROWID;
  `);
}

interface LegacyOwnerKeyRow {
  id: string;
  wrapped_user_key: string;
  wrapped_user_key_iv: string;
  wrapped_user_key_tag: string;
  created_at: string;
}

function importLegacyOwnerKeyIfNeeded(args: {
  db: DatabaseSync;
  row: LegacyOwnerKeyRow;
  context: VaultMasterKeyContextV2;
  legacyDek: Uint8Array;
}): UserVaultKeyMetadataV2 {
  const existing = listUserVaultKeysV2(args.db, args.row.id);
  if (existing.length > 0) {
    const resolved = resolveActiveUserVaultKeyV2({
      db: args.db,
      ownerUserId: args.row.id,
      context: args.context,
    });
    try {
      const { dek: _dek, ...metadata } = resolved;
      return Object.freeze(metadata);
    } finally {
      resolved.dek.fill(0);
    }
  }
  return importLegacyUserDekIntoVaultKeyringV2({
    db: args.db,
    ownerUserId: args.row.id,
    context: args.context,
    legacyDek: args.legacyDek,
    createdAt: args.row.created_at,
  });
}

function unwrapLegacyOwnerDek(
  row: LegacyOwnerKeyRow,
  legacyMasterKey: Buffer,
): Buffer {
  const encoded = decryptText(
    {
      ciphertext: row.wrapped_user_key,
      iv: row.wrapped_user_key_iv,
      tag: row.wrapped_user_key_tag,
    },
    legacyMasterKey,
  );
  const legacyDek = Buffer.from(encoded, "base64");
  if (legacyDek.length !== 32 || legacyDek.toString("base64") !== encoded) {
    legacyDek.fill(0);
    throw new VaultKeyLifecycleError("corrupt_key_record");
  }
  return legacyDek;
}

function encryptedColumns(contract: CoreContentVaultTableContract): string[] {
  return Object.entries(contract.columns).flatMap(([column, value]) =>
    value.disposition === "encrypted" ? [column] : [],
  );
}

function normalizeLegacyJournalInput(
  table: string,
  column: string,
  value: Exclude<SqliteValue, null>,
  legacyUserDek: Buffer,
): Exclude<SqliteValue, null> {
  const isJournalInput =
    (table === "prism_action_proposals" &&
      (column === "input_json" || column === "preview_json")) ||
    (table === "prism_action_runs" && column === "input_json");
  if (!isJournalInput || typeof value !== "string") return value;
  let stored: Record<string, unknown>;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("invalid journal input");
    }
    stored = parsed as Record<string, unknown>;
  } catch {
    throw new VaultEnvelopeMalformedError("invalid_input");
  }
  const existing = stored.__prismEncryptedInputV1;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    const envelope = existing as Record<string, unknown>;
    if (
      typeof envelope.ciphertext !== "string" ||
      typeof envelope.iv !== "string" ||
      typeof envelope.tag !== "string"
    ) {
      throw new VaultEnvelopeMalformedError("invalid_input");
    }
    decryptJson(
      {
        ciphertext: envelope.ciphertext,
        iv: envelope.iv,
        tag: envelope.tag,
      },
      legacyUserDek,
    );
    return value;
  }
  const encrypted = encryptJson(stored, legacyUserDek);
  return JSON.stringify({ __prismEncryptedInputV1: encrypted });
}

function migrateCoreRows(args: {
  db: DatabaseSync;
  ownerUserId: string;
  context: VaultMasterKeyContextV2;
  activeKeyId: string;
  legacyUserDek: Buffer;
  onUnit: (encrypted: boolean) => void;
}): void {
  const idempotencyRows = args.db
    .prepare(
      `SELECT id, idempotency_key
         FROM main.prism_action_runs
        WHERE user_id = ?`,
    )
    .all(args.ownerUserId) as Array<{
    id: string;
    idempotency_key: string;
  }>;
  const updateIdempotency = args.db.prepare(
    `UPDATE main.prism_action_runs
        SET idempotency_key = ?
      WHERE user_id = ? AND id = ?`,
  );
  for (const row of idempotencyRows) {
    if (PRISM_ACTION_IDEMPOTENCY_DIGEST.test(row.idempotency_key)) continue;
    updateIdempotency.run(
      prismActionIdempotencyDigestV2(args.ownerUserId, row.idempotency_key),
      args.ownerUserId,
      row.id,
    );
  }

  for (const contract of CORE_CONTENT_VAULT_TABLES) {
    const encrypted = encryptedColumns(contract);
    if (encrypted.length === 0) continue;
    const selected = [...new Set([...contract.stableRowColumns, ...encrypted])]
      .map(quoteIdentifier)
      .join(", ");
    const orderBy = contract.stableRowColumns.map(quoteIdentifier).join(", ");
    const rows = args.db
      .prepare(
        `SELECT ${selected} FROM main.${quoteIdentifier(contract.table)} WHERE ${quoteIdentifier(contract.ownerColumn)} = ? ORDER BY ${orderBy}`,
      )
      .all(args.ownerUserId) as unknown as Array<Record<string, SqliteValue>>;

    for (const row of rows) {
      const stableRowValues = contract.stableRowColumns.map(
        (column) => row[column],
      );
      const stableRowId = coreContentVaultStableRowIdV2(
        contract.table,
        stableRowValues,
      );
      const updates: Array<{ column: string; envelope: Buffer }> = [];
      for (const column of encrypted) {
        const value = row[column];
        if (value === null) {
          args.onUnit(false);
          continue;
        }
        if (value instanceof Uint8Array) {
          const envelope = parseVaultEnvelopeV2(value);
          const plaintext = decryptUserVaultContentForMigrationV2({
            db: args.db,
            ownerUserId: args.ownerUserId,
            context: args.context,
            migrationContext: VAULT_KEYRING_MIGRATION_CONTEXT_V2,
            logicalTable: contract.table,
            logicalColumn: column,
            stableRowId,
            serializedEnvelope: value,
          });
          decodeSqliteValue(plaintext);
          if (envelope.keyId !== args.activeKeyId) {
            updates.push({
              column,
              envelope: encryptUserVaultContentV2({
                db: args.db,
                ownerUserId: args.ownerUserId,
                context: args.context,
                logicalTable: contract.table,
                logicalColumn: column,
                stableRowId,
                plaintext,
              }),
            });
          }
          args.onUnit(false);
          continue;
        }

        // This is the only code path allowed to interpret an ordinary SQLite
        // scalar as legacy plaintext. It is resumable because every completed
        // cell becomes a self-identifying V2 envelope before progress advances.
        const migratedValue = normalizeLegacyJournalInput(
          contract.table,
          column,
          value,
          args.legacyUserDek,
        );
        updates.push({
          column,
          envelope: encryptUserVaultContentV2({
            db: args.db,
            ownerUserId: args.ownerUserId,
            context: args.context,
            logicalTable: contract.table,
            logicalColumn: column,
            stableRowId,
            plaintext: encodeSqliteValue(migratedValue),
          }),
        });
        args.onUnit(true);
      }
      if (updates.length === 0) continue;
      const assignments = updates
        .map(({ column }) => `${quoteIdentifier(column)} = ?`)
        .join(", ");
      args.db
        .prepare(
          `UPDATE main.${quoteIdentifier(contract.table)} SET ${assignments} WHERE ${quoteIdentifier(contract.ownerColumn)} = ? AND ${contract.stableRowColumns
            .map((column) => `${quoteIdentifier(column)} IS ?`)
            .join(" AND ")}`,
        )
        .run(
          ...updates.map(({ envelope }) => envelope),
          args.ownerUserId,
          ...stableRowValues,
        );
    }
  }
}

function migrationUnitCount(db: DatabaseSync, ownerUserId: string): number {
  let total = 0;
  for (const contract of CORE_CONTENT_VAULT_TABLES) {
    const count = db
      .prepare(
        `SELECT COUNT(*) AS count FROM main.${quoteIdentifier(contract.table)} WHERE ${quoteIdentifier(contract.ownerColumn)} = ?`,
      )
      .get(ownerUserId) as { count: number };
    total += Number(count.count) * encryptedColumns(contract).length;
  }
  return total;
}

function setMigrationState(
  db: DatabaseSync,
  userId: string,
  phase: "migrating" | "blocked" | "complete",
  completedUnits: number,
  totalUnits: number,
): void {
  db.prepare(`
    INSERT INTO core_content_vault_migrations
      (user_id, contract_version, phase, completed_units, total_units, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, contract_version) DO UPDATE SET
      phase = excluded.phase,
      completed_units = excluded.completed_units,
      total_units = excluded.total_units,
      updated_at = excluded.updated_at
  `).run(
    userId,
    CORE_CONTENT_VAULT_CONTRACT_VERSION,
    phase,
    completedUnits,
    totalUnits,
    new Date().toISOString(),
  );
}

function scrubLegacyCoreContentPages(db: DatabaseSync): void {
  // Row updates alone can leave old values in freelist pages or a WAL. This is
  // part of the explicit migration boundary, never an ordinary CRUD path.
  db.exec("PRAGMA secure_delete = ON");
  db.exec("VACUUM");
  db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
}

export function migrateCoreContentVaultV2(args: {
  db: DatabaseSync;
  context: VaultMasterKeyContextV2;
  legacyMasterSecret: string;
}): CoreContentVaultMigrationReport {
  assertCoreContentVaultContract(args.db);
  ensureMigrationStateSchema(args.db);
  const owners = args.db
    .prepare(
      `SELECT id, wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag, created_at FROM main.users ORDER BY id`,
    )
    .all() as unknown as LegacyOwnerKeyRow[];
  const legacyMasterKey = deriveMasterKey(args.legacyMasterSecret);
  let encryptedCellCount = 0;
  let verifiedCellCount = 0;
  try {
    for (const owner of owners) {
      const totalUnits = migrationUnitCount(args.db, owner.id);
      let completedUnits = 0;
      setMigrationState(args.db, owner.id, "migrating", 0, totalUnits);
      try {
        const legacyUserDek = unwrapLegacyOwnerDek(owner, legacyMasterKey);
        try {
          const active = importLegacyOwnerKeyIfNeeded({
            db: args.db,
            row: owner,
            context: args.context,
            legacyDek: legacyUserDek,
          });
          migrateCoreRows({
            db: args.db,
            ownerUserId: owner.id,
            context: args.context,
            activeKeyId: active.keyId,
            legacyUserDek,
            onUnit(encrypted) {
              completedUnits += 1;
              if (encrypted) encryptedCellCount += 1;
              else verifiedCellCount += 1;
            },
          });
        } finally {
          legacyUserDek.fill(0);
        }
        setMigrationState(
          args.db,
          owner.id,
          "migrating",
          completedUnits,
          totalUnits,
        );
      } catch (error) {
        setMigrationState(
          args.db,
          owner.id,
          "blocked",
          completedUnits,
          totalUnits,
        );
        throw error;
      }
    }
    if (owners.length > 0) scrubLegacyCoreContentPages(args.db);
    for (const owner of owners) {
      const totalUnits = migrationUnitCount(args.db, owner.id);
      setMigrationState(
        args.db,
        owner.id,
        "complete",
        totalUnits,
        totalUnits,
      );
    }
  } finally {
    legacyMasterKey.fill(0);
  }
  return Object.freeze({
    contractVersion: CORE_CONTENT_VAULT_CONTRACT_VERSION,
    ownerCount: owners.length,
    encryptedCellCount,
    verifiedCellCount,
  });
}

export function activateCoreContentVaultV2(args: {
  db: DatabaseSync;
  masterSecret: string;
}): CoreContentVaultMigrationReport {
  if (RUNTIMES.has(args.db)) {
    throw new VaultKeyLifecycleError("transaction_conflict");
  }
  const runtime: CoreVaultRuntime = {
    context: deriveVaultMasterKeyContextV2(args.db, args.masterSecret),
    functionsRegistered: false,
    physicalPrepare: null,
    physicalMutations: new Map(),
    prepareWrapped: false,
    viewsInstalled: false,
  };
  RUNTIMES.set(args.db, runtime);
  try {
    const report = migrateCoreContentVaultV2({
      db: args.db,
      context: runtime.context,
      legacyMasterSecret: args.masterSecret,
    });
    installCoreContentVaultViewsV2(args.db);
    return report;
  } catch (error) {
    RUNTIMES.delete(args.db);
    throw error;
  }
}

/**
 * Reinstalls the cleartext compatibility views before legacy additive schema
 * normalizers run on a database that already completed this contract. It does
 * not inspect or accept plaintext; an incomplete migration always continues to
 * the explicit migrator at the end of initialization instead.
 */
export function resumeCoreContentVaultViewsV2(args: {
  db: DatabaseSync;
  masterSecret: string;
}): boolean {
  if (RUNTIMES.has(args.db)) return coreContentVaultIsActiveV2(args.db);
  const migrationTable = args.db
    .prepare(
      "SELECT 1 AS present FROM main.sqlite_master WHERE type = 'table' AND name = 'core_content_vault_migrations'",
    )
    .get() as { present?: number } | undefined;
  if (!migrationTable?.present) return false;
  const ownerCount = Number(
    (
      args.db.prepare("SELECT COUNT(*) AS count FROM main.users").get() as {
        count: number;
      }
    ).count,
  );
  if (ownerCount === 0) return false;
  const completedOwnerCount = Number(
    (
      args.db
        .prepare(
          `SELECT COUNT(*) AS count
             FROM main.core_content_vault_migrations
            WHERE contract_version = ? AND phase = 'complete'`,
        )
        .get(CORE_CONTENT_VAULT_CONTRACT_VERSION) as { count: number }
    ).count,
  );
  if (completedOwnerCount !== ownerCount) return false;
  const runtime: CoreVaultRuntime = {
    context: deriveVaultMasterKeyContextV2(args.db, args.masterSecret),
    functionsRegistered: false,
    physicalPrepare: null,
    physicalMutations: new Map(),
    prepareWrapped: false,
    viewsInstalled: false,
  };
  RUNTIMES.set(args.db, runtime);
  try {
    installCoreContentVaultViewsV2(args.db);
    return true;
  } catch (error) {
    RUNTIMES.delete(args.db);
    throw error;
  }
}

export function initializeCoreContentVaultOwnerV2(args: {
  db: DatabaseSync;
  ownerUserId: string;
  legacyUserDek: Uint8Array;
  createdAt?: string;
}): UserVaultKeyMetadataV2 {
  const runtime = RUNTIMES.get(args.db);
  if (!runtime) {
    throw new VaultKeyLifecycleError("invalid_master_key_context");
  }
  const existing = listUserVaultKeysV2(args.db, args.ownerUserId);
  if (existing.length > 0) {
    const resolved = resolveActiveUserVaultKeyV2({
      db: args.db,
      ownerUserId: args.ownerUserId,
      context: runtime.context,
    });
    try {
      const { dek: _dek, ...metadata } = resolved;
      setMigrationState(args.db, args.ownerUserId, "complete", 0, 0);
      return Object.freeze(metadata);
    } finally {
      resolved.dek.fill(0);
    }
  }
  const metadata = importLegacyUserDekIntoVaultKeyringV2({
    db: args.db,
    ownerUserId: args.ownerUserId,
    context: runtime.context,
    legacyDek: args.legacyUserDek,
    createdAt: args.createdAt,
  });
  setMigrationState(args.db, args.ownerUserId, "complete", 0, 0);
  return metadata;
}

export function coreContentVaultIsActiveV2(db: DatabaseSync): boolean {
  return RUNTIMES.get(db)?.viewsInstalled === true;
}

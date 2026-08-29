import {
  BOT_LIBRARY_GROUP_MEMBER_MAX,
  PRISM_ORCHESTRATION_VERSION,
  parseStoredBotPrompt,
  parseStoredBotAvatarDetailsV1,
  serializeBotAudioVoiceProfileV1,
  serializeBotAvatarDetailsV1,
  serializeBotPowersV1,
  serializeStoredBotPrompt,
  type BotGeneratedDraftV1,
  type PrismActionPreviewV1,
  type PrismCapabilityDescriptorV1,
  type PrismEntityReferenceV1,
  type PrismJsonObject,
  type PrismJsonValue,
} from "@localai/shared";
import {
  createPrismContextToken,
} from "./prism-action-journal.ts";
import {
  listLibraryGroups,
  projectLibraryProtectionToBots,
  replaceLibraryGroups,
  setLibraryFavorites,
} from "./library-groups.ts";
import {
  PrismCapabilityRegistry,
  type PrismCapabilityContext,
  type PrismCapabilityDefinition,
} from "./prism-capabilities.ts";
import { decryptJson, encryptJson, randomId } from "./security.ts";
import { deleteMemoriesAcquiredDuringAppletSessions } from "./memory.ts";
import type { ElevenLabsCreditBalance } from "./elevenlabs-subscription.ts";
import {
  checkElevenLabsCreditMonitor,
  listPrismMonitors,
  upsertElevenLabsCreditMonitor,
} from "./prism-monitors.ts";
import { createSlateProject, updateSlateProject } from "./slate.ts";
import { createSlateSeries } from "./slate-continuity.ts";
import {
  createBotcastEpisode,
  getBotcastShow,
  updateBotcastShow,
} from "./botcast.ts";
import {
  installPrismMarketplaceSelection,
  preparePrismMarketplaceInstall,
  resolvePrismMarketplaceSelection,
  undoPrismMarketplaceInstall,
  type PrismMarketplacePreparedArchive,
  type PrismMarketplaceSelection,
} from "./prism-marketplace.ts";
import {
  applyPrismSettingsPatch,
  previewPrismSettingsPatch,
  readPrismJournaledSettings,
  undoPrismSettingsPatch,
  validatePrismSettingsPatch,
} from "./prism-settings-mutations.ts";
import {
  applyPrismBotPatch,
  previewPrismBotPatch,
  undoPrismBotPatch,
  validatePrismBotPatch,
} from "./prism-bot-mutations.ts";
import {
  applyPrismDefaultBotPatch,
  previewPrismDefaultBotPatch,
  undoPrismDefaultBotPatch,
} from "./prism-default-bot-mutations.ts";
import {
  advancePrismStorySession,
  deletePrismStorySession,
  previewPrismStorySession,
  readPrismStorySession,
  undoPrismStorySession,
  type PrismStoryAdvanceKind,
} from "./prism-story-mutations.ts";
import {
  applyPrismSlateProjectPatch,
  createPrismSlateProject,
  previewPrismSlateProject,
  readPrismSlateProject,
  undoPrismSlateProjectCreate,
  undoPrismSlateProjectPatch,
  validatePrismSlateRootPatch,
} from "./prism-slate-mutations.ts";
import {
  deletePrismImage,
  previewPrismImageDeletion,
  undoPrismImageDeletion,
} from "./prism-image-mutations.ts";
import {
  deleteDebateSession,
  getDebateSession,
  restoreDeletedDebateSession,
} from "./debate.ts";

export interface PrismDomainCapabilityDependencies {
  primaryOllamaHost?: string;
  onBotProfileChanged?: (
    context: PrismCapabilityContext,
    botId: string,
  ) => void;
  readElevenLabsBalance?: (
    context: PrismCapabilityContext,
  ) => Promise<ElevenLabsCreditBalance>;
  generateBotDraft?: (
    context: PrismCapabilityContext,
    brief: string,
  ) => Promise<BotGeneratedDraftV1>;
  generateSignalBooking?: (
    context: PrismCapabilityContext,
    input: {
      showId: string;
      guestBotId: string;
      direction: string;
    },
  ) => Promise<{
    topic: string;
    producerBrief: string;
    provider: string;
    model: string | null;
  }>;
  generateBotContextualField?: (
    context: PrismCapabilityContext,
    input: {
      botId: string;
      botName: string;
      currentValue: string;
      direction: string;
      profile: PrismJsonObject;
    },
  ) => Promise<{
    value: string;
    provider: string;
    model: string;
  }>;
  generateCoffeeGroupIdentity?: (
    context: PrismCapabilityContext,
    input: {
      brief: string;
      bots: Array<{
        id: string;
        name: string;
        profileSummary: string;
      }>;
    },
  ) => Promise<{
    name: string;
    premise: string;
    provider: string;
    model: string;
  }>;
  startStorySession?: (
    context: PrismCapabilityContext,
    input: PrismJsonObject,
  ) => Promise<{
    id: string;
    title: string;
    status: string;
    updatedAt: string;
  }>;
}

function descriptor(
  definition: Omit<
    PrismCapabilityDescriptorV1,
    "schemaVersion" | "version" | "inputSchema" | "resultSchema"
  >,
): PrismCapabilityDescriptorV1 {
  return {
    schemaVersion: PRISM_ORCHESTRATION_VERSION,
    version: 1,
    inputSchema: { type: "object" },
    resultSchema: { type: "object" },
    ...definition,
  };
}

function requiredString(
  input: PrismJsonObject,
  key: string,
  maximum = 500,
): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }
  return value.trim().slice(0, maximum);
}

function stringArray(
  input: PrismJsonObject,
  key: string,
  limit = 100,
): string[] {
  const value = input[key];
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function jsonClone(value: unknown): PrismJsonValue {
  return JSON.parse(JSON.stringify(value)) as PrismJsonValue;
}

function botRows(
  context: PrismCapabilityContext,
  botIds: readonly string[],
): Array<{
  id: string;
  name: string;
  face_eye_count: number;
  updated_at: string;
}> {
  if (botIds.length === 0) return [];
  const placeholders = botIds.map(() => "?").join(", ");
  return context.db
    .prepare(
      `SELECT id, name, face_eye_count, updated_at
         FROM bots
        WHERE user_id = ? AND id IN (${placeholders})
        ORDER BY name COLLATE NOCASE, id`,
    )
    .all(context.userId, ...botIds) as unknown as Array<{
    id: string;
    name: string;
    face_eye_count: number;
    updated_at: string;
  }>;
}

function botReference(row: {
  id: string;
  name: string;
  updated_at: string;
}): PrismEntityReferenceV1 {
  return {
    schemaVersion: PRISM_ORCHESTRATION_VERSION,
    entityType: "bot",
    id: row.id,
    label: row.name,
    revision: row.updated_at,
  };
}

function simplePreview(
  summary: string,
  targets: PrismEntityReferenceV1[] = [],
): PrismActionPreviewV1 {
  return {
    summary,
    consequences: [],
    targets,
    diffs: [],
    provider: null,
    model: null,
    estimatedCostMicroUsd: null,
  };
}

interface PrismMemoryRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  bot_id: string | null;
  ciphertext: string;
  iv: string;
  tag: string;
  confidence: number;
  category: string;
  tier: string;
  durability: number;
  source: string;
  certainty: number | null;
  source_message_ids: string;
  created_at: string;
}

function memoryRows(
  context: PrismCapabilityContext,
  memoryIds: readonly string[],
): PrismMemoryRow[] {
  if (memoryIds.length === 0) return [];
  const placeholders = memoryIds.map(() => "?").join(", ");
  return context.db
    .prepare(
      `SELECT *
         FROM memories
        WHERE user_id = ? AND id IN (${placeholders})
        ORDER BY created_at, id`,
    )
    .all(context.userId, ...memoryIds) as unknown as PrismMemoryRow[];
}

function memoriesDeleteCapability(): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "memories.delete",
    label: "Delete memories",
    description:
      "Deletes an exact frozen set of encrypted memories with a 30-day undo receipt.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: true,
    risk: "destructive",
    confirmation: "explicit-confirmation",
    privacy: "private",
    provider: "none",
    cost: "none",
    undo: "quarantine",
    idempotent: true,
  });
  const validateInput = (input: PrismJsonObject): PrismJsonObject => {
    const memoryIds = stringArray(input, "memoryIds", 500);
    const revisions =
      input.revisions &&
      typeof input.revisions === "object" &&
      !Array.isArray(input.revisions)
        ? Object.fromEntries(
            Object.entries(input.revisions).flatMap(([id, revision]) =>
              typeof revision === "string" ? [[id, revision]] : [],
            ),
          )
        : {};
    const all = input.all === true;
    if (!all && memoryIds.length === 0) {
      throw new Error("Choose at least one memory to delete.");
    }
    return {
      memoryIds,
      revisions,
      all,
      includeAboutYou: input.includeAboutYou === true,
      allowLongTerm: input.allowLongTerm === true || all,
    };
  };
  const selectRequestedRows = (
    context: PrismCapabilityContext,
    input: PrismJsonObject,
  ): PrismMemoryRow[] => {
    const requestedIds = stringArray(input, "memoryIds", 500);
    const includeAboutYou = input.includeAboutYou === true;
    const allowLongTerm = input.allowLongTerm === true;
    if (requestedIds.length > 0) {
      return memoryRows(context, requestedIds).filter(
        (row) =>
          (includeAboutYou || row.source !== "about_you") &&
          (allowLongTerm || row.tier !== "long_term"),
      );
    }
    return context.db
      .prepare(
        `SELECT *
           FROM memories
          WHERE user_id = ?
            ${includeAboutYou ? "" : "AND COALESCE(source, 'direct') != 'about_you'"}
          ORDER BY created_at, id`,
      )
      .all(context.userId) as unknown as PrismMemoryRow[];
  };
  const previewFor = (
    context: PrismCapabilityContext,
    input: PrismJsonObject,
  ): PrismActionPreviewV1 => {
    const rows = selectRequestedRows(context, input);
    if (rows.length === 0) throw new Error("No matching memories are available.");
    return {
      ...simplePreview(
        `Delete ${rows.length} memor${rows.length === 1 ? "y" : "ies"}.`,
        rows.map((row) => ({
          schemaVersion: PRISM_ORCHESTRATION_VERSION,
          entityType: "memory",
          id: row.id,
          label: "Encrypted memory",
          revision: row.created_at,
        })),
      ),
      consequences: [
        "The encrypted memory rows leave active recall immediately and remain undoable for 30 days.",
        ...(input.includeAboutYou === true
          ? ["Protected About You memories are included."]
          : ["Protected About You memories are left untouched."]),
      ],
    };
  };
  return {
    descriptor: capabilityDescriptor,
    validateInput,
    prepareProposal: async (context, initialInput) => {
      const rows = selectRequestedRows(context, initialInput);
      if (rows.length === 0) {
        throw new Error("No matching memories are available.");
      }
      const input = validateInput({
        ...initialInput,
        all: false,
        memoryIds: rows.map((row) => row.id),
        revisions: Object.fromEntries(
          rows.map((row) => [row.id, row.created_at]),
        ),
      });
      return { input, preview: previewFor(context, input) };
    },
    preview: previewFor,
    execute: (context, input) => {
      const memoryIds = stringArray(input, "memoryIds", 500);
      const rows = memoryRows(context, memoryIds);
      const revisions =
        input.revisions &&
        typeof input.revisions === "object" &&
        !Array.isArray(input.revisions)
          ? input.revisions
          : {};
      if (
        rows.length !== memoryIds.length ||
        rows.some((row) => revisions[row.id] !== row.created_at)
      ) {
        throw new Error(
          "One or more memories changed after preview. Review the target set again.",
        );
      }
      const placeholders = memoryIds.map(() => "?").join(", ");
      context.db
        .prepare(
          `DELETE FROM memories
            WHERE user_id = ? AND id IN (${placeholders})`,
        )
        .run(context.userId, ...memoryIds);
      return {
        result: { deleted: rows.length },
        affectedEntities: rows.map((row) => ({
          schemaVersion: PRISM_ORCHESTRATION_VERSION,
          entityType: "memory",
          id: row.id,
          label: "Encrypted memory",
          revision: row.created_at,
        })),
        inverse: { rows: jsonClone(rows) },
      };
    },
    undo: (context, inverse) => {
      if (!Array.isArray(inverse.rows)) {
        throw new Error("Undo data is invalid.");
      }
      const insert = context.db.prepare(
        `INSERT INTO memories (
          id, user_id, conversation_id, bot_id, ciphertext, iv, tag,
          confidence, category, tier, durability, source, certainty,
          source_message_ids, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const affectedEntities: PrismEntityReferenceV1[] = [];
      for (const raw of inverse.rows) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          throw new Error("Undo data is invalid.");
        }
        const row = raw as PrismJsonObject;
        if (
          typeof row.id !== "string" ||
          typeof row.ciphertext !== "string" ||
          typeof row.iv !== "string" ||
          typeof row.tag !== "string" ||
          typeof row.created_at !== "string"
        ) {
          throw new Error("Undo data is invalid.");
        }
        insert.run(
          row.id,
          context.userId,
          typeof row.conversation_id === "string"
            ? row.conversation_id
            : null,
          typeof row.bot_id === "string" ? row.bot_id : null,
          row.ciphertext,
          row.iv,
          row.tag,
          typeof row.confidence === "number" ? row.confidence : 0.5,
          typeof row.category === "string" ? row.category : "general",
          typeof row.tier === "string" ? row.tier : "short_term",
          typeof row.durability === "number" ? row.durability : 0.5,
          typeof row.source === "string" ? row.source : "direct",
          typeof row.certainty === "number" ? row.certainty : null,
          typeof row.source_message_ids === "string"
            ? row.source_message_ids
            : "[]",
          row.created_at,
        );
        affectedEntities.push({
          schemaVersion: PRISM_ORCHESTRATION_VERSION,
          entityType: "memory",
          id: row.id,
          label: "Encrypted memory",
          revision: row.created_at,
        });
      }
      return { affectedEntities };
    },
  };
}

interface PrismConversationRow {
  id: string;
  title: string;
  conversation_mode: string;
  updated_at: string;
  archived_at: string | null;
  archive_batch_id: string | null;
}

function conversationRows(
  context: PrismCapabilityContext,
  conversationIds: readonly string[],
): PrismConversationRow[] {
  if (conversationIds.length === 0) return [];
  const placeholders = conversationIds.map(() => "?").join(", ");
  return context.db
    .prepare(
      `SELECT id, title, conversation_mode, updated_at, archived_at, archive_batch_id
         FROM conversations
        WHERE user_id = ? AND id IN (${placeholders})
        ORDER BY updated_at, id`,
    )
    .all(
      context.userId,
      ...conversationIds,
    ) as unknown as PrismConversationRow[];
}

function conversationsQuarantineCapability(): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "conversations.quarantine",
    label: "Delete conversations",
    description:
      "Removes an exact frozen set of conversations from active history while retaining a 30-day undo path.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: true,
    risk: "destructive",
    confirmation: "explicit-confirmation",
    privacy: "private",
    provider: "none",
    cost: "none",
    undo: "quarantine",
    idempotent: true,
  });
  const validateInput = (input: PrismJsonObject): PrismJsonObject => {
    const conversationIds = stringArray(input, "conversationIds", 500);
    const revisions =
      input.revisions &&
      typeof input.revisions === "object" &&
      !Array.isArray(input.revisions)
        ? Object.fromEntries(
            Object.entries(input.revisions).flatMap(([id, revision]) =>
              typeof revision === "string" ? [[id, revision]] : [],
            ),
          )
        : {};
    const all = input.all === true;
    if (!all && conversationIds.length === 0) {
      throw new Error("Choose at least one conversation to delete.");
    }
    return { conversationIds, revisions, all };
  };
  const selectRequestedRows = (
    context: PrismCapabilityContext,
    input: PrismJsonObject,
  ): PrismConversationRow[] => {
    const requestedIds = stringArray(input, "conversationIds", 500);
    if (requestedIds.length > 0) {
      const direct = conversationRows(context, requestedIds).filter(
        (row) => row.archived_at === null,
      );
      const rootIds = direct.map((row) => row.id);
      if (rootIds.length === 0) return [];
      const placeholders = rootIds.map(() => "?").join(", ");
      const children = context.db
        .prepare(
          `SELECT id, title, conversation_mode, updated_at, archived_at, archive_batch_id
             FROM conversations
            WHERE user_id = ?
              AND parent_id IN (${placeholders})
              AND archived_at IS NULL`,
        )
        .all(
          context.userId,
          ...rootIds,
        ) as unknown as PrismConversationRow[];
      return Array.from(
        new Map([...direct, ...children].map((row) => [row.id, row])).values(),
      );
    }
    return context.db
      .prepare(
        `SELECT id, title, conversation_mode, updated_at, archived_at, archive_batch_id
           FROM conversations
          WHERE user_id = ?
            AND COALESCE(incognito, 0) = 0
            AND archived_at IS NULL
            AND NOT (
              conversation_mode = 'zen'
              OR (conversation_mode = 'chat' AND bot_id IS NULL)
            )
          ORDER BY updated_at, id
          LIMIT 500`,
      )
      .all(context.userId) as unknown as PrismConversationRow[];
  };
  const previewFor = (
    context: PrismCapabilityContext,
    input: PrismJsonObject,
  ): PrismActionPreviewV1 => {
    const rows = selectRequestedRows(context, input);
    if (rows.length === 0) {
      throw new Error("No matching conversations are available.");
    }
    return {
      ...simplePreview(
        `Delete ${rows.length} conversation${rows.length === 1 ? "" : "s"}.`,
        rows.map((row) => ({
          schemaVersion: PRISM_ORCHESTRATION_VERSION,
          entityType: "conversation",
          id: row.id,
          label: row.title || "Untitled conversation",
          revision: row.updated_at,
        })),
      ),
      consequences: [
        "The conversations leave active history immediately and remain recoverable for 30 days.",
        "Memories learned inside deleted Coffee sessions are permanently removed, even if a session is restored.",
        "Downloaded exports and already-consumed provider credits are not recalled.",
      ],
    };
  };
  return {
    descriptor: capabilityDescriptor,
    validateInput,
    prepareProposal: async (context, initialInput) => {
      const rows = selectRequestedRows(context, initialInput);
      if (rows.length === 0) {
        throw new Error("No matching conversations are available.");
      }
      const input = validateInput({
        all: false,
        conversationIds: rows.map((row) => row.id),
        revisions: Object.fromEntries(
          rows.map((row) => [row.id, row.updated_at]),
        ),
      });
      return { input, preview: previewFor(context, input) };
    },
    preview: previewFor,
    execute: (context, input) => {
      const conversationIds = stringArray(input, "conversationIds", 500);
      const rows = conversationRows(context, conversationIds);
      const revisions =
        input.revisions &&
        typeof input.revisions === "object" &&
        !Array.isArray(input.revisions)
          ? input.revisions
          : {};
      if (
        rows.length !== conversationIds.length ||
        rows.some(
          (row) =>
            row.archived_at !== null ||
            revisions[row.id] !== row.updated_at,
        )
      ) {
        throw new Error(
          "One or more conversations changed after preview. Review the target set again.",
        );
      }
      const archiveBatchId = `prism:${context.runId ?? randomId()}`;
      const placeholders = conversationIds.map(() => "?").join(", ");
      const archivedAt = context.now.toISOString();
      const coffeeIds = rows
        .filter((row) => row.conversation_mode === "coffee")
        .map((row) => row.id);
      if (coffeeIds.length > 0) {
        const coffeePlaceholders = coffeeIds.map(() => "?").join(", ");
        const sourceMessageIds = (
          context.db
            .prepare(
              `SELECT id FROM messages
                WHERE user_id = ?
                  AND conversation_id IN (${coffeePlaceholders})`,
            )
            .all(context.userId, ...coffeeIds) as Array<{ id: string }>
        ).map((row) => row.id);
        deleteMemoriesAcquiredDuringAppletSessions(
          context.db,
          context.userId,
          coffeeIds,
          sourceMessageIds,
        );
      }
      context.db
        .prepare(
          `UPDATE conversations
              SET archived_at = ?, archive_batch_id = ?
            WHERE user_id = ?
              AND id IN (${placeholders})
              AND archived_at IS NULL`,
        )
        .run(
          archivedAt,
          archiveBatchId,
          context.userId,
          ...conversationIds,
        );
      return {
        result: {
          deleted: rows.length,
          undoExpiresAt: new Date(
            context.now.getTime() + 30 * 24 * 60 * 60 * 1_000,
          ).toISOString(),
        },
        affectedEntities: rows.map((row) => ({
          schemaVersion: PRISM_ORCHESTRATION_VERSION,
          entityType: "conversation",
          id: row.id,
          label: row.title || "Untitled conversation",
          revision: row.updated_at,
        })),
        inverse: {
          archiveBatchId,
          rows: rows.map((row) => ({
            id: row.id,
            archivedAt: row.archived_at,
            archiveBatchId: row.archive_batch_id,
          })),
        },
        nonReversibleConsequences:
          coffeeIds.length > 0
            ? ["Learned Coffee memories cannot be restored by Undo."]
            : [],
      };
    },
    undo: (context, inverse) => {
      const archiveBatchId =
        typeof inverse.archiveBatchId === "string"
          ? inverse.archiveBatchId
          : "";
      if (!archiveBatchId || !Array.isArray(inverse.rows)) {
        throw new Error("Undo data is invalid.");
      }
      const restore = context.db.prepare(
        `UPDATE conversations
            SET archived_at = ?, archive_batch_id = ?
          WHERE id = ? AND user_id = ? AND archive_batch_id = ?`,
      );
      const affectedEntities: PrismEntityReferenceV1[] = [];
      for (const raw of inverse.rows) {
        if (
          !raw ||
          typeof raw !== "object" ||
          Array.isArray(raw) ||
          typeof raw.id !== "string"
        ) {
          throw new Error("Undo data is invalid.");
        }
        const restored = restore.run(
          typeof raw.archivedAt === "string" ? raw.archivedAt : null,
          typeof raw.archiveBatchId === "string"
            ? raw.archiveBatchId
            : null,
          raw.id,
          context.userId,
          archiveBatchId,
        );
        if (restored.changes !== 1) {
          throw new Error("A quarantined conversation could not be restored.");
        }
        affectedEntities.push({
          schemaVersion: PRISM_ORCHESTRATION_VERSION,
          entityType: "conversation",
          id: raw.id,
          label: raw.id,
          revision: null,
        });
      }
      return { affectedEntities };
    },
  };
}

function settingsOnlineModelCapability(): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "settings.online-model.update",
    label: "Change primary online model",
    description:
      "Changes preferredOnlineModel without changing LOCAL, AUTO, or ONLINE.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: true,
    risk: "reversible",
    confirmation: "none",
    privacy: "private",
    provider: "none",
    cost: "none",
    undo: "inverse",
    idempotent: true,
  });
  return {
    descriptor: capabilityDescriptor,
    validateInput: (input) => ({
      model: requiredString(input, "model", 200),
    }),
    preview: (context, input) => {
      const previous = context.db
        .prepare(
          "SELECT preferred_online_model FROM users WHERE id = ?",
        )
        .get(context.userId) as { preferred_online_model: string | null };
      const model = requiredString(input, "model", 200);
      return {
        ...simplePreview(`Use ${model} as the primary online model.`),
        diffs: [
          {
            entity: {
              schemaVersion: PRISM_ORCHESTRATION_VERSION,
              entityType: "account-setting",
              id: "preferredOnlineModel",
              label: "Primary online model",
              revision: null,
            },
            before: previous.preferred_online_model,
            after: model,
          },
        ],
      };
    },
    execute: (context, input) => {
      const previous = context.db
        .prepare(
          "SELECT preferred_online_model FROM users WHERE id = ?",
        )
        .get(context.userId) as { preferred_online_model: string | null };
      const model = requiredString(input, "model", 200);
      context.db
        .prepare(
          "UPDATE users SET preferred_online_model = ? WHERE id = ?",
        )
        .run(model, context.userId);
      const entity: PrismEntityReferenceV1 = {
        schemaVersion: PRISM_ORCHESTRATION_VERSION,
        entityType: "account-setting",
        id: "preferredOnlineModel",
        label: "Primary online model",
        revision: null,
      };
      return {
        result: { preferredOnlineModel: model },
        affectedEntities: [entity],
        inverse: { preferredOnlineModel: previous.preferred_online_model },
      };
    },
    undo: (context, inverse) => {
      const previous = inverse.preferredOnlineModel;
      context.db
        .prepare(
          "UPDATE users SET preferred_online_model = ? WHERE id = ?",
        )
        .run(typeof previous === "string" ? previous : null, context.userId);
      return { affectedEntities: [] };
    },
  };
}

function settingsFieldsUpdateCapability(
  dependencies: PrismDomainCapabilityDependencies,
): PrismCapabilityDefinition {
  const primaryOllamaHost =
    dependencies.primaryOllamaHost ?? "http://127.0.0.1:11434";
  const capabilityDescriptor = descriptor({
    id: "settings.fields.update",
    label: "Update account settings",
    description:
      "Updates supported non-credential settings through the shared account service.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: true,
    risk: "reversible",
    confirmation: "none",
    privacy: "private",
    provider: "none",
    cost: "none",
    undo: "inverse",
    idempotent: true,
  });
  const readPatch = (input: PrismJsonObject): PrismJsonObject => {
    const patch = input.patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new Error("A settings patch is required.");
    }
    return validatePrismSettingsPatch(patch as PrismJsonObject);
  };
  return {
    descriptor: capabilityDescriptor,
    validateInput: (input) => ({ patch: readPatch(input) }),
    preview: (context, input) => {
      const mutation = previewPrismSettingsPatch({
        db: context.db,
        userId: context.userId,
        patch: readPatch(input),
        primaryOllamaHost,
      });
      return {
        ...simplePreview(
          mutation.changedKeys.length === 0
            ? "Those settings already match."
            : `Update ${mutation.changedKeys.length} account setting${
                mutation.changedKeys.length === 1 ? "" : "s"
              }.`,
        ),
        diffs: mutation.changedKeys.map((key) => ({
          entity: {
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "account-setting",
            id: key,
            label: key,
            revision: null,
          },
          before: mutation.before[key] ?? null,
          after: mutation.after[key] ?? null,
        })),
      };
    },
    execute: (context, input) => {
      const mutation = applyPrismSettingsPatch({
        db: context.db,
        userId: context.userId,
        patch: readPatch(input),
        primaryOllamaHost,
      });
      return {
        result: {
          updated: mutation.changedKeys.length,
          settings: readPrismJournaledSettings({
            db: context.db,
            userId: context.userId,
            primaryOllamaHost,
          }),
        },
        affectedEntities: mutation.changedKeys.map((key) => ({
          schemaVersion: PRISM_ORCHESTRATION_VERSION,
          entityType: "account-setting",
          id: key,
          label: key,
          revision: context.now.toISOString(),
        })),
        inverse:
          mutation.changedKeys.length > 0
            ? {
                before: mutation.before,
              }
            : null,
      };
    },
    undo: (context, inverse) => {
      const before = inverse.before;
      if (!before || typeof before !== "object" || Array.isArray(before)) {
        throw new Error("Undo data is invalid.");
      }
      undoPrismSettingsPatch({
        db: context.db,
        userId: context.userId,
        before: before as PrismJsonObject,
      });
      return { affectedEntities: [] };
    },
  };
}

function defaultBotFieldsUpdateCapability(): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "default-bot.fields.update",
    label: "Update Default Prism appearance",
    description:
      "Updates Default Prism through the same journaled Avatar Studio service as the UI.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: true,
    risk: "reversible",
    confirmation: "none",
    privacy: "private",
    provider: "none",
    cost: "none",
    undo: "inverse",
    idempotent: true,
  });
  const validated = (
    input: PrismJsonObject,
  ): {
    patch: PrismJsonObject;
    expectedFingerprint: string | null;
  } => {
    const patch = input.patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new Error("A Default Prism patch is required.");
    }
    return {
      patch: patch as PrismJsonObject,
      expectedFingerprint:
        typeof input.expectedFingerprint === "string"
          ? input.expectedFingerprint
          : null,
    };
  };
  return {
    descriptor: capabilityDescriptor,
    validateInput: (input) => {
      const value = validated(input);
      return {
        patch: value.patch,
        expectedFingerprint: value.expectedFingerprint,
      };
    },
    preview: (context, input) => {
      const value = validated(input);
      const mutation = previewPrismDefaultBotPatch({
        db: context.db,
        userId: context.userId,
        patch: value.patch,
        expectedFingerprint: value.expectedFingerprint,
      });
      const entity = {
        schemaVersion: PRISM_ORCHESTRATION_VERSION,
        entityType: "default-bot",
        id: "default-prism",
        label: "Default Prism",
        revision: mutation.beforeFingerprint,
      } satisfies PrismEntityReferenceV1;
      return {
        ...simplePreview(
          mutation.changedKeys.length === 0
            ? "Default Prism already matches."
            : `Update ${mutation.changedKeys.length} Default Prism appearance field${
                mutation.changedKeys.length === 1 ? "" : "s"
              }.`,
          [entity],
        ),
        diffs: mutation.changedKeys.map((key) => ({
          entity,
          before: mutation.before[key] ?? null,
          after: mutation.after[key] ?? null,
        })),
      };
    },
    execute: (context, input) => {
      const value = validated(input);
      const mutation = applyPrismDefaultBotPatch({
        db: context.db,
        userId: context.userId,
        patch: value.patch,
        expectedFingerprint: value.expectedFingerprint,
      });
      return {
        result: {
          updated: mutation.changedKeys.length,
        },
        affectedEntities:
          mutation.changedKeys.length === 0
            ? []
            : [
                {
                  schemaVersion: PRISM_ORCHESTRATION_VERSION,
                  entityType: "default-bot",
                  id: "default-prism",
                  label: "Default Prism",
                  revision: mutation.beforeFingerprint,
                },
              ],
        inverse:
          mutation.changedKeys.length === 0
            ? null
            : {
                before: mutation.before,
                expectedCurrent: mutation.after,
              },
      };
    },
    undo: (context, inverse) => {
      if (
        !inverse.before ||
        typeof inverse.before !== "object" ||
        Array.isArray(inverse.before) ||
        !inverse.expectedCurrent ||
        typeof inverse.expectedCurrent !== "object" ||
        Array.isArray(inverse.expectedCurrent)
      ) {
        throw new Error("Undo data is invalid.");
      }
      undoPrismDefaultBotPatch({
        db: context.db,
        userId: context.userId,
        before: inverse.before as PrismJsonObject,
        expectedCurrent: inverse.expectedCurrent as PrismJsonObject,
      });
      return { affectedEntities: [] };
    },
  };
}

function storySessionAdvanceCapability(): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "story.session.advance",
    label: "Advance a Story session",
    description:
      "Applies an eligible choice, travel, or item action to one owned Story session.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: false,
    risk: "reversible",
    confirmation: "none",
    privacy: "private",
    provider: "none",
    cost: "none",
    undo: "inverse",
    idempotent: true,
  });
  const validated = (input: PrismJsonObject) => {
    const kind = input.kind;
    if (kind !== "choice" && kind !== "travel" && kind !== "item") {
      throw new Error("Story action must be choice, travel, or item.");
    }
    return {
      sessionId: requiredString(input, "sessionId", 200),
      kind: kind as PrismStoryAdvanceKind,
      targetId: requiredString(input, "targetId", 200),
      expectedRevision:
        typeof input.expectedRevision === "string"
          ? input.expectedRevision
          : null,
    };
  };
  return {
    descriptor: capabilityDescriptor,
    validateInput: (input) => validated(input),
    preview: (context, input) => {
      const value = validated(input);
      const session = previewPrismStorySession({
        db: context.db,
        userId: context.userId,
        sessionId: value.sessionId,
        expectedRevision: value.expectedRevision,
      });
      return simplePreview(
        `Apply this ${value.kind} in ${session.title}.`,
        [
          {
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "story-session",
            id: session.sessionId,
            label: session.title,
            revision: session.revision,
          },
        ],
      );
    },
    execute: (context, input) => {
      const value = validated(input);
      const mutation = advancePrismStorySession({
        db: context.db,
        userId: context.userId,
        ...value,
      });
      return {
        result: {
          session: jsonClone(
            readPrismStorySession(
              context.db,
              context.userId,
              mutation.sessionId,
            ),
          ),
        },
        affectedEntities: [
          {
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "story-session",
            id: mutation.sessionId,
            label: mutation.title,
            revision: mutation.appliedRevision,
          },
        ],
        inverse: {
          before: mutation.before,
          expectedRevision: mutation.appliedRevision,
        },
      };
    },
    undo: (context, inverse) => {
      if (
        !inverse.before ||
        typeof inverse.before !== "object" ||
        Array.isArray(inverse.before) ||
        typeof inverse.expectedRevision !== "string"
      ) {
        throw new Error("Story undo data is invalid.");
      }
      undoPrismStorySession({
        db: context.db,
        userId: context.userId,
        before: inverse.before as PrismJsonObject,
        expectedRevision: inverse.expectedRevision,
      });
      return { affectedEntities: [] };
    },
  };
}

function storySessionCreateCapability(
  dependencies: PrismDomainCapabilityDependencies,
): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "story.session.create",
    label: "Create a Story session",
    description:
      "Creates and begins generating a Story session from a validated owned-bot cast.",
    execution: "hybrid",
    surfaces: [],
    unavailableWhileLive: true,
    risk: "costly",
    confirmation: "preview",
    privacy: "private",
    provider: "local-or-online",
    cost: "estimated",
    undo: "inverse",
    idempotent: true,
  });
  const validated = (input: PrismJsonObject) => {
    const botIds = stringArray(input, "botIds", 5);
    if (botIds.length < 2 || botIds.length > 5) {
      throw new Error("Story Mode needs 2-5 bots.");
    }
    return {
      botIds,
      premise:
        typeof input.premise === "string"
          ? input.premise.trim().slice(0, 16_000)
          : "",
      ...(typeof input.preferredProvider === "string"
        ? { preferredProvider: input.preferredProvider }
        : {}),
      ...(typeof input.modelOverride === "string"
        ? { modelOverride: input.modelOverride }
        : {}),
      ...(input.theme &&
      typeof input.theme === "object" &&
      !Array.isArray(input.theme)
        ? { theme: input.theme }
        : {}),
    };
  };
  return {
    descriptor: capabilityDescriptor,
    transactional: false,
    validateInput: (input) => validated(input),
    preview: (context, input) => {
      const value = validated(input);
      const rows = botRows(context, value.botIds);
      if (rows.length !== value.botIds.length) {
        throw new Error("One or more Story bots are unavailable.");
      }
      return simplePreview(
        `Create a Story with ${rows.map((row) => row.name).join(", ")}.`,
        rows.map(botReference),
      );
    },
    execute: async (context, input) => {
      if (!dependencies.startStorySession) {
        throw new Error("Story session creation is unavailable.");
      }
      const session = await dependencies.startStorySession(
        context,
        validated(input),
      );
      return {
        result: {
          session: jsonClone(session),
          navigation: {
            surfaceId: "story",
            storySessionId: session.id,
          },
        },
        affectedEntities: [
          {
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "story-session",
            id: session.id,
            label: session.title,
            revision: session.updatedAt,
          },
        ],
        inverse: { sessionId: session.id },
        nonReversibleConsequences:
          context.hardLocal
            ? []
            : [
                "Any provider credits consumed before Undo cannot be restored.",
              ],
      };
    },
    undo: (context, inverse) => {
      if (typeof inverse.sessionId !== "string") {
        throw new Error("Story undo data is invalid.");
      }
      context.db
        .prepare(
          "DELETE FROM story_sessions WHERE id = ? AND user_id = ?",
        )
        .run(inverse.sessionId, context.userId);
      return { affectedEntities: [] };
    },
  };
}

function storySessionDeleteCapability(): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "story.session.delete",
    label: "Delete a Story session",
    description:
      "Quarantines one owned Story session for 30-day undo.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: false,
    risk: "destructive",
    confirmation: "explicit-confirmation",
    privacy: "private",
    provider: "none",
    cost: "none",
    undo: "quarantine",
    idempotent: true,
  });
  const validated = (input: PrismJsonObject) => ({
    sessionId: requiredString(input, "sessionId", 200),
    expectedRevision:
      typeof input.expectedRevision === "string"
        ? input.expectedRevision
        : null,
  });
  return {
    descriptor: capabilityDescriptor,
    validateInput: (input) => validated(input),
    preview: (context, input) => {
      const value = validated(input);
      const session = previewPrismStorySession({
        db: context.db,
        userId: context.userId,
        ...value,
      });
      return {
        ...simplePreview(
          `Delete ${session.title} and quarantine it for 30 days.`,
          [
            {
              schemaVersion: PRISM_ORCHESTRATION_VERSION,
              entityType: "story-session",
              id: session.sessionId,
              label: session.title,
              revision: session.revision,
            },
          ],
        ),
        consequences: [
          "The session disappears immediately but can be restored for 30 days.",
          "Any memories learned inside this Story session are permanently removed, even if the session is restored.",
        ],
      };
    },
    execute: (context, input) => {
      const value = validated(input);
      const mutation = deletePrismStorySession({
        db: context.db,
        userId: context.userId,
        ...value,
      });
      return {
        result: {
          sessionId: mutation.sessionId,
          title: mutation.title,
        },
        affectedEntities: [
          {
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "story-session",
            id: mutation.sessionId,
            label: mutation.title,
            revision: mutation.previousRevision,
          },
        ],
        inverse: {
          before: mutation.before,
          expectedRevision: null,
        },
        nonReversibleConsequences: [
          "Learned Story memories cannot be restored by Undo.",
        ],
      };
    },
    undo: (context, inverse) => {
      if (
        !inverse.before ||
        typeof inverse.before !== "object" ||
        Array.isArray(inverse.before)
      ) {
        throw new Error("Story undo data is invalid.");
      }
      undoPrismStorySession({
        db: context.db,
        userId: context.userId,
        before: inverse.before as PrismJsonObject,
        expectedRevision: null,
      });
      return { affectedEntities: [] };
    },
  };
}

function debateSessionDeleteCapability(): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "debate.session.delete",
    label: "Delete a Debate session",
    description:
      "Quarantines one owned Debate session for 30-day undo.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: false,
    risk: "destructive",
    confirmation: "explicit-confirmation",
    privacy: "private",
    provider: "none",
    cost: "none",
    undo: "quarantine",
    idempotent: true,
  });
  const validated = (input: PrismJsonObject) => {
    const expectedRevision = input.expectedRevision;
    if (
      typeof expectedRevision !== "number" ||
      !Number.isInteger(expectedRevision) ||
      expectedRevision < 1
    ) {
      throw new Error("expectedRevision must be a positive integer.");
    }
    return {
      sessionId: requiredString(input, "sessionId", 200),
      expectedRevision,
    };
  };
  return {
    descriptor: capabilityDescriptor,
    validateInput: (input) => validated(input),
    preview: (context, input) => {
      const value = validated(input);
      const session = getDebateSession(
        context.db,
        context.userId,
        value.sessionId,
      );
      if (session.revision !== value.expectedRevision) {
        throw new Error(
          `Debate changed from revision ${value.expectedRevision} to ${session.revision}. Refresh and retry.`,
        );
      }
      return {
        ...simplePreview(
          `Delete “${session.motion.motion}” and quarantine it for 30 days.`,
          [
            {
              schemaVersion: PRISM_ORCHESTRATION_VERSION,
              entityType: "debate-session",
              id: session.id,
              label: session.motion.motion,
              revision: String(session.revision),
            },
          ],
        ),
        consequences: [
          "The Debate disappears immediately but can be restored for 30 days.",
          "Any memories learned inside this Debate are permanently removed, even if the session is restored.",
        ],
      };
    },
    execute: (context, input) => {
      const value = validated(input);
      const before = getDebateSession(
        context.db,
        context.userId,
        value.sessionId,
      );
      deleteDebateSession(
        context.db,
        context.userId,
        value.sessionId,
        {
          expectedRevision: value.expectedRevision,
          idempotencyKey: `journal:${context.runId ?? "debate-delete"}`,
        },
      );
      return {
        result: {
          sessionId: before.id,
          motion: before.motion.motion,
        },
        affectedEntities: [
          {
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "debate-session",
            id: before.id,
            label: before.motion.motion,
            revision: String(before.revision),
          },
        ],
        inverse: {
          before: JSON.parse(JSON.stringify(before)) as PrismJsonObject,
        },
        nonReversibleConsequences: [
          "Learned Debate memories cannot be restored by Undo.",
        ],
      };
    },
    undo: (context, inverse) => {
      if (
        !inverse.before ||
        typeof inverse.before !== "object" ||
        Array.isArray(inverse.before)
      ) {
        throw new Error("Debate undo data is invalid.");
      }
      restoreDeletedDebateSession(
        context.db,
        context.userId,
        inverse.before as unknown as Parameters<
          typeof restoreDeletedDebateSession
        >[2],
      );
      return { affectedEntities: [] };
    },
  };
}

function slateProjectCreateCapability(): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "slate.project.create",
    label: "Create a Slate project",
    description:
      "Creates a writer-owned Slate project and records it for undo.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: true,
    risk: "reversible",
    confirmation: "none",
    privacy: "private",
    provider: "none",
    cost: "none",
    undo: "inverse",
    idempotent: true,
  });
  const validated = (input: PrismJsonObject) => ({
    title: requiredString(input, "title", 240),
    spark: requiredString(input, "spark", 16_000),
    titleOrigin:
      input.titleOrigin === "spark" || input.titleOrigin === "material"
        ? input.titleOrigin
        : "writer",
    ...(input.sparkWildcards !== undefined
      ? { sparkWildcards: input.sparkWildcards }
      : {}),
    ...(typeof input.seriesId === "string"
      ? { seriesId: input.seriesId }
      : {}),
  });
  return {
    descriptor: capabilityDescriptor,
    transactional: false,
    validateInput: (input) => validated(input),
    preview: (_context, input) => {
      const value = validated(input);
      return simplePreview(`Create “${value.title}” in Slate.`);
    },
    execute: (context, input) => {
      const mutation = createPrismSlateProject({
        db: context.db,
        userId: context.userId,
        input: validated(input),
      });
      const project = readPrismSlateProject(
        context.db,
        context.userId,
        mutation.projectId,
      );
      return {
        result: {
          project: jsonClone(project),
          navigation: {
            surfaceId: "slate",
            slateProjectId: mutation.projectId,
          },
        },
        affectedEntities: [
          {
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "slate-project",
            id: mutation.projectId,
            label: mutation.title,
            revision: mutation.appliedRevision,
          },
        ],
        inverse: {
          projectId: mutation.projectId,
          expectedRevision: mutation.appliedRevision,
        },
      };
    },
    undo: (context, inverse) => {
      if (
        typeof inverse.projectId !== "string" ||
        typeof inverse.expectedRevision !== "string"
      ) {
        throw new Error("Slate undo data is invalid.");
      }
      undoPrismSlateProjectCreate({
        db: context.db,
        userId: context.userId,
        projectId: inverse.projectId,
        expectedRevision: inverse.expectedRevision,
      });
      return { affectedEntities: [] };
    },
  };
}

function slateSeriesCreateCapability(): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "slate.series.create",
    label: "Create a Slate series",
    description:
      "Creates an empty writer-owned Slate series and records it for undo.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: true,
    risk: "reversible",
    confirmation: "none",
    privacy: "private",
    provider: "none",
    cost: "none",
    undo: "inverse",
    idempotent: true,
  });
  const validated = (input: PrismJsonObject) => ({
    title: requiredString(input, "title", 240),
    description:
      typeof input.description === "string"
        ? input.description.trim().slice(0, 4_000)
        : "",
  });
  return {
    descriptor: capabilityDescriptor,
    validateInput: (input) => validated(input),
    preview: (_context, input) => {
      const value = validated(input);
      return simplePreview(`Create the Slate series “${value.title}”.`);
    },
    execute: (context, input) => {
      const value = validated(input);
      const series = createSlateSeries(context.db, context.userId, value);
      return {
        result: { series: jsonClone(series) },
        affectedEntities: [
          {
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "slate-series",
            id: series.id,
            label: series.title,
            revision: series.updatedAt,
          },
        ],
        inverse: {
          seriesId: series.id,
          expectedRevision: series.updatedAt,
        },
      };
    },
    undo: (context, inverse) => {
      if (
        typeof inverse.seriesId !== "string" ||
        typeof inverse.expectedRevision !== "string"
      ) {
        throw new Error("Slate series undo data is invalid.");
      }
      const series = context.db
        .prepare(
          `SELECT updated_at,
                  (SELECT COUNT(*)
                     FROM slate_projects
                    WHERE series_id = slate_series.id AND user_id = ?) AS project_count
             FROM slate_series
            WHERE id = ? AND user_id = ?`,
        )
        .get(
          context.userId,
          inverse.seriesId,
          context.userId,
        ) as
        | { updated_at: string; project_count: number }
        | undefined;
      if (
        !series ||
        series.updated_at !== inverse.expectedRevision ||
        Number(series.project_count) !== 0
      ) {
        throw new Error(
          "The Slate series changed after creation and cannot be undone.",
        );
      }
      context.db
        .prepare("DELETE FROM slate_series WHERE id = ? AND user_id = ?")
        .run(inverse.seriesId, context.userId);
      return { affectedEntities: [] };
    },
  };
}

function slateProjectFieldsUpdateCapability(): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "slate.project.fields.update",
    label: "Update a Slate project",
    description:
      "Updates revision-checked Slate project direction, prose, manuscript, and metadata fields.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: true,
    risk: "reversible",
    confirmation: "none",
    privacy: "private",
    provider: "none",
    cost: "none",
    undo: "inverse",
    idempotent: true,
  });
  const validated = (input: PrismJsonObject) => ({
    projectId: requiredString(input, "projectId", 200),
    expectedRevision:
      typeof input.expectedRevision === "string"
        ? input.expectedRevision
        : null,
    patch: validatePrismSlateRootPatch(input.patch),
  });
  return {
    descriptor: capabilityDescriptor,
    validateInput: (input) => validated(input),
    preview: (context, input) => {
      const value = validated(input);
      const project = previewPrismSlateProject({
        db: context.db,
        userId: context.userId,
        projectId: value.projectId,
        expectedRevision: value.expectedRevision,
      });
      const entity = {
        schemaVersion: PRISM_ORCHESTRATION_VERSION,
        entityType: "slate-project",
        id: project.projectId,
        label: project.title,
        revision: project.revision,
      } satisfies PrismEntityReferenceV1;
      return {
        ...simplePreview(
          `Update ${Object.keys(value.patch).length} field${
            Object.keys(value.patch).length === 1 ? "" : "s"
          } in ${project.title}.`,
          [entity],
        ),
        diffs: Object.entries(value.patch).map(([key, after]) => ({
          entity,
          before: project.before[
            key.replace(/[A-Z]/gu, (character) => `_${character.toLowerCase()}`)
          ] ?? null,
          after,
        })),
      };
    },
    execute: (context, input) => {
      const value = validated(input);
      const mutation = applyPrismSlateProjectPatch({
        db: context.db,
        userId: context.userId,
        ...value,
      });
      return {
        result: {
          project: jsonClone(
            readPrismSlateProject(
              context.db,
              context.userId,
              mutation.projectId,
            ),
          ),
        },
        affectedEntities: [
          {
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "slate-project",
            id: mutation.projectId,
            label: mutation.title,
            revision: mutation.appliedRevision,
          },
        ],
        inverse: {
          before: mutation.before,
          expectedRevision: mutation.appliedRevision,
        },
      };
    },
    undo: (context, inverse) => {
      if (
        !inverse.before ||
        typeof inverse.before !== "object" ||
        Array.isArray(inverse.before) ||
        typeof inverse.expectedRevision !== "string"
      ) {
        throw new Error("Slate undo data is invalid.");
      }
      undoPrismSlateProjectPatch({
        db: context.db,
        userId: context.userId,
        before: inverse.before as PrismJsonObject,
        expectedRevision: inverse.expectedRevision,
      });
      return { affectedEntities: [] };
    },
  };
}

function imageDeleteCapability(): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "images.delete",
    label: "Delete an image",
    description:
      "Quarantines one owned Image Library asset and its local file for 30-day undo.",
    execution: "hybrid",
    surfaces: [],
    unavailableWhileLive: true,
    risk: "destructive",
    confirmation: "explicit-confirmation",
    privacy: "private",
    provider: "none",
    cost: "none",
    undo: "quarantine",
    idempotent: true,
  });
  const validated = (input: PrismJsonObject) => ({
    imageId: requiredString(input, "imageId", 200),
  });
  return {
    descriptor: capabilityDescriptor,
    validateInput: (input) => validated(input),
    preview: (context, input) => {
      const value = validated(input);
      const image = previewPrismImageDeletion({
        db: context.db,
        userId: context.userId,
        imageId: value.imageId,
      });
      return {
        ...simplePreview(
          `Delete this image and retain recovery for 30 days.`,
          [
            {
              schemaVersion: PRISM_ORCHESTRATION_VERSION,
              entityType: "image",
              id: image.imageId,
              label: image.prompt.slice(0, 80) || "Image",
              revision: null,
            },
          ],
        ),
        consequences: [
          ...(image.localFile
            ? ["The local image file moves into encrypted account-scoped recovery."]
            : []),
          ...(image.profileReferenceCount > 0
            ? [
                `${image.profileReferenceCount} bot profile picture reference${
                  image.profileReferenceCount === 1 ? "" : "s"
                } will be cleared and restored by Undo.`,
              ]
            : []),
        ],
      };
    },
    execute: (context, input) => {
      const value = validated(input);
      const mutation = deletePrismImage({
        db: context.db,
        userId: context.userId,
        imageId: value.imageId,
        now: context.now,
      });
      return {
        result: {
          imageId: mutation.imageId,
          recoveryId: mutation.recoveryId,
        },
        affectedEntities: [
          {
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "image",
            id: mutation.imageId,
            label: mutation.prompt.slice(0, 80) || "Image",
            revision: null,
          },
        ],
        inverse: {
          row: mutation.row,
          botReferences: mutation.botReferences,
          recoveryId: mutation.recoveryId,
          appliedAt: mutation.appliedAt,
        },
      };
    },
    undo: (context, inverse) => {
      if (
        !inverse.row ||
        typeof inverse.row !== "object" ||
        Array.isArray(inverse.row) ||
        !Array.isArray(inverse.botReferences) ||
        typeof inverse.recoveryId !== "string" ||
        typeof inverse.appliedAt !== "string"
      ) {
        throw new Error("Image undo data is invalid.");
      }
      const botReferences = inverse.botReferences.map((reference) => {
        if (
          !reference ||
          typeof reference !== "object" ||
          Array.isArray(reference)
        ) {
          throw new Error("Image undo data is invalid.");
        }
        return reference as PrismJsonObject;
      });
      undoPrismImageDeletion({
        db: context.db,
        userId: context.userId,
        row: inverse.row as PrismJsonObject,
        botReferences,
        recoveryId: inverse.recoveryId,
        appliedAt: inverse.appliedAt,
      });
      return { affectedEntities: [] };
    },
  };
}

function oneEyeBatchCapability(): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "bots.avatar.eye-count.batch",
    label: "Set bot eye count",
    description: "Updates the registered Avatar Studio eye-count field.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: true,
    risk: "bulk",
    confirmation: "preview",
    privacy: "normal",
    provider: "none",
    cost: "none",
    undo: "inverse",
    idempotent: true,
  });
  return {
    descriptor: capabilityDescriptor,
    validateInput: (input) => {
      const botIds = stringArray(input, "botIds", 100);
      if (botIds.length === 0) throw new Error("At least one bot is required.");
      return { botIds, eyeCount: 1 };
    },
    preview: (context, input) => {
      const botIds = stringArray(input, "botIds", 100);
      const rows = botRows(context, botIds);
      if (rows.length !== botIds.length) {
        throw new Error("One or more target bots are unavailable.");
      }
      return {
        ...simplePreview(
          `Give ${rows.length} bot${rows.length === 1 ? "" : "s"} one eye.`,
          rows.map(botReference),
        ),
        diffs: rows.map((row) => ({
          entity: botReference(row),
          before: row.face_eye_count,
          after: 1,
        })),
      };
    },
    execute: (context, input) => {
      const botIds = stringArray(input, "botIds", 100);
      const rows = botRows(context, botIds);
      if (rows.length !== botIds.length) {
        throw new Error("One or more target bots are stale.");
      }
      const appliedRevision = context.now.toISOString();
      const update = context.db.prepare(
        `UPDATE bots
            SET face_eye_count = 1, updated_at = ?
          WHERE id = ? AND user_id = ? AND updated_at = ?`,
      );
      for (const row of rows) {
        const changed = update.run(
          appliedRevision,
          row.id,
          context.userId,
          row.updated_at,
        ).changes;
        if (changed !== 1) throw new Error(`${row.name} changed before apply.`);
      }
      return {
        result: { updated: rows.length, eyeCount: 1 },
        affectedEntities: rows.map((row) => ({
          ...botReference(row),
          revision: appliedRevision,
        })),
        inverse: {
          bots: rows.map((row) => ({
            id: row.id,
            faceEyeCount: row.face_eye_count,
            previousRevision: row.updated_at,
            appliedRevision,
          })),
        },
      };
    },
    undo: (context, inverse) => {
      if (!Array.isArray(inverse.bots)) throw new Error("Undo data is invalid.");
      const affectedEntities: PrismEntityReferenceV1[] = [];
      const update = context.db.prepare(
        `UPDATE bots
            SET face_eye_count = ?, updated_at = ?
          WHERE id = ? AND user_id = ? AND updated_at = ?`,
      );
      for (const item of inverse.bots) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          throw new Error("Undo data is invalid.");
        }
        const row = item as PrismJsonObject;
        const id = typeof row.id === "string" ? row.id : "";
        const eyeCount =
          typeof row.faceEyeCount === "number" ? row.faceEyeCount : 1;
        const previousRevision =
          typeof row.previousRevision === "string"
            ? row.previousRevision
            : "";
        const appliedRevision =
          typeof row.appliedRevision === "string" ? row.appliedRevision : "";
        if (!id || !previousRevision || !appliedRevision) {
          throw new Error("Undo data is invalid.");
        }
        if (
          update.run(
            eyeCount,
            previousRevision,
            id,
            context.userId,
            appliedRevision,
          ).changes !== 1
        ) {
          throw new Error("A bot changed after this action; undo was stopped.");
        }
        affectedEntities.push({
          schemaVersion: PRISM_ORCHESTRATION_VERSION,
          entityType: "bot",
          id,
          label: id,
          revision: previousRevision,
        });
      }
      return { affectedEntities };
    },
  };
}

function botFieldsUpdateCapability(
  dependencies: PrismDomainCapabilityDependencies,
): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "bots.fields.update",
    label: "Update bot and avatar fields",
    description:
      "Updates one owned bot through the same revision-checked Bot and Avatar Studio service as the UI.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: true,
    risk: "reversible",
    confirmation: "none",
    privacy: "private",
    provider: "none",
    cost: "none",
    undo: "inverse",
    idempotent: true,
  });
  const validated = (
    input: PrismJsonObject,
  ): {
    botId: string;
    expectedRevision: string | null;
    patch: PrismJsonObject;
  } => {
    const botId = requiredString(input, "botId", 200);
    const patch = input.patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new Error("A bot patch is required.");
    }
    return {
      botId,
      expectedRevision:
        typeof input.expectedRevision === "string"
          ? input.expectedRevision
          : null,
      patch: validatePrismBotPatch(patch as PrismJsonObject),
    };
  };
  return {
    descriptor: capabilityDescriptor,
    validateInput: (input) => {
      const value = validated(input);
      return {
        botId: value.botId,
        expectedRevision: value.expectedRevision,
        patch: value.patch,
      };
    },
    preview: (context, input) => {
      const value = validated(input);
      const mutation = previewPrismBotPatch({
        db: context.db,
        userId: context.userId,
        botId: value.botId,
        patch: value.patch,
        expectedRevision: value.expectedRevision,
        now: context.now,
      });
      const entity = {
        schemaVersion: PRISM_ORCHESTRATION_VERSION,
        entityType: "bot",
        id: mutation.botId,
        label: mutation.botName,
        revision: mutation.previousRevision,
      } satisfies PrismEntityReferenceV1;
      return {
        ...simplePreview(
          mutation.changedKeys.length === 0
            ? `${mutation.botName} already matches.`
            : `Update ${mutation.changedKeys.length} field${
                mutation.changedKeys.length === 1 ? "" : "s"
              } on ${mutation.botName}.`,
          [entity],
        ),
        diffs: mutation.changedKeys.map((key) => ({
          entity,
          before: mutation.before[key] ?? null,
          after: mutation.after[key] ?? null,
        })),
      };
    },
    execute: (context, input) => {
      const value = validated(input);
      const mutation = applyPrismBotPatch({
        db: context.db,
        userId: context.userId,
        botId: value.botId,
        patch: value.patch,
        expectedRevision: value.expectedRevision,
        now: context.now,
      });
      if (mutation.profileChanged) {
        dependencies.onBotProfileChanged?.(context, mutation.botId);
      }
      return {
        result: {
          botId: mutation.botId,
          updated: mutation.changedKeys.length,
          revision:
            mutation.changedKeys.length > 0
              ? mutation.appliedRevision
              : mutation.previousRevision,
        },
        affectedEntities:
          mutation.changedKeys.length === 0
            ? []
            : [
                {
                  schemaVersion: PRISM_ORCHESTRATION_VERSION,
                  entityType: "bot",
                  id: mutation.botId,
                  label: mutation.botName,
                  revision: mutation.appliedRevision,
                },
              ],
        inverse:
          mutation.changedKeys.length === 0
            ? null
            : {
                botId: mutation.botId,
                before: mutation.before,
                appliedRevision: mutation.appliedRevision,
              },
      };
    },
    undo: (context, inverse) => {
      const before = inverse.before;
      if (
        typeof inverse.botId !== "string" ||
        typeof inverse.appliedRevision !== "string" ||
        !before ||
        typeof before !== "object" ||
        Array.isArray(before)
      ) {
        throw new Error("Undo data is invalid.");
      }
      undoPrismBotPatch({
        db: context.db,
        userId: context.userId,
        botId: inverse.botId,
        before: before as PrismJsonObject,
        appliedRevision: inverse.appliedRevision,
        restoredRevision: context.now.toISOString(),
      });
      dependencies.onBotProfileChanged?.(context, inverse.botId);
      return { affectedEntities: [] };
    },
  };
}

function botFieldsBatchCapability(
  dependencies: PrismDomainCapabilityDependencies,
): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "bots.fields.batch",
    label: "Update bot fields in bulk",
    description:
      "Applies one validated Bot or Avatar Studio patch to a frozen owned-bot set atomically.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: true,
    risk: "bulk",
    confirmation: "preview",
    privacy: "private",
    provider: "none",
    cost: "none",
    undo: "inverse",
    idempotent: true,
  });
  const validated = (input: PrismJsonObject) => {
    const botIds = stringArray(input, "botIds", 100);
    if (botIds.length === 0) throw new Error("At least one bot is required.");
    const patch = input.patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new Error("A bot patch is required.");
    }
    const revisions =
      input.expectedRevisions &&
      typeof input.expectedRevisions === "object" &&
      !Array.isArray(input.expectedRevisions)
        ? Object.fromEntries(
            Object.entries(input.expectedRevisions).flatMap(([id, value]) =>
              typeof value === "string" ? [[id, value]] : [],
            ),
          )
        : {};
    return {
      botIds,
      patch: validatePrismBotPatch(patch as PrismJsonObject),
      expectedRevisions: revisions as PrismJsonObject,
    };
  };
  const mutationsFor = (
    context: PrismCapabilityContext,
    input: PrismJsonObject,
  ) => {
    const value = validated(input);
    return value.botIds.map((botId) =>
      previewPrismBotPatch({
        db: context.db,
        userId: context.userId,
        botId,
        patch: value.patch,
        expectedRevision:
          typeof value.expectedRevisions[botId] === "string"
            ? value.expectedRevisions[botId]
            : null,
        now: context.now,
      }),
    );
  };
  return {
    descriptor: capabilityDescriptor,
    validateInput: (input) => {
      const value = validated(input);
      return {
        botIds: value.botIds,
        patch: value.patch,
        expectedRevisions: value.expectedRevisions,
      };
    },
    preview: (context, input) => {
      const mutations = mutationsFor(context, input);
      return {
        ...simplePreview(
          `Update ${mutations.length} bot${
            mutations.length === 1 ? "" : "s"
          } atomically.`,
          mutations.map((mutation) => ({
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "bot",
            id: mutation.botId,
            label: mutation.botName,
            revision: mutation.previousRevision,
          })),
        ),
        diffs: mutations.flatMap((mutation) =>
          mutation.changedKeys.map((key) => ({
            entity: {
              schemaVersion: PRISM_ORCHESTRATION_VERSION,
              entityType: "bot",
              id: mutation.botId,
              label: mutation.botName,
              revision: mutation.previousRevision,
            },
            before: mutation.before[key] ?? null,
            after: mutation.after[key] ?? null,
          })),
        ),
      };
    },
    execute: (context, input) => {
      const value = validated(input);
      const mutations = value.botIds.map((botId) =>
        applyPrismBotPatch({
          db: context.db,
          userId: context.userId,
          botId,
          patch: value.patch,
          expectedRevision:
            typeof value.expectedRevisions[botId] === "string"
              ? value.expectedRevisions[botId]
              : null,
          now: context.now,
        }),
      );
      for (const mutation of mutations) {
        if (mutation.profileChanged) {
          dependencies.onBotProfileChanged?.(context, mutation.botId);
        }
      }
      const changed = mutations.filter(
        (mutation) => mutation.changedKeys.length > 0,
      );
      return {
        result: {
          updated: changed.length,
          botIds: changed.map((mutation) => mutation.botId),
        },
        affectedEntities: changed.map((mutation) => ({
          schemaVersion: PRISM_ORCHESTRATION_VERSION,
          entityType: "bot",
          id: mutation.botId,
          label: mutation.botName,
          revision: mutation.appliedRevision,
        })),
        inverse:
          changed.length === 0
            ? null
            : {
                bots: changed.map((mutation) => ({
                  botId: mutation.botId,
                  before: mutation.before,
                  appliedRevision: mutation.appliedRevision,
                  profileChanged: mutation.profileChanged,
                })),
              },
      };
    },
    undo: (context, inverse) => {
      if (!Array.isArray(inverse.bots)) {
        throw new Error("Undo data is invalid.");
      }
      for (const raw of [...inverse.bots].reverse()) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          throw new Error("Undo data is invalid.");
        }
        const bot = raw as PrismJsonObject;
        if (
          typeof bot.botId !== "string" ||
          typeof bot.appliedRevision !== "string" ||
          !bot.before ||
          typeof bot.before !== "object" ||
          Array.isArray(bot.before)
        ) {
          throw new Error("Undo data is invalid.");
        }
        undoPrismBotPatch({
          db: context.db,
          userId: context.userId,
          botId: bot.botId,
          before: bot.before as PrismJsonObject,
          appliedRevision: bot.appliedRevision,
          restoredRevision: context.now.toISOString(),
        });
        if (bot.profileChanged === true) {
          dependencies.onBotProfileChanged?.(context, bot.botId);
        }
      }
      return { affectedEntities: [] };
    },
  };
}

function snapshotRows(
  rows: Array<Record<string, unknown>>,
): PrismJsonValue[] {
  return rows.map((row) => jsonClone(row));
}

function insertSnapshotRow(
  context: PrismCapabilityContext,
  table: "bots" | "memories" | "bot_relationships",
  raw: unknown,
): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Bot restore data is invalid.");
  }
  const row = raw as PrismJsonObject;
  const columns = Object.keys(row);
  if (
    columns.length === 0 ||
    columns.some((column) => !/^[a-z][a-z0-9_]*$/u.test(column))
  ) {
    throw new Error("Bot restore data is invalid.");
  }
  const values = columns.map((column) => {
    const value = row[column];
    if (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number"
    ) {
      return value ?? null;
    }
    throw new Error("Bot restore data is invalid.");
  });
  context.db
    .prepare(
      `INSERT INTO ${table} (${columns.join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})`,
    )
    .run(...values);
}

function botDeleteCapability(): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "bots.delete",
    label: "Delete a bot",
    description:
      "Quarantines one unprotected owned bot and its bot-scoped records for 30-day undo.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: true,
    risk: "destructive",
    confirmation: "explicit-confirmation",
    privacy: "private",
    provider: "none",
    cost: "none",
    undo: "quarantine",
    idempotent: true,
  });
  const readBot = (
    context: PrismCapabilityContext,
    input: PrismJsonObject,
  ) => {
    const botId = requiredString(input, "botId", 200);
    const row = context.db
      .prepare(
        `SELECT *
           FROM bots
          WHERE id = ? AND user_id = ?`,
      )
      .get(botId, context.userId) as Record<string, unknown> | undefined;
    if (!row) throw new Error("Bot not found.");
    if (Number(row.delete_protected) === 1) {
      throw new Error(
        "This bot is protected. Unprotect it before deleting it.",
      );
    }
    const expectedRevision =
      typeof input.expectedRevision === "string"
        ? input.expectedRevision
        : null;
    if (expectedRevision && row.updated_at !== expectedRevision) {
      throw new Error(`${String(row.name)} changed before deletion.`);
    }
    return { botId, row };
  };
  return {
    descriptor: capabilityDescriptor,
    validateInput: (input) => ({
      botId: requiredString(input, "botId", 200),
      expectedRevision:
        typeof input.expectedRevision === "string"
          ? input.expectedRevision
          : null,
    }),
    preview: (context, input) => {
      const { row } = readBot(context, input);
      const memories = context.db
        .prepare(
          `SELECT COUNT(*) AS count
             FROM memories
            WHERE user_id = ? AND bot_id = ?
              AND COALESCE(source, 'direct') != 'about_you'`,
        )
        .get(context.userId, String(row.id)) as { count: number };
      const hostedShows = context.db
        .prepare(
          `SELECT COUNT(*) AS count FROM botcast_shows
            WHERE user_id = ? AND host_bot_id = ?`,
        )
        .get(context.userId, String(row.id)) as { count: number };
      return {
        ...simplePreview(
          `Delete ${String(row.name)} and quarantine its bot-scoped data for 30 days.`,
          [
            {
              schemaVersion: PRISM_ORCHESTRATION_VERSION,
              entityType: "bot",
              id: String(row.id),
              label: String(row.name),
              revision: String(row.updated_at),
            },
          ],
        ),
        consequences: [
          `${Number(memories.count).toLocaleString()} bot-scoped memories will be quarantined.`,
          "Historical messages remain, but their bot link is restored only if Undo is used.",
          ...(Number(hostedShows.count) > 0
            ? [`${Number(hostedShows.count)} hosted Signal archive${Number(hostedShows.count) === 1 ? " remains" : "s remain"}; future production pauses until a new host consents.`]
            : []),
        ],
      };
    },
    execute: (context, input) => {
      const { botId, row } = readBot(context, input);
      const memories = context.db
        .prepare(
          `SELECT *
             FROM memories
            WHERE user_id = ? AND bot_id = ?
              AND COALESCE(source, 'direct') != 'about_you'`,
        )
        .all(context.userId, botId) as Array<Record<string, unknown>>;
      const relationships = context.db
        .prepare(
          `SELECT *
             FROM bot_relationships
            WHERE user_id = ?
              AND (source_bot_id = ? OR target_bot_id = ?)`,
        )
        .all(context.userId, botId, botId) as Array<Record<string, unknown>>;
      const messageIds = (
        context.db
          .prepare(
            "SELECT id FROM messages WHERE user_id = ? AND bot_id = ?",
          )
          .all(context.userId, botId) as Array<{ id: string }>
      ).map((entry) => entry.id);
      const conversationIds = (
        context.db
          .prepare(
            "SELECT id FROM conversations WHERE user_id = ? AND bot_id = ?",
          )
          .all(context.userId, botId) as Array<{ id: string }>
      ).map((entry) => entry.id);

      context.db
        .prepare(
          "UPDATE messages SET bot_id = NULL WHERE user_id = ? AND bot_id = ?",
        )
        .run(context.userId, botId);
      context.db
        .prepare(
          "UPDATE conversations SET bot_id = NULL WHERE user_id = ? AND bot_id = ?",
        )
        .run(context.userId, botId);
      context.db
        .prepare(
          `DELETE FROM memories
            WHERE user_id = ? AND bot_id = ?
              AND COALESCE(source, 'direct') != 'about_you'`,
        )
        .run(context.userId, botId);
      context.db
        .prepare(
          `DELETE FROM bot_relationships
            WHERE user_id = ?
              AND (source_bot_id = ? OR target_bot_id = ?)`,
        )
        .run(context.userId, botId, botId);
      const deleted = context.db
        .prepare(
          `DELETE FROM bots
            WHERE id = ? AND user_id = ? AND updated_at = ?`,
        )
        .run(botId, context.userId, String(row.updated_at));
      if (deleted.changes !== 1) {
        throw new Error(`${String(row.name)} changed before deletion.`);
      }
      return {
        result: {
          deleted: 1,
          botId,
          name: String(row.name),
          quarantinedMemories: memories.length,
        },
        affectedEntities: [
          {
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "bot",
            id: botId,
            label: String(row.name),
            revision: String(row.updated_at),
          },
        ],
        inverse: {
          bot: jsonClone(row),
          memories: snapshotRows(memories),
          relationships: snapshotRows(relationships),
          messageIds,
          conversationIds,
        },
      };
    },
    undo: (context, inverse) => {
      const rawBot = inverse.bot;
      if (!rawBot || typeof rawBot !== "object" || Array.isArray(rawBot)) {
        throw new Error("The bot quarantine data has expired.");
      }
      const bot = rawBot as PrismJsonObject;
      if (
        typeof bot.id !== "string" ||
        typeof bot.user_id !== "string" ||
        bot.user_id !== context.userId
      ) {
        throw new Error("The bot quarantine data is invalid.");
      }
      const conflict = context.db
        .prepare("SELECT 1 FROM bots WHERE id = ?")
        .get(bot.id);
      if (conflict) {
        throw new Error("A bot with this identity already exists.");
      }
      insertSnapshotRow(context, "bots", bot);
      for (const memory of Array.isArray(inverse.memories)
        ? inverse.memories
        : []) {
        insertSnapshotRow(context, "memories", memory);
      }
      for (const relationship of Array.isArray(inverse.relationships)
        ? inverse.relationships
        : []) {
        insertSnapshotRow(context, "bot_relationships", relationship);
      }
      const restoreMessage = context.db.prepare(
        `UPDATE messages
            SET bot_id = ?
          WHERE id = ? AND user_id = ? AND bot_id IS NULL`,
      );
      for (const id of Array.isArray(inverse.messageIds)
        ? inverse.messageIds
        : []) {
        if (typeof id === "string") {
          restoreMessage.run(bot.id, id, context.userId);
        }
      }
      const restoreConversation = context.db.prepare(
        `UPDATE conversations
            SET bot_id = ?
          WHERE id = ? AND user_id = ? AND bot_id IS NULL`,
      );
      for (const id of Array.isArray(inverse.conversationIds)
        ? inverse.conversationIds
        : []) {
        if (typeof id === "string") {
          restoreConversation.run(bot.id, id, context.userId);
        }
      }
      return {
        affectedEntities: [
          {
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "bot",
            id: bot.id,
            label: typeof bot.name === "string" ? bot.name : bot.id,
            revision:
              typeof bot.updated_at === "string" ? bot.updated_at : null,
          },
        ],
      };
    },
  };
}

function libraryFavoritesCapability(): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "library.favorites.update",
    label: "Update Library favorites",
    description: "Favorites an exact authorized bot set.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: true,
    risk: "reversible",
    confirmation: "none",
    privacy: "normal",
    provider: "none",
    cost: "none",
    undo: "inverse",
    idempotent: true,
  });
  return {
    descriptor: capabilityDescriptor,
    validateInput: (input) => {
      const botIds = stringArray(input, "botIds", BOT_LIBRARY_GROUP_MEMBER_MAX);
      if (botIds.length === 0) throw new Error("At least one bot is required.");
      return { botIds, favorite: input.favorite !== false };
    },
    preview: (context, input) => {
      const rows = botRows(context, stringArray(input, "botIds", BOT_LIBRARY_GROUP_MEMBER_MAX));
      return simplePreview(
        `${input.favorite === false ? "Remove" : "Add"} ${rows.length} bot${
          rows.length === 1 ? "" : "s"
        } ${input.favorite === false ? "from" : "to"} Favorites.`,
        rows.map(botReference),
      );
    },
    execute: (context, input) => {
      const before = listLibraryGroups(context.db, context.userId);
      const result = setLibraryFavorites({
        db: context.db,
        userId: context.userId,
        botIds: stringArray(input, "botIds", BOT_LIBRARY_GROUP_MEMBER_MAX),
        favorite: input.favorite !== false,
        now: context.now,
      });
      return {
        result: {
          groups: jsonClone(result.groups),
          favorite: input.favorite !== false,
        },
        affectedEntities: result.entities,
        inverse: { groups: jsonClone(before) },
      };
    },
    undo: (context, inverse) => {
      if (!Array.isArray(inverse.groups)) throw new Error("Undo data is invalid.");
      replaceLibraryGroups({
        db: context.db,
        userId: context.userId,
        groups: inverse.groups,
        manageTransaction: false,
        now: context.now,
      });
      return { affectedEntities: [] };
    },
  };
}

function libraryUnprotectCapability(): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "library.protection.unprotect",
    label: "Unprotect Library bots",
    description: "Removes effective group membership protection.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: true,
    risk: "bulk",
    confirmation: "preview",
    privacy: "normal",
    provider: "none",
    cost: "none",
    undo: "inverse",
    idempotent: true,
  });
  return {
    descriptor: capabilityDescriptor,
    validateInput: (input) => ({ botIds: stringArray(input, "botIds", 100) }),
    preview: (context, input) => {
      const requested = stringArray(input, "botIds", 100);
      const rows = context.db
        .prepare(
          `SELECT DISTINCT bots.id, bots.name, bots.updated_at
             FROM bots
             JOIN library_group_members AS member
               ON member.user_id = bots.user_id AND member.bot_id = bots.id
             JOIN library_groups AS library_group
               ON library_group.user_id = member.user_id
              AND library_group.id = member.group_id
            WHERE bots.user_id = ?
              AND COALESCE(
                member.delete_protected_override,
                library_group.delete_protected_default
              ) = 1
              ${
                requested.length > 0
                  ? `AND bots.id IN (${requested.map(() => "?").join(", ")})`
                  : ""
              }
            ORDER BY bots.name COLLATE NOCASE`,
        )
        .all(context.userId, ...requested) as unknown as Array<{
        id: string;
        name: string;
        updated_at: string;
      }>;
      return simplePreview(
        `Unprotect ${rows.length} Library bot${rows.length === 1 ? "" : "s"}.`,
        rows.map(botReference),
      );
    },
    execute: (context, input) => {
      const before = listLibraryGroups(context.db, context.userId);
      const requested = stringArray(input, "botIds", 100);
      const effectiveRows = context.db
        .prepare(
          `SELECT DISTINCT member.bot_id
             FROM library_group_members AS member
             JOIN library_groups AS library_group
               ON library_group.user_id = member.user_id
              AND library_group.id = member.group_id
            WHERE member.user_id = ?
              AND COALESCE(
                member.delete_protected_override,
                library_group.delete_protected_default
              ) = 1
              ${
                requested.length > 0
                  ? `AND member.bot_id IN (${requested.map(() => "?").join(", ")})`
                  : ""
              }`,
        )
        .all(context.userId, ...requested) as unknown as Array<{
        bot_id: string;
      }>;
      const botIds = effectiveRows.map((row) => row.bot_id);
      if (botIds.length > 0) {
        const placeholders = botIds.map(() => "?").join(", ");
        context.db
          .prepare(
            `UPDATE library_group_members
                SET delete_protected_override = 0, updated_at = ?
              WHERE user_id = ? AND bot_id IN (${placeholders})`,
          )
          .run(context.now.toISOString(), context.userId, ...botIds);
        projectLibraryProtectionToBots(context.db, context.userId);
      }
      return {
        result: {
          updated: botIds.length,
          groups: jsonClone(listLibraryGroups(context.db, context.userId)),
        },
        affectedEntities: botIds.map((id) => ({
          schemaVersion: PRISM_ORCHESTRATION_VERSION,
          entityType: "bot",
          id,
          label: id,
          revision: null,
        })),
        inverse: { groups: jsonClone(before) },
      };
    },
    undo: (context, inverse) => {
      if (!Array.isArray(inverse.groups)) throw new Error("Undo data is invalid.");
      replaceLibraryGroups({
        db: context.db,
        userId: context.userId,
        groups: inverse.groups,
        manageTransaction: false,
        now: context.now,
      });
      return { affectedEntities: [] };
    },
  };
}

function libraryGroupCreateCapability(
  dependencies: PrismDomainCapabilityDependencies,
): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "library.group.create",
    label: "Create Library group",
    description: "Creates a server-backed Library group ready for Coffee.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: true,
    risk: "reversible",
    confirmation: "none",
    privacy: "normal",
    provider: "local-or-online",
    cost: "none",
    undo: "inverse",
    idempotent: true,
  });
  return {
    descriptor: capabilityDescriptor,
    validateInput: (input) => {
      const botIds = stringArray(input, "botIds", BOT_LIBRARY_GROUP_MEMBER_MAX);
      if (botIds.length < 2) throw new Error("A group needs at least two bots.");
      return {
        groupId:
          typeof input.groupId === "string" && input.groupId.trim()
            ? input.groupId.trim().slice(0, 160)
            : `group:${randomId()}`,
        name: requiredString(input, "name", 120),
        description:
          typeof input.description === "string"
            ? input.description.trim().slice(0, 1_000)
            : "",
        premise:
          typeof input.premise === "string"
            ? input.premise.trim().slice(0, 1_000)
            : "",
        brief:
          typeof input.brief === "string"
            ? input.brief.trim().slice(0, 4_000)
            : "",
        synthesizeIdentity: input.synthesizeIdentity === true,
        identityProvider:
          typeof input.identityProvider === "string"
            ? input.identityProvider.trim().slice(0, 120)
            : "",
        identityModel:
          typeof input.identityModel === "string"
            ? input.identityModel.trim().slice(0, 240)
            : "",
        botIds,
      };
    },
    prepareProposal: dependencies.generateCoffeeGroupIdentity
      ? async (context, input) => {
          const botIds = stringArray(input, "botIds", BOT_LIBRARY_GROUP_MEMBER_MAX);
          const placeholders = botIds.map(() => "?").join(", ");
          const rows = context.db
            .prepare(
              `SELECT id, name, system_prompt, semantic_facets
                 FROM bots
                WHERE user_id = ?
                  AND chat_enabled = 1
                  AND id IN (${placeholders})
                ORDER BY name COLLATE NOCASE, id`,
            )
            .all(context.userId, ...botIds) as unknown as Array<{
            id: string;
            name: string;
            system_prompt: string;
            semantic_facets: string | null;
          }>;
          if (rows.length !== botIds.length) {
            throw new Error(
              "One or more Coffee group members are no longer eligible.",
            );
          }
          const generated = await dependencies.generateCoffeeGroupIdentity!(
            context,
            {
              brief:
                typeof input.brief === "string" ? input.brief : "",
              bots: rows.map((row) => ({
                id: row.id,
                name: row.name,
                profileSummary: `${row.system_prompt}\n${row.semantic_facets ?? ""}`.slice(
                  0,
                  2_000,
                ),
              })),
            },
          );
          const preparedInput = {
            ...input,
            name: generated.name,
            premise: generated.premise,
            identityProvider: generated.provider,
            identityModel: generated.model,
          };
          return {
            input: preparedInput,
            preview: {
              ...simplePreview(
                `Create ${generated.name} with ${rows.length} bots and an ironic Coffee premise.`,
                rows.map((row) => ({
                  schemaVersion: PRISM_ORCHESTRATION_VERSION,
                  entityType: "bot",
                  id: row.id,
                  label: row.name,
                  revision: null,
                })),
              ),
              consequences: [
                `Premise: ${generated.premise}`,
                "The group will open in Coffee-ready state. Starting remains your choice.",
              ],
              provider: generated.provider,
              model: generated.model,
            },
          };
        }
      : undefined,
    preview: (context, input) => {
      const rows = botRows(context, stringArray(input, "botIds", BOT_LIBRARY_GROUP_MEMBER_MAX));
      if (rows.length < 2) throw new Error("The selected group is unavailable.");
      return {
        ...simplePreview(
          `Create ${requiredString(input, "name", 120)} with ${rows.length} bots.`,
          rows.map(botReference),
        ),
        ...(typeof input.premise === "string" && input.premise
          ? { consequences: [`Premise: ${input.premise}`] }
          : {}),
        provider:
          typeof input.identityProvider === "string" &&
          input.identityProvider.trim()
            ? input.identityProvider
            : null,
        model:
          typeof input.identityModel === "string" && input.identityModel.trim()
            ? input.identityModel
            : null,
      };
    },
    execute: (context, input) => {
      const before = listLibraryGroups(context.db, context.userId);
      const groupId = requiredString(input, "groupId", 160);
      const now = context.now.toISOString();
      const group = {
        id: groupId,
        name: requiredString(input, "name", 120),
        description:
          typeof input.description === "string" ? input.description : "",
        botIds: stringArray(input, "botIds", BOT_LIBRARY_GROUP_MEMBER_MAX),
        deleteProtected: false,
        deleteProtectionByBotId: {},
        builtIn: false,
        createdAt: now,
        updatedAt: now,
      };
      const groups = replaceLibraryGroups({
        db: context.db,
        userId: context.userId,
        groups: [...before, group],
        manageTransaction: false,
        now: context.now,
      });
      return {
        result: {
          group: jsonClone(group),
          groups: jsonClone(groups),
          premise:
            typeof input.premise === "string" ? input.premise : "",
          navigation: {
            surfaceId: "group-home",
            groupId,
            coffeeReady: true,
          },
        },
        affectedEntities: [
          {
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "library-group",
            id: groupId,
            label: group.name,
            revision: now,
          },
        ],
        inverse: { groups: jsonClone(before) },
      };
    },
    undo: (context, inverse) => {
      if (!Array.isArray(inverse.groups)) throw new Error("Undo data is invalid.");
      replaceLibraryGroups({
        db: context.db,
        userId: context.userId,
        groups: inverse.groups,
        manageTransaction: false,
        now: context.now,
      });
      return { affectedEntities: [] };
    },
  };
}

function libraryGroupsReplaceCapability(): PrismCapabilityDefinition {
  return {
    descriptor: descriptor({
      id: "library.groups.replace",
      label: "Save Library groups",
      description:
        "Persists the account Library group membership, protection, atmosphere, and theme state used by the ordinary UI.",
      execution: "server",
      surfaces: [],
      unavailableWhileLive: true,
      risk: "reversible",
      confirmation: "none",
      privacy: "normal",
      provider: "none",
      cost: "none",
      undo: "inverse",
      idempotent: true,
    }),
    validateInput: (input) => {
      if (!Array.isArray(input.groups)) {
        throw new Error("Library groups are required.");
      }
      return { groups: input.groups.slice(0, 200) };
    },
    preview: (context, input) => {
      const current = listLibraryGroups(context.db, context.userId);
      return simplePreview(
        `Save ${Array.isArray(input.groups) ? input.groups.length : 0} Library groups (currently ${current.length}).`,
      );
    },
    execute: (context, input) => {
      const before = listLibraryGroups(context.db, context.userId);
      const groups = replaceLibraryGroups({
        db: context.db,
        userId: context.userId,
        groups: input.groups,
        manageTransaction: false,
        now: context.now,
      });
      return {
        result: { groups: jsonClone(groups) },
        affectedEntities: groups.map((group) => ({
          schemaVersion: PRISM_ORCHESTRATION_VERSION,
          entityType: "library-group",
          id: group.id,
          label: group.name,
          revision: group.updatedAt,
        })),
        inverse: { groups: jsonClone(before) },
      };
    },
    undo: (context, inverse) => {
      if (!Array.isArray(inverse.groups)) {
        throw new Error("Undo data is invalid.");
      }
      replaceLibraryGroups({
        db: context.db,
        userId: context.userId,
        groups: inverse.groups,
        manageTransaction: false,
        now: context.now,
      });
      return { affectedEntities: [] };
    },
  };
}

function usageTopBotsCapability(): PrismCapabilityDefinition {
  const capabilityDescriptor = descriptor({
    id: "usage.top-bots.query",
    label: "Find most-used bots",
    description: "Ranks owned Library bots by persisted assistant reply turns.",
    execution: "server",
    surfaces: [],
    unavailableWhileLive: false,
    risk: "query",
    confirmation: "none",
    privacy: "private",
    provider: "none",
    cost: "none",
    undo: "none",
    idempotent: true,
  });
  return {
    descriptor: capabilityDescriptor,
    validateInput: () => ({}),
    preview: () => simplePreview("Rank the five most-used Library bots."),
    execute: (context) => {
      const rows = context.db
        .prepare(
          `SELECT bots.id, bots.name, bots.updated_at, COUNT(messages.id) AS turns
             FROM bots
             JOIN messages
               ON messages.user_id = bots.user_id
              AND messages.bot_id = bots.id
              AND messages.role = 'assistant'
             JOIN conversations
               ON conversations.id = messages.conversation_id
              AND conversations.user_id = messages.user_id
            WHERE bots.user_id = ?
              AND conversations.incognito = 0
            GROUP BY bots.id, bots.name, bots.updated_at
            ORDER BY turns DESC, bots.name COLLATE NOCASE
            LIMIT 5`,
        )
        .all(context.userId) as unknown as Array<{
        id: string;
        name: string;
        updated_at: string;
        turns: number;
      }>;
      const entities = rows.map(botReference);
      const token = createPrismContextToken({
        db: context.db,
        userId: context.userId,
        purpose: "most-used-bots",
        entities,
        now: context.now,
      });
      return {
        result: {
          bots: rows.map((row) => ({
            id: row.id,
            name: row.name,
            replyTurns: row.turns,
          })),
          contextToken: jsonClone(token),
        },
        affectedEntities: [],
        inverse: null,
      };
    },
  };
}

const SIGNAL_EPISODE_QUARANTINE_TABLES = [
  "botcast_episodes",
  "botcast_episode_segments",
  "botcast_messages",
  "botcast_events",
  "replay_recordings",
  "replay_voice_takes",
  "replay_premium_productions",
  "replay_premium_segments",
] as const;

type SignalQuarantineTable =
  (typeof SIGNAL_EPISODE_QUARANTINE_TABLES)[number];

function rowsForIds(
  context: PrismCapabilityContext,
  table: SignalQuarantineTable,
  idColumn: "id" | "episode_id" | "recording_id" | "source_id",
  ids: readonly string[],
): PrismJsonObject[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  return context.db
    .prepare(
      `SELECT * FROM ${table}
        WHERE user_id = ? AND ${idColumn} IN (${placeholders})`,
    )
    .all(context.userId, ...ids)
    .map((row) => jsonClone(row) as PrismJsonObject);
}

function insertQuarantinedRows(
  context: PrismCapabilityContext,
  table: SignalQuarantineTable,
  rows: readonly PrismJsonObject[],
): void {
  const sqlValue = (
    value: PrismJsonValue | undefined,
  ): string | number | bigint | Uint8Array | null => {
    if (value === undefined || value === null) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "string" || typeof value === "number") return value;
    return JSON.stringify(value);
  };
  for (const row of rows) {
    const columns = Object.keys(row);
    if (columns.length === 0) continue;
    const placeholders = columns.map(() => "?").join(", ");
    context.db
      .prepare(
        `INSERT INTO ${table} (${columns.join(", ")})
         VALUES (${placeholders})`,
      )
      .run(...columns.map((column) => sqlValue(row[column])));
  }
}

function signalEpisodesDeleteCapability(): PrismCapabilityDefinition {
  return {
    descriptor: descriptor({
      id: "signal.episodes.delete",
      label: "Delete Signal episodes",
      description:
        "Quarantines exact Signal episodes and replay records for 30-day undo.",
      execution: "server",
      surfaces: [],
      unavailableWhileLive: true,
      risk: "destructive",
      confirmation: "explicit-confirmation",
      privacy: "private",
      provider: "none",
      cost: "none",
      undo: "quarantine",
      idempotent: true,
    }),
    validateInput: (input) => {
      const episodeIds = stringArray(input, "episodeIds", 500);
      if (episodeIds.length === 0) {
        throw new Error("At least one Signal episode is required.");
      }
      return {
        episodeIds,
        showId:
          typeof input.showId === "string"
            ? input.showId.trim().slice(0, 160)
            : "",
      };
    },
    preview: (context, input) => {
      const episodeIds = stringArray(input, "episodeIds", 500);
      const placeholders = episodeIds.map(() => "?").join(", ");
      const rows = context.db
        .prepare(
          `SELECT episode.id, episode.title, episode.status,
                  episode.updated_at, show.name AS show_name
             FROM botcast_episodes AS episode
             JOIN botcast_shows AS show
               ON show.id = episode.show_id AND show.user_id = episode.user_id
            WHERE episode.user_id = ?
              AND episode.id IN (${placeholders})
            ORDER BY episode.created_at`,
        )
        .all(context.userId, ...episodeIds) as unknown as Array<{
        id: string;
        title: string;
        status: string;
        updated_at: string;
        show_name: string;
      }>;
      if (rows.length !== episodeIds.length) {
        throw new Error("One or more Signal episodes are unavailable.");
      }
      const replayCount = (
        context.db
          .prepare(
            `SELECT COUNT(*) AS count
               FROM replay_recordings
              WHERE user_id = ? AND surface = 'signal'
                AND source_id IN (${placeholders})`,
          )
          .get(context.userId, ...episodeIds) as { count: number }
      ).count;
      return {
        ...simplePreview(
          `Delete ${rows.length} episode${rows.length === 1 ? "" : "s"} from ${rows[0]?.show_name ?? "this show"}.`,
          rows.map((row) => ({
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "signal-episode",
            id: row.id,
            label: row.title,
            revision: row.updated_at,
          })),
        ),
        consequences: [
          `${replayCount} replay package${replayCount === 1 ? "" : "s"} will be quarantined with the episodes.`,
          "Memories learned inside the selected episodes are permanently removed, even if an episode is restored.",
          "Independent Slate projects remain unchanged.",
          "Undo is available for 30 days.",
        ],
      };
    },
    execute: (context, input) => {
      if (!context.runId) throw new Error("Prism action run is missing.");
      const episodeIds = stringArray(input, "episodeIds", 500);
      const episodeRows = rowsForIds(
        context,
        "botcast_episodes",
        "id",
        episodeIds,
      );
      if (episodeRows.length !== episodeIds.length) {
        throw new Error("One or more Signal episodes changed before deletion.");
      }
      const recordingRows = rowsForIds(
        context,
        "replay_recordings",
        "source_id",
        episodeIds,
      );
      const recordingIds = recordingRows.flatMap((row) =>
        typeof row.id === "string" ? [row.id] : [],
      );
      const snapshot: Record<SignalQuarantineTable, PrismJsonObject[]> = {
        botcast_episodes: episodeRows,
        botcast_episode_segments: rowsForIds(
          context,
          "botcast_episode_segments",
          "episode_id",
          episodeIds,
        ),
        botcast_messages: rowsForIds(
          context,
          "botcast_messages",
          "episode_id",
          episodeIds,
        ),
        botcast_events: rowsForIds(
          context,
          "botcast_events",
          "episode_id",
          episodeIds,
        ),
        replay_recordings: recordingRows,
        replay_voice_takes: rowsForIds(
          context,
          "replay_voice_takes",
          "recording_id",
          recordingIds,
        ),
        replay_premium_productions: rowsForIds(
          context,
          "replay_premium_productions",
          "recording_id",
          recordingIds,
        ),
        replay_premium_segments: rowsForIds(
          context,
          "replay_premium_segments",
          "recording_id",
          recordingIds,
        ),
      };
      const encrypted = encryptJson(snapshot, context.userKey);
      const quarantineId = `quarantine-${randomId()}`;
      const expiresAt = new Date(
        context.now.getTime() + 30 * 24 * 60 * 60 * 1_000,
      ).toISOString();
      context.db
        .prepare(
          `INSERT INTO prism_quarantine
            (id, user_id, run_id, entity_type, entity_id, payload_ciphertext,
             payload_iv, payload_tag, created_at, expires_at)
           VALUES (?, ?, ?, 'signal-episode-set', ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          quarantineId,
          context.userId,
          context.runId,
          JSON.stringify(recordingIds),
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.tag,
          context.now.toISOString(),
          expiresAt,
        );
      deleteMemoriesAcquiredDuringAppletSessions(
        context.db,
        context.userId,
        episodeIds,
        snapshot.botcast_messages.flatMap((row) =>
          typeof row.id === "string" ? [row.id] : [],
        ),
      );
      const remove = context.db.prepare(
        "DELETE FROM botcast_episodes WHERE id = ? AND user_id = ?",
      );
      for (const episodeId of episodeIds) {
        if (remove.run(episodeId, context.userId).changes !== 1) {
          throw new Error("A Signal episode changed before deletion.");
        }
      }
      return {
        result: {
          deleted: episodeIds.length,
          quarantinedReplayPackages: recordingIds.length,
          undoExpiresAt: expiresAt,
        },
        affectedEntities: episodeRows.map((row) => ({
          schemaVersion: PRISM_ORCHESTRATION_VERSION,
          entityType: "signal-episode",
          id: String(row.id),
          label: String(row.title),
          revision: null,
        })),
        inverse: { quarantineId },
        nonReversibleConsequences: [
          "Learned Signal memories cannot be restored by Undo.",
        ],
      };
    },
    undo: (context, inverse) => {
      const quarantineId =
        typeof inverse.quarantineId === "string" ? inverse.quarantineId : "";
      const row = context.db
        .prepare(
          `SELECT payload_ciphertext, payload_iv, payload_tag, expires_at,
                  restored_at
             FROM prism_quarantine
            WHERE id = ? AND user_id = ?`,
        )
        .get(quarantineId, context.userId) as
        | {
            payload_ciphertext: string;
            payload_iv: string;
            payload_tag: string;
            expires_at: string;
            restored_at: string | null;
          }
        | undefined;
      if (
        !row ||
        row.restored_at ||
        new Date(row.expires_at).getTime() <= context.now.getTime()
      ) {
        throw new Error("The quarantined Signal episodes have expired.");
      }
      const snapshot = decryptJson(
        {
          ciphertext: row.payload_ciphertext,
          iv: row.payload_iv,
          tag: row.payload_tag,
        },
        context.userKey,
      ) as Record<SignalQuarantineTable, PrismJsonObject[]>;
      for (const table of SIGNAL_EPISODE_QUARANTINE_TABLES) {
        insertQuarantinedRows(context, table, snapshot[table] ?? []);
      }
      context.db
        .prepare(
          `UPDATE prism_quarantine
              SET restored_at = ?
            WHERE id = ? AND user_id = ?`,
        )
        .run(context.now.toISOString(), quarantineId, context.userId);
      return { affectedEntities: [] };
    },
  };
}

function signalLatestToSlateCapability(): PrismCapabilityDefinition {
  return {
    descriptor: descriptor({
      id: "signal.latest.export-to-slate",
      label: "Export latest Signal episode to Slate",
      description:
        "Creates a Slate material project from the latest completed episode transcript and provenance.",
      execution: "server",
      surfaces: [],
      unavailableWhileLive: true,
      risk: "reversible",
      confirmation: "none",
      privacy: "private",
      provider: "none",
      cost: "none",
      undo: "inverse",
      idempotent: true,
    }),
    transactional: false,
    validateInput: (input) => ({
      showId: requiredString(input, "showId", 160),
    }),
    preview: () =>
      simplePreview("Create a Slate material project from the latest episode."),
    execute: (context, input) => {
      const showId = requiredString(input, "showId", 160);
      const episode = context.db
        .prepare(
          `SELECT episode.id, episode.title, episode.topic,
                  episode.completed_at, show.name AS show_name
             FROM botcast_episodes AS episode
             JOIN botcast_shows AS show
               ON show.id = episode.show_id AND show.user_id = episode.user_id
            WHERE episode.user_id = ? AND episode.show_id = ?
              AND episode.status = 'completed'
            ORDER BY COALESCE(episode.completed_at, episode.updated_at) DESC,
                     episode.created_at DESC
            LIMIT 1`,
        )
        .get(context.userId, showId) as
        | {
            id: string;
            title: string;
            topic: string;
            completed_at: string | null;
            show_name: string;
          }
        | undefined;
      if (!episode) throw new Error("This show has no completed episode to export.");
      const lines = context.db
        .prepare(
          `SELECT message.speaker_role, message.content,
                  COALESCE(bot.name, message.speaker_role) AS speaker_name
             FROM botcast_messages AS message
             LEFT JOIN bots AS bot
               ON bot.id = message.bot_id AND bot.user_id = message.user_id
            WHERE message.user_id = ? AND message.episode_id = ?
            ORDER BY message.created_at, message.rowid`,
        )
        .all(context.userId, episode.id) as unknown as Array<{
        speaker_role: string;
        content: string;
        speaker_name: string;
      }>;
      const transcript = lines
        .map((line) => `${line.speaker_name}: ${line.content}`)
        .join("\n\n");
      if (!transcript.trim()) {
        throw new Error("The latest completed episode has no transcript.");
      }
      let projectId: string | null = null;
      try {
        const project = createSlateProject(context.db, context.userId, {
          title: `${episode.show_name} — ${episode.title}`,
          titleOrigin: "material",
          spark: episode.topic || episode.title,
        });
        projectId = project.id;
        const updated = updateSlateProject(
          context.db,
          context.userId,
          project.id,
          {
            manuscript: transcript,
            premise: `Source material from Signal show “${episode.show_name}”, episode “${episode.title}” (${episode.id}), completed ${episode.completed_at ?? "at an unknown time"}.`,
            direction:
              "Preserve this Signal transcript as source material. The writer decides what, if anything, to adapt.",
          },
        );
        return {
          result: {
            project: jsonClone(updated),
            sourceEpisodeId: episode.id,
            navigation: {
              surfaceId: "slate",
              slateProjectId: project.id,
            },
          },
          affectedEntities: [
            {
              schemaVersion: PRISM_ORCHESTRATION_VERSION,
              entityType: "slate-project",
              id: project.id,
              label: project.title,
              revision: project.updatedAt,
            },
          ],
          inverse: { projectId: project.id },
        };
      } catch (error) {
        if (projectId) {
          context.db
            .prepare(
              "DELETE FROM slate_projects WHERE id = ? AND user_id = ?",
            )
            .run(projectId, context.userId);
        }
        throw error;
      }
    },
    undo: (context, inverse) => {
      const projectId =
        typeof inverse.projectId === "string" ? inverse.projectId : "";
      if (
        context.db
          .prepare(
            "DELETE FROM slate_projects WHERE id = ? AND user_id = ?",
          )
          .run(projectId, context.userId).changes !== 1
      ) {
        throw new Error("The exported Slate project is no longer available.");
      }
      return { affectedEntities: [] };
    },
  };
}

function signalShowTextUpdateCapability(): PrismCapabilityDefinition {
  return {
    descriptor: descriptor({
      id: "signal.show.text.update",
      label: "Update Signal show identity",
      description:
        "Updates the same Signal show name and premise fields used by native editing and accepted Refract drafts.",
      execution: "server",
      surfaces: ["signal"],
      unavailableWhileLive: true,
      risk: "reversible",
      confirmation: "none",
      privacy: "private",
      provider: "none",
      cost: "none",
      undo: "inverse",
      idempotent: true,
    }),
    validateInput: (input) => {
      const patch =
        input.patch &&
        typeof input.patch === "object" &&
        !Array.isArray(input.patch)
          ? input.patch
          : {};
      const name =
        typeof patch.name === "string"
          ? patch.name.trim().slice(0, 80)
          : undefined;
      const premise =
        typeof patch.premise === "string"
          ? patch.premise.trim().slice(0, 500)
          : undefined;
      if (name === undefined && premise === undefined) {
        throw new Error("A Signal show name or premise change is required.");
      }
      return {
        showId: requiredString(input, "showId", 160),
        patch: {
          ...(name !== undefined ? { name } : {}),
          ...(premise !== undefined ? { premise } : {}),
        },
      };
    },
    preview: (context, input) => {
      const show = getBotcastShow(
        context.db,
        context.userId,
        requiredString(input, "showId", 160),
      );
      const patch = input.patch as PrismJsonObject;
      const entity: PrismEntityReferenceV1 = {
        schemaVersion: PRISM_ORCHESTRATION_VERSION,
        entityType: "signal-show",
        id: show.id,
        label: show.name,
        revision: show.updatedAt,
      };
      return {
        ...simplePreview(`Update ${show.name}.`, [entity]),
        diffs: [
          ...(typeof patch.name === "string"
            ? [
                {
                  entity,
                  before: show.name,
                  after: patch.name,
                },
              ]
            : []),
          ...(typeof patch.premise === "string"
            ? [
                {
                  entity,
                  before: show.premise,
                  after: patch.premise,
                },
              ]
            : []),
        ],
      };
    },
    execute: (context, input) => {
      const showId = requiredString(input, "showId", 160);
      const before = getBotcastShow(context.db, context.userId, showId);
      const patch = input.patch as PrismJsonObject;
      const show = updateBotcastShow(context.db, context.userId, showId, {
        ...(typeof patch.name === "string" ? { name: patch.name } : {}),
        ...(typeof patch.premise === "string"
          ? { premise: patch.premise }
          : {}),
      });
      return {
        result: { show: jsonClone(show) },
        affectedEntities: [
          {
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "signal-show",
            id: show.id,
            label: show.name,
            revision: show.updatedAt,
          },
        ],
        inverse: {
          showId,
          revision: show.updatedAt,
          name: before.name,
          premise: before.premise,
        },
      };
    },
    undo: (context, inverse) => {
      const showId =
        typeof inverse.showId === "string" ? inverse.showId : "";
      const revision =
        typeof inverse.revision === "string" ? inverse.revision : "";
      const current = getBotcastShow(context.db, context.userId, showId);
      if (current.updatedAt !== revision) {
        throw new Error(
          "That Signal show changed after this action, so Prism stopped the undo.",
        );
      }
      updateBotcastShow(context.db, context.userId, showId, {
        name: typeof inverse.name === "string" ? inverse.name : current.name,
        premise:
          typeof inverse.premise === "string"
            ? inverse.premise
            : current.premise,
      });
      return { affectedEntities: [] };
    },
  };
}

function signalEpisodeStageCapability(
  dependencies: PrismDomainCapabilityDependencies,
): PrismCapabilityDefinition {
  return {
    descriptor: descriptor({
      id: "signal.episode.stage",
      label: "Make and play a Signal episode",
      description:
        "Synthesizes a guest-specific Signal booking, opens the show, warms its model, and begins playback through the normal Signal launch workflow.",
      execution: "hybrid",
      surfaces: [],
      unavailableWhileLive: true,
      risk: "costly",
      confirmation: "explicit-confirmation",
      privacy: "private",
      provider: "local-or-online",
      cost: "estimated",
      undo: "none",
      idempotent: true,
    }),
    transactional: false,
    validateInput: (input) => ({
      showId: requiredString(input, "showId", 160),
      guestBotId: requiredString(input, "guestBotId", 160),
      direction: requiredString(input, "direction", 2_000),
    }),
    preview: (context, input) => {
      const showId = requiredString(input, "showId", 160);
      const guestBotId = requiredString(input, "guestBotId", 160);
      const show = context.db
        .prepare(
          `SELECT show.id, show.name, show.host_bot_id, host.name AS host_name,
                  show.updated_at
             FROM botcast_shows AS show
             JOIN bots AS host
               ON host.id = show.host_bot_id AND host.user_id = show.user_id
            WHERE show.id = ? AND show.user_id = ?`,
        )
        .get(showId, context.userId) as
        | {
            id: string;
            name: string;
            host_bot_id: string;
            host_name: string;
            updated_at: string;
          }
        | undefined;
      const guest = context.db
        .prepare(
          `SELECT id, name, updated_at
             FROM bots
            WHERE id = ? AND user_id = ?`,
        )
        .get(guestBotId, context.userId) as
        | { id: string; name: string; updated_at: string }
        | undefined;
      if (!show || !guest) {
        throw new Error("The Signal show or guest is no longer available.");
      }
      if (show.host_bot_id === guest.id) {
        throw new Error("Choose a guest other than the Signal host.");
      }
      return {
        ...simplePreview(
          `Make a new ${show.name} episode with ${guest.name}, switch to Signal, and begin playback.`,
          [
            {
              schemaVersion: PRISM_ORCHESTRATION_VERSION,
              entityType: "signal-show",
              id: show.id,
              label: show.name,
              revision: show.updated_at,
            },
            {
              schemaVersion: PRISM_ORCHESTRATION_VERSION,
              entityType: "bot",
              id: guest.id,
              label: guest.name,
              revision: guest.updated_at,
            },
          ],
        ),
        consequences: [
          "Signal will synthesize the booking before going live.",
          "Episode speech may consume paid ElevenLabs credits under the current voice settings.",
          "Stopping or undoing the episode cannot restore credits already consumed.",
        ],
        provider: "Prism auxiliary",
        model: "configured auxiliary model (llama3.2 fallback)",
      };
    },
    execute: async (context, input) => {
      if (!dependencies.generateSignalBooking) {
        throw new Error("Signal booking synthesis is unavailable.");
      }
      const showId = requiredString(input, "showId", 160);
      const guestBotId = requiredString(input, "guestBotId", 160);
      const direction = requiredString(input, "direction", 2_000);
      const booking = await dependencies.generateSignalBooking(context, {
        showId,
        guestBotId,
        direction,
      });
      const show = context.db
        .prepare(
          `SELECT show.name, show.host_bot_id, host.name AS host_name
             FROM botcast_shows AS show
             JOIN bots AS host
               ON host.id = show.host_bot_id AND host.user_id = show.user_id
            WHERE show.id = ? AND show.user_id = ?`,
        )
        .get(showId, context.userId) as
        | { name: string; host_bot_id: string; host_name: string }
        | undefined;
      const guest = context.db
        .prepare("SELECT name FROM bots WHERE id = ? AND user_id = ?")
        .get(guestBotId, context.userId) as { name: string } | undefined;
      if (!show || !guest) {
        throw new Error("The Signal show or guest changed during synthesis.");
      }
      return {
        result: {
          navigation: {
            surfaceId: "signal",
            autoStart: true,
            showId,
            showName: show.name,
            hostBotId: show.host_bot_id,
            hostName: show.host_name,
            guestBotId,
            guestName: guest.name,
            topic: booking.topic,
            producerBrief: booking.producerBrief,
          },
          provider: booking.provider,
          model: booking.model,
          actions: ["Open Signal", "Cancel"],
        },
        affectedEntities: [],
        inverse: null,
        nonReversibleConsequences: [
          "Any ElevenLabs credits consumed after playback begins cannot be restored.",
        ],
      };
    },
  };
}

function signalEpisodeCreateCapability(): PrismCapabilityDefinition {
  return {
    descriptor: descriptor({
      id: "signal.episode.create",
      label: "Create Signal episode",
      description:
        "Creates the validated Signal episode used by both the production desk and Prism orchestration.",
      execution: "server",
      surfaces: ["signal"],
      unavailableWhileLive: true,
      risk: "costly",
      confirmation: "explicit-confirmation",
      privacy: "private",
      provider: "local-or-online",
      cost: "estimated",
      undo: "inverse",
      idempotent: true,
    }),
    // createBotcastEpisode owns its domain transaction.
    transactional: false,
    validateInput: (input) => {
      const responseMode =
        input.responseMode === "auto"
          ? "auto"
          : input.responseMode === "online"
            ? "online"
            : "local";
      const provider =
        input.preferredProvider === "ollama_cloud" ||
        input.preferredProvider === "openai" ||
        input.preferredProvider === "anthropic"
          ? input.preferredProvider
          : "local";
      const guestKind = input.guestKind === "producer" ? "producer" : "bot";
      return {
        showId: requiredString(input, "showId", 160),
        guestKind,
        guestBotId:
          guestKind === "bot"
            ? requiredString(input, "guestBotId", 160)
            : "",
        guestName:
          typeof input.guestName === "string"
            ? input.guestName.trim().slice(0, 160)
            : "",
        guestContext:
          typeof input.guestContext === "string"
            ? input.guestContext.trim().slice(0, 4_000)
            : "",
        topic: requiredString(input, "topic", 500),
        producerBrief:
          typeof input.producerBrief === "string"
            ? input.producerBrief.trim().slice(0, 4_000)
            : "",
        preferredProvider: provider,
        responseMode,
        modelOverride:
          typeof input.modelOverride === "string" &&
          input.modelOverride.trim()
            ? input.modelOverride.trim().slice(0, 240)
            : null,
        durationMinutes:
          typeof input.durationMinutes === "number"
            ? input.durationMinutes
            : null,
        playbackMode: input.playbackMode === "watch" ? "watch" : "live",
      };
    },
    preview: (context, input) => {
      const showId = requiredString(input, "showId", 160);
      const show = context.db
        .prepare("SELECT name FROM botcast_shows WHERE id = ? AND user_id = ?")
        .get(showId, context.userId) as { name: string } | undefined;
      if (!show) throw new Error("Signal show not found.");
      const watchMode = input.playbackMode === "watch";
      return {
        ...simplePreview(
          watchMode
            ? `Bake a Watch episode of ${show.name}.`
            : `Begin a new episode of ${show.name}.`,
        ),
        consequences: watchMode
          ? [
              "Watch mode bakes the full episode before playback.",
              "Credits already consumed are not restored by Undo.",
            ]
          : [
              "Going live may consume paid voice credits.",
              "Credits already consumed are not restored by Undo.",
            ],
        provider:
          typeof input.preferredProvider === "string"
            ? input.preferredProvider
            : null,
        model:
          typeof input.modelOverride === "string"
            ? input.modelOverride
            : null,
      };
    },
    execute: (context, input) => {
      const showId = requiredString(input, "showId", 160);
      const episode = createBotcastEpisode(context.db, context.userId, showId, {
        guestKind: input.guestKind === "producer" ? "producer" : "bot",
        guestBotId:
          typeof input.guestBotId === "string" ? input.guestBotId : "",
        guestName:
          typeof input.guestName === "string" ? input.guestName : "",
        guestContext:
          typeof input.guestContext === "string" ? input.guestContext : "",
        topic: requiredString(input, "topic", 500),
        producerBrief:
          typeof input.producerBrief === "string"
            ? input.producerBrief
            : "",
        preferredProvider:
          input.preferredProvider === "ollama_cloud" ||
          input.preferredProvider === "openai" ||
          input.preferredProvider === "anthropic"
            ? input.preferredProvider
            : "local",
        responseMode:
          input.responseMode === "auto"
            ? "auto"
            : input.responseMode === "online"
              ? "online"
              : "local",
        modelOverride:
          typeof input.modelOverride === "string"
            ? input.modelOverride
            : null,
        durationMinutes:
          typeof input.durationMinutes === "number"
            ? input.durationMinutes
            : null,
        playbackMode: input.playbackMode === "watch" ? "watch" : "live",
      });
      return {
        result: {
          episodeId: episode.id,
          showId: episode.showId,
          status: episode.status,
        },
        affectedEntities: [
          {
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "signal-episode",
            id: episode.id,
            label: episode.title,
            revision: episode.updatedAt,
          },
        ],
        inverse: { episodeId: episode.id },
        nonReversibleConsequences: [
          "Any voice credits consumed while the episode plays cannot be restored.",
        ],
      };
    },
    undo: (context, inverse) => {
      const episodeId =
        typeof inverse.episodeId === "string" ? inverse.episodeId : "";
      if (
        context.db
          .prepare("DELETE FROM botcast_episodes WHERE id = ? AND user_id = ?")
          .run(episodeId, context.userId).changes !== 1
      ) {
        throw new Error("That Signal episode is no longer available to undo.");
      }
      return { affectedEntities: [] };
    },
  };
}

function backupExportCapability(): PrismCapabilityDefinition {
  return {
    descriptor: descriptor({
      id: "backup.export",
      label: "Export backup",
      description:
        "Prepares an account .prism, Library group .bots, or Coffee transcript export through the existing browser exporter.",
      execution: "hybrid",
      surfaces: [],
      unavailableWhileLive: true,
      risk: "query",
      confirmation: "none",
      privacy: "private",
      provider: "none",
      cost: "none",
      undo: "none",
      idempotent: true,
    }),
    validateInput: (input) => {
      const scope =
        input.scope === "group" || input.scope === "coffee"
          ? input.scope
          : "account";
      return {
        scope,
        targetId:
          typeof input.targetId === "string"
            ? input.targetId.trim().slice(0, 160)
            : "",
      };
    },
    preview: (_context, input) =>
      simplePreview(
        input.scope === "group"
          ? "Export this Library group as .bots."
          : input.scope === "coffee"
            ? "Export this Coffee session transcript."
            : "Export this account as .prism.",
      ),
    execute: (context, input) => {
      const scope =
        input.scope === "group" || input.scope === "coffee"
          ? input.scope
          : "account";
      const targetId =
        typeof input.targetId === "string" ? input.targetId : "";
      if (scope === "group") {
        const group = listLibraryGroups(context.db, context.userId).find(
          (candidate) => candidate.id === targetId,
        );
        if (!group) throw new Error("That Library group is unavailable.");
        return {
          result: jsonClone({
            download: {
              kind: "library-group",
              groupId: group.id,
              filenameHint: `${group.name}.bots`,
            },
          }),
          affectedEntities: [],
          inverse: null,
          nonReversibleConsequences: [
            "A downloaded file cannot be recalled by Undo.",
          ],
        };
      }
      if (scope === "coffee") {
        const conversation = context.db
          .prepare(
            `SELECT id, title
               FROM conversations
              WHERE id = ? AND user_id = ? AND conversation_mode = 'coffee'`,
          )
          .get(targetId, context.userId) as
          | { id: string; title: string }
          | undefined;
        if (!conversation) {
          throw new Error("That Coffee session is unavailable.");
        }
        return {
          result: jsonClone({
            download: {
              kind: "coffee-transcript",
              conversationId: conversation.id,
              filenameHint: `${conversation.title}.md`,
            },
          }),
          affectedEntities: [],
          inverse: null,
          nonReversibleConsequences: [
            "A downloaded file cannot be recalled by Undo.",
          ],
        };
      }
      return {
        result: jsonClone({
          download: {
            kind: "account",
            filenameHint: "prism-account.prism",
          },
        }),
        affectedEntities: [],
        inverse: null,
        nonReversibleConsequences: [
          "A downloaded file cannot be recalled by Undo.",
        ],
      };
    },
  };
}

function botContextualBatchCapability(
  dependencies: PrismDomainCapabilityDependencies,
): PrismCapabilityDefinition {
  type PreparedPatch = {
    botId: string;
    botName: string;
    revision: string;
    beforeValue: string;
    afterValue: string;
    beforeSystemPrompt: string;
    afterSystemPrompt: string;
    provider: string;
    model: string;
  };
  const patchesFromInput = (input: PrismJsonObject): PreparedPatch[] => {
    if (!Array.isArray(input.patches)) return [];
    return input.patches.flatMap((entry): PreparedPatch[] => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const required = [
        "botId",
        "botName",
        "revision",
        "beforeValue",
        "afterValue",
        "beforeSystemPrompt",
        "afterSystemPrompt",
        "provider",
        "model",
      ] as const;
      if (required.some((key) => typeof entry[key] !== "string")) return [];
      return [entry as unknown as PreparedPatch];
    });
  };
  return {
    descriptor: descriptor({
      id: "bots.contextual.batch",
      label: "Contextually update bots",
      description:
        "Generates isolated per-bot profile drafts, previews exact differences, then atomically applies the accepted revision-frozen set.",
      execution: "hybrid",
      surfaces: [],
      unavailableWhileLive: true,
      risk: "bulk",
      confirmation: "preview",
      privacy: "private",
      provider: "local-or-online",
      cost: "estimated",
      undo: "inverse",
      idempotent: true,
    }),
    validateInput: (input) => {
      const botIds = stringArray(input, "botIds", 100);
      if (botIds.length === 0) {
        throw new Error("At least one bot is required.");
      }
      const direction = requiredString(input, "direction", 2_000);
      const patches = patchesFromInput(input);
      return {
        botIds,
        direction,
        ...(patches.length > 0 ? { patches: jsonClone(patches) } : {}),
        failures: Array.isArray(input.failures)
          ? input.failures.slice(0, 100)
          : [],
      };
    },
    preview: () => {
      throw new Error("Contextual bot batches require prepared previews.");
    },
    prepareProposal: async (context, input) => {
      if (!dependencies.generateBotContextualField) {
        throw new Error("Contextual bot generation is unavailable.");
      }
      const botIds = stringArray(input, "botIds", 100);
      const direction = requiredString(input, "direction", 2_000);
      const rows = botRows(context, botIds).map((row) => {
        const stored = context.db
          .prepare(
            "SELECT system_prompt FROM bots WHERE id = ? AND user_id = ?",
          )
          .get(row.id, context.userId) as
          | { system_prompt: string }
          | undefined;
        if (!stored) throw new Error("A target bot is unavailable.");
        const parsed = parseStoredBotPrompt(stored.system_prompt);
        return {
          ...row,
          systemPrompt: stored.system_prompt,
          profile: parsed.fields,
          currentValue: parsed.fields.purpose.legacyNotes,
        };
      });
      if (rows.length !== botIds.length) {
        throw new Error("One or more target bots are unavailable.");
      }
      const generated = await Promise.allSettled(
        rows.map(async (row): Promise<PreparedPatch> => {
          const next = await dependencies.generateBotContextualField!(
            context,
            {
              botId: row.id,
              botName: row.name,
              currentValue: row.currentValue,
              direction,
              profile: jsonClone(row.profile) as PrismJsonObject,
            },
          );
          const nextProfile = JSON.parse(
            JSON.stringify(row.profile),
          ) as typeof row.profile;
          nextProfile.purpose.legacyNotes = next.value;
          return {
            botId: row.id,
            botName: row.name,
            revision: row.updated_at,
            beforeValue: row.currentValue,
            afterValue: next.value,
            beforeSystemPrompt: row.systemPrompt,
            afterSystemPrompt: serializeStoredBotPrompt(
              nextProfile,
              row.name,
            ),
            provider: next.provider,
            model: next.model,
          };
        }),
      );
      const patches = generated.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      const failures = generated.flatMap((result, index) =>
        result.status === "rejected"
          ? [
              {
                botId: rows[index]!.id,
                botName: rows[index]!.name,
                error:
                  result.reason instanceof Error
                    ? result.reason.message.slice(0, 300)
                    : "Draft generation failed.",
              },
            ]
          : [],
      );
      if (patches.length === 0) {
        throw new Error("Prism could not draft a safe update for any target.");
      }
      return {
        input: {
          botIds,
          direction,
          patches: jsonClone(patches),
          failures: jsonClone(failures),
        },
        preview: {
          ...simplePreview(
            `Review ${patches.length} contextual bot update${patches.length === 1 ? "" : "s"} before applying.`,
            patches.map((patch) => ({
              schemaVersion: PRISM_ORCHESTRATION_VERSION,
              entityType: "bot",
              id: patch.botId,
              label: patch.botName,
              revision: patch.revision,
            })),
          ),
          consequences: [
            "Target IDs and revisions are frozen until Apply.",
            "Each draft was generated independently from that bot’s profile.",
            ...(failures.length > 0
              ? [
                  `${failures.length} target${failures.length === 1 ? "" : "s"} failed drafting and will not be changed.`,
                ]
              : []),
          ],
          diffs: patches.map((patch) => ({
            entity: {
              schemaVersion: PRISM_ORCHESTRATION_VERSION,
              entityType: "bot",
              id: patch.botId,
              label: patch.botName,
              revision: patch.revision,
            },
            before: patch.beforeValue,
            after: patch.afterValue,
          })),
          provider: Array.from(
            new Set(patches.map((patch) => patch.provider)),
          ).join(", "),
          model: Array.from(
            new Set(patches.map((patch) => patch.model)),
          ).join(", "),
          estimatedCostMicroUsd: null,
        },
      };
    },
    execute: (context, input) => {
      const patches = patchesFromInput(input);
      if (patches.length === 0) {
        throw new Error("The contextual drafts are missing.");
      }
      const updatedAt = context.now.toISOString();
      for (const patch of patches) {
        const updated = context.db
          .prepare(
            `UPDATE bots
                SET system_prompt = ?, updated_at = ?
              WHERE id = ? AND user_id = ? AND updated_at = ?`,
          )
          .run(
            patch.afterSystemPrompt,
            updatedAt,
            patch.botId,
            context.userId,
            patch.revision,
          );
        if (updated.changes !== 1) {
          throw new Error(
            `${patch.botName} changed after preview. Prism stopped the whole batch.`,
          );
        }
      }
      return {
        result: {
          updated: patches.length,
          failures: Array.isArray(input.failures) ? input.failures : [],
        },
        affectedEntities: patches.map((patch) => ({
          schemaVersion: PRISM_ORCHESTRATION_VERSION,
          entityType: "bot",
          id: patch.botId,
          label: patch.botName,
          revision: updatedAt,
        })),
        inverse: {
          patches: patches.map((patch) => ({
            botId: patch.botId,
            botName: patch.botName,
            appliedRevision: updatedAt,
            systemPrompt: patch.beforeSystemPrompt,
            revision: patch.revision,
          })),
        },
      };
    },
    undo: (context, inverse) => {
      const patches = Array.isArray(inverse.patches)
        ? inverse.patches
        : [];
      for (const entry of patches) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          throw new Error("The contextual batch inverse is invalid.");
        }
        const botId = typeof entry.botId === "string" ? entry.botId : "";
        const botName =
          typeof entry.botName === "string" ? entry.botName : "A bot";
        const appliedRevision =
          typeof entry.appliedRevision === "string"
            ? entry.appliedRevision
            : "";
        const systemPrompt =
          typeof entry.systemPrompt === "string" ? entry.systemPrompt : "";
        const restoredRevision =
          typeof entry.revision === "string"
            ? entry.revision
            : context.now.toISOString();
        if (
          context.db
            .prepare(
              `UPDATE bots
                  SET system_prompt = ?, updated_at = ?
                WHERE id = ? AND user_id = ? AND updated_at = ?`,
            )
            .run(
              systemPrompt,
              restoredRevision,
              botId,
              context.userId,
              appliedRevision,
            ).changes !== 1
        ) {
          throw new Error(
            `${botName} changed after this batch, so Prism stopped the undo.`,
          );
        }
      }
      return { affectedEntities: [] };
    },
  };
}

function botCreateCapability(
  dependencies: PrismDomainCapabilityDependencies,
): PrismCapabilityDefinition {
  return {
    descriptor: descriptor({
      id: "bots.create",
      label: "Create character bot",
      description:
        "Generates, validates, compiles, and saves a character bot from a creative brief.",
      execution: "hybrid",
      surfaces: [],
      unavailableWhileLive: true,
      risk: "reversible",
      confirmation: "none",
      privacy: "private",
      provider: "local-or-online",
      cost: "estimated",
      undo: "inverse",
      idempotent: true,
    }),
    validateInput: (input) => ({
      brief: requiredString(input, "brief", 4_000),
    }),
    preview: () =>
      simplePreview(
        "Generate, validate, compile, and save a new character bot from this private direction.",
      ),
    prepare: async (context, input) => {
      if (!dependencies.generateBotDraft) {
        throw new Error("Character generation is unavailable.");
      }
      return jsonClone(
        await dependencies.generateBotDraft(
          context,
          requiredString(input, "brief", 4_000),
        ),
      );
    },
    execute: (context, _input, prepared) => {
      if (
        !prepared ||
        typeof prepared !== "object" ||
        Array.isArray(prepared) ||
        typeof prepared.name !== "string" ||
        !prepared.profile ||
        typeof prepared.profile !== "object" ||
        Array.isArray(prepared.profile)
      ) {
        throw new Error("Character generation returned an invalid draft.");
      }
      const draft = prepared as unknown as BotGeneratedDraftV1;
      const botId = randomId(12);
      const now = context.now.toISOString();
      const systemPrompt = serializeStoredBotPrompt(draft.profile, draft.name);
      context.db
        .prepare(
          `INSERT INTO bots
            (id, user_id, name, system_prompt, powers_json, color, glyph,
             avatar_details_json, face_eyes_font, face_eye_character,
             face_eye_animation, face_mouth_font, face_mouth_character,
             face_mouth_animation, face_mouth_coffee_pucker, face_font_weight,
             face_eye_scale, face_eye_offset_x, face_eye_offset_y,
             face_eye_rotation_deg, face_eye_count, face_mouth_scale,
             face_mouth_offset_x, face_mouth_offset_y, face_mouth_rotation_deg,
             face_blink_bar, face_blink_scale, face_blink_offset_x,
             face_blink_offset_y, face_blink_rotation_deg,
             face_thinking_frames, authored_audio_voice_profile,
             voice_preview_line, flirt_enabled, temperature, max_tokens, top_p,
             top_k, repetition_penalty, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                   ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                   ?, ?, ?)`,
        )
        .run(
          botId,
          context.userId,
          draft.name,
          systemPrompt,
          serializeBotPowersV1(draft.powers),
          draft.color,
          draft.glyph,
          parseStoredBotAvatarDetailsV1(draft.avatarDetails)
            ? serializeBotAvatarDetailsV1(draft.avatarDetails)
            : null,
          draft.face.eyesFont,
          draft.face.eyeCharacter,
          draft.face.eyeAnimation,
          draft.face.mouthFont,
          draft.face.mouthCharacter,
          draft.face.mouthAnimation,
          draft.face.mouthCoffeePucker ? 1 : 0,
          draft.face.weight,
          draft.face.eyeScale,
          draft.face.eyeOffsetX,
          draft.face.eyeOffsetY,
          draft.face.eyeRotationDeg,
          draft.face.eyeCount,
          draft.face.mouthScale,
          draft.face.mouthOffsetX,
          draft.face.mouthOffsetY,
          draft.face.mouthRotationDeg,
          draft.face.blinkBar,
          draft.face.blinkScale,
          draft.face.blinkOffsetX,
          draft.face.blinkOffsetY,
          draft.face.blinkRotationDeg,
          JSON.stringify(draft.face.thinkingFrames),
          serializeBotAudioVoiceProfileV1(draft.audioVoiceProfile),
          draft.voicePreviewLine,
          draft.settings.flirtEnabled ? 1 : 0,
          draft.settings.temperature,
          draft.settings.maxTokens,
          draft.settings.topP,
          draft.settings.topK,
          draft.settings.repetitionPenalty,
          now,
          now,
        );
      context.db
        .prepare(
          "UPDATE bots SET face_eye_spacing = ? WHERE id = ? AND user_id = ?",
        )
        .run(draft.face.eyeSpacing, botId, context.userId);
      context.db
        .prepare(
          "UPDATE bots SET face_blink_count = ? WHERE id = ? AND user_id = ?",
        )
        .run(draft.face.blinkCount, botId, context.userId);
      return {
        result: {
          bot: {
            id: botId,
            name: draft.name,
            color: draft.color,
            glyph: draft.glyph,
          },
          navigation: {
            surfaceId: "avatar-studio",
            botId,
          },
          actions: ["Open Avatar Studio", "Refine", "Undo"],
        },
        affectedEntities: [
          {
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "bot",
            id: botId,
            label: draft.name,
            revision: now,
          },
        ],
        inverse: { botId, createdRevision: now },
      };
    },
    undo: (context, inverse) => {
      const botId = typeof inverse.botId === "string" ? inverse.botId : "";
      const revision =
        typeof inverse.createdRevision === "string"
          ? inverse.createdRevision
          : "";
      if (
        context.db
          .prepare(
            `DELETE FROM bots
              WHERE id = ? AND user_id = ? AND updated_at = ?`,
          )
          .run(botId, context.userId, revision).changes !== 1
      ) {
        throw new Error(
          "That bot changed after creation, so Prism stopped the undo.",
        );
      }
      return { affectedEntities: [] };
    },
  };
}

function elevenLabsCreditQueryCapability(
  dependencies: PrismDomainCapabilityDependencies,
): PrismCapabilityDefinition {
  return {
    descriptor: descriptor({
      id: "usage.elevenlabs-credits.query",
      label: "Check ElevenLabs credits",
      description: "Reads the current ElevenLabs subscription credit balance.",
      execution: "hybrid",
      surfaces: [],
      unavailableWhileLive: true,
      risk: "query",
      confirmation: "none",
      privacy: "private",
      provider: "online-required",
      cost: "none",
      undo: "none",
      idempotent: true,
    }),
    transactional: false,
    validateInput: () => ({}),
    preview: () => simplePreview("Check the current ElevenLabs credit balance."),
    execute: async (context) => {
      if (!dependencies.readElevenLabsBalance) {
        throw new Error("ElevenLabs credit checks are unavailable.");
      }
      const balance = await dependencies.readElevenLabsBalance(context);
      return {
        result: {
          balance: jsonClone(balance),
          remainingRatio:
            balance.totalCredits > 0
              ? balance.remainingCredits / balance.totalCredits
              : 0,
        },
        affectedEntities: [],
        inverse: null,
      };
    },
  };
}

function elevenLabsMonitorCapability(
  dependencies: PrismDomainCapabilityDependencies,
): PrismCapabilityDefinition {
  return {
    descriptor: descriptor({
      id: "notifications.elevenlabs-credit.monitor",
      label: "Monitor ElevenLabs credits",
      description:
        "Checks after usage and at six-hour intervals, then notifies once per billing cycle.",
      execution: "hybrid",
      surfaces: [],
      unavailableWhileLive: true,
      risk: "reversible",
      confirmation: "none",
      privacy: "private",
      provider: "local-or-online",
      cost: "none",
      undo: "inverse",
      idempotent: true,
    }),
    transactional: false,
    validateInput: (input) => {
      const raw =
        typeof input.thresholdRatio === "number"
          ? input.thresholdRatio
          : 0.2;
      if (!Number.isFinite(raw) || raw <= 0 || raw >= 1) {
        throw new Error("The credit threshold must be between 1% and 99%.");
      }
      return { thresholdRatio: raw, enabled: input.enabled !== false };
    },
    preview: (_context, input) =>
      simplePreview(
        input.enabled === false
          ? "Disable the ElevenLabs credit reminder."
          : `Notify once when ElevenLabs reaches about ${Math.round(
              Number(input.thresholdRatio) * 100,
            )}% remaining in each billing cycle.`,
      ),
    execute: async (context, input) => {
      const before = listPrismMonitors(context.db, context.userId)[0] ?? null;
      if (input.enabled === false) {
        if (before) {
          context.db
            .prepare(
              `UPDATE prism_monitors
                  SET status = 'disabled', updated_at = ?
                WHERE id = ? AND user_id = ?`,
            )
            .run(context.now.toISOString(), before.id, context.userId);
        }
        return {
          result: {
            monitor: before
              ? jsonClone(
                  listPrismMonitors(context.db, context.userId)[0] ?? before,
                )
              : null,
            disabled: true,
          } as PrismJsonObject,
          affectedEntities: before
            ? [
                {
                  schemaVersion: PRISM_ORCHESTRATION_VERSION,
                  entityType: "monitor",
                  id: before.id,
                  label: "ElevenLabs credit reminder",
                  revision: context.now.toISOString(),
                },
              ]
            : [],
          inverse: {
            previousMonitor: before ? jsonClone(before) : null,
            monitorId: before?.id ?? "",
          },
        };
      }
      if (context.hardLocal) {
        throw new Error(
          "Switch Prism to AUTO or ONLINE before enabling an external credit reminder.",
        );
      }
      const monitor = upsertElevenLabsCreditMonitor({
        db: context.db,
        userId: context.userId,
        thresholdRatio: Number(input.thresholdRatio),
        hardLocal: context.hardLocal,
        now: context.now,
      });
      let checked = null;
      let checkError: string | null = null;
      if (dependencies.readElevenLabsBalance) {
        try {
          checked = await checkElevenLabsCreditMonitor({
            db: context.db,
            userId: context.userId,
            hardLocal: context.hardLocal,
            readBalance: () => dependencies.readElevenLabsBalance!(context),
            now: context.now,
            force: true,
          });
        } catch (error) {
          checkError =
            error instanceof Error
              ? error.message
              : "The first credit check could not finish.";
        }
      }
      return {
        result: {
          monitor: jsonClone(checked?.monitor ?? monitor),
          balance: checked?.balance ? jsonClone(checked.balance) : null,
          notificationCreated: checked?.notificationCreated ?? false,
          checkError,
        },
        affectedEntities: [
          {
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "monitor",
            id: monitor.id,
            label: "ElevenLabs credit reminder",
            revision: monitor.updatedAt,
          },
        ],
        inverse: {
          previousMonitor: before ? jsonClone(before) : null,
          monitorId: monitor.id,
        },
        nonReversibleConsequences: checked?.notificationCreated
          ? ["A low-credit notification was already delivered."]
          : [],
      };
    },
    undo: (context, inverse) => {
      const prior = inverse.previousMonitor;
      if (!prior || typeof prior !== "object" || Array.isArray(prior)) {
        context.db
          .prepare(
            `DELETE FROM prism_monitors
              WHERE id = ? AND user_id = ?`,
          )
          .run(
            typeof inverse.monitorId === "string" ? inverse.monitorId : "",
            context.userId,
          );
        return { affectedEntities: [] };
      }
      const monitor = prior as PrismJsonObject;
      const optionalString = (value: PrismJsonValue | undefined) =>
        typeof value === "string" ? value : null;
      context.db
        .prepare(
          `UPDATE prism_monitors
              SET status = ?, threshold_ratio = ?, last_observed_ratio = ?,
                  billing_cycle_key = ?, last_checked_at = ?, triggered_at = ?,
                  updated_at = ?
            WHERE id = ? AND user_id = ?`,
        )
        .run(
          typeof monitor.status === "string" ? monitor.status : "active",
          typeof monitor.thresholdRatio === "number"
            ? monitor.thresholdRatio
            : 0.2,
          typeof monitor.lastObservedRatio === "number"
            ? monitor.lastObservedRatio
            : null,
          optionalString(monitor.billingCycleKey),
          optionalString(monitor.lastCheckedAt),
          optionalString(monitor.triggeredAt),
          optionalString(monitor.updatedAt) ?? context.now.toISOString(),
          optionalString(monitor.id) ?? "",
          context.userId,
        );
      return { affectedEntities: [] };
    },
  };
}

function marketplaceSelectionFromInput(
  input: PrismJsonObject,
): PrismMarketplaceSelection {
  const selection = input.selection;
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
    throw new Error("The Marketplace selection is missing.");
  }
  const row = selection as PrismJsonObject;
  const entries = Array.isArray(row.entries)
    ? row.entries.flatMap((candidate) => {
        if (
          !candidate ||
          typeof candidate !== "object" ||
          Array.isArray(candidate)
        ) {
          return [];
        }
        const entry = candidate as PrismJsonObject;
        return typeof entry.id === "string" &&
          typeof entry.name === "string" &&
          typeof entry.botHash === "string"
          ? [
              {
                id: entry.id,
                name: entry.name,
                botHash: entry.botHash,
              },
            ]
          : [];
      })
    : [];
  const selectionType =
    row.selectionType === "theme" ? "theme" : "entry";
  return {
    selectionType,
    selectionId: requiredString(row, "selectionId", 160),
    label: requiredString(row, "label", 240),
    description:
      typeof row.description === "string" ? row.description.slice(0, 1_000) : "",
    themeId:
      typeof row.themeId === "string" && row.themeId.trim()
        ? row.themeId.trim()
        : null,
    entries,
    installedEntryIds: stringArray(row, "installedEntryIds", 200),
    missingEntryIds: stringArray(row, "missingEntryIds", 200),
  };
}

function marketplaceInstallCapability(): PrismCapabilityDefinition {
  return {
    descriptor: descriptor({
      id: "marketplace.install",
      label: "Install from Marketplace",
      description:
        "Installs an exact bundled Marketplace bot or pack, restores its bundled memories, and adds it to server-backed Library state.",
      execution: "hybrid",
      surfaces: [],
      unavailableWhileLive: true,
      risk: "reversible",
      confirmation: "preview",
      privacy: "private",
      provider: "local-only",
      cost: "none",
      undo: "inverse",
      idempotent: true,
    }),
    transactional: false,
    validateInput: (input) => ({
      query: requiredString(input, "query", 500),
      ...(input.selection &&
      typeof input.selection === "object" &&
      !Array.isArray(input.selection)
        ? { selection: jsonClone(input.selection) }
        : {}),
    }),
    preview: () => {
      throw new Error("Marketplace installs require a prepared target preview.");
    },
    prepareProposal: async (context, input) => {
      const query = requiredString(input, "query", 500);
      const selection = resolvePrismMarketplaceSelection(
        context.db,
        context.userId,
        query,
      );
      return {
        input: {
          query,
          selection: jsonClone(selection),
        },
        preview: {
          ...simplePreview(
            selection.missingEntryIds.length > 0
              ? `Install ${selection.label} from the bundled Prism Marketplace.`
              : `${selection.label} is already installed.`,
            selection.entries.map((entry) => ({
              schemaVersion: PRISM_ORCHESTRATION_VERSION,
              entityType: "marketplace-entry",
              id: entry.id,
              label: entry.name,
              revision: entry.botHash,
            })),
          ),
          consequences: [
            `${selection.missingEntryIds.length} new bot${
              selection.missingEntryIds.length === 1 ? "" : "s"
            } will be installed.`,
            ...(selection.installedEntryIds.length > 0
              ? [
                  `${selection.installedEntryIds.length} already-installed item${
                    selection.installedEntryIds.length === 1 ? "" : "s"
                  } will be left unchanged.`,
                ]
              : []),
            "Bundled memories are restored locally. No Marketplace content leaves this installation.",
            "Newly installed bots and their bundled memories can be removed with Undo.",
          ],
          diffs: selection.entries
            .filter((entry) => selection.missingEntryIds.includes(entry.id))
            .map((entry) => ({
              entity: {
                schemaVersion: PRISM_ORCHESTRATION_VERSION,
                entityType: "marketplace-entry",
                id: entry.id,
                label: entry.name,
                revision: entry.botHash,
              },
              before: null,
              after: "Installed in Library",
            })),
          provider: "local",
          model: null,
          estimatedCostMicroUsd: 0,
        },
      };
    },
    prepare: async (_context, input) =>
      jsonClone(
        preparePrismMarketplaceInstall(marketplaceSelectionFromInput(input)),
      ),
    execute: async (context, input, prepared) => {
      const selection = marketplaceSelectionFromInput(input);
      const archives = Array.isArray(prepared)
        ? (prepared as unknown as PrismMarketplacePreparedArchive[])
        : [];
      const installed = await installPrismMarketplaceSelection({
        db: context.db,
        userId: context.userId,
        userKey: context.userKey,
        selection,
        archives,
        now: context.now.toISOString(),
      });
      return {
        result: {
          installed: installed.installed.length,
          skipped: installed.skippedEntryIds.length,
          bots: installed.installed,
          groupId: installed.groupId,
          navigation: {
            surfaceId: "marketplace",
            selectionId: selection.selectionId,
          },
        },
        affectedEntities: installed.installed.map((entry) => ({
          schemaVersion: PRISM_ORCHESTRATION_VERSION,
          entityType: "bot",
          id: entry.botId,
          label: entry.name,
          revision: context.now.toISOString(),
        })),
        inverse:
          installed.installed.length > 0
            ? {
                bots: installed.installed.map((entry) => ({
                  botId: entry.botId,
                  createdRevision: context.now.toISOString(),
                })),
                groupId: installed.groupId,
                groupRevision: installed.groupId
                  ? context.now.toISOString()
                  : null,
                previousGroups: jsonClone(installed.previousGroups),
              }
            : null,
      };
    },
    undo: (context, inverse) => {
      const bots = Array.isArray(inverse.bots)
        ? inverse.bots.flatMap((candidate) => {
            if (
              !candidate ||
              typeof candidate !== "object" ||
              Array.isArray(candidate)
            ) {
              return [];
            }
            const row = candidate as PrismJsonObject;
            return typeof row.botId === "string" &&
              typeof row.createdRevision === "string"
              ? [
                  {
                    botId: row.botId,
                    createdRevision: row.createdRevision,
                  },
                ]
              : [];
          })
        : [];
      const previousGroups = Array.isArray(inverse.previousGroups)
        ? (inverse.previousGroups as unknown as ReturnType<
            typeof listLibraryGroups
          >)
        : [];
      undoPrismMarketplaceInstall({
        db: context.db,
        userId: context.userId,
        bots,
        groupId:
          typeof inverse.groupId === "string" ? inverse.groupId : null,
        groupRevision:
          typeof inverse.groupRevision === "string"
            ? inverse.groupRevision
            : null,
        previousGroups,
      });
      return { affectedEntities: [] };
    },
  };
}

export function createPrismDomainCapabilityRegistry(
  dependencies: PrismDomainCapabilityDependencies = {},
): PrismCapabilityRegistry {
  const registry = new PrismCapabilityRegistry();
  registry.register(memoriesDeleteCapability());
  registry.register(conversationsQuarantineCapability());
  registry.register(settingsOnlineModelCapability());
  registry.register(settingsFieldsUpdateCapability(dependencies));
  registry.register(defaultBotFieldsUpdateCapability());
  registry.register(storySessionCreateCapability(dependencies));
  registry.register(storySessionAdvanceCapability());
  registry.register(storySessionDeleteCapability());
  registry.register(debateSessionDeleteCapability());
  registry.register(slateSeriesCreateCapability());
  registry.register(slateProjectCreateCapability());
  registry.register(slateProjectFieldsUpdateCapability());
  registry.register(imageDeleteCapability());
  registry.register(oneEyeBatchCapability());
  registry.register(botFieldsUpdateCapability(dependencies));
  registry.register(botFieldsBatchCapability(dependencies));
  registry.register(botDeleteCapability());
  registry.register(botContextualBatchCapability(dependencies));
  registry.register(libraryFavoritesCapability());
  registry.register(libraryUnprotectCapability());
  registry.register(libraryGroupCreateCapability(dependencies));
  registry.register(libraryGroupsReplaceCapability());
  registry.register(usageTopBotsCapability());
  registry.register(signalShowTextUpdateCapability());
  registry.register(signalEpisodeStageCapability(dependencies));
  registry.register(signalEpisodeCreateCapability());
  registry.register(signalEpisodesDeleteCapability());
  registry.register(signalLatestToSlateCapability());
  registry.register(backupExportCapability());
  registry.register(botCreateCapability(dependencies));
  registry.register(marketplaceInstallCapability());
  registry.register(elevenLabsCreditQueryCapability(dependencies));
  registry.register(elevenLabsMonitorCapability(dependencies));
  return registry;
}

export const PRISM_CAPABILITY_COVERAGE_MANIFEST = {
  Navigation: ["client:navigation"],
  Settings: ["settings.fields.update", "settings.online-model.update"],
  Library: [
    "library.favorites.update",
    "library.protection.unprotect",
    "library.group.create",
    "library.groups.replace",
  ],
  "Avatar Studio": [
    "default-bot.fields.update",
    "bots.fields.update",
    "bots.fields.batch",
    "bots.delete",
    "bots.avatar.eye-count.batch",
  ],
  Bots: [
    "default-bot.fields.update",
    "bots.fields.update",
    "bots.fields.batch",
    "bots.delete",
    "bots.avatar.eye-count.batch",
    "bots.contextual.batch",
    "bots.create",
  ],
  Groups: ["library.group.create"],
  Coffee: ["library.group.create"],
  Signal: [
    "signal.show.text.update",
    "signal.episode.stage",
    "signal.episode.create",
    "signal.episodes.delete",
  ],
  Slate: [
    "slate.series.create",
    "slate.project.create",
    "slate.project.fields.update",
    "signal.latest.export-to-slate",
  ],
  Story: [
    "story.session.create",
    "story.session.advance",
    "story.session.delete",
    "human-only:manual-drawing",
  ],
  Debate: ["debate.session.delete"],
  Images: ["images.delete", "human-only:os-file-picker"],
  Marketplace: ["marketplace.install"],
  Memories: ["memories.delete"],
  Conversations: ["conversations.quarantine"],
  Usage: ["usage.top-bots.query", "usage.elevenlabs-credits.query"],
  Backups: ["backup.export"],
  Notifications: ["notifications.elevenlabs-credit.monitor"],
} as const;

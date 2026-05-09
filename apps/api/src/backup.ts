import type { DatabaseSync } from "node:sqlite";
import { decryptJson, encryptJson } from "./security.ts";
import { normalizeMemoryTier } from "./memory.ts";

export interface BackupSnapshot {
  version: 1;
  exportedAt: string;
  conversations: Array<{
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: Array<{
      id: string;
      role: string;
      content: string;
      createdAt: string;
      /** Optional; older v1 snapshots omit this. */
      provider?: "local" | "openai";
      /** Optional; older v1 snapshots (pre-model tracking) omit this. */
      model?: string;
      /** Optional; older v1 snapshots (pre-per-message bot tracking) omit this. */
      botId?: string;
      /** Serialized AskQuestion envelope; optional snapshots omit this. */
      toolPayload?: string;
    }>;
  }>;
  memories: Array<{
    id: string;
    conversationId?: string;
    botId?: string;
    confidence: number;
    category?: "general" | "user" | "bot_relation";
    tier?: "short_term" | "long_term";
    durability?: number;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
}

export interface BackupAdapter {
  upload(userId: string, payload: BackupSnapshot): Promise<void>;
  download(userId: string): Promise<BackupSnapshot | null>;
  listVersions(userId: string): Promise<string[]>;
}

export class LocalOnlyBackupAdapter implements BackupAdapter {
  private readonly snapshots = new Map<string, BackupSnapshot>();

  public async upload(userId: string, payload: BackupSnapshot): Promise<void> {
    this.snapshots.set(userId, payload);
  }

  public async download(userId: string): Promise<BackupSnapshot | null> {
    return this.snapshots.get(userId) ?? null;
  }

  public async listVersions(userId: string): Promise<string[]> {
    const snapshot = this.snapshots.get(userId);
    return snapshot ? [snapshot.exportedAt] : [];
  }
}

export function exportUserSnapshot(
  db: DatabaseSync,
  userId: string,
  userKey: Buffer
): BackupSnapshot {
  const conversations = db
    .prepare(
      "SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC"
    )
    .all(userId) as Array<{
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
  }>;

  const conversationPayload = conversations.map((conversation) => {
    const messages = db
      .prepare(
        "SELECT id, role, content, provider, model, bot_id, tool_payload, created_at FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC"
      )
      .all(conversation.id, userId) as Array<{
      id: string;
      role: string;
      content: string;
      provider: string | null;
      model: string | null;
      bot_id: string | null;
      tool_payload: string | null;
      created_at: string;
    }>;
    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      messages: messages.map((message) => {
        const provider: "local" | "openai" | undefined =
          message.provider === "local" || message.provider === "openai"
            ? message.provider
            : undefined;
        const botId: string | undefined = message.bot_id ?? undefined;
        const model: string | undefined = message.model ?? undefined;
        const toolPayload =
          typeof message.tool_payload === "string" && message.tool_payload.trim().length > 0
            ? message.tool_payload
            : undefined;
        return {
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.created_at,
          provider,
          model,
          botId,
          ...(toolPayload ? { toolPayload } : {}),
        };
      }),
    };
  });

  const memories = db
    .prepare(
      "SELECT id, conversation_id, bot_id, confidence, category, tier, durability, ciphertext, iv, tag, created_at FROM memories WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(userId) as Array<{
    id: string;
    conversation_id: string | null;
    bot_id: string | null;
    confidence: number;
    category: "general" | "user" | "bot_relation";
    tier: "short_term" | "long_term";
    durability: number | null;
    ciphertext: string;
    iv: string;
    tag: string;
    created_at: string;
  }>;

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations: conversationPayload,
    memories: memories.map((memory) => ({
      id: memory.id,
      conversationId: memory.conversation_id ?? undefined,
      botId: memory.bot_id ?? undefined,
      confidence: memory.confidence,
      category: memory.category,
      tier: memory.tier,
      durability: memory.durability ?? undefined,
      createdAt: memory.created_at,
      payload: decryptJson(
        {
          ciphertext: memory.ciphertext,
          iv: memory.iv,
          tag: memory.tag
        },
        userKey
      )
    }))
  };
}

export function importUserSnapshot(
  db: DatabaseSync,
  userId: string,
  snapshot: BackupSnapshot,
  userKey: Buffer
): void {
  const insertConversation = db.prepare(`
    INSERT OR REPLACE INTO conversations (id, user_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertMessage = db.prepare(`
    INSERT OR REPLACE INTO messages (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMemory = db.prepare(`
    INSERT OR REPLACE INTO memories (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const conversation of snapshot.conversations) {
    insertConversation.run(
      conversation.id,
      userId,
      conversation.title,
      conversation.createdAt,
      conversation.updatedAt
    );
    for (const message of conversation.messages) {
      const providerValue =
        message.provider === "local" || message.provider === "openai"
          ? message.provider
          : null;
      const botIdValue =
        typeof message.botId === "string" && message.botId.length > 0
          ? message.botId
          : null;
      const modelValue =
        typeof message.model === "string" && message.model.trim().length > 0
          ? message.model.trim()
          : null;
      const toolPayloadValue =
        typeof message.toolPayload === "string" && message.toolPayload.trim().length > 0
          ? message.toolPayload.trim()
          : null;
      insertMessage.run(
        message.id,
        conversation.id,
        userId,
        message.role,
        message.content,
        providerValue,
        modelValue,
        botIdValue,
        toolPayloadValue,
        message.createdAt
      );
    }
  }

  for (const memory of snapshot.memories) {
    const encrypted = encryptJson(memory.payload, userKey);
    insertMemory.run(
      memory.id,
      userId,
      memory.conversationId ?? null,
      memory.botId ?? null,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      memory.confidence,
      memory.category ?? "user",
      memory.tier ?? normalizeMemoryTier(undefined, memory.confidence, memory.confidence, memory.durability ?? 0.5),
      memory.durability ?? 0.5,
      memory.createdAt
    );
  }
}

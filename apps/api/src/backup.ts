import type { DatabaseSync } from "node:sqlite";
import { decryptJson, encryptJson } from "./security.ts";

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
    }>;
  }>;
  memories: Array<{
    id: string;
    confidence: number;
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
        "SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC"
      )
      .all(conversation.id, userId) as Array<{
      id: string;
      role: string;
      content: string;
      created_at: string;
    }>;
    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.created_at
      }))
    };
  });

  const memories = db
    .prepare(
      "SELECT id, confidence, ciphertext, iv, tag, created_at FROM memories WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(userId) as Array<{
    id: string;
    confidence: number;
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
      confidence: memory.confidence,
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
    INSERT OR REPLACE INTO messages (id, conversation_id, user_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertMemory = db.prepare(`
    INSERT OR REPLACE INTO memories (id, user_id, ciphertext, iv, tag, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
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
      insertMessage.run(
        message.id,
        conversation.id,
        userId,
        message.role,
        message.content,
        message.createdAt
      );
    }
  }

  for (const memory of snapshot.memories) {
    const encrypted = encryptJson(memory.payload, userKey);
    insertMemory.run(
      memory.id,
      userId,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      memory.confidence,
      memory.createdAt
    );
  }
}

---
title: "apps/api/src/backup.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/backup.ts"
status: "active"
---

# apps/api/src/backup.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/security.ts]]

## Referenced by
- [[02-apps/api/src/server.ts]]

## Source path
- `apps/api/src/backup.ts`

## Import references
- `node:sqlite`
- `./security.ts`

## Source preview
```text
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

  public async upload(userId: string, payload: BackupSnapshot): Promise<void

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->

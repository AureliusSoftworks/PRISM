import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const chat = readFileSync(new URL("../chat.ts", import.meta.url), "utf8");
const conversations = readFileSync(
  new URL("../conversations.ts", import.meta.url),
  "utf8",
);
const database = readFileSync(new URL("../db.ts", import.meta.url), "utf8");

describe("Chat distillation route contract", () => {
  it("routes the ritual through the requested LOCAL or ONLINE runtime", () => {
    assert.match(
      server,
      /route\("POST", "\/api\/conversations\/distill"[\s\S]{0,1800}requestedProvider: body\.preferredProvider[\s\S]{0,300}requestedResponseMode: body\.responseMode[\s\S]{0,900}selectProvider\(\s*runtime\.provider/u,
    );
    assert.match(
      server,
      /distillChatConversations\(db, provider, userId, \{[\s\S]{0,100}localProvider[\s\S]{0,700}prismPersona:[\s\S]{0,500}composeBotSystemPrompt\(/u,
    );
  });

  it("injects only the exact bot or Prism continuity on a new non-private direct Chat", () => {
    assert.match(
      chat,
      /createdConversationForTurn[\s\S]{0,120}!incognitoForTurn[\s\S]{0,240}activeMemoryBotId && \(mode === "chat" \|\| isZenMode\(mode\)\)[\s\S]{0,220}getLatestChatBotDistillation\(\s*db,\s*userId,\s*activeMemoryBotId/u,
    );
    assert.match(
      chat,
      /!activeMemoryBotId && \(mode === "chat" \|\| isZenMode\(mode\)\)[\s\S]{0,180}getLatestPrismChatDistillation\(db, userId\)/u,
    );
    assert.match(
      chat,
      /The user's newest message is authoritative and takes precedence/u,
    );
    assert.doesNotMatch(chat, /getLatestOrphanChatDistillation/u);
  });

  it("uses typed scope metadata and never title parsing for surfaced continuity", () => {
    assert.match(
      conversations,
      /c\.chat_distillation_kind IN \('bot', 'prism'\)[\s\S]{0,160}c\.chat_distillation_key IS NOT NULL/u,
    );
    assert.match(
      conversations,
      /c\.conversation_mode IN \('chat', 'zen'\)/u,
    );
    assert.doesNotMatch(
      conversations,
      /c\.title LIKE[\s\S]{0,200}CHAT_DISTILLATION/u,
    );
    assert.match(
      conversations,
      /group\.personaKind === "orphan"[\s\S]{0,260}CHAT_ORPHAN_DISTILLATION_PROMPT/u,
    );
    for (const column of [
      "chat_distillation_kind",
      "chat_distillation_key",
      "chat_distillation_persona_name",
    ]) {
      assert.match(database, new RegExp(`${column} TEXT`, "u"));
      assert.match(
        database,
        new RegExp(`ALTER TABLE conversations ADD COLUMN ${column} TEXT`, "u"),
      );
    }
  });
});

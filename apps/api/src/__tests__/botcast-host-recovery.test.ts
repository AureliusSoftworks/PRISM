import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import {
  castBotcastShowRecoveryHost,
  createBotcastShow,
  getBotcastShow,
  screenBotcastShowHostRecovery,
} from "../botcast.ts";
import { initializeDatabase } from "../db.ts";
import type { GenerateOptions, LlmProvider, ProviderMessage } from "../providers.ts";

const NOW = "2026-08-15T00:00:00.000Z";

class RecoveryProvider implements LlmProvider {
  public readonly name = "local" as const;
  public readonly diagnosticModel = "llama3.2";
  public calls = 0;
  public readonly received: ProviderMessage[][] = [];
  private readonly responses: string[];
  public constructor(responses: string[]) {
    this.responses = responses;
  }
  async generateResponse(messages: ProviderMessage[], _options?: GenerateOptions): Promise<string> {
    this.calls += 1;
    this.received.push(messages);
    return this.responses.shift() ?? '{"status":"decline","reason":"No."}';
  }
  async embedText(): Promise<number[]> { return []; }
}

function fixture(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.prepare(`INSERT INTO users (id, email, display_name, password_hash, password_salt, wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
    VALUES ('user-1', 'signal@example.com', 'Producer', 'hash', 'salt', 'cipher', 'iv', 'tag', ?, ?)`).run(NOW, NOW);
  for (const [id, name] of [["old-host", "Old Host"], ["candidate", "Candidate"]]) {
    db.prepare(`INSERT INTO bots (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at)
      VALUES (?, 'user-1', ?, ?, '#7744ee', 'sparkles', 1, ?, ?)`)
      .run(id, name, `${name} is a thoughtful radio host.`, NOW, NOW);
  }
  return db;
}

const localFactory = (provider: LlmProvider) => (() => provider) as never;

describe("Signal vacant host recovery", () => {
  it("uses the local auxiliary provider, reassigns only the show, and leaves episode host history intact", async () => {
    const db = fixture();
    const show = createBotcastShow(db, "user-1", { hostBotId: "old-host", name: "The Signal", premise: "Patient interviews", hostingStyle: "gentle, precise" });
    db.prepare(`INSERT INTO botcast_episodes (id, user_id, show_id, host_bot_id, guest_bot_id, title, topic, started_at, created_at, updated_at)
      VALUES ('episode-1', 'user-1', ?, 'old-host', 'candidate', 'Archive', 'Origins', ?, ?, ?)`)
      .run(show.id, NOW, NOW, NOW);
    db.prepare("DELETE FROM bots WHERE id = 'old-host' AND user_id = 'user-1'").run();
    const provider = new RecoveryProvider([
      '{"status":"compatible","reason":"The pace and curiosity fit."}',
      '{"status":"accept","reason":"I consent to hold this chair."}',
    ]);

    const recovery = await screenBotcastShowHostRecovery(db, "user-1", show.id, { auxiliaryProviderFactory: localFactory(provider) });
    assert.equal(provider.name, "local");
    assert.equal(provider.calls, 1);
    assert.equal(recovery.candidates[0]?.status, "compatible");
    const cast = await castBotcastShowRecoveryHost(db, "user-1", show.id, "candidate", { auxiliaryProviderFactory: localFactory(provider) });
    assert.equal(cast.status, "accepted");
    assert.equal(getBotcastShow(db, "user-1", show.id).hostBotId, "candidate");
    assert.equal((db.prepare("SELECT host_bot_id FROM botcast_episodes WHERE id = 'episode-1'").get() as { host_bot_id: string }).host_bot_id, "old-host");
  });

  it("persists an explicit refusal across identity re-screening", async () => {
    const db = fixture();
    const show = createBotcastShow(db, "user-1", { hostBotId: "old-host" });
    db.prepare("DELETE FROM bots WHERE id = 'old-host' AND user_id = 'user-1'").run();
    const provider = new RecoveryProvider([
      '{"status":"compatible","reason":"A clear fit."}',
      '{"status":"decline","reason":"This chair is not mine."}',
    ]);
    await screenBotcastShowHostRecovery(db, "user-1", show.id, { auxiliaryProviderFactory: localFactory(provider) });
    const result = await castBotcastShowRecoveryHost(db, "user-1", show.id, "candidate", { auxiliaryProviderFactory: localFactory(provider) });
    assert.equal(result.status, "declined");
    db.prepare("UPDATE botcast_shows SET premise = 'A materially different premise' WHERE id = ?").run(show.id);
    const rescreened = await screenBotcastShowHostRecovery(db, "user-1", show.id, { auxiliaryProviderFactory: localFactory(provider) });
    assert.equal(rescreened.candidates[0]?.status, "refused");
    assert.equal(provider.calls, 2);
  });
});

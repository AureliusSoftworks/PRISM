import test from "node:test";
import assert from "node:assert/strict";

import {
  queueBotAvatarAutosavePatch,
  takeBotAvatarAutosaveRequest,
  updateOwnedBotAvatarSnapshot,
  type BotAvatarAutosaveQueue,
} from "./botAvatarAutosaveQueue.ts";

test("keeps deferred autosave requests isolated by bot id", () => {
  const queue: BotAvatarAutosaveQueue = new Map();

  queueBotAvatarAutosavePatch(queue, "bot A/one", { color: "#aa0000" });
  const firstARequest = takeBotAvatarAutosaveRequest(queue, "bot A/one");
  assert.ok(firstARequest);

  // A is now conceptually in flight. Changes arriving for B and then A must
  // remain in their own keyed slots until each endpoint drains its own body.
  queueBotAvatarAutosavePatch(queue, "bot B/two", { glyph: "star" });
  queueBotAvatarAutosavePatch(queue, "bot A/one", { faceEyeScale: 112 });

  const bRequest = takeBotAvatarAutosaveRequest(queue, "bot B/two");
  const secondARequest = takeBotAvatarAutosaveRequest(queue, "bot A/one");
  assert.ok(bRequest);
  assert.ok(secondARequest);

  assert.equal(firstARequest.endpoint, "/api/bots/bot%20A%2Fone");
  assert.equal(firstARequest.body, JSON.stringify({ color: "#aa0000" }));
  assert.equal(bRequest.endpoint, "/api/bots/bot%20B%2Ftwo");
  assert.equal(bRequest.body, JSON.stringify({ glyph: "star" }));
  assert.equal(secondARequest.endpoint, "/api/bots/bot%20A%2Fone");
  assert.equal(secondARequest.body, JSON.stringify({ faceEyeScale: 112 }));
});

test("does not apply a completed autosave to another bot's pristine snapshot", () => {
  const botBSnapshot = { botId: "bot-b", color: "#0000bb" };
  const result = updateOwnedBotAvatarSnapshot(
    botBSnapshot,
    "bot-a",
    (snapshot) => ({ ...snapshot, color: "#aa0000" })
  );

  assert.strictEqual(result, botBSnapshot);
  assert.equal(result?.color, "#0000bb");
});

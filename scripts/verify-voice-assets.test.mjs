import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyVoiceAssets } from "./verify-voice-assets.mjs";

test("commercial voice assets and the Voice+ candidate stay pinned", async () => {
  const manifest = await verifyVoiceAssets();
  const candidate = manifest.qualificationCandidates.find(
    (entry) => entry.id === "chatterbox-turbo-onnx-q4",
  );
  assert.ok(candidate);
  assert.equal(
    candidate.sourceRevision,
    "d21799bd0354adb85e348b8a0442a8405110a2cf",
  );
  assert.equal(candidate.requiredFiles.length, 13);
});

test("explicit Voice+ qualification stays blocked until every target is qualified", async () => {
  await assert.rejects(
    verifyVoiceAssets({ requireVoicePlus: true }),
    /Voice\+ release gate is blocked/u,
  );
});

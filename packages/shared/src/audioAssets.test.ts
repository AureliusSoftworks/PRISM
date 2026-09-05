import assert from "node:assert/strict";
import test from "node:test";
import {
  decideAudioReuseV1,
  type AudioAssetV1,
  type AudioNeedV1,
} from "./audioAssets.ts";

function asset(
  id: string,
  semanticRole: string,
  automaticTags: string[],
  scope: AudioAssetV1["scope"] = "universal",
): AudioAssetV1 {
  return {
    version: 1,
    id,
    category: "effects",
    scope,
    status: "accepted",
    source: "generated",
    title: id,
    description: "",
    semanticRole,
    automaticTags,
    playerTags: [],
    context: {},
    safety: "nonsemantic",
    contentSha256: null,
    technical: {
      mimeType: "audio/mpeg",
      byteSize: 10,
      durationMs: 1_200,
      sampleRateHz: null,
      channels: null,
      loopable: false,
    },
    provenance: {
      applet: "whodunnit",
      provider: "elevenlabs",
      model: "eleven_text_to_sound_v2",
      promptContractHash: null,
      createdAt: "2026-08-28T00:00:00.000Z",
    },
    usageCount: 0,
    lastAccessedAt: null,
  };
}

const paperFoldNeed: AudioNeedV1 = {
  version: 1,
  category: "effects",
  semanticRole: "paper_fold",
  requiredTags: ["paper", "fold"],
  preferredTags: ["envelope"],
  allowedScopes: ["universal", "theme"],
  applet: "whodunnit",
  context: {},
  durationMs: { min: 400, max: 2_000 },
  loopable: false,
  stageCueAuthorized: false,
};

test("reuses only the exact safe paper-fold match", () => {
  const result = decideAudioReuseV1(paperFoldNeed, [
    asset("rustle", "paper_rustle", ["paper", "rustle"]),
    asset("door", "door_latch", ["wood", "latch"]),
    asset("fold", "paper_fold", ["paper", "fold", "envelope"]),
  ]);
  assert.equal(result.action, "reuse");
  assert.equal(result.assetId, "fold");
});

test("themed and identity matches require preview", () => {
  for (const scope of ["theme", "identity"] as const) {
    const result = decideAudioReuseV1(
      { ...paperFoldNeed, allowedScopes: [scope] },
      [asset(scope, "paper_fold", ["paper", "fold"], scope)],
    );
    assert.equal(result.action, "preview");
    assert.equal(result.assetId, scope);
  }
});

test("candidate and clue-bearing audio never auto-reuses", () => {
  const candidate = {
    ...asset("candidate", "paper_fold", ["paper", "fold"]),
    status: "candidate" as const,
  };
  const clue = {
    ...asset("clue", "paper_fold", ["paper", "fold"]),
    safety: "stage_cue_required" as const,
  };
  assert.equal(decideAudioReuseV1(paperFoldNeed, [candidate]).action, "generate");
  assert.equal(decideAudioReuseV1(paperFoldNeed, [clue]).action, "generate");
  assert.equal(
    decideAudioReuseV1(
      { ...paperFoldNeed, stageCueAuthorized: true },
      [clue],
    ).action,
    "preview",
  );
});


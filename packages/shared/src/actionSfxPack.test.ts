import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACTION_SFX_PACK_CLIP_COUNT,
  ACTION_SFX_PACK_KINDS,
  ACTION_SFX_PACK_VARIANT_COUNT,
  actionSfxPackOwnerIdFor,
  buildActionSfxPackPrompt,
  isActionSfxPackKind,
  pickActionSfxPackVariantIndex,
} from "./actionSfxPack.ts";

describe("actionSfxPack", () => {
  it("covers seven kinds and twenty-one clips", () => {
    assert.equal(ACTION_SFX_PACK_KINDS.length, 7);
    assert.equal(ACTION_SFX_PACK_VARIANT_COUNT, 3);
    assert.equal(ACTION_SFX_PACK_CLIP_COUNT, 21);
    assert.equal(isActionSfxPackKind("laugh"), true);
    assert.equal(isActionSfxPackKind("yawn"), false);
  });

  it("flavors vocal prompts more strongly than bodily ones", () => {
    const laugh = buildActionSfxPackPrompt({
      kind: "laugh",
      variantIndex: 1,
      ownerLabel: "Mara",
      personaSnippet: "dry, wry, mid-register",
    });
    const fart = buildActionSfxPackPrompt({
      kind: "fart",
      variantIndex: 0,
      ownerLabel: "Mara",
    });
    assert.match(laugh, /Mara/u);
    assert.match(laugh, /dry, wry/u);
    assert.match(laugh, /never speak words/u);
    assert.match(fart, /Unique take 1 for Mara/u);
    assert.doesNotMatch(fart, /never speak words/u);
  });

  it("avoids repeating the last variant when possible", () => {
    const first = pickActionSfxPackVariantIndex({
      kind: "cough",
      state: { lastVariantByKind: {} },
      random: () => 0,
    });
    const second = pickActionSfxPackVariantIndex({
      kind: "cough",
      state: first.state,
      random: () => 0,
    });
    assert.notEqual(second.variantIndex, first.variantIndex);
  });

  it("resolves owner ids for bot and player packs", () => {
    assert.equal(actionSfxPackOwnerIdFor("player"), "player");
    assert.equal(actionSfxPackOwnerIdFor("bot", "bot-1"), "bot-1");
    assert.throws(() => actionSfxPackOwnerIdFor("bot", "  "));
  });
});

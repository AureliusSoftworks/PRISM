import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACTION_SFX_BODILY_KINDS,
  ACTION_SFX_PACK_CLIP_COUNT,
  ACTION_SFX_PACK_KINDS,
  ACTION_SFX_PACK_VARIANT_COUNT,
  ACTION_SFX_PACK_VERSION,
  actionSfxPackOwnerIdFor,
  actionSfxPackTtsSeed,
  buildActionSfxPackTtsText,
  isActionSfxBodilyKind,
  isActionSfxPackBodilyKind,
  isActionSfxPackKind,
  pickActionSfxPackVariantIndex,
} from "./actionSfxPack.ts";

describe("actionSfxPack", () => {
  it("covers four vocal kinds and twelve clips at pack v2", () => {
    assert.equal(ACTION_SFX_PACK_VERSION, 2);
    assert.equal(ACTION_SFX_PACK_KINDS.length, 4);
    assert.equal(ACTION_SFX_PACK_VARIANT_COUNT, 3);
    assert.equal(ACTION_SFX_PACK_CLIP_COUNT, 12);
    assert.equal(isActionSfxPackKind("laugh"), true);
    assert.equal(isActionSfxPackKind("fart"), false);
    assert.equal(isActionSfxPackKind("yawn"), false);
    assert.deepEqual([...ACTION_SFX_BODILY_KINDS], ["fart", "burp", "cough"]);
    assert.equal(isActionSfxBodilyKind("cough"), true);
    assert.equal(isActionSfxPackBodilyKind("laugh"), false);
  });

  it("builds short ElevenLabs audio-tag TTS text per vocal take", () => {
    assert.equal(
      buildActionSfxPackTtsText({ kind: "laugh", variantIndex: 0 }),
      "[laughs] ha",
    );
    assert.equal(
      buildActionSfxPackTtsText({ kind: "laugh", variantIndex: 1 }),
      "[laughs softly] heh",
    );
    assert.equal(
      buildActionSfxPackTtsText({ kind: "throat_clear", variantIndex: 0 }),
      "[clears throat] ahem",
    );
    assert.match(
      buildActionSfxPackTtsText({ kind: "gasp", variantIndex: 2 }),
      /^\[[^\]]+\]\s+\S+$/u,
    );
    // Carrier must survive tag stripping so ElevenLabs does not reject empty text.
    for (const kind of ACTION_SFX_PACK_KINDS) {
      for (let variantIndex = 0; variantIndex < 3; variantIndex += 1) {
        const text = buildActionSfxPackTtsText({ kind, variantIndex });
        const withoutTags = text.replace(/\[[^\]]+\]/gu, " ").replace(/\s+/gu, " ").trim();
        assert.ok(withoutTags.length > 0, `${kind}:${variantIndex} needs carrier`);
      }
    }
  });

  it("derives a stable non-negative TTS seed", () => {
    const a = actionSfxPackTtsSeed({
      ownerId: "bot-1",
      kind: "sigh",
      variantIndex: 1,
      packGenerationId: "abc",
    });
    const b = actionSfxPackTtsSeed({
      ownerId: "bot-1",
      kind: "sigh",
      variantIndex: 1,
      packGenerationId: "abc",
    });
    const c = actionSfxPackTtsSeed({
      ownerId: "bot-1",
      kind: "sigh",
      variantIndex: 2,
      packGenerationId: "abc",
    });
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.ok(a >= 0);
  });

  it("avoids repeating the last variant when possible", () => {
    const first = pickActionSfxPackVariantIndex({
      kind: "laugh",
      state: { lastVariantByKind: {} },
      random: () => 0,
    });
    const second = pickActionSfxPackVariantIndex({
      kind: "laugh",
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

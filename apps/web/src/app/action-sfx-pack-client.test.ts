import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  actionSfxPackClipUrl,
  resetActionSfxPackClientStateForTests,
  resolveActionSfxPackOwnerId,
} from "./action-sfx-pack-client.ts";
import {
  buildBundledActionSfxPlan,
  coffeeActionReactionKindForAction,
} from "./coffee-action-sfx.ts";

describe("action-sfx-pack-client", () => {
  it("builds clip URLs and owner ids", () => {
    resetActionSfxPackClientStateForTests();
    assert.equal(resolveActionSfxPackOwnerId("player"), "player");
    assert.equal(resolveActionSfxPackOwnerId("bot", "bot-9"), "bot-9");
    const url = actionSfxPackClipUrl({
      origin: "http://localhost:3000",
      ownerKind: "bot",
      ownerId: "bot-9",
      kind: "laugh",
      variantIndex: 2,
    });
    assert.match(url, /\/api\/action-sfx-pack\/clip/u);
    assert.match(url, /ownerKind=bot/u);
    assert.match(url, /kind=laugh/u);
    assert.match(url, /variantIndex=2/u);
  });
});

describe("action sfx pack playback wiring", () => {
  it("classifies vocal fancy-action kinds for Coffee/Signal planners", () => {
    assert.equal(coffeeActionReactionKindForAction("laughs"), "laugh");
    assert.equal(coffeeActionReactionKindForAction("sighs"), "sigh");
    assert.equal(coffeeActionReactionKindForAction("gasps"), "gasp");
    assert.equal(
      coffeeActionReactionKindForAction("clears their throat"),
      "throat_clear",
    );
    assert.deepEqual(buildBundledActionSfxPlan("*laughs*"), {
      kind: "laugh",
      revealAtDisplayLength: 0,
    });
    assert.deepEqual(buildBundledActionSfxPlan("*clears throat*"), {
      kind: "throat_clear",
      revealAtDisplayLength: 0,
    });
  });

  it("wires magic button + pack owner playback into page and Signal cut", () => {
    const page = readFileSync(
      fileURLToPath(new URL("./page.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(page, /ActionSfxPackMagicButton/u);
    assert.match(page, /ownerKind="player"/u);
    assert.match(page, /ownerKind: "player"/u);
    assert.match(page, /packOwnerId=\{actionSfxPackBotId\}/u);
    assert.doesNotMatch(page, /packOwnerId=\{scheduleKey\}/u);

    const magic = readFileSync(
      fileURLToPath(new URL("./ActionSfxPackMagicButton.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(magic, /data-action-sfx-pack-sample="true"/u);
    assert.match(magic, /actionSfxPackClipUrl/u);
    assert.match(magic, /Choose a vocal action pack clip to sample/u);
    assert.match(magic, /Generate vocal action pack/u);
    assert.match(magic, /hasPremiumVoice/u);
    assert.match(magic, /ACTION_SFX_PACK_KIND_LABELS/u);
    assert.match(magic, /ACTION_SFX_PACK_CLIP_COUNT/u);
    assert.doesNotMatch(magic, /\bfart\b/u);

    const cut = readFileSync(
      fileURLToPath(new URL("./signalStudioCutAudio.ts", import.meta.url)),
      "utf8",
    );
    assert.match(cut, /resolveActionSfxPackPlayback/u);
    assert.match(cut, /isActionSfxPackKind\(actionKind\)/u);
    assert.match(cut, /resolveBodilyActionSfxPlayback/u);
    assert.match(cut, /throat_clear/u);

    const tutorial = readFileSync(
      fileURLToPath(new URL("./modeTutorials.ts", import.meta.url)),
      "utf8",
    );
    assert.match(tutorial, /vocal Action pack/u);
    assert.match(tutorial, /Premium ElevenLabs voice/u);
    assert.match(tutorial, /bodily Foley/u);
    assert.match(tutorial, /Corporality/u);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCoffeeActionSfxPlan,
  coffeeActionSfxGate,
  coffeeActionSfxIsEligible,
  coffeeActionSfxKindForAction,
  type CoffeeActionSfxGateState,
} from "./coffee-action-sfx.ts";

describe("Coffee action sound effects", () => {
  it("recognizes only the small physical foley allowlist", () => {
    assert.equal(coffeeActionSfxKindForAction("pours coffee into her mug"), "coffee_pour");
    assert.equal(coffeeActionSfxKindForAction("stirs the coffee with a spoon"), "spoon_stir");
    assert.equal(coffeeActionSfxKindForAction("sets his cup down on the table"), "cup_set_down");
    assert.equal(coffeeActionSfxKindForAction("taps twice on the tabletop"), "table_knock");
    assert.equal(coffeeActionSfxKindForAction("takes a long sip"), null);
    assert.equal(coffeeActionSfxKindForAction("laughs and whispers"), null);
  });

  it("times one eligible effect to its visible stage-direction cue", () => {
    assert.deepEqual(
      buildCoffeeActionSfxPlan("That tracks. *sets the mug down on the table* Anyway—go on."),
      { kind: "cup_set_down", revealAtDisplayLength: 12 },
    );
    assert.equal(buildCoffeeActionSfxPlan("*smiles* Fair point."), null);
  });

  it("requires a genuinely online ElevenLabs Coffee context", () => {
    const eligible = {
      coffeeProvider: "openai",
      offlineProtectedBotPresent: false,
      voiceMode: "english",
      englishVoiceEngine: "elevenlabs",
      voiceEffectsEnabled: true,
      voiceVolume: 0.8,
      elevenLabsKeyAvailable: true,
    };
    assert.equal(coffeeActionSfxIsEligible(eligible), true);
    assert.equal(coffeeActionSfxIsEligible({ ...eligible, coffeeProvider: "local" }), false);
    assert.equal(
      coffeeActionSfxIsEligible({ ...eligible, offlineProtectedBotPresent: true }),
      false,
    );
    assert.equal(coffeeActionSfxIsEligible({ ...eligible, voiceEffectsEnabled: false }), false);
    assert.equal(coffeeActionSfxIsEligible({ ...eligible, elevenLabsKeyAvailable: false }), false);
  });

  it("applies global and per-effect fatigue protection", () => {
    const empty: CoffeeActionSfxGateState = {
      lastPlayedAtMs: null,
      lastPlayedAtMsByKind: {},
    };
    const first = coffeeActionSfxGate({ kind: "coffee_pour", nowMs: 10_000, state: empty });
    assert.equal(first.allowed, true);
    assert.equal(
      coffeeActionSfxGate({ kind: "table_knock", nowMs: 11_000, state: first.state }).allowed,
      false,
    );
    assert.equal(
      coffeeActionSfxGate({ kind: "table_knock", nowMs: 12_200, state: first.state }).allowed,
      true,
    );
    assert.equal(
      coffeeActionSfxGate({ kind: "coffee_pour", nowMs: 16_999, state: first.state }).allowed,
      false,
    );
  });
});

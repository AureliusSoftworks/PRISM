import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildCoffeeActionReactionPlan,
  buildCoffeeActionSfxPlan,
  coffeeActionCueTextForMessage,
  coffeeActionReactionKindForAction,
  coffeeActionSfxGate,
  coffeeActionSfxIsEligible,
  coffeeActionSfxKindForAction,
  resolveBundledCoffeeActionSfxPlayback,
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

  it("recognizes semantic action families instead of exact keywords only", () => {
    assert.equal(coffeeActionReactionKindForAction("nods twice toward Mara"), "nod");
    assert.equal(coffeeActionReactionKindForAction("shakes head to and fro"), "nod");
    assert.equal(coffeeActionReactionKindForAction("bobs his chin in agreement"), "nod");
    assert.equal(coffeeActionReactionKindForAction("flatulates discreetly"), "fart");
    assert.equal(coffeeActionReactionKindForAction("breaks wind"), "fart");
    assert.equal(coffeeActionReactionKindForAction("passes some gas"), "fart");
    assert.equal(coffeeActionReactionKindForAction("belches into one hand"), "burp");
    assert.equal(coffeeActionReactionKindForAction("eructates loudly"), "burp");
    assert.equal(coffeeActionReactionKindForAction("clears her throat"), "cough");
    assert.equal(coffeeActionReactionKindForAction("hacks twice"), "cough");
    assert.equal(coffeeActionReactionKindForAction("shakes the cocktail tin"), null);
  });

  it("times authored motion and bodily audio to their visible action cue", () => {
    assert.deepEqual(
      buildCoffeeActionReactionPlan("Agreed. *shakes his head to and fro* Next point."),
      { kind: "nod", revealAtDisplayLength: 7 },
    );
    assert.deepEqual(buildCoffeeActionSfxPlan("Well— *flatulates* excuse me."), {
      kind: "fart",
      revealAtDisplayLength: 5,
    });
    assert.equal(buildCoffeeActionSfxPlan("*nods twice* Yes."), null);
  });

  it("uses the saved player-action payload as the canonical replay cue", () => {
    const cueText = coffeeActionCueTextForMessage({
      content: "stale display text",
      coffeeUserAction: { action: "  shakes head to and fro  " },
    });
    assert.equal(cueText, "*shakes head to and fro*");
    assert.deepEqual(buildCoffeeActionReactionPlan(cueText), {
      kind: "nod",
      revealAtDisplayLength: 0,
    });
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
      kind: "coffee_pour" as const,
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
    assert.equal(
      coffeeActionSfxIsEligible({
        ...eligible,
        kind: "burp",
        coffeeProvider: "local",
        offlineProtectedBotPresent: true,
        englishVoiceEngine: "builtin",
        elevenLabsKeyAvailable: false,
      }),
      true,
    );
    assert.equal(
      coffeeActionSfxIsEligible({ ...eligible, kind: "cough", voiceMode: "mute" }),
      false,
    );
  });

  it("selects one of four bundled clips and varies physical playback pitch", () => {
    const lowValues = [0, 0];
    const low = resolveBundledCoffeeActionSfxPlayback(
      "fart",
      () => lowValues.shift() ?? 0,
    );
    assert.equal(low.source, "/audio/coffee/action-reactions/fart-01.mp3");
    assert.equal(low.playbackRate, 0.84);

    const highValues = [0.999_999, 0.999_999];
    const high = resolveBundledCoffeeActionSfxPlayback(
      "fart",
      () => highValues.shift() ?? 0,
    );
    assert.equal(high.source, "/audio/coffee/action-reactions/fart-04.mp3");
    assert.ok(high.playbackRate > 1.15 && high.playbackRate < 1.17);

    const coughValues = [0.5, 0];
    const cough = resolveBundledCoffeeActionSfxPlayback(
      "cough",
      () => coughValues.shift() ?? 0,
    );
    assert.equal(cough.source, "/audio/coffee/action-reactions/cough-03.mp3");
    assert.equal(cough.playbackRate, 0.9);
  });

  it("ships four non-empty clips for each bodily action family", () => {
    for (const family of ["fart", "burp", "cough"] as const) {
      for (let variant = 1; variant <= 4; variant += 1) {
        const source = new URL(
          `../../public/audio/coffee/action-reactions/${family}-0${variant}.mp3`,
          import.meta.url,
        );
        assert.ok(statSync(source).size > 1_000, `${family}-${variant} is empty`);
      }
    }
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

  it("wires authored action reactions into Coffee seats with reduced-motion CSS", () => {
    const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const cssSource = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
    assert.match(pageSource, /presentCoffeeAuthoredActionReactionOnce/u);
    assert.match(pageSource, /data-coffee-authored-action-reaction/u);
    assert.match(pageSource, /actor: message\.role === "user" \? "player" : "bot"/u);
    assert.match(
      pageSource,
      /coffeeAuthoredActionReaction\?\.actor === "player"/u,
    );
    assert.match(
      pageSource,
      /playCoffeeActionSfxOnce\(\s*"live",\s*activeConversation\.id,\s*optimisticMessage/u,
    );
    assert.match(cssSource, /coffeeAuthoredActionNod/u);
    assert.match(cssSource, /coffeeAuthoredActionFart/u);
    assert.match(cssSource, /coffeeAuthoredActionBurp/u);
    assert.match(cssSource, /coffeeAuthoredActionCough/u);
    assert.match(
      cssSource,
      /coffeeReplayPlayerSeat\[data-coffee-authored-action-reaction="nod"\]/u,
    );
    assert.match(
      cssSource,
      /prefers-reduced-motion:[\s\S]*data-coffee-authored-action-reaction/u,
    );
  });
});

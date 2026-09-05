import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifySignalFancyActionV1,
  signalFancyActionCueText,
  signalFancyActionHostNoticeRuleV1,
  signalFancyActionReadHoldMs,
} from "./signalFancyAction.ts";

describe("signalFancyAction", () => {
  it("classifies disruptive bodily comedy with SFX and host notice", () => {
    assert.deepEqual(classifySignalFancyActionV1("farts"), {
      sfxKind: "fart",
      visualAction: null,
      avatarReaction: null,
      hostNotice: "disruptive",
    });
    assert.deepEqual(classifySignalFancyActionV1("burps loudly"), {
      sfxKind: "burp",
      visualAction: null,
      avatarReaction: null,
      hostNotice: "disruptive",
    });
    assert.deepEqual(classifySignalFancyActionV1("coughs"), {
      sfxKind: "cough",
      visualAction: null,
      avatarReaction: null,
      hostNotice: "mild",
    });
    assert.equal(
      classifySignalFancyActionV1("clears throat")?.sfxKind,
      "throat_clear",
    );
    assert.equal(classifySignalFancyActionV1("laughs")?.sfxKind, "laugh");
    assert.equal(classifySignalFancyActionV1("sighs")?.hostNotice, "none");
    assert.equal(classifySignalFancyActionV1("gasps")?.sfxKind, "gasp");
  });

  it("keeps ambient gestures visual-only for the host", () => {
    assert.deepEqual(classifySignalFancyActionV1("nods"), {
      sfxKind: null,
      visualAction: "nod",
      avatarReaction: "nod",
      hostNotice: "none",
    });
    assert.deepEqual(classifySignalFancyActionV1("leans in"), {
      sfxKind: null,
      visualAction: "lean_in",
      avatarReaction: "lean_in",
      hostNotice: "none",
    });
    assert.deepEqual(classifySignalFancyActionV1("leans back"), {
      sfxKind: null,
      visualAction: "lean_back",
      avatarReaction: "head_tilt",
      hostNotice: "none",
    });
    assert.deepEqual(classifySignalFancyActionV1("shakes head"), {
      sfxKind: null,
      visualAction: "shake_head",
      avatarReaction: "head_tilt",
      hostNotice: "none",
    });
  });

  it("returns a none-notice freeform cue without effects", () => {
    assert.deepEqual(classifySignalFancyActionV1("adjusts the mic"), {
      sfxKind: null,
      visualAction: null,
      avatarReaction: null,
      hostNotice: "none",
    });
    assert.equal(classifySignalFancyActionV1(""), null);
    assert.equal(classifySignalFancyActionV1(null), null);
  });

  it("builds cue text and read-hold timing for action-only turns", () => {
    assert.equal(signalFancyActionCueText("farts"), "*farts*");
    assert.equal(signalFancyActionCueText("  "), null);
    assert.equal(signalFancyActionReadHoldMs("nods"), 1_800);
    assert.equal(signalFancyActionReadHoldMs("leans toward the mic carefully"), 2_000);
  });

  it("returns host notice rules for each tier", () => {
    assert.match(
      signalFancyActionHostNoticeRuleV1("disruptive") ?? "",
      /fart or burp/u,
    );
    assert.match(
      signalFancyActionHostNoticeRuleV1("mild") ?? "",
      /cough/u,
    );
    assert.match(
      signalFancyActionHostNoticeRuleV1("none") ?? "",
      /stage-only/u,
    );
  });
});

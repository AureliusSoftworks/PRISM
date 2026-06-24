import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveZenLineDisplayPlacements,
  resolveZenMessageDisplayPlacement,
  resolveZenTextEffectSpans,
  resolveZenToneSpaceFromAnnoyance,
} from "./zenToneText.ts";
import { tokenizeChatRevealText } from "./chatRevealTiming.ts";
import {
  resolveCurrentZenActionCue,
  resolveZenActionPresentation,
  resolveZenActionPreview,
} from "./zenActions.ts";

function spansFor(text: string): ReturnType<typeof resolveZenTextEffectSpans> {
  return resolveZenTextEffectSpans(tokenizeChatRevealText(text));
}

describe("resolveZenToneSpaceFromAnnoyance", () => {
  it("keeps baseline annoyance at the closest spacing", () => {
    assert.equal(resolveZenToneSpaceFromAnnoyance(0), 0);
    assert.equal(resolveZenToneSpaceFromAnnoyance(0.12), 0);
  });

  it("opens spacing as annoyance rises", () => {
    assert.equal(resolveZenToneSpaceFromAnnoyance(0.82), 1);
    assert.equal(resolveZenToneSpaceFromAnnoyance(1), 1);
    assert.equal(resolveZenToneSpaceFromAnnoyance(0.47), 0.5);
  });
});

describe("resolveZenLineDisplayPlacements", () => {
  it("automatically centers the final line of a short ellipsis setup", () => {
    const placements = resolveZenLineDisplayPlacements({
      content: "...\n\n...What?",
      hasFencedCodeBlock: false,
    });
    assert.deepEqual(placements, [
      { index: 0, x: 0.5, y: 0.24, align: "center", source: "automatic" },
      { index: 2, x: 0.5, y: 0.5, align: "center", source: "automatic" },
    ]);
  });

  it("does not place long prose or code blocks automatically", () => {
    assert.deepEqual(
      resolveZenLineDisplayPlacements({
        content: "...\n\nThis is a longer ordinary paragraph with too many words to stage dramatically.",
        hasFencedCodeBlock: false,
      }),
      []
    );
    assert.deepEqual(
      resolveZenLineDisplayPlacements({
        content: "...\n\n...What?",
        hasFencedCodeBlock: true,
      }),
      []
    );
  });

  it("uses explicit metadata placements before automatic inference", () => {
    const placements = resolveZenLineDisplayPlacements({
      content: "...\n\n...What?",
      hasFencedCodeBlock: false,
      zenDisplay: {
        v: 1,
        lines: [{ index: 2, x: 0.25, y: 0.7, align: "end" }],
      },
    });
    assert.deepEqual(placements, [
      { index: 2, x: 0.25, y: 0.7, align: "end", source: "metadata" },
    ]);
  });
});

describe("resolveZenMessageDisplayPlacement", () => {
  it("normalizes incomplete message placement with centered defaults", () => {
    assert.deepEqual(
      resolveZenMessageDisplayPlacement({
        v: 1,
        placement: { y: 0.66 },
      }),
      { x: 0.5, y: 0.66, align: "center", source: "metadata" }
    );
  });
});

describe("resolveZenTextEffectSpans", () => {
  it("classifies impact and question phrase spans", () => {
    assert.deepEqual(spansFor("Look out!"), [
      { effect: "impact", startTokenIndex: 0, endTokenIndex: 2 },
    ]);
    assert.deepEqual(spansFor("How are you, today?"), [
      { effect: "question", startTokenIndex: 3, endTokenIndex: 4 },
    ]);
  });

  it("keeps one effect per sentence and expands same-kind lexical pairs", () => {
    assert.deepEqual(spansFor("Yes, I'm sure."), [
      { effect: "affirm", startTokenIndex: 0, endTokenIndex: 3 },
    ]);
    assert.deepEqual(spansFor("No, absolutely not."), [
      { effect: "negative", startTokenIndex: 0, endTokenIndex: 3 },
    ]);
  });

  it("prefers explicit action and whisper spans over punctuation and lexical matches", () => {
    assert.deepEqual(spansFor("yes, *duck!*"), [
      { effect: "action", startTokenIndex: 1, endTokenIndex: 2 },
    ]);
    assert.deepEqual(spansFor("yes (quiet!)"), [
      { effect: "whisper", startTokenIndex: 1, endTokenIndex: 2 },
    ]);
  });

  it("does not match partial words as affirmative or negative", () => {
    assert.deepEqual(spansFor("Yesterday, the notebook notion worked."), []);
    assert.deepEqual(spansFor("yes-ish is not yes."), [
      { effect: "negative", startTokenIndex: 2, endTokenIndex: 3 },
    ]);
  });

  it("ignores inline and fenced code tokens", () => {
    assert.deepEqual(spansFor("Say `yes!` now."), []);
    assert.deepEqual(spansFor("```\nyes!\n```"), []);
  });
});

describe("resolveZenActionPresentation", () => {
  it("turns action-only player text into a visible Zen beat", () => {
    const presentation = resolveZenActionPresentation("*looks at you inquisitively*");

    assert.equal(presentation.hasActions, true);
    assert.equal(presentation.actionOnly, true);
    assert.equal(presentation.mainText, "");
    assert.equal(presentation.cues.length, 1);
    assert.equal(presentation.cues[0]?.action, "looks at you inquisitively");
    assert.equal(presentation.cues[0]?.revealAtDisplayLength, 0);
    assert.equal(presentation.cues[0]?.motion, "glance");
  });

  it("strips a leading action from visible prose while preserving speech", () => {
    const presentation = resolveZenActionPresentation("*softly nods* I hear you.");

    assert.equal(presentation.hasActions, true);
    assert.equal(presentation.actionOnly, false);
    assert.equal(presentation.mainText, "I hear you.");
    assert.deepEqual(
      presentation.cues.map((cue) => cue.action),
      ["softly nods"]
    );
  });

  it("keeps multiple actions ordered and reveals later cues after enough prose", () => {
    const presentation = resolveZenActionPresentation(
      "*takes a breath* I'm here. *sets the cup down*"
    );

    assert.equal(presentation.mainText, "I'm here.");
    assert.deepEqual(
      presentation.cues.map((cue) => cue.action),
      ["takes a breath", "sets the cup down"]
    );
    assert.equal(resolveCurrentZenActionCue(presentation.cues, 0)?.action, "takes a breath");
    assert.equal(
      resolveCurrentZenActionCue(presentation.cues, Number.POSITIVE_INFINITY)?.action,
      "sets the cup down"
    );
  });

  it("keeps inline emphasis as prose when it is not an action", () => {
    const presentation = resolveZenActionPresentation("The *thought* that counts is yours.");

    assert.equal(presentation.hasActions, false);
    assert.equal(presentation.actionOnly, false);
    assert.equal(presentation.mainText, "The *thought* that counts is yours.");
    assert.deepEqual(presentation.cues, []);
  });

  it("previews composer actions without treating commands as action drafts", () => {
    assert.equal(resolveZenActionPreview("*looks around*")?.action, "looks around");
    assert.equal(resolveZenActionPreview("/nvm *looks around*"), null);
    assert.equal(resolveZenActionPreview("!prompt *looks around*"), null);
  });
});

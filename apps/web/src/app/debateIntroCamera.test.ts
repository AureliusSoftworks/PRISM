import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEBATE_INTRO_WIDE_HOLD_MS,
  DEBATE_MODERATOR_BREATH_WIDE_MS,
  DEBATE_MODERATOR_MONOLOGUE_MIN_CHARS,
  debateEventIsModeratorIntro,
  debateEventIsModeratorMonologue,
  debateIntroAdvocateCues,
  debateModeratorBreathCues,
  resolveDebateModeratorCameraView,
} from "./debateIntroCamera.ts";

describe("Debate intro camera choreography", () => {
  const content =
    "This Debate is called to order on: Free coffee for all. " +
    "Ava argues For; Blake argues Against. The proceeding may begin.";

  it("orders advocate cues by first name mention", () => {
    assert.deepEqual(
      debateIntroAdvocateCues({
        content,
        forName: "Ava",
        againstName: "Blake",
      }),
      [
        {
          kind: "advocate",
          side: "for",
          view: "left",
          offset: content.indexOf("Ava"),
        },
        {
          kind: "advocate",
          side: "against",
          view: "right",
          offset: content.indexOf("Blake"),
        },
      ],
    );
  });

  it("recognizes moderator intro and broader monologue events", () => {
    assert.equal(
      debateEventIsModeratorIntro({
        kind: "intro",
        speakerKind: "moderator",
        stepKey: "intro",
      }),
      true,
    );
    assert.equal(
      debateEventIsModeratorMonologue({
        kind: "speech",
        speakerKind: "moderator",
        stepKey: "resume",
        content: "Welcome back. Let us continue where we left off.",
      }),
      true,
    );
    assert.equal(
      debateEventIsModeratorMonologue({
        kind: "speech",
        speakerKind: "advocate",
        stepKey: "opening_for",
        content: "A".repeat(DEBATE_MODERATOR_MONOLOGUE_MIN_CHARS + 20),
      }),
      false,
    );
  });

  it("starts on the moderator, then Wide → advocate as each name is heard", () => {
    const forOffset = content.indexOf("Ava");
    const againstOffset = content.indexOf("Blake");

    assert.equal(
      resolveDebateModeratorCameraView({
        content,
        visibleLength: 12,
        forName: "Ava",
        againstName: "Blake",
        nowMs: 1_000,
        wideHoldStartedAtMs: null,
        focusedSide: null,
      }).view,
      "moderator",
    );

    const firstWide = resolveDebateModeratorCameraView({
      content,
      visibleLength: forOffset + 1,
      forName: "Ava",
      againstName: "Blake",
      nowMs: 2_000,
      wideHoldStartedAtMs: null,
      focusedSide: null,
    });
    assert.equal(firstWide.view, "wide");
    assert.equal(firstWide.focusedSide, "for");

    const forClose = resolveDebateModeratorCameraView({
      content,
      visibleLength: forOffset + 8,
      forName: "Ava",
      againstName: "Blake",
      nowMs: 2_000 + DEBATE_INTRO_WIDE_HOLD_MS,
      wideHoldStartedAtMs: firstWide.wideHoldStartedAtMs,
      focusedSide: firstWide.focusedSide,
    });
    assert.equal(forClose.view, "left");

    const secondWide = resolveDebateModeratorCameraView({
      content,
      visibleLength: againstOffset + 1,
      forName: "Ava",
      againstName: "Blake",
      nowMs: 4_000,
      wideHoldStartedAtMs: forClose.wideHoldStartedAtMs,
      focusedSide: forClose.focusedSide,
    });
    assert.equal(secondWide.view, "wide");
    assert.equal(secondWide.focusedSide, "against");

    const againstClose = resolveDebateModeratorCameraView({
      content,
      visibleLength: againstOffset + 10,
      forName: "Ava",
      againstName: "Blake",
      nowMs: 4_000 + DEBATE_INTRO_WIDE_HOLD_MS,
      wideHoldStartedAtMs: secondWide.wideHoldStartedAtMs,
      focusedSide: secondWide.focusedSide,
    });
    assert.equal(againstClose.view, "right");
  });

  it("returns to the moderator before the intro finishes", () => {
    const late = Math.floor(content.length * 0.9);
    assert.equal(
      resolveDebateModeratorCameraView({
        content,
        visibleLength: late,
        forName: "Ava",
        againstName: "Blake",
        nowMs: 9_000,
        wideHoldStartedAtMs: 4_000,
        focusedSide: "against",
      }).view,
      "moderator",
    );
  });

  it("takes Wide breaths on long moderator prose without advocate names", () => {
    const monologue =
      "Welcome back everyone. The chamber is restored and the held floor " +
      "remains yours when we continue. Keep the argument sharp, stay with " +
      "the frozen record, and do not invent evidence while we resume.";
    assert.ok(monologue.length >= DEBATE_MODERATOR_MONOLOGUE_MIN_CHARS);
    assert.equal(debateModeratorBreathCues(monologue).length >= 1, true);

    const breathOffset = debateModeratorBreathCues(monologue)[0]!.offset;
    const wide = resolveDebateModeratorCameraView({
      content: monologue,
      visibleLength: breathOffset + 1,
      forName: "Ava",
      againstName: "Blake",
      nowMs: 3_000,
      wideHoldStartedAtMs: null,
      focusedSide: null,
    });
    assert.equal(wide.view, "wide");
    assert.equal(wide.focusedSide, `breath:${breathOffset}`);

    const back = resolveDebateModeratorCameraView({
      content: monologue,
      visibleLength: breathOffset + 20,
      forName: "Ava",
      againstName: "Blake",
      nowMs: 3_000 + DEBATE_MODERATOR_BREATH_WIDE_MS,
      wideHoldStartedAtMs: wide.wideHoldStartedAtMs,
      focusedSide: wide.focusedSide,
    });
    assert.equal(back.view, "moderator");
  });

  it("stays on the moderator when names are missing from a short line", () => {
    assert.equal(
      resolveDebateModeratorCameraView({
        content: "The proceeding is called to order.",
        visibleLength: 20,
        forName: "Ava",
        againstName: "Blake",
        nowMs: 1_000,
        wideHoldStartedAtMs: null,
        focusedSide: null,
      }).view,
      "moderator",
    );
  });
});

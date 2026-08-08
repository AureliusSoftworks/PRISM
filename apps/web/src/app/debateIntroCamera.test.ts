import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEBATE_INTRO_WIDE_HOLD_MS,
  DEBATE_INTRO_MIN_CLOSE_BEFORE_ADVANCE_MS,
  DEBATE_MODERATOR_BREATH_WIDE_MS,
  DEBATE_MODERATOR_MONOLOGUE_MIN_CHARS,
  debateEventIsModeratorIntro,
  debateEventIsModeratorMonologue,
  debateIntroAdvocateCues,
  debateIntroNameArmOffset,
  debateIntroPreferredNameOffset,
  debateModeratorBreathCues,
  resolveDebateModeratorCameraView,
} from "./debateIntroCamera.ts";

describe("Debate intro camera choreography", () => {
  const docketOnly =
    "This Debate is called to order on: Free coffee for all. " +
    "Ava argues For; Blake argues Against. The proceeding may begin.";

  const withProfiles =
    "This Debate is called to order on: Free coffee for all. " +
    "Ava argues For; Blake argues Against. The proceeding may begin. " +
    "Tonight Ava brings a sharp practical case, while Blake answers with " +
    "tradition and craft. Keep the arguments sharp, stay with the frozen " +
    "record, and do not invent evidence while the chamber settles into the " +
    "first round.";

  it("prefers post-docket profile name mentions over the first roll call", () => {
    const forOffset = debateIntroPreferredNameOffset(withProfiles, "Ava");
    const againstOffset = debateIntroPreferredNameOffset(withProfiles, "Blake");
    assert.ok(forOffset != null && forOffset > withProfiles.indexOf("Ava"));
    assert.ok(
      againstOffset != null && againstOffset > withProfiles.indexOf("Blake"),
    );
    assert.deepEqual(
      debateIntroAdvocateCues({
        content: withProfiles,
        forName: "Ava",
        againstName: "Blake",
      }),
      [
        {
          kind: "advocate",
          side: "for",
          view: "left",
          offset: forOffset,
          armOffset: debateIntroNameArmOffset(forOffset!, "Ava"),
        },
        {
          kind: "advocate",
          side: "against",
          view: "right",
          offset: againstOffset,
          armOffset: debateIntroNameArmOffset(againstOffset!, "Blake"),
        },
      ],
    );
  });

  it("skips advocate cuts for a docket-only roll call", () => {
    assert.deepEqual(
      debateIntroAdvocateCues({
        content: docketOnly,
        forName: "Ava",
        againstName: "Blake",
      }),
      [],
    );
    assert.equal(
      resolveDebateModeratorCameraView({
        content: docketOnly,
        visibleLength: docketOnly.length,
        forName: "Ava",
        againstName: "Blake",
        nowMs: 2_000,
        wideHoldStartedAtMs: null,
        focusedSide: null,
      }).view,
      "moderator",
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

  it("starts on the moderator, then Wide → advocate as each profile name is heard", () => {
    const forCue = debateIntroAdvocateCues({
      content: withProfiles,
      forName: "Ava",
      againstName: "Blake",
    })[0]!;
    const againstCue = debateIntroAdvocateCues({
      content: withProfiles,
      forName: "Ava",
      againstName: "Blake",
    })[1]!;

    assert.equal(
      resolveDebateModeratorCameraView({
        content: withProfiles,
        visibleLength: 12,
        forName: "Ava",
        againstName: "Blake",
        nowMs: 1_000,
        wideHoldStartedAtMs: null,
        focusedSide: null,
      }).view,
      "moderator",
    );

    // Docket listing — stay with the moderator.
    assert.equal(
      resolveDebateModeratorCameraView({
        content: withProfiles,
        visibleLength: docketOnly.indexOf("Ava") + 1,
        forName: "Ava",
        againstName: "Blake",
        nowMs: 1_500,
        wideHoldStartedAtMs: null,
        focusedSide: null,
      }).view,
      "moderator",
    );

    // Name started but not yet armed — still moderator.
    assert.equal(
      resolveDebateModeratorCameraView({
        content: withProfiles,
        visibleLength: forCue.offset + 1,
        forName: "Ava",
        againstName: "Blake",
        nowMs: 1_800,
        wideHoldStartedAtMs: null,
        focusedSide: null,
      }).view,
      "moderator",
    );

    const firstWide = resolveDebateModeratorCameraView({
      content: withProfiles,
      visibleLength: forCue.armOffset,
      forName: "Ava",
      againstName: "Blake",
      nowMs: 2_000,
      wideHoldStartedAtMs: null,
      focusedSide: null,
    });
    assert.equal(firstWide.view, "wide");
    assert.equal(firstWide.focusedSide, "for");

    const forClose = resolveDebateModeratorCameraView({
      content: withProfiles,
      visibleLength: forCue.armOffset + 8,
      forName: "Ava",
      againstName: "Blake",
      nowMs: 2_000 + DEBATE_INTRO_WIDE_HOLD_MS,
      wideHoldStartedAtMs: firstWide.wideHoldStartedAtMs,
      focusedSide: firstWide.focusedSide,
    });
    assert.equal(forClose.view, "left");

    // Reveal already past Against — queue still finishes For first.
    const stillFor = resolveDebateModeratorCameraView({
      content: withProfiles,
      visibleLength: againstCue.armOffset + 4,
      forName: "Ava",
      againstName: "Blake",
      nowMs: 2_000 + DEBATE_INTRO_WIDE_HOLD_MS + 200,
      wideHoldStartedAtMs: forClose.wideHoldStartedAtMs,
      focusedSide: forClose.focusedSide,
    });
    assert.equal(stillFor.view, "left");
    assert.equal(stillFor.focusedSide, "for");

    const secondWide = resolveDebateModeratorCameraView({
      content: withProfiles,
      visibleLength: againstCue.armOffset + 4,
      forName: "Ava",
      againstName: "Blake",
      nowMs:
        2_000 +
        DEBATE_INTRO_WIDE_HOLD_MS +
        DEBATE_INTRO_MIN_CLOSE_BEFORE_ADVANCE_MS,
      wideHoldStartedAtMs: forClose.wideHoldStartedAtMs,
      focusedSide: forClose.focusedSide,
    });
    // After For has dwelt and Against is armed, advance the queue.
    assert.equal(secondWide.view, "wide");
    assert.equal(secondWide.focusedSide, "against");

    const againstClose = resolveDebateModeratorCameraView({
      content: withProfiles,
      visibleLength: againstCue.armOffset + 10,
      forName: "Ava",
      againstName: "Blake",
      nowMs: (secondWide.wideHoldStartedAtMs ?? 0) + DEBATE_INTRO_WIDE_HOLD_MS,
      wideHoldStartedAtMs: secondWide.wideHoldStartedAtMs,
      focusedSide: secondWide.focusedSide,
    });
    assert.equal(againstClose.view, "right");
  });

  it("returns to the moderator before the intro finishes", () => {
    const againstCue = debateIntroAdvocateCues({
      content: withProfiles,
      forName: "Ava",
      againstName: "Blake",
    })[1]!;
    const late = Math.max(
      againstCue.armOffset + 40,
      Math.floor(withProfiles.length * 0.9),
    );
    const home = resolveDebateModeratorCameraView({
      content: withProfiles,
      visibleLength: late,
      forName: "Ava",
      againstName: "Blake",
      nowMs: 9_000 + DEBATE_INTRO_WIDE_HOLD_MS,
      wideHoldStartedAtMs: 9_000,
      focusedSide: "against",
    });
    assert.equal(home.view, "moderator");
    assert.equal(home.focusedSide, "complete");
  });

  it("does not flicker Wide after cutting home from the final introducee", () => {
    const againstCue = debateIntroAdvocateCues({
      content: withProfiles,
      forName: "Ava",
      againstName: "Blake",
    })[1]!;
    const late = Math.max(
      againstCue.armOffset + 40,
      Math.floor(withProfiles.length * 0.9),
    );
    const home = resolveDebateModeratorCameraView({
      content: withProfiles,
      visibleLength: late,
      forName: "Ava",
      againstName: "Blake",
      nowMs: 9_000 + DEBATE_INTRO_WIDE_HOLD_MS,
      wideHoldStartedAtMs: 9_000,
      focusedSide: "against",
    });
    assert.equal(home.focusedSide, "complete");

    const afterClear = resolveDebateModeratorCameraView({
      content: withProfiles,
      visibleLength: late + 8,
      forName: "Ava",
      againstName: "Blake",
      nowMs: 10_000,
      wideHoldStartedAtMs: null,
      focusedSide: null,
    });
    assert.equal(afterClear.view, "moderator");
    assert.equal(afterClear.focusedSide, "complete");

    const latched = resolveDebateModeratorCameraView({
      content: withProfiles,
      visibleLength: late + 20,
      forName: "Ava",
      againstName: "Blake",
      nowMs: 11_000,
      wideHoldStartedAtMs: null,
      focusedSide: "complete",
    });
    assert.equal(latched.view, "moderator");
    assert.equal(latched.focusedSide, "complete");
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
        content: "Welcome back. The floor is yours.",
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

  it("does not jump to Against when reveal races past both name offsets", () => {
    const cues = debateIntroAdvocateCues({
      content: withProfiles,
      forName: "Ava",
      againstName: "Blake",
    });
    const againstArm = cues[1]!.armOffset;
    const raced = resolveDebateModeratorCameraView({
      content: withProfiles,
      visibleLength: againstArm + 20,
      forName: "Ava",
      againstName: "Blake",
      nowMs: 5_000,
      wideHoldStartedAtMs: null,
      focusedSide: null,
    });
    // First armed cue in the queue is For, never Against first.
    assert.equal(raced.focusedSide, "for");
    assert.ok(raced.view === "wide" || raced.view === "left");
  });
});

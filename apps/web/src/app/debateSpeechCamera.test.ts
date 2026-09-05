import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  debateSpeakerCameraView,
  debateSpeechCoverageNextTickMs,
  resolveDebateSpeechCoverageView,
} from "./debateSpeechCamera.ts";

describe("Debate speech Auto coverage", () => {
  it("maps each floor holder to their close-up", () => {
    assert.equal(debateSpeakerCameraView("for"), "left");
    assert.equal(debateSpeakerCameraView("moderator"), "moderator");
    assert.equal(debateSpeakerCameraView("against"), "right");
  });

  it("stays on the speaker until a lingering close-up has earned a cut", () => {
    const content =
      "The chamber has heard this argument at length. We can see the whole floor. Then the advocate continues.";
    const args = {
      speakerRole: "for" as const,
      durationMs: 18_000,
      seed: "debate-line-1",
      content,
    };
    assert.equal(
      resolveDebateSpeechCoverageView({ ...args, elapsedMs: 1_200 }),
      null,
    );
    const enterMs = debateSpeechCoverageNextTickMs({
      elapsedMs: 0,
      durationMs: args.durationMs,
      seed: args.seed,
      content,
    });
    assert.ok(enterMs !== null && enterMs > 1_200);
    const later = resolveDebateSpeechCoverageView({
      ...args,
      elapsedMs: enterMs + 80,
    });
    assert.ok(later === "wide" || later === "right" || later === "moderator");
    assert.notEqual(later, "left");
  });

  it("glances at someone other than the speaking advocate", () => {
    const content =
      "This longer case keeps going. The other table can sit in frame. Then we return to the point.";
    const views = new Set(
      Array.from({ length: 20 }, (_, index) => {
        const seed = `against-line-${index}`;
        const enterMs = debateSpeechCoverageNextTickMs({
          elapsedMs: 0,
          durationMs: 18_000,
          seed,
          content,
        });
        if (enterMs == null) return null;
        return resolveDebateSpeechCoverageView({
          speakerRole: "against",
          elapsedMs: enterMs + 80,
          durationMs: 18_000,
          seed,
          content,
        });
      }),
    );
    views.delete(null);
    assert.equal(views.has("right"), false);
    assert.ok(views.has("wide") || views.has("left") || views.has("moderator"));
  });

  it("never treats Jury as a coverage glance", () => {
    const content =
      "The floor has heard enough of this close-up. Cut away from the speaker for a breath, then come back.";
    for (const speakerRole of ["for", "against", "moderator"] as const) {
      for (let index = 0; index < 24; index += 1) {
        const seed = `${speakerRole}-coverage-${index}`;
        const enterMs = debateSpeechCoverageNextTickMs({
          elapsedMs: 0,
          durationMs: 22_000,
          seed,
          content,
        });
        if (enterMs == null) continue;
        const view = resolveDebateSpeechCoverageView({
          speakerRole,
          elapsedMs: enterMs + 80,
          durationMs: 22_000,
          seed,
          content,
        });
        assert.notEqual(String(view), "jury");
        assert.ok(
          view === null ||
            view === "wide" ||
            view === "left" ||
            view === "moderator" ||
            view === "right",
        );
      }
    }
  });

  it("schedules a timer boundary for the next coverage enter or leave", () => {
    const remaining = debateSpeechCoverageNextTickMs({
      elapsedMs: 400,
      durationMs: 18_000,
      seed: "debate-timer",
      content: "A long enough speech. Another sentence. A close.",
    });
    assert.ok(remaining !== null && remaining > 0);
  });
});

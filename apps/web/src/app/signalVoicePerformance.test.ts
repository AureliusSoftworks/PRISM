import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  signalVoicePerformanceActionAtProgress,
  signalVoicePerformanceActionPresentationAtProgress,
  signalVoicePerformancePresentation,
  signalVoicePerformanceTranscriptText,
} from "./signalVoicePerformance.ts";

describe("Signal voice performance presentation", () => {
  it("keeps saved vocal reactions above the bot and out of the transcript", () => {
    const message = {
      content: "Welcome to the difficult part.",
      voicePerformanceText:
        "[sighs] Welcome to the difficult part. [laughs]",
    };
    assert.deepEqual(signalVoicePerformancePresentation(message), {
      actions: ["sighs", "laughs"],
      leadingActions: ["sighs"],
      trailingActions: ["laughs"],
      cues: [
        { action: "sighs", revealAtProgress: 0 },
        { action: "laughs", revealAtProgress: 1 },
      ],
      transcriptText: "Welcome to the difficult part.",
    });
    assert.equal(signalVoicePerformanceActionAtProgress(message, 0.1), "sighs");
    assert.equal(signalVoicePerformanceActionAtProgress(message, 0.99), "sighs");
    assert.equal(signalVoicePerformanceActionAtProgress(message, 1), "laughs");
  });

  it("replaces inline actions when the cleaned transcript reaches each cue", () => {
    const message = {
      content: "Look [gasp] at *scream* me! [dance]",
      voicePerformanceText: "Look [gasp] at [screams] me! [dance]",
    };
    assert.deepEqual(signalVoicePerformancePresentation(message), {
      actions: ["gasp", "scream", "dance"],
      leadingActions: [],
      trailingActions: ["dance"],
      cues: [
        { action: "gasp", revealAtProgress: 4 / 11 },
        { action: "scream", revealAtProgress: 7 / 11 },
        { action: "dance", revealAtProgress: 1 },
      ],
      transcriptText: "Look at me!",
    });
    assert.equal(signalVoicePerformanceTranscriptText(message), "Look at me!");
    assert.equal(signalVoicePerformanceActionAtProgress(message, 0.35), null);
    assert.equal(signalVoicePerformanceActionAtProgress(message, 4 / 11), "gasp");
    assert.equal(signalVoicePerformanceActionAtProgress(message, 0.6), "gasp");
    assert.equal(signalVoicePerformanceActionAtProgress(message, 7 / 11), "scream");
    assert.equal(signalVoicePerformanceActionAtProgress(message, 1), "dance");
  });

  it("surfaces arbitrary bracketed actions but rejects transcript-changing tags", () => {
    const actionMessage = {
      content: "Keep the transcript trustworthy.",
      voicePerformanceText: "[explosion] Keep the transcript trustworthy.",
    };
    assert.equal(
      signalVoicePerformanceTranscriptText(actionMessage),
      "Keep the transcript trustworthy.",
    );
    assert.equal(
      signalVoicePerformanceActionAtProgress(actionMessage, 0),
      "explosion",
    );
    assert.equal(
      signalVoicePerformancePresentation({
        content: "The canonical line.",
        voicePerformanceText: "[sighs] A different line.",
      }),
      null,
    );
  });

  it("shows a muted speaker's physical action over their avatar only", () => {
    const message = {
      content: "...",
      stageActionText: "leans back, slight smile",
      voicePerformanceText: null,
    };
    assert.deepEqual(signalVoicePerformancePresentation(message), {
      actions: ["leans back, slight smile"],
      leadingActions: ["leans back, slight smile"],
      trailingActions: [],
      cues: [{ action: "leans back, slight smile", revealAtProgress: 0 }],
      transcriptText: "...",
    });
    assert.equal(
      signalVoicePerformanceTranscriptText(message),
      "...",
    );
    assert.equal(
      signalVoicePerformanceActionAtProgress(message, 0.5),
      "leans back, slight smile",
    );
  });

  it("keeps the latest reached action mounted until it is replaced", () => {
    const message = {
      content: "One *gasp* two *scream* three.",
      voicePerformanceText: "One [gasps] two [screams] three.",
    };
    assert.equal(
      signalVoicePerformanceActionPresentationAtProgress(message, 0.1),
      null,
    );
    assert.deepEqual(
      signalVoicePerformanceActionPresentationAtProgress(message, 0.4),
      { action: "gasp", opacity: 1, phase: "holding" },
    );
    assert.deepEqual(
      signalVoicePerformanceActionPresentationAtProgress(message, 0.75),
      { action: "scream", opacity: 1, phase: "holding" },
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  signalVoicePerformanceActionAtProgress,
  signalVoicePerformanceActionPresentationAtProgress,
  signalVoicePerformancePresentation,
  signalVoicePerformanceTranscriptText,
} from "./signalVoicePerformance.ts";

describe("Signal voice performance presentation", () => {
  it("shows saved vocal reactions as literal transcript actions", () => {
    const message = {
      content: "Welcome to the difficult part.",
      voicePerformanceText:
        "[sighs] Welcome to the difficult part. [laughs]",
    };
    assert.deepEqual(signalVoicePerformancePresentation(message), {
      actions: ["sighs", "laughs"],
      leadingActions: ["sighs"],
      trailingActions: ["laughs"],
      transcriptText: "*sighs* Welcome to the difficult part. *laughs*",
    });
    assert.equal(signalVoicePerformanceActionAtProgress(message, 0.1), "sighs");
    assert.equal(signalVoicePerformanceActionAtProgress(message, 0.9), "laughs");
  });

  it("does not surface unsupported or transcript-changing tags", () => {
    assert.equal(
      signalVoicePerformanceTranscriptText({
        content: "Keep the transcript trustworthy.",
        voicePerformanceText: "[explosion] Keep the transcript trustworthy.",
      }),
      "Keep the transcript trustworthy.",
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

  it("keeps action text mounted through a gradual entrance, hold, and exit", () => {
    const message = {
      content: "A line with one performed reaction.",
      voicePerformanceText: "[sighs] A line with one performed reaction.",
    };
    assert.deepEqual(
      signalVoicePerformanceActionPresentationAtProgress(message, 0),
      { action: "sighs", opacity: 0, phase: "entering" },
    );
    assert.deepEqual(
      signalVoicePerformanceActionPresentationAtProgress(message, 0.4),
      { action: "sighs", opacity: 1, phase: "holding" },
    );
    assert.deepEqual(
      signalVoicePerformanceActionPresentationAtProgress(message, 1),
      { action: "sighs", opacity: 0, phase: "exiting" },
    );
  });

  it("gives every saved action its own full fade envelope", () => {
    const message = {
      content: "Two beats live on the same line.",
      voicePerformanceText: "[sighs] Two beats live on the same line. [laughs]",
    };
    assert.deepEqual(
      signalVoicePerformanceActionPresentationAtProgress(message, 0.25),
      { action: "sighs", opacity: 1, phase: "holding" },
    );
    assert.deepEqual(
      signalVoicePerformanceActionPresentationAtProgress(message, 0.5),
      { action: "laughs", opacity: 0, phase: "entering" },
    );
    assert.equal(
      signalVoicePerformanceActionPresentationAtProgress(message, 0.75)
        ?.opacity,
      1,
    );
  });
});

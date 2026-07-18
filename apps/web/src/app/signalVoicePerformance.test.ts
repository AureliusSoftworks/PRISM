import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  signalVoicePerformanceActionAtProgress,
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
});

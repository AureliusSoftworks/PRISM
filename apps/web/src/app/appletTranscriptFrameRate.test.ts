import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { annotateAppletTranscriptFrameRates } from "./appletTranscriptFrameRate.ts";

describe("applet transcript frame-rate metadata", () => {
  it("places a persisted frame sample beside the matching message timestamp", () => {
    const transcript = [
      "## Transcript",
      "",
      "### Turn 01",
      "",
      "- Message ID: message-1",
      "- Recorded: 2026-08-14T19:00:00.000Z",
      "- Turn routing: human-authored",
      "",
      "Hello.",
    ].join("\n");
    assert.equal(
      annotateAppletTranscriptFrameRates(transcript, [
        {
          entryId: "message-1",
          fps: 57,
          capturedAt: "2026-08-14T19:00:00.010Z",
        },
      ]),
      [
        "## Transcript",
        "",
        "### Turn 01",
        "",
        "- Message ID: message-1",
        "- Recorded: 2026-08-14T19:00:00.000Z",
        "- Frame rate: 57 FPS",
        "- Turn routing: human-authored",
        "",
        "Hello.",
      ].join("\n"),
    );
  });

  it("leaves legacy transcripts unchanged when no sample was recorded", () => {
    assert.equal(
      annotateAppletTranscriptFrameRates("# Legacy\n", []),
      "# Legacy",
    );
  });
});

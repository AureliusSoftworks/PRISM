import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  sessionTranscriptCopyLabel,
  sessionTranscriptDownloadFileName,
  sessionTranscriptNotice,
  sessionTranscriptVariantAtClick,
} from "./sessionExport.ts";

describe("session export interaction", () => {
  it("checks Shift at click time without changing normal behavior", () => {
    assert.equal(sessionTranscriptVariantAtClick({ shiftKey: false }), "standard");
    assert.equal(sessionTranscriptVariantAtClick({ shiftKey: true }), "developer");
    assert.equal(sessionTranscriptDownloadFileName("coffee-session", "standard"), "coffee-session.md");
    assert.equal(
      sessionTranscriptDownloadFileName("coffee-session", "developer"),
      "coffee-session-developer-transcript.md",
    );
  });

  it("clearly confirms which transcript was copied or downloaded", () => {
    assert.equal(sessionTranscriptCopyLabel("standard", "copied"), "Copied Session Transcript");
    assert.equal(
      sessionTranscriptCopyLabel("developer", "copied"),
      "Copied Developer Transcript",
    );
    assert.match(sessionTranscriptNotice("standard", "downloaded").title, /Session Transcript/u);
    assert.match(sessionTranscriptNotice("developer", "downloaded").title, /Developer Transcript/u);
  });

  it("wires every session copy/download click to the live modifier", () => {
    const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(pageSource, /sessionTranscriptVariantAtClick\(event\)/u);
    assert.match(pageSource, /format: variant/u);
    assert.match(pageSource, /Hold Shift for a redacted Developer Transcript/u);
  });
});

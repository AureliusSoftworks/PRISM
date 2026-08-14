import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signal = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const debate = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const companion = readFileSync(
  new URL("./PrismCompanion.tsx", import.meta.url),
  "utf8",
);
const governor = readFileSync(
  new URL("./PrismAdaptiveDomQualityGovernor.tsx", import.meta.url),
  "utf8",
);

describe("applet transcript frame-rate capture integration", () => {
  it("samples every live transcript lane from one always-on FPS governor", () => {
    assert.match(governor, /publishPrismFrameRate\(1_000 \/ deltaMs\)/u);
    assert.match(governor, /fpsWindowFrameCount \* 1_000/u);
    assert.match(
      page,
      /useAppletTranscriptFrameRate\(\s*"coffee",\s*coffeeConversation\?\.id/u,
    );
    assert.match(
      page,
      /useAppletTranscriptFrameRate\(\s*"story",\s*storySession\?\.id/u,
    );
    assert.match(
      signal,
      /useAppletTranscriptFrameRate\("signal", episode\?\.id/u,
    );
    assert.match(
      debate,
      /useAppletTranscriptFrameRate\(\s*"debate",\s*activeSession\?\.id/u,
    );
  });

  it("keeps FPS beside exported message metadata and first-typed developer notes", () => {
    for (const source of [page, signal, debate]) {
      assert.match(source, /annotateAppletTranscriptFrameRates/u);
    }
    assert.match(debate, /`- Event ID: \$\{event\.id\}`/u);
    assert.match(companion, /fps: sessionNoteTypingStartedFpsRef\.current/u);
    assert.match(companion, /currentPrismFrameRate\(\)\?\.fps/u);
    assert.match(page, /capture\.fps \? ` · \$\{capture\.fps\} FPS`/u);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const apiServerSource = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);

describe("Zen canvas verbose transcript copy (dev tools)", () => {
  it("exposes a digests-only Copy Verbose Transcript canvas menu action", () => {
    assert.match(pageSource, /async function copyVerboseTranscriptToClipboard\(\)/u);
    assert.match(
      pageSource,
      /\.\.\.\(DEV_TOOLS_ENABLED\s*\?[\s\S]{0,500}id: "copy-verbose-transcript"[\s\S]{0,200}label: "Copy Verbose Transcript"/u,
    );
    assert.match(
      pageSource,
      /body: JSON\.stringify\(\{ format: "developer" \}\)/u,
    );
    assert.match(
      pageSource,
      /sessionTranscriptNotice\("developer", "copied"\)/u,
    );
  });

  it("keeps standard Zen export blocked while allowing developer format", () => {
    assert.match(
      apiServerSource,
      /conversation\.conversation_mode === "zen" && !developerTranscript/u,
    );
    assert.match(
      apiServerSource,
      /Zen conversations cannot be exported from the chat surface\./u,
    );
  });
});

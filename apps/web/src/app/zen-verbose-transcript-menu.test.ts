import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const apiServerSource = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);

describe("Zen canvas diagnostic transcript copy", () => {
  it("exposes a digests-only diagnostic transcript action", () => {
    assert.match(pageSource, /async function copyVerboseTranscriptToClipboard\(\)/u);
    assert.match(
      pageSource,
      /id: "copy-verbose-transcript"[\s\S]{0,200}label: "Copy diagnostic transcript"/u,
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

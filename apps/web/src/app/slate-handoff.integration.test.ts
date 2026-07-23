import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(
  new URL("./SlateWorkspace.tsx", import.meta.url),
  "utf8",
);
const canvasSource = readFileSync(
  new URL("./PrismHandoffCanvas.tsx", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

describe("explicit Slate and Zen handoffs", () => {
  it("previews the immutable source and states the cross-surface boundary", () => {
    assert.match(canvasSource, /Exact source preview/u);
    assert.match(canvasSource, /handoff\.sourceText/u);
    assert.match(canvasSource, /Only this selection will cross surfaces/u);
    assert.match(canvasSource, /surrounding conversation,[\s\S]*manuscript,[\s\S]*Continuity,[\s\S]*memories stay where they are/u);
  });

  it("keeps Zen destinations explicit and manuscript-safe", () => {
    assert.match(canvasSource, />New project</u);
    assert.match(canvasSource, />Add to project</u);
    assert.match(canvasSource, /Attach a source card without changing manuscript prose/u);
    assert.match(workspaceSource, /Source material from Zen/u);
    assert.match(workspaceSource, /do not alter the manuscript or[\s\S]*enter Continuity/u);
  });

  it("stages Slate excerpts in Zen without sending them", () => {
    assert.match(workspaceSource, />\s*Discuss in Zen\s*</u);
    assert.match(pageSource, /Discuss this Slate excerpt with me:\\n\\n/u);
    assert.match(canvasSource, /Nothing is sent to a bot until you choose Send/u);
    assert.match(pageSource, /zenHandoffSelectionRef/u);
    assert.match(pageSource, /document\.addEventListener\("selectionchange", captureSelection\)/u);
  });

  it("keeps the writer-facing tutorial aligned with the new action", () => {
    assert.match(tutorialSource, /choose Discuss in Zen/u);
    assert.match(tutorialSource, /previews the exact excerpt/u);
  });
});

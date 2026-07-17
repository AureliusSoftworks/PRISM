import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const workspace = readFileSync(
  new URL("./SlateWorkspace.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("./slateWorkspace.module.css", import.meta.url),
  "utf8",
);

describe("Slate AI workspace controls", () => {
  it("keeps prose routing project-scoped with an explicit model picker", () => {
    assert.match(workspace, /\["offline", "auto", "online"\]/u);
    assert.match(workspace, /data-tutorial-target="slate-ai-controls"/u);
    assert.match(workspace, /saveProseModel/u);
    assert.match(workspace, /Every generated prose artifact keeps its provider and\s+model receipt/u);
  });

  it("surfaces the living summary and advisory title decision on the canvas", () => {
    assert.match(workspace, /data-tutorial-target="slate-summary"/u);
    assert.match(workspace, /livingSummary\.tail/u);
    assert.match(workspace, /Could this title be stronger\?/u);
    assert.match(workspace, /SLATE_TITLE_REVIEW_INTERVAL_CHARS = 12_000/u);
    assert.match(workspace, /requestTitleSuggestion\(\{ quiet: true \}\)/u);
    assert.match(workspace, /resolveTitleSuggestion\("accepted"\)/u);
  });

  it("renders a movable collapsible Prism project companion", () => {
    assert.match(workspace, /data-tutorial-target="slate-project-chat"/u);
    assert.match(workspace, /onPointerDown=\{beginCompanionDrag\}/u);
    assert.match(workspace, /Nothing here edits the manuscript/u);
    assert.match(styles, /\.companionAvatar\s*\{/u);
    assert.match(styles, /\.companionPanel\s*\{/u);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MODE_TUTORIALS } from "./modeTutorials.ts";

const source = readFileSync(new URL("./SlateWorkspace.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Slate workspace integration", () => {
  it("renders every registered Slate tutorial target in the live workspace", () => {
    for (const step of MODE_TUTORIALS.slate.steps) {
      const match = step.targetSelector.match(/data-tutorial-target="([^"]+)"/);
      assert.ok(match?.[1], `Could not read target from ${step.targetSelector}`);
      assert.match(source, new RegExp(`data-tutorial-target="${match[1]}"`));
    }
  });

  it("wires project persistence, drafting, revision preview, and explicit decisions", () => {
    assert.match(source, /\/api\/slate\/projects/);
    assert.match(source, /runProjectOperation\("\/shape"\)/);
    assert.match(source, /runProjectOperation\("\/draft"/);
    assert.match(source, /runProjectOperation\("\/revisions"/);
    assert.match(source, /\/accept`/);
    assert.match(source, /\/reject`/);
    assert.match(source, /Lock selection/);
  });

  it("flushes manuscript autosave before leaving or switching projects", () => {
    assert.match(source, /await flushPendingManuscriptSave\(\);[\s\S]*?\/api\/slate\/projects\/\$\{encodeURIComponent\(projectId\)\}/);
    assert.match(source, /flushPendingManuscriptSave\(\)[\s\S]*?setProject\(null\)/);
  });

  it("offers optional wildcard project creation with preview and saved provenance", () => {
    assert.match(source, /Use \{\"\{wildcards\}\"\}/);
    assert.match(source, /\/api\/slate\/wildcards\/resolve/);
    assert.match(source, /Preview wildcard roll/);
    assert.match(source, /sparkWildcards/);
    assert.match(source, /Created from \{\"\{wildcards\}\"\}/);
  });

  it("keeps direction document-native instead of rendering a chat transcript", () => {
    assert.match(source, /What happens next\?/);
    assert.match(source, /Resolve current proposal/);
    assert.doesNotMatch(source, /conversationId|message bubble|chat transcript/i);
  });

  it("uses the shared PRISM app header and keeps its utility panels mounted", () => {
    const slateBranch = pageSource.slice(
      pageSource.indexOf('if (view === "slate")'),
      pageSource.indexOf('if (view === "story")'),
    );
    assert.match(
      slateBranch,
      /sidebarHeader=\{renderSharedAppletSidebarHeader\("slate"\)\}/,
    );
    assert.match(
      slateBranch,
      /navigationHeader=\{renderSharedAppletNavbar\("Slate tools"\)\}/,
    );
    assert.match(slateBranch, /renderSharedPanels\(\)/);
    assert.match(slateBranch, /renderModeTutorialOverlay\(\)/);
    assert.match(source, /sidebarHeader:\s*ReactNode/);
    assert.match(source, /navigationHeader:\s*ReactNode/);
    assert.match(source, /data-theme=\{theme\}/);
  });
});

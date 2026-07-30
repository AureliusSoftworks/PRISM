import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const workspace = readFileSync(
  new URL("./SlateWorkspace.tsx", import.meta.url),
  "utf8",
);
const manuscript = readFileSync(
  new URL("./SlateManuscriptCanvas.tsx", import.meta.url),
  "utf8",
);
const storyMap = readFileSync(
  new URL("./SlateStoryMap.tsx", import.meta.url),
  "utf8",
);
const storyBible = readFileSync(
  new URL("./SlateStoryBibleDesk.tsx", import.meta.url),
  "utf8",
);
const director = readFileSync(
  new URL("./SlateDirectorBar.tsx", import.meta.url),
  "utf8",
);
const question = readFileSync(
  new URL("./SlateDirectionQuestion.tsx", import.meta.url),
  "utf8",
);
const fullBookStyles = readFileSync(
  new URL("./slateFullBookReader.module.css", import.meta.url),
  "utf8",
);

describe("Slate Writer's Cockpit", () => {
  it("keeps the rich document authoritative through focused-section autosave", () => {
    assert.match(manuscript, /EditorContent/u);
    assert.match(manuscript, /SlateBlockAttributes/u);
    assert.match(manuscript, /slateTiptapJsonToSectionDocument/u);
    assert.match(workspace, /\.\.\.\(snapshot\.document \? \{ document: snapshot\.document \}/u);
    assert.match(workspace, /slateSectionEditableFingerprint/u);
    assert.match(workspace, /transformSlateLockedRangesForTextEdit/u);
  });

  it("renders the calm manuscript-primary cockpit and temporary desks", () => {
    assert.match(storyMap, /Story Map/u);
    assert.match(storyMap, /aria-expanded/u);
    assert.match(workspace, /data-focus-mode/u);
    assert.match(workspace, /Read full book/u);
    assert.match(fullBookStyles, /content-visibility: auto/u);
    assert.match(workspace, /Cast[\s\S]*Continuity[\s\S]*History/u);
    assert.match(workspace, /Project tools/u);
    assert.match(workspace, /History & developer review/u);
    assert.match(workspace, /Open focused Story Bible/u);
    assert.match(storyBible, /Live Wire/u);
    assert.match(storyBible, /\["cast", "Cast"\]/u);
    assert.match(storyBible, /\["arcs", "Arcs"\]/u);
    assert.match(storyBible, /\["threads", "Threads"\]/u);
    assert.match(storyBible, /\["timeline", "Timeline"\]/u);
    assert.match(storyBible, /\["world", "World"\]/u);
    assert.match(storyBible, /Intended/u);
    assert.match(storyBible, /Observed in prose/u);
    assert.match(storyBible, /Curate canon/u);
    assert.match(storyBible, /Lock this field against inference/u);
    assert.match(storyBible, /Set intended arc/u);
    assert.match(
      workspace,
      /\/characters\/\$\{encodeURIComponent\(profileId\)\}\/fields\//u,
    );
    assert.match(
      workspace,
      /\/characters\/\$\{encodeURIComponent\(profileId\)\}\/intended-arc/u,
    );
  });

  it("drives the inspector Live Wire and loose ends from active Story Bible truth", () => {
    assert.match(
      workspace,
      /const currentStoryBible =[\s\S]*storyBibleDesk && storyBibleDesk\.projectId === project\?\.id/u,
    );
    assert.match(
      workspace,
      /currentStoryBible\.storyBible\.threads\.filter[\s\S]*thread\.status === "open"[\s\S]*thread\.status === "due"[\s\S]*thread\.status === "missed"[\s\S]*thread\.status === "deferred"/u,
    );
    assert.match(workspace, /currentMomentum\?\.liveWire\?\.label/u);
    assert.match(workspace, /<small>\{inspectorLooseThreads\.length\}<\/small>/u);
  });

  it("offers exactly three fixed directions plus one custom vibe", () => {
    assert.match(
      question,
      /readonly \[\s*SlateDirectionChoice,\s*SlateDirectionChoice,\s*SlateDirectionChoice,\s*\]/u,
    );
    assert.match(question, /Describe the vibe…/u);
    assert.match(question, /Resolve & continue/u);
    assert.match(director, /\["beat", "passage", "scene"\]/u);
    assert.match(director, /Unstick me/u);
  });

  it("runs composition asynchronously so Stop and Redirect stay reachable", () => {
    assert.match(workspace, /writingOperationRef/u);
    assert.match(workspace, /\/writing-operations\/\$\{encodeURIComponent\(operation\.id\)\}\/run/u);
    assert.match(workspace, /window\.setTimeout\(\(\) => void poll\(\), 650\)/u);
    assert.match(
      workspace,
      /response\.operation\.status === "compiling"[\s\S]*response\.operation\.status === "generating"[\s\S]*runWritingOperationRequest/u,
    );
  });

  it("persists anchored notes outside prose", () => {
    assert.match(workspace, /\/annotations`/u);
    assert.match(workspace, /idempotencyKey: crypto\.randomUUID\(\)/u);
    assert.match(workspace, /startPosition/u);
    assert.match(workspace, /quoteHash: await slateQuoteHash/u);
    assert.match(manuscript, /Notes are anchored to this section/u);
  });

  it("exports a focused safe Slate review only from History", () => {
    assert.match(workspace, /\/review-export`/u);
    assert.match(
      workspace,
      /sectionId: currentSection\.id,\s*format: "markdown"/u,
    );
    assert.match(workspace, /Export Slate Review/u);
    assert.match(workspace, /Diagnostic, not hidden reasoning/u);
    assert.match(workspace, /Credentials, chain-of-thought/u);
    assert.match(workspace, /Proposal provenance & examples/u);
  });
});

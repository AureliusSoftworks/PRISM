import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

function sourceSlice(start: string, end: string): string {
  const startIndex = pageSource.indexOf(start);
  const endIndex = pageSource.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing source marker: ${start}`);
  assert.ok(endIndex > startIndex, `Missing source marker: ${end}`);
  return pageSource.slice(startIndex, endIndex);
}

describe("Images drawer generation queue", () => {
  it("snapshots request ownership, routing, and privacy before enqueue", () => {
    const createSlice = sourceSlice(
      "function createQueuedImageGeneration",
      "function drainImageGenerationQueue",
    );
    assert.match(createSlice, /scopeKey = imageGenerationScopeKey/u);
    assert.match(createSlice, /composeImagePromptWithKeywordDirectives/u);
    assert.match(createSlice, /IMAGE_GENERATION_SIZE_BY_VARIANT/u);
    assert.match(createSlice, /requestBody\.preferredProvider/u);
    assert.match(createSlice, /requestBody\.model/u);
    assert.match(createSlice, /privateImage:[\s\S]*imagePrivateMode/u);
  });

  it("drains FIFO one at a time per scope and continues after settlement", () => {
    const queueSlice = sourceSlice(
      "function drainImageGenerationQueue",
      "async function runImageGeneration",
    );
    assert.match(
      queueSlice,
      /imageGenerationRunningScopesRef\.current\.has\(scopeKey\)/u,
    );
    assert.match(
      queueSlice,
      /findIndex\([\s\S]*item\.scopeKey === scopeKey/u,
    );
    assert.match(queueSlice, /runImageGeneration\(nextItem\)\.finally/u);
    assert.match(queueSlice, /drainImageGenerationQueue\(scopeKey\)/u);
    assert.match(queueSlice, /IMAGE_GENERATION_QUEUE_LIMIT_PER_SCOPE/u);
  });

  it("lets queued prompts be removed and cancel-all clears waiting work", () => {
    const queueSlice = sourceSlice(
      "function removeQueuedImageGeneration",
      "async function runImageGeneration",
    );
    assert.match(queueSlice, /item\.id !== queueId/u);
    assert.match(queueSlice, /item\.scopeKey !== scopeKey/u);
    assert.match(queueSlice, /abortImageGenForScope\(scopeKey\)/u);

    const overlaySlice = sourceSlice(
      "{activeImageGenScopeKey !== null ? (",
      "{/* Scoped to panelError",
    );
    assert.match(overlaySlice, /aria-label="Queue another image"/u);
    assert.match(overlaySlice, /activeImageGenQueuedItems\.map/u);
    assert.match(overlaySlice, /removeQueuedImageGeneration\(queued\.id\)/u);
    assert.match(overlaySlice, /cancelImageGenerationScope/u);
    assert.match(overlaySlice, /Cancel all/u);
  });

  it("keeps the queue composer and removable list usable in the progress overlay", () => {
    assert.match(cssSource, /\.panelImagesGenQueueComposer\s*\{/u);
    assert.match(
      cssSource,
      /\.panelImagesGenQueueComposer textarea[\s\S]*resize: vertical/u,
    );
    assert.match(cssSource, /\.panelImagesGenQueueList\s*\{/u);
    assert.match(
      cssSource,
      /\.panelImagesGenQueueList[\s\S]*max-height:[\s\S]*overflow-y: auto/u,
    );
    assert.match(
      tutorialSource,
      /running render lets you queue up to eight more prompts/u,
    );
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

test("Chat and Zen use the full GFM renderer for live and settled messages", () => {
  assert.match(pageSource, /fullMarkdownPresentation\?: boolean/u);
  assert.equal(
    pageSource.match(
      /fullMarkdownPresentation=\{\s*sharedChatConversationPresentation\s*\}/gu,
    )?.length,
    2,
  );
  assert.match(
    pageSource,
    /fullMarkdownPresentation &&\s*messageUsesFullMarkdownPresentation\(chatModeSource\)/u,
  );
  assert.match(
    pageSource,
    /!useFullMarkdownRenderer\s*&&\s*renderAsEphemeralLines/u,
  );
  assert.match(
    pageSource,
    /renderAsEphemeralLines && !fullMarkdownPresentation\s*\? stripChatRevealThematicBreakLines/u,
  );
  assert.match(pageSource, /remarkPlugins=\{\[remarkGfm\]\}/u);
  assert.doesNotMatch(pageSource, /rehypeRaw/u);
});

test("the shared message presentation covers the complete GFM surface", () => {
  for (const selector of [
    ".markdownBody h6",
    ".markdownBody :global(.contains-task-list)",
    ".markdownBody :global(.task-list-item)",
    ".markdownBody hr",
    ".markdownBody del",
    ".markdownBody img",
    ".markdownBody table",
  ]) {
    assert.equal(
      stylesSource.includes(selector),
      true,
      `${selector} should have shared message styling`,
    );
  }
});

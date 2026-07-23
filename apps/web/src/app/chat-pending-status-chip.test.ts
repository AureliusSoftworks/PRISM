import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

test("Chat and Zen pending replies reuse the existing floating bot status chip", () => {
  assert.match(
    pageSource,
    /const zenFloatingStatusChipVisible =\s*zenInitialThinkingActive \|\|\s*zenInitialReplyRevealActive \|\|\s*zenPendingReplyPlaceholderVisible;/,
  );
  assert.match(
    pageSource,
    /const compactPhase =\s*!zenInitialThinkingActive &&\s*\(zenInitialReplyRevealActive \|\| zenPendingReplyPlaceholderVisible\);/,
  );
  assert.match(
    pageSource,
    /if \(zenInitialReplyRevealActive\) \{[\s\S]*?handleZenInitialReplyRevealCancel\(event\);[\s\S]*?handleTypingIndicatorPress\(\);/,
  );
  assert.match(pageSource, /className=\{styles\.zenInitialThinkingButton\}/);
  assert.match(pageSource, /className=\{styles\.zenInitialThinkingGlyphHalo\}/);
  assert.match(pageSource, /<span className=\{styles\.zenInitialThinkingLabel\}>\{label\}<\/span>/);
  assert.match(pageSource, /personaStyle = personaBot\s*\? botAccentStyle\(personaBot\.color, resolvedTheme\)/);

  assert.doesNotMatch(pageSource, /const zenPendingReplyPlaceholderNode/);
  assert.doesNotMatch(pageSource, /styles\.zenPendingReplyDots/);
  assert.equal(
    [...pageSource.matchAll(/\{zenInitialThinkingNode\}/g)].length,
    1,
    "the shared floating status chip should mount only once",
  );

  assert.match(
    cssSource,
    /\.zenInitialThinkingOverlay\[data-phase="compact"\] \.zenInitialThinkingButton \{[\s\S]*?border-radius: 999px;/,
  );
  assert.match(pageSource, /<TypingDots className=\{styles\.typingDots\}/);
  assert.match(cssSource, /\.typingDots \{/);
});

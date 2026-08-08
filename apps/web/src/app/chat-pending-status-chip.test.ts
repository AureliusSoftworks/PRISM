import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

test("Zen uses the full-screen wait only for the first Home-to-room handoff", () => {
  assert.match(
    pageSource,
    /setZenPlayerSpeechReveal\(\{ messageId, content: messageText, revealKey \}\);[\s\S]*?setZenInitialStarterOverlayActive\(false\);/,
  );
  const zenInitialThinkingSource = pageSource.match(
    /const zenInitialThinkingNode = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[/,
  )?.[0];
  assert.ok(zenInitialThinkingSource);
  assert.match(
    zenInitialThinkingSource,
    /if \(!zenInitialThinkingActive\) return null;/,
  );
  assert.match(zenInitialThinkingSource, /data-phase="thinking"/);
  assert.doesNotMatch(zenInitialThinkingSource, /compactPhase/);
  assert.doesNotMatch(
    zenInitialThinkingSource,
    /zenPendingReplyPlaceholderVisible|zenInitialReplyRevealActive/,
  );
  assert.doesNotMatch(pageSource, /zenFloatingStatusChipVisible/);
  assert.equal(
    [...pageSource.matchAll(/\{zenInitialThinkingNode\}/g)].length,
    1,
    "the first-entry transition should mount only once",
  );
  assert.match(
    cssSource,
    /\.appLayout\[data-zen-initial-thinking="true"\][\s\S]*?\.zenInitialThinkingOverlay \{/,
  );
  assert.match(
    pageSource,
    /showThinkingSpinner=\{zenPendingReplyPlaceholderVisible\}/,
  );
});

test("non-Zen pending replies retain the ordinary floating status chip", () => {
  assert.match(pageSource, /const typingIndicatorNode = useMemo/);
  assert.match(pageSource, /<TypingDots className=\{styles\.typingDots\}/);
  assert.match(cssSource, /\.typingDots \{/);
});

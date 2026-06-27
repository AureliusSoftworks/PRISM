import assert from "node:assert/strict";
import test from "node:test";

import {
  looksLikePrismDevComposerCommand,
  normalizeComposerSlashCommandLine,
  resolvePrismDevPanelToggleAction,
} from "./prismDevChatCommands.ts";

test("normalizes Markdown-escaped leading slash commands", () => {
  assert.equal(normalizeComposerSlashCommandLine("\\/dev"), "/dev");
  assert.equal(normalizeComposerSlashCommandLine("  \\/dev close"), "  /dev close");
  assert.equal(looksLikePrismDevComposerCommand("\\/dev"), true);
  assert.equal(looksLikePrismDevComposerCommand("  \\/dev close"), true);
});

test("does not rewrite non-command slash escapes later in prose", () => {
  assert.equal(normalizeComposerSlashCommandLine("literal \\/dev"), "literal \\/dev");
  assert.equal(looksLikePrismDevComposerCommand("literal \\/dev"), false);
});

test("bare /dev opens the panel unless the full panel is already open", () => {
  assert.equal(
    resolvePrismDevPanelToggleAction({
      devToolsUnlocked: false,
      devToolsOpen: false,
      devToolsMinimized: false,
    }),
    "open-panel"
  );
  assert.equal(
    resolvePrismDevPanelToggleAction({
      devToolsUnlocked: true,
      devToolsOpen: false,
      devToolsMinimized: true,
    }),
    "open-panel"
  );
  assert.equal(
    resolvePrismDevPanelToggleAction({
      devToolsUnlocked: true,
      devToolsOpen: true,
      devToolsMinimized: false,
    }),
    "close-layer"
  );
});

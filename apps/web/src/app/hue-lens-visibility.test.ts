import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldShowEmptyStateHueLens } from "./hue-lens-visibility.ts";

const visibleChatLens = {
  view: "chat" as const,
  hueLensAvailable: true,
  conversationIsEmpty: true,
  privateChatActive: false,
  hasSelectedBot: false,
};

test("shows the hue lens for the empty Chat icon-only bot browser", () => {
  assert.equal(shouldShowEmptyStateHueLens(visibleChatLens), true);
});

test("keeps the hue lens on the Sandbox bot browser", () => {
  assert.equal(
    shouldShowEmptyStateHueLens({ ...visibleChatLens, view: "sandbox" }),
    true
  );
});

test("hides the empty-state hue lens when it cannot help navigate", () => {
  assert.equal(
    shouldShowEmptyStateHueLens({
      ...visibleChatLens,
      hueLensAvailable: false,
    }),
    false
  );
  assert.equal(
    shouldShowEmptyStateHueLens({
      ...visibleChatLens,
      conversationIsEmpty: false,
    }),
    false
  );
  assert.equal(
    shouldShowEmptyStateHueLens({
      ...visibleChatLens,
      privateChatActive: true,
    }),
    false
  );
  assert.equal(
    shouldShowEmptyStateHueLens({
      ...visibleChatLens,
      hasSelectedBot: true,
    }),
    false
  );
  assert.equal(
    shouldShowEmptyStateHueLens({ ...visibleChatLens, view: "coffee" }),
    false
  );
});

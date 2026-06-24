import assert from "node:assert/strict";
import test from "node:test";

import {
  armComposerChipActivation,
  replaceComposerChipText,
  shouldResolveComposerChipActivation,
  type ComposerChipActivationTarget,
} from "./composerChipActivation.ts";
import { shouldChoiceChipRailControlViewport } from "./choiceChipRailAnchor.ts";

const nounTarget: ComposerChipActivationTarget = {
  surface: "editor",
  kind: "wildcard-slot",
  start: 5,
  end: 11,
  text: "{NOUN}",
};

const promptTarget: ComposerChipActivationTarget = {
  surface: "editor",
  kind: "prompt",
  start: 5,
  end: 15,
  text: "/story-seed",
};

test("second tap on the same prompt chip within the activation window resolves", () => {
  const pending = armComposerChipActivation(promptTarget, 1000);

  assert.equal(shouldResolveComposerChipActivation(pending, promptTarget, 2199), true);
});

test("wildcard chips stay literal in the composer", () => {
  assert.equal(
    shouldResolveComposerChipActivation(
      armComposerChipActivation(nounTarget, 1000),
      nounTarget,
      1100
    ),
    false
  );
  const deckTarget: ComposerChipActivationTarget = {
    surface: "textarea",
    kind: "wildcard",
    start: 0,
    end: 8,
    text: "!weather",
  };
  assert.equal(
    shouldResolveComposerChipActivation(
      armComposerChipActivation(deckTarget, 1000),
      deckTarget,
      1100
    ),
    false
  );
});

test("different chips do not reuse pending activation", () => {
  const pending = armComposerChipActivation(promptTarget, 1000);

  assert.equal(
    shouldResolveComposerChipActivation(
      pending,
      {
        ...promptTarget,
        start: 7,
        end: 17,
      },
      1100
    ),
    false
  );
  assert.equal(
    shouldResolveComposerChipActivation(
      pending,
      {
        ...promptTarget,
        text: "/tone-shift",
      },
      1100
    ),
    false
  );
  assert.equal(
    shouldResolveComposerChipActivation(
      pending,
      {
        ...promptTarget,
        surface: "textarea",
      },
      1100
    ),
    false
  );
});

test("stale pending activation expires", () => {
  const pending = armComposerChipActivation(promptTarget, 1000);

  assert.equal(shouldResolveComposerChipActivation(pending, promptTarget, 2201), false);
});

test("chip text replacement guards against stale ranges", () => {
  assert.deepEqual(replaceComposerChipText("make {NOUN} now", nounTarget, "story"), {
    value: "make story now",
    caret: 10,
  });
  assert.equal(replaceComposerChipText("make {VERB} now", nounTarget, "story"), null);
});

test("chat choice rails only control the viewport for the latest assistant message", () => {
  assert.equal(
    shouldChoiceChipRailControlViewport({
      chatSurface: true,
      anchorMessageId: "assistant-1",
      latestAssistantMessageId: "assistant-1",
    }),
    true
  );

  assert.equal(
    shouldChoiceChipRailControlViewport({
      chatSurface: true,
      anchorMessageId: "assistant-1",
      latestAssistantMessageId: "assistant-3",
    }),
    false
  );

  assert.equal(
    shouldChoiceChipRailControlViewport({
      chatSurface: true,
      anchorMessageId: null,
      latestAssistantMessageId: "assistant-3",
    }),
    false
  );
});

test("non-chat choice rails preserve their existing viewport ownership", () => {
  assert.equal(
    shouldChoiceChipRailControlViewport({
      chatSurface: false,
      anchorMessageId: "assistant-1",
      latestAssistantMessageId: "assistant-3",
    }),
    true
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  armComposerChipActivation,
  replaceComposerChipText,
  shouldResolveComposerChipActivation,
  type ComposerChipActivationTarget,
} from "./composerChipActivation.ts";

const nounTarget: ComposerChipActivationTarget = {
  surface: "editor",
  kind: "wildcard-slot",
  start: 5,
  end: 11,
  text: "{NOUN}",
};

test("second tap on the same chip within the activation window resolves", () => {
  const pending = armComposerChipActivation(nounTarget, 1000);

  assert.equal(shouldResolveComposerChipActivation(pending, nounTarget, 2199), true);
});

test("different chips do not reuse pending activation", () => {
  const pending = armComposerChipActivation(nounTarget, 1000);

  assert.equal(
    shouldResolveComposerChipActivation(
      pending,
      {
        ...nounTarget,
        start: 7,
        end: 13,
      },
      1100
    ),
    false
  );
  assert.equal(
    shouldResolveComposerChipActivation(
      pending,
      {
        ...nounTarget,
        text: "{VERB}",
      },
      1100
    ),
    false
  );
  assert.equal(
    shouldResolveComposerChipActivation(
      pending,
      {
        ...nounTarget,
        surface: "textarea",
      },
      1100
    ),
    false
  );
});

test("stale pending activation expires", () => {
  const pending = armComposerChipActivation(nounTarget, 1000);

  assert.equal(shouldResolveComposerChipActivation(pending, nounTarget, 2201), false);
});

test("chip text replacement guards against stale ranges", () => {
  assert.deepEqual(replaceComposerChipText("make {NOUN} now", nounTarget, "story"), {
    value: "make story now",
    caret: 10,
  });
  assert.equal(replaceComposerChipText("make {VERB} now", nounTarget, "story"), null);
});

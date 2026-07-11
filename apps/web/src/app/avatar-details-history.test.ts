import test from "node:test";
import assert from "node:assert/strict";

import {
  commitAvatarDetailsHistory,
  redoAvatarDetailsHistory,
  undoAvatarDetailsHistory,
  type AvatarDetailsHistoryState,
} from "./avatar-details-history.ts";
import { normalizeAvatarDetails } from "./avatar-details.ts";

test("undo and redo are pure transitions that move each recipe exactly once", () => {
  const original = normalizeAvatarDetails(null);
  const changed = {
    ...original,
    screen: {
      ...original.screen,
      stamps: [
        {
          id: "round-glasses" as const,
          offsetX: 0,
          offsetY: 0,
          scalePct: 100,
        },
      ],
    },
  };
  const initial = { working: original, undo: [], redo: [] };

  const committed = commitAvatarDetailsHistory(initial, changed);
  assert.strictEqual(initial.working, original);
  assert.equal(initial.undo.length, 0);
  assert.equal(committed.undo.length, 1);
  assert.equal(committed.redo.length, 0);

  const undone = undoAvatarDetailsHistory(committed);
  assert.deepEqual(undone.working, original);
  assert.equal(undone.undo.length, 0);
  assert.equal(undone.redo.length, 1);
  assert.equal(committed.undo.length, 1, "undo must not mutate its input stack");

  const redone = redoAvatarDetailsHistory(undone);
  assert.deepEqual(redone.working, changed);
  assert.equal(redone.undo.length, 1);
  assert.equal(redone.redo.length, 0);
  assert.equal(undone.redo.length, 1, "redo must not mutate its input stack");
});

test("history keeps only the latest 50 completed operations", () => {
  let state: AvatarDetailsHistoryState = {
    working: normalizeAvatarDetails(null),
    undo: [],
    redo: [],
  };
  for (let index = 0; index < 60; index += 1) {
    state = commitAvatarDetailsHistory(state, {
      version: 1,
      screen: {
        stamps: [
          {
            id: "round-glasses",
            offsetX: (index % 33) - 16,
            offsetY: 0,
            scalePct: 100,
          },
        ],
        paintMaskBase64: null,
      },
    });
  }
  assert.equal(state.undo.length, 50);
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { moveCommandCenterItemToTarget } from "./commandCenterOrdering.ts";

describe("moveCommandCenterItemToTarget", () => {
  const items = [
    { id: "builtin-help", builtIn: true },
    { id: "prompt-a", builtIn: false },
    { id: "prompt-b", builtIn: false },
    { id: "prompt-c", builtIn: false },
  ];

  it("moves an item after a movable target", () => {
    const next = moveCommandCenterItemToTarget(
      items,
      "prompt-a",
      "prompt-b",
      "after",
      (item) => !item.builtIn
    );

    assert.deepEqual(
      next.map((item) => item.id),
      ["builtin-help", "prompt-b", "prompt-a", "prompt-c"]
    );
  });

  it("moves an item before a movable target", () => {
    const next = moveCommandCenterItemToTarget(
      items,
      "prompt-c",
      "prompt-a",
      "before",
      (item) => !item.builtIn
    );

    assert.deepEqual(
      next.map((item) => item.id),
      ["builtin-help", "prompt-c", "prompt-a", "prompt-b"]
    );
  });

  it("keeps non-movable items pinned while movable items pass them", () => {
    const next = moveCommandCenterItemToTarget(
      [
        { id: "prompt-a", builtIn: false },
        { id: "builtin-help", builtIn: true },
        { id: "prompt-b", builtIn: false },
      ],
      "prompt-b",
      "prompt-a",
      "before",
      (item) => !item.builtIn
    );

    assert.deepEqual(
      next.map((item) => item.id),
      ["prompt-b", "builtin-help", "prompt-a"]
    );
  });

  it("returns the same array when the item cannot move", () => {
    const sameTarget = moveCommandCenterItemToTarget(
      items,
      "prompt-a",
      "prompt-a",
      "before",
      (item) => !item.builtIn
    );
    const missing = moveCommandCenterItemToTarget(
      items,
      "missing",
      "prompt-b",
      "after",
      (item) => !item.builtIn
    );
    const builtIn = moveCommandCenterItemToTarget(
      items,
      "builtin-help",
      "prompt-b",
      "after",
      (item) => !item.builtIn
    );

    assert.equal(sameTarget, items);
    assert.equal(missing, items);
    assert.equal(builtIn, items);
  });
});

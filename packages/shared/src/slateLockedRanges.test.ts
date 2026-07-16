import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { transformSlateLockedRangesForTextEdit } from "./slate.ts";

const lock = {
  id: "canon",
  start: 6,
  end: 11,
  label: "Keep this",
};

describe("Slate locked-range anchoring", () => {
  it("moves a lock after insertions and deletions before it", () => {
    assert.deepEqual(
      transformSlateLockedRangesForTextEdit(
        "Hello world!",
        "Bright Hello world!",
        [lock],
      ),
      [{ ...lock, start: 13, end: 18 }],
    );
    assert.deepEqual(
      transformSlateLockedRangesForTextEdit(
        "Bright Hello world!",
        "Hello world!",
        [{ ...lock, start: 13, end: 18 }],
      ),
      [lock],
    );
  });

  it("keeps replacements inside a lock protected", () => {
    const next = "Hello wide world!";
    const [transformed] = transformSlateLockedRangesForTextEdit(
      "Hello world!",
      next,
      [lock],
    );
    assert.equal(next.slice(transformed!.start, transformed!.end), "wide world");
  });

  it("contracts or removes a lock when its protected prose is deleted", () => {
    const partlyDeleted = "Hello wld!";
    const [contracted] = transformSlateLockedRangesForTextEdit(
      "Hello world!",
      partlyDeleted,
      [lock],
    );
    assert.equal(
      partlyDeleted.slice(contracted!.start, contracted!.end),
      "wld",
    );
    assert.deepEqual(
      transformSlateLockedRangesForTextEdit(
        "Hello world!",
        "Hello !",
        [lock],
      ),
      [],
    );
  });

  it("uses boundary affinity that excludes inserts beside a lock", () => {
    const atStart = "Hello brave world!";
    const [moved] = transformSlateLockedRangesForTextEdit(
      "Hello world!",
      atStart,
      [lock],
    );
    assert.equal(atStart.slice(moved!.start, moved!.end), "world");

    const atEnd = "Hello world, again!";
    const [unchanged] = transformSlateLockedRangesForTextEdit(
      "Hello world!",
      atEnd,
      [lock],
    );
    assert.equal(atEnd.slice(unchanged!.start, unchanged!.end), "world");
  });
});

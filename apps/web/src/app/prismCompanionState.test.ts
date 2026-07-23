import assert from "node:assert/strict";
import test from "node:test";
import {
  isPrismCompanionShortcut,
  parsePrismCompanionRecovery,
  prismCompanionRecoveryStorageKey,
  retainPrismCompanionRecovery,
} from "./prismCompanionState.ts";

test("scopes companion recovery to account and exact surface", () => {
  const first = prismCompanionRecoveryStorageKey("u1", {
    surfaceId: "slate",
    slateProjectId: "project-1",
  });
  const second = prismCompanionRecoveryStorageKey("u1", {
    surfaceId: "slate",
    slateProjectId: "project-2",
  });
  assert.notEqual(first, second);
  assert.notEqual(
    first,
    prismCompanionRecoveryStorageKey("u2", {
      surfaceId: "slate",
      slateProjectId: "project-1",
    }),
  );
});

test("recovers only the latest three valid messages", () => {
  const messages = ["one", "two", "three", "four"].map((content, index) => ({
    id: String(index),
    role: index % 2 ? ("assistant" as const) : ("user" as const),
    content,
    createdAt: new Date(index).toISOString(),
  }));
  assert.deepEqual(
    retainPrismCompanionRecovery(messages).map((message) => message.content),
    ["two", "three", "four"],
  );
  assert.deepEqual(
    parsePrismCompanionRecovery(JSON.stringify(messages)).map(
      (message) => message.content,
    ),
    ["two", "three", "four"],
  );
});

test("uses Option Space on Apple platforms and Control Space elsewhere", () => {
  const base = {
    key: " ",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  };
  assert.equal(
    isPrismCompanionShortcut({ ...base, altKey: true, platform: "MacIntel" }),
    true,
  );
  assert.equal(
    isPrismCompanionShortcut({ ...base, ctrlKey: true, platform: "Win32" }),
    true,
  );
  assert.equal(
    isPrismCompanionShortcut({ ...base, ctrlKey: true, platform: "MacIntel" }),
    false,
  );
});

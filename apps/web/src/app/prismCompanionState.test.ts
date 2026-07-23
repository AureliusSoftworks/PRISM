import assert from "node:assert/strict";
import test from "node:test";
import {
  isPrismCompanionShortcut,
  parsePrismCompanionRecovery,
  parsePrismCompanionSpeechEnabled,
  prismCompanionDismissesOnExternalInteraction,
  prismCompanionRecoveryStorageKey,
  prismCompanionSpeechStorageKey,
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

test("collapses the ephemeral panel when focus returns to a Zen bot", () => {
  assert.equal(
    prismCompanionDismissesOnExternalInteraction({ surfaceId: "zen" }),
    true,
  );
  assert.equal(
    prismCompanionDismissesOnExternalInteraction({ surfaceId: "prism-home" }),
    true,
  );
  assert.equal(
    prismCompanionDismissesOnExternalInteraction({ surfaceId: "slate" }),
    false,
  );
});

test("keeps the companion voice choice device-local and enabled by default", () => {
  assert.notEqual(
    prismCompanionSpeechStorageKey("u1"),
    prismCompanionSpeechStorageKey("u2"),
  );
  assert.equal(parsePrismCompanionSpeechEnabled(null), true);
  assert.equal(parsePrismCompanionSpeechEnabled("true"), true);
  assert.equal(parsePrismCompanionSpeechEnabled("false"), false);
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

test("recognizes the physical Space key when Option changes its key value", () => {
  const base = {
    code: "Space",
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    platform: "MacIntel",
  };
  assert.equal(
    isPrismCompanionShortcut({ ...base, key: "\u00a0" }),
    true,
  );
  assert.equal(isPrismCompanionShortcut({ ...base, key: "Dead" }), true);
});

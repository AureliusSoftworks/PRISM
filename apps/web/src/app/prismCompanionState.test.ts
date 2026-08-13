import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PRISM_COMPANION_SESSION_IDLE_GAP_MS,
  isPrismCompanionModifierHeld,
  isPrismCompanionModifierKey,
  parsePrismCompanionRecovery,
  parsePrismCompanionSessionRecord,
  parsePrismCompanionSpeechEnabled,
  prismCompanionDismissesOnExternalInteraction,
  prismCompanionModifierPresentation,
  prismCompanionPrivateRecoveryStorageKey,
  prismCompanionRecoveryStorageKey,
  prismCompanionSessionIsReusable,
  prismCompanionSessionStorageKey,
  prismCompanionSpeechStorageKey,
  retainPrismCompanionRecovery,
  touchPrismCompanionSessionRecord,
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

test("scopes the saved assistant session and Private recovery to the account", () => {
  assert.notEqual(
    prismCompanionSessionStorageKey("u1"),
    prismCompanionSessionStorageKey("u2"),
  );
  assert.notEqual(
    prismCompanionPrivateRecoveryStorageKey("u1"),
    prismCompanionPrivateRecoveryStorageKey("u2"),
  );
  assert.equal(
    prismCompanionSessionStorageKey("u1"),
    prismCompanionSessionStorageKey("u1"),
  );
});

test("reuses a valid assistant session only inside the configured idle gap", () => {
  const now = Date.parse("2026-08-09T20:00:00.000Z");
  const record = touchPrismCompanionSessionRecord(
    "conversation-1",
    now - 60_000,
  );
  assert.deepEqual(
    parsePrismCompanionSessionRecord(JSON.stringify(record)),
    record,
  );
  assert.equal(
    prismCompanionSessionIsReusable(record, now, 2 * 60_000),
    true,
  );
  assert.equal(
    prismCompanionSessionIsReusable(record, now, 60_000),
    false,
  );
  assert.equal(
    prismCompanionSessionIsReusable(
      touchPrismCompanionSessionRecord("conversation-1", now + 1),
      now,
      DEFAULT_PRISM_COMPANION_SESSION_IDLE_GAP_MS,
    ),
    false,
  );
});

test("rejects malformed assistant session records", () => {
  assert.equal(parsePrismCompanionSessionRecord(null), null);
  assert.equal(parsePrismCompanionSessionRecord("not-json"), null);
  assert.equal(
    parsePrismCompanionSessionRecord(
      JSON.stringify({ conversationId: "", lastUsedAt: new Date().toISOString() }),
    ),
    null,
  );
  assert.equal(
    parsePrismCompanionSessionRecord(
      JSON.stringify({ conversationId: "conversation-1", lastUsedAt: "later" }),
    ),
    null,
  );
});

test("collapses the companion panel when focus returns to a Zen bot", () => {
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

test("derives platform-aware Prism Wield modifier labels", () => {
  assert.deepEqual(prismCompanionModifierPresentation("MacIntel"), {
    modifier: "command",
    modifierLabel: "Command",
  });
  assert.deepEqual(prismCompanionModifierPresentation("Win32"), {
    modifier: "control",
    modifierLabel: "Control",
  });
  assert.deepEqual(prismCompanionModifierPresentation("MacIntel", true), {
    modifier: "option",
    modifierLabel: "Option",
  });
  assert.deepEqual(prismCompanionModifierPresentation("Win32", true), {
    modifier: "control",
    modifierLabel: "Control",
  });
});

test("uses Option-only Wield for immersive Zen on Apple platforms", () => {
  const option = {
    key: "Alt",
    code: "AltLeft",
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  };
  assert.equal(isPrismCompanionModifierKey(option, "MacIntel", true), true);
  assert.equal(
    isPrismCompanionModifierKey(
      { ...option, key: "ArrowLeft", code: "ArrowLeft" },
      "MacIntel",
      true,
    ),
    false,
  );
  assert.equal(
    isPrismCompanionModifierHeld(
      {
        altKey: option.altKey,
        ctrlKey: option.ctrlKey,
        metaKey: option.metaKey,
        shiftKey: option.shiftKey,
      },
      "MacIntel",
      true,
    ),
    true,
  );
  assert.equal(
    isPrismCompanionModifierKey(
      {
        ...option,
        key: "Meta",
        code: "MetaLeft",
        altKey: false,
        metaKey: true,
      },
      "MacIntel",
      true,
    ),
    false,
  );
});

test("uses Command-only Wield on Apple platforms and leaves Option available", () => {
  const base = {
    key: "Meta",
    altKey: false,
    ctrlKey: false,
    metaKey: true,
    shiftKey: false,
  };
  assert.equal(isPrismCompanionModifierKey(base, "MacIntel"), true);
  assert.equal(
    isPrismCompanionModifierKey(
      { ...base, key: "Alt", altKey: true, metaKey: false },
      "MacIntel",
    ),
    false,
  );
  assert.equal(
    isPrismCompanionModifierKey(
      { ...base, key: "Control", ctrlKey: true, metaKey: false },
      "MacIntel",
    ),
    false,
  );
  assert.equal(
    isPrismCompanionModifierKey(
      { ...base, key: "Control", ctrlKey: true, metaKey: false },
      "Win32",
    ),
    true,
  );
  assert.equal(
    isPrismCompanionModifierKey({ ...base, shiftKey: true }, "MacIntel"),
    false,
  );
});

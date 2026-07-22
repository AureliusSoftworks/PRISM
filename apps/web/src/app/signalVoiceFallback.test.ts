import assert from "node:assert/strict";
import test from "node:test";
import {
  requestSignalVoiceWithFallback,
  SIGNAL_ONLINE_VOICE_TIMEOUT_MS,
  SIGNAL_OPENING_ONLINE_VOICE_TIMEOUT_MS,
  signalOnlineVoiceTimeoutMs,
} from "./signalVoiceFallback.ts";

test("Signal gives a Premium episode opening more time before local fallback", () => {
  assert.equal(
    signalOnlineVoiceTimeoutMs("opening"),
    SIGNAL_OPENING_ONLINE_VOICE_TIMEOUT_MS,
  );
  assert.equal(
    signalOnlineVoiceTimeoutMs("closing"),
    SIGNAL_ONLINE_VOICE_TIMEOUT_MS,
  );
  assert.equal(signalOnlineVoiceTimeoutMs(), SIGNAL_ONLINE_VOICE_TIMEOUT_MS);
});

test("Signal keeps a healthy preferred voice without invoking fallback", async () => {
  let fallbackCalls = 0;
  const result = await requestSignalVoiceWithFallback({
    requestPreferred: async () => "elevenlabs",
    requestBuiltin: async () => {
      fallbackCalls += 1;
      return "builtin";
    },
  });

  assert.equal(result, "elevenlabs");
  assert.equal(fallbackCalls, 0);
});

test("Signal falls back to the local voice pack when preferred speech stalls", async () => {
  let preferredWasAborted = false;
  const result = await requestSignalVoiceWithFallback({
    timeoutMs: 5,
    requestPreferred: (signal) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            preferredWasAborted = true;
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }),
    requestBuiltin: async () => "builtin",
  });

  assert.equal(preferredWasAborted, true);
  assert.equal(result, "builtin");
});

test("Signal does not start fallback speech after its parent operation is cancelled", async () => {
  const parentController = new AbortController();
  let fallbackCalls = 0;
  const result = requestSignalVoiceWithFallback({
    parentSignal: parentController.signal,
    requestPreferred: (signal) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
    requestBuiltin: async () => {
      fallbackCalls += 1;
      return "builtin";
    },
  });

  parentController.abort();
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(fallbackCalls, 0);
});

test("Signal does not start a voice request for an already-cancelled operation", async () => {
  const parentController = new AbortController();
  parentController.abort();
  let requestCalls = 0;

  await assert.rejects(
    requestSignalVoiceWithFallback({
      parentSignal: parentController.signal,
      requestPreferred: async () => {
        requestCalls += 1;
        return "elevenlabs";
      },
      requestBuiltin: async () => {
        requestCalls += 1;
        return "builtin";
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(requestCalls, 0);
});

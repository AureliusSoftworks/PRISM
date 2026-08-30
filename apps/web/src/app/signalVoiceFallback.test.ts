import assert from "node:assert/strict";
import test from "node:test";
import {
  requestSignalVoiceWithFallback,
  SIGNAL_ONLINE_VOICE_TIMEOUT_MAX_MS,
  SIGNAL_ONLINE_VOICE_TIMEOUT_MS,
  SIGNAL_BUILTIN_VOICE_TIMEOUT_MS,
  SIGNAL_VOICE_START_SETTLE_GRACE_MS,
  signalOnlineVoiceTimeoutMs,
  signalPreferredVoiceClipReady,
  signalVoiceClipMatchesEpisodeEngine,
  signalVoiceEngineFamily,
  signalVoiceStartTimeoutMs,
} from "./signalVoiceFallback.ts";

test("Signal keeps one audible engine family per participant and episode", () => {
  assert.equal(signalVoiceEngineFamily("builtin-provider-fallback"), "builtin");
  assert.equal(signalVoiceEngineFamily("elevenlabs"), "elevenlabs");
  assert.equal(
    signalVoiceClipMatchesEpisodeEngine({
      engineUsed: "builtin-provider-fallback",
      selectedEngine: "elevenlabs",
      pinnedEngine: "elevenlabs",
    }),
    false,
  );
  assert.equal(
    signalVoiceClipMatchesEpisodeEngine({
      engineUsed: "builtin-local-fallback",
      selectedEngine: "elevenlabs",
      pinnedEngine: "builtin",
    }),
    true,
  );
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

test("Signal gives long closing lines more preferred-voice patience", () => {
  assert.equal(signalOnlineVoiceTimeoutMs(0), SIGNAL_ONLINE_VOICE_TIMEOUT_MS);
  assert.equal(
    signalOnlineVoiceTimeoutMs(40),
    SIGNAL_ONLINE_VOICE_TIMEOUT_MS + 40 * 35,
  );
  assert.ok(signalOnlineVoiceTimeoutMs(400) > SIGNAL_ONLINE_VOICE_TIMEOUT_MS);
  assert.equal(
    signalOnlineVoiceTimeoutMs(10_000),
    SIGNAL_ONLINE_VOICE_TIMEOUT_MAX_MS,
  );
});

test("Signal voice startup waits for the bounded built-in synthesis budget", () => {
  assert.equal(
    signalVoiceStartTimeoutMs({
      textLength: 120,
      voiceMode: "english",
      englishVoiceEngine: "builtin",
    }),
    SIGNAL_BUILTIN_VOICE_TIMEOUT_MS + SIGNAL_VOICE_START_SETTLE_GRACE_MS,
  );
});

test("Signal voice startup includes Premium timeout before built-in recovery", () => {
  assert.equal(
    signalVoiceStartTimeoutMs({
      textLength: 120,
      voiceMode: "english",
      englishVoiceEngine: "elevenlabs",
    }),
    signalOnlineVoiceTimeoutMs(120) +
      SIGNAL_BUILTIN_VOICE_TIMEOUT_MS +
      SIGNAL_VOICE_START_SETTLE_GRACE_MS,
  );
});

test("Signal procedural voices keep a short bounded startup watchdog", () => {
  assert.equal(
    signalVoiceStartTimeoutMs({
      textLength: 120,
      voiceMode: "bottish",
      englishVoiceEngine: "builtin",
    }),
    SIGNAL_ONLINE_VOICE_TIMEOUT_MS,
  );
});

test("Signal rejects cached builtin clips when Premium voice was requested", () => {
  assert.equal(
    signalPreferredVoiceClipReady({ engineUsed: "elevenlabs" }, "elevenlabs"),
    true,
  );
  assert.equal(
    signalPreferredVoiceClipReady({ engineUsed: "builtin" }, "elevenlabs"),
    false,
  );
  assert.equal(
    signalPreferredVoiceClipReady(
      { engineUsed: "builtin-provider-fallback" },
      "elevenlabs",
    ),
    false,
  );
  assert.equal(
    signalPreferredVoiceClipReady({ engineUsed: "builtin" }, "builtin"),
    true,
  );
  assert.equal(signalPreferredVoiceClipReady(null, "elevenlabs"), false);
});

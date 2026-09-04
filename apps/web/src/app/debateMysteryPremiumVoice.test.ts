import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1 } from "@localai/shared";
import { playWhodunnitPremiumVoice, type WhodunnitPremiumSelection } from "./debateMysteryPremiumVoice.ts";

const selected: WhodunnitPremiumSelection = {
  voiceMode: "english", whodunnitSpeechType: "premium", audioEnabled: true,
  volume: 0.7, localOnly: false, hasKey: true,
};
const performance = {
  lineId: "line-question", cacheKey: "frozen-performance", speakerBotId: "frozen-prosecutor", spokenText: "Where were you?",
  voiceProfile: { ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1, elevenLabsVoiceId: "frozen-voice" },
};

test("Premium plays only the requested visible performance through the supplied canonical player", async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  assert.equal(await playWhodunnitPremiumVoice({
    sessionId: "case-1", lineId: performance.lineId, localOnly: false,
    signal: controller.signal, lifecycle: {}, selection: () => selected,
    read: async (path, options) => {
      calls.push(path);
      assert.equal(options.signal, controller.signal);
      return { performance };
    },
    play: async (received) => {
      calls.push("play");
      assert.equal(received, performance);
      return true;
    },
    stop: () => { throw new Error("unexpected stop"); },
  }), true);
  assert.deepEqual(calls, ["/api/debates/case-1/mystery-spoken-performance/line-question", "play"]);
});

test("muted, LOCAL, missing-key, local English, Babble and Bottish never request Premium", async () => {
  for (const override of [
    { audioEnabled: false }, { volume: 0 }, { voiceMode: "mute" },
    { localOnly: true }, { hasKey: false }, { whodunnitSpeechType: "english" as const },
  ]) {
    let reads = 0;
    assert.equal(await playWhodunnitPremiumVoice({
      sessionId: "case-1", lineId: performance.lineId, localOnly: false,
      signal: new AbortController().signal, lifecycle: {}, selection: () => ({ ...selected, ...override }),
      read: async () => { reads++; throw new Error("must not read"); },
      play: async () => { assert.fail("must not play"); }, stop: () => assert.fail("must not stop"),
    }), false, JSON.stringify(override));
    assert.equal(reads, 0, JSON.stringify(override));
  }
  let reads = 0;
  for (const aborted of [false, true]) {
    const controller = new AbortController();
    if (aborted) controller.abort();
    await playWhodunnitPremiumVoice({
      sessionId: "case-1", lineId: performance.lineId, localOnly: !aborted,
      signal: controller.signal, lifecycle: {}, selection: () => selected,
      read: async () => { reads++; return { performance }; },
      play: async () => assert.fail("sealed LOCAL or cancelled case must not play"), stop: () => {},
    });
  }
  assert.equal(reads, 0);
});

test("a selection change or cancellation during the read cannot start stale Premium", async () => {
  for (const cancel of [false, true]) {
    const controller = new AbortController();
    let selection = selected;
    let played = false;
    assert.equal(await playWhodunnitPremiumVoice({
      sessionId: "case-1", lineId: performance.lineId, localOnly: false,
      signal: controller.signal, lifecycle: {}, selection: () => selection,
      read: async () => {
        if (cancel) controller.abort();
        else selection = { ...selected, whodunnitSpeechType: "english" };
        return { performance };
      },
      play: async () => { played = true; return true; }, stop: () => {},
    }), false);
    assert.equal(played, false);
  }
});

test("dialogue cancellation stops the canonical player exactly once", async () => {
  const controller = new AbortController();
  let stops = 0;
  await playWhodunnitPremiumVoice({
    sessionId: "case-1", lineId: performance.lineId, localOnly: false,
    signal: controller.signal, lifecycle: {}, selection: () => selected,
    read: async () => ({ performance }),
    play: async () => { controller.abort(); return false; },
    stop: () => { stops++; },
  });
  assert.equal(stops, 1);
});

test("unavailable, mismatched, anonymous and disabled performances retain local fallback", async () => {
  for (const value of [null, { ...performance, lineId: "unheard-line" },
    { ...performance, speakerBotId: "" },
    { ...performance, voiceProfile: { ...performance.voiceProfile, enabled: false } }]) {
    let plays = 0;
    assert.equal(await playWhodunnitPremiumVoice({
      sessionId: "case-1", lineId: performance.lineId, localOnly: false,
      signal: new AbortController().signal, lifecycle: {}, selection: () => selected,
      read: async () => { if (!value) throw new Error("not found"); return { performance: value }; },
      play: async () => { plays++; return true; }, stop: () => {},
    }), false);
    assert.equal(plays, 0);
  }
});

test("a failed canonical Premium player returns control to the local fallback", async () => {
  for (const throws of [false, true]) {
    assert.equal(await playWhodunnitPremiumVoice({
      sessionId: "case-1", lineId: performance.lineId, localOnly: false,
      signal: new AbortController().signal, lifecycle: {}, selection: () => selected,
      read: async () => ({ performance }),
      play: async () => { if (throws) throw new Error("unavailable"); return false; },
      stop: () => {},
    }), false);
  }
});

test("only V2 play receives Premium; Forge, return prewarming, Babble and local fallback remain separated", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const debate = readFileSync(new URL("./DebateExperience.tsx", import.meta.url), "utf8");
  const experience = readFileSync(new URL("./DebateMysteryV2Experience.tsx", import.meta.url), "utf8");
  const shared = debate.slice(debate.indexOf("const mysterySharedProps ="), debate.indexOf("const mysteryPreludeMusicPhase ="));
  assert.doesNotMatch(shared, /playMysteryPremiumVoice/u);
  assert.match(debate, /<DebateMysteryV2Play\s+\{\.\.\.mysterySharedProps\}\s+playMysteryPremiumVoice=/u);
  assert.match(debate, /session\.format === "whodunnit" && session\.formatState\.version === 2\) return null/u);
  assert.match(page, /voiceProfile: performance\.voiceProfile/u);
  assert.match(page, /spokenText: performance\.spokenText/u);
  assert.match(page, /voiceCacheKey: messageId/u);
  assert.match(page, /performance\.cacheKey/u);
  assert.match(page, /!preparedClip && playbackSurface === "debate" && debateFormat === "whodunnit"[\s\S]{0,260}loadCapturedReplayVoiceAudio/u);
  const premium = page.slice(page.indexOf("playMysteryPremiumVoice={(voiceRequest)"), page.indexOf("onStopUtterance={stopBotcastUtterance}"));
  assert.match(premium, /return playDebateUtterance\(/u);
  assert.doesNotMatch(premium, /prefetch|onPrepareUtterance|elevenlabs\.io/u);
  assert.match(experience, /\(displayedDialogue\.delivery \?\? "spoken"\) === "spoken"/u);
  assert.match(experience, /localOnly: props\.session\.responseMode === "local"/u);
  assert.match(experience, /if \(!premiumIsCurrent\(\)\) return;\s+if \(played \|\| premiumStarted\) completeBeatNaturally\(\);\s+else void audio\.play\(\)/u);
  assert.match(experience, /completed = true;\s+premiumController\.abort\(\)/u);
  assert.match(experience, /onProgress: \(elapsedMs, durationMs\)/u);
  assert.match(experience, /alignment: premiumAlignment, audible: true/u);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { BotAvatarSfxV1 } from "@localai/shared";
import {
  botAvatarSfxShouldPlay,
  stopBotAvatarSfxAudio,
  syncBotAvatarSfxAudio,
  type BotAvatarSfxAudioTarget,
} from "./botAvatarSfx.ts";

const sfx: BotAvatarSfxV1 = {
  v: 1,
  source: "upload",
  audioDataUrl: "data:audio/mpeg;base64,AQID",
  playWhileTalking: true,
  playWhileIdle: false,
  playWhileThinking: true,
  volume: 0.5,
};

test("avatar SFX maps the editor demos to distinct playback states", () => {
  assert.equal(botAvatarSfxShouldPlay(sfx, "talking"), true);
  assert.equal(botAvatarSfxShouldPlay(sfx, "thinking"), true);
  assert.equal(botAvatarSfxShouldPlay(sfx, "idle"), false);
  assert.equal(botAvatarSfxShouldPlay(sfx, "blink"), false);
});

test("avatar SFX treats blink as not-talking and respects mute volume", () => {
  const idleLoop = {
    ...sfx,
    playWhileIdle: true,
    volume: 0.25,
  };
  assert.equal(botAvatarSfxShouldPlay(idleLoop, "idle"), true);
  assert.equal(botAvatarSfxShouldPlay(idleLoop, "blink"), true);
  assert.equal(botAvatarSfxShouldPlay({ ...idleLoop, volume: 0 }, "idle"), false);
});

class FakeAvatarSfxAudio implements BotAvatarSfxAudioTarget {
  src = "";
  currentTime = 0;
  loop = false;
  volume = 1;
  paused = true;
  loadCalls = 0;
  pauseCalls = 0;
  playCalls = 0;

  load(): void {
    this.loadCalls += 1;
  }

  pause(): void {
    this.pauseCalls += 1;
    this.paused = true;
  }

  async play(): Promise<void> {
    this.playCalls += 1;
    this.paused = false;
  }
}

test("avatar SFX keeps one loop running across enabled live states", () => {
  const audio = new FakeAvatarSfxAudio();
  const allStates = {
    ...sfx,
    playWhileIdle: true,
  };

  const loadedSource = syncBotAvatarSfxAudio(
    audio,
    allStates,
    "idle",
    null,
  );
  assert.equal(loadedSource, sfx.audioDataUrl);
  assert.equal(audio.src, sfx.audioDataUrl);
  assert.equal(audio.loop, true);
  assert.equal(audio.volume, 0.5);
  assert.equal(audio.loadCalls, 1);
  assert.equal(audio.playCalls, 1);

  const talkingSource = syncBotAvatarSfxAudio(
    audio,
    allStates,
    "talking",
    loadedSource,
  );
  const thinkingSource = syncBotAvatarSfxAudio(
    audio,
    allStates,
    "thinking",
    talkingSource,
  );
  assert.equal(thinkingSource, loadedSource);
  assert.equal(audio.loadCalls, 1);
  assert.equal(audio.playCalls, 1);
  assert.equal(audio.paused, false);
});

test("avatar SFX pauses outside its checked states and resumes without reloading", () => {
  const audio = new FakeAvatarSfxAudio();
  const loadedSource = syncBotAvatarSfxAudio(audio, sfx, "talking", null);
  audio.currentTime = 1.25;

  const pausedSource = syncBotAvatarSfxAudio(
    audio,
    sfx,
    "idle",
    loadedSource,
  );
  assert.equal(pausedSource, loadedSource);
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 0);

  syncBotAvatarSfxAudio(audio, sfx, "thinking", pausedSource);
  assert.equal(audio.loadCalls, 1);
  assert.equal(audio.playCalls, 2);

  audio.currentTime = 0.75;
  stopBotAvatarSfxAudio(audio);
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 0);
});

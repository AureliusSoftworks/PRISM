import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  beginPrismFullscreenBlockingAudioMute,
  isPrismFullscreenBlockingAudioMuted,
  resetPrismFullscreenBlockingAudioMuteForTests,
} from "./prismFullscreenBlockingAudio.ts";
import {
  botAvatarSfxShouldPlay,
  type BotAvatarSfxPlayback,
} from "./botAvatarSfx.ts";

const thinkingSfx: BotAvatarSfxPlayback = {
  audioDataUrl: "data:audio/mpeg;base64,AAA",
  playWhileIdle: false,
  playWhileTalking: false,
  playWhileThinking: true,
  volume: 0.7,
};

describe("fullscreen blocking audio mute", () => {
  it("mutes avatar thinking SFX while a fullscreen loader holds the gate", () => {
    resetPrismFullscreenBlockingAudioMuteForTests();
    assert.equal(botAvatarSfxShouldPlay(thinkingSfx, "thinking"), true);
    const release = beginPrismFullscreenBlockingAudioMute();
    assert.equal(isPrismFullscreenBlockingAudioMuted(), true);
    assert.equal(botAvatarSfxShouldPlay(thinkingSfx, "thinking"), false);
    assert.equal(botAvatarSfxShouldPlay(thinkingSfx, "talking"), false);
    release();
    assert.equal(isPrismFullscreenBlockingAudioMuted(), false);
    assert.equal(botAvatarSfxShouldPlay(thinkingSfx, "thinking"), true);
  });

  it("keeps a nested mute until every fullscreen overlay releases", () => {
    resetPrismFullscreenBlockingAudioMuteForTests();
    const first = beginPrismFullscreenBlockingAudioMute();
    const second = beginPrismFullscreenBlockingAudioMute();
    assert.equal(botAvatarSfxShouldPlay(thinkingSfx, "thinking"), false);
    first();
    assert.equal(isPrismFullscreenBlockingAudioMuted(), true);
    assert.equal(botAvatarSfxShouldPlay(thinkingSfx, "thinking"), false);
    second();
    assert.equal(botAvatarSfxShouldPlay(thinkingSfx, "thinking"), true);
  });

  it("wires fullscreen PrismBlockingLoader and model warmup to the mute gate", () => {
    const blocking = readFileSync(
      new URL("./PrismBlockingLoader.tsx", import.meta.url),
      "utf8",
    );
    const warmup = readFileSync(
      new URL("./ModelWarmupIntermission.tsx", import.meta.url),
      "utf8",
    );
    assert.match(blocking, /beginPrismFullscreenBlockingAudioMute/u);
    assert.match(
      blocking,
      /if \(!open \|\| docked\) return;[\s\S]{0,80}beginPrismFullscreenBlockingAudioMute\(\)/u,
    );
    assert.match(warmup, /beginPrismFullscreenBlockingAudioMute/u);
  });
});

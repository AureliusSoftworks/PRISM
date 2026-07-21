import assert from "node:assert/strict";
import test from "node:test";
import type { BotAvatarSfxV1 } from "@localai/shared";
import { botAvatarSfxShouldPlay } from "./botAvatarSfx.ts";

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

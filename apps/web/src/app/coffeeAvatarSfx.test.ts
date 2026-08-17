import assert from "node:assert/strict";
import test from "node:test";
import {
  COFFEE_SEAT_THINKING_AVATAR_SFX_GAIN,
  coffeeSeatAvatarSfxBusGain,
} from "./coffeeAvatarSfx.ts";

test("Coffee seat avatar SFX gain stays muted or idle when silent", () => {
  const mutedState = coffeeSeatAvatarSfxBusGain({
    avatarSfxState: "thinking",
    voiceBusGain: 0,
  });
  assert.equal(mutedState, 0);
});

test("Coffee seat avatar SFX gain stays idle and talking unchanged", () => {
  assert.equal(
    coffeeSeatAvatarSfxBusGain({
      avatarSfxState: "idle",
      voiceBusGain: 0.5,
    }),
    0.5,
  );
  assert.equal(
    coffeeSeatAvatarSfxBusGain({
      avatarSfxState: "talking",
      voiceBusGain: 0.5,
    }),
    0.5,
  );
});

test("Coffee seat avatar SFX applies thinking-only 12% gain", () => {
  assert.equal(
    coffeeSeatAvatarSfxBusGain({
      avatarSfxState: "thinking",
      voiceBusGain: 1,
    }),
    COFFEE_SEAT_THINKING_AVATAR_SFX_GAIN,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { signalAvatarSfxShouldPlay } from "./signalAvatarSfx.ts";

test("Signal enables Persona SFX only on a fully presented stage", () => {
  assert.equal(
    signalAvatarSfxShouldPlay({
      surface: "stage",
      introActive: false,
      outroActive: false,
    }),
    true,
  );
  assert.equal(
    signalAvatarSfxShouldPlay({
      surface: "dashboard",
      introActive: false,
      outroActive: false,
    }),
    false,
  );
  assert.equal(
    signalAvatarSfxShouldPlay({
      surface: "stage",
      introActive: true,
      outroActive: false,
    }),
    false,
  );
  assert.equal(
    signalAvatarSfxShouldPlay({
      surface: "stage",
      introActive: false,
      outroActive: true,
    }),
    false,
  );
});

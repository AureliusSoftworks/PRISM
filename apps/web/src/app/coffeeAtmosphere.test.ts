import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COFFEE_ATMOSPHERE_SPEAKER_BLEND_MS,
  coffeeAtmosphereActivity,
  coffeeAtmosphereHexColor,
  coffeeAtmosphereMixColor,
  coffeeAtmosphereMotes,
  coffeeAtmospherePalette,
  coffeeAtmosphereSeed,
  coffeeAtmosphereSpeakerLift,
} from "./coffeeAtmosphere.ts";

describe("Coffee atmosphere model", () => {
  it("creates deterministic session/group-seeded motes", () => {
    const first = coffeeAtmosphereMotes("group:violet-room", 28);
    const revisited = coffeeAtmosphereMotes("group:violet-room", 28);
    const different = coffeeAtmosphereMotes("session:next", 28);
    assert.deepEqual(revisited, first);
    assert.notDeepEqual(different, first);
    assert.equal(first.length, 28);
    assert.ok(first.every((mote) => mote.x >= 0.16 && mote.x <= 0.84));
    assert.equal(coffeeAtmosphereSeed("stable"), coffeeAtmosphereSeed("stable"));
  });

  it("keeps setup and finished review static while animating arrivals/live/replay", () => {
    for (const phase of ["selecting", "preview", "topic", "finished"] as const) {
      assert.equal(
        coffeeAtmosphereActivity({
          phase,
          replayActive: false,
          activeSpeakerColor: null,
        }),
        "settled",
      );
    }
    assert.equal(
      coffeeAtmosphereActivity({
        phase: "arriving",
        replayActive: false,
        activeSpeakerColor: null,
      }),
      "ambient",
    );
    assert.equal(
      coffeeAtmosphereActivity({
        phase: "live",
        replayActive: false,
        activeSpeakerColor: "#55ccff",
      }),
      "interactive",
    );
    assert.equal(
      coffeeAtmosphereActivity({
        phase: "finished",
        replayActive: true,
        activeSpeakerColor: null,
      }),
      "ambient",
    );
  });

  it("uses a cool light-mode palette and a restrained 700ms speaker lift", () => {
    assert.deepEqual(coffeeAtmospherePalette("light"), [
      "#77bdfc",
      "#9be7ff",
      "#9da9ff",
      "#d2a7ff",
    ]);
    assert.equal(COFFEE_ATMOSPHERE_SPEAKER_BLEND_MS, 700);
    assert.equal(coffeeAtmosphereSpeakerLift("dark"), 0.016);
    assert.equal(coffeeAtmosphereSpeakerLift("light"), 0.01);
  });

  it("validates and interpolates normalized speaker colors", () => {
    assert.equal(coffeeAtmosphereHexColor("#000000"), 0x000000);
    assert.equal(coffeeAtmosphereHexColor("#ffffff"), 0xffffff);
    assert.equal(coffeeAtmosphereHexColor("provider-secret"), null);
    assert.equal(coffeeAtmosphereMixColor(0x000000, 0xffffff, 0.5), 0x808080);
  });
});

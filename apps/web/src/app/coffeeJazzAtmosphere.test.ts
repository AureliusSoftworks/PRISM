import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COFFEE_JAZZ_STATIONS,
  DEFAULT_COFFEE_JAZZ_ATMOSPHERE_PREFERENCE,
  coffeeJazzBackgroundUrl,
  coffeeJazzStationById,
  normalizeCoffeeJazzAtmospherePreference,
} from "./coffeeJazzAtmosphere.ts";

describe("coffeeJazzAtmosphere", () => {
  it("ships five public jazz station loops", () => {
    assert.equal(COFFEE_JAZZ_STATIONS.length, 5);
    for (const station of COFFEE_JAZZ_STATIONS) {
      assert.match(station.audioUrl, /^\/audio\/coffee\/jazz\/.+\.mp3$/u);
      assert.equal(station.audioUrl.includes(".."), false);
    }
  });

  it("defaults to enabled Rainy Morning", () => {
    assert.deepEqual(DEFAULT_COFFEE_JAZZ_ATMOSPHERE_PREFERENCE, {
      enabled: true,
      stationId: "rainy-morning",
    });
    assert.equal(
      coffeeJazzBackgroundUrl(DEFAULT_COFFEE_JAZZ_ATMOSPHERE_PREFERENCE),
      "/audio/coffee/jazz/rainy-morning.mp3",
    );
  });

  it("normalizes unknown preference payloads safely", () => {
    assert.deepEqual(normalizeCoffeeJazzAtmospherePreference(null), {
      enabled: true,
      stationId: "rainy-morning",
    });
    assert.deepEqual(
      normalizeCoffeeJazzAtmospherePreference({
        enabled: false,
        stationId: "dreamy-steam",
      }),
      { enabled: false, stationId: "dreamy-steam" },
    );
    assert.deepEqual(
      normalizeCoffeeJazzAtmospherePreference({
        enabled: "yes",
        stationId: "not-a-station",
      }),
      { enabled: true, stationId: "rainy-morning" },
    );
  });

  it("returns null background URL when Jazz is off", () => {
    assert.equal(
      coffeeJazzBackgroundUrl({ enabled: false, stationId: "sunny-brunch" }),
      null,
    );
    assert.equal(
      coffeeJazzStationById("sunny-brunch").label,
      "Sunny Brunch",
    );
  });
});

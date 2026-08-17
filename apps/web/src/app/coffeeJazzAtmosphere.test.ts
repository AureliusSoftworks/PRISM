import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COFFEE_JAZZ_STATIONS,
  COFFEE_SHOP_ENVIRONMENT_DUCKED_MIX,
  COFFEE_SHOP_ENVIRONMENT_MIX,
  COFFEE_SHOP_ENVIRONMENT_URL,
  DEFAULT_COFFEE_JAZZ_ATMOSPHERE_PREFERENCE,
  coffeeJazzBackgroundUrl,
  coffeeJazzStationById,
  coffeeShopEnvironmentMix,
  normalizeCoffeeJazzAtmospherePreference,
  randomCoffeeJazzStationId,
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
      source: "fallback",
      stationIdByGroupId: {},
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
      source: "fallback",
      stationIdByGroupId: {},
    });
    assert.deepEqual(
      normalizeCoffeeJazzAtmospherePreference({
        enabled: false,
        stationId: "dreamy-steam",
      }),
      {
        enabled: true,
        stationId: "dreamy-steam",
        source: "fallback",
        stationIdByGroupId: {},
      },
    );
    assert.deepEqual(
      normalizeCoffeeJazzAtmospherePreference({
        enabled: "yes",
        stationId: "not-a-station",
      }),
      {
        enabled: true,
        stationId: "rainy-morning",
        source: "fallback",
        stationIdByGroupId: {},
      },
    );
    assert.deepEqual(
      normalizeCoffeeJazzAtmospherePreference({
        stationIdByGroupId: {
          "group-a": "sunny-brunch",
          "group-b": "not-a-station",
        },
      }).stationIdByGroupId,
      { "group-a": "sunny-brunch" },
    );
  });

  it("randomly selects across all five bundled songs", () => {
    assert.deepEqual(
      [0, 0.2, 0.4, 0.6, 0.8].map((sample) =>
        randomCoffeeJazzStationId(() => sample),
      ),
      COFFEE_JAZZ_STATIONS.map((station) => station.id),
    );
    assert.equal(randomCoffeeJazzStationId(() => -1), "rainy-morning");
    assert.equal(randomCoffeeJazzStationId(() => 1), "dreamy-steam");
  });

  it("returns null background URL when Jazz is off", () => {
    assert.equal(
      coffeeJazzBackgroundUrl({
        enabled: false,
        stationId: "sunny-brunch",
        source: "fallback",
        stationIdByGroupId: {},
      }),
      null,
    );
    assert.equal(
      coffeeJazzStationById("sunny-brunch").label,
      "Sunny Brunch",
    );
  });

  it("wires a modest local coffee-shop bed that ducks under foreground voices", () => {
    assert.equal(
      COFFEE_SHOP_ENVIRONMENT_URL,
      "/audio/coffee/ambience/coffee-shop-foley-forest-loop.mp3",
    );
    assert.ok(COFFEE_SHOP_ENVIRONMENT_MIX < 0.08);
    assert.ok(COFFEE_SHOP_ENVIRONMENT_DUCKED_MIX < COFFEE_SHOP_ENVIRONMENT_MIX);
    assert.equal(coffeeShopEnvironmentMix(false), COFFEE_SHOP_ENVIRONMENT_MIX);
    assert.equal(
      coffeeShopEnvironmentMix(true),
      COFFEE_SHOP_ENVIRONMENT_DUCKED_MIX,
    );
  });
});

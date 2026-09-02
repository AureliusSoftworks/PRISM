/**
 * Coffee Jazz is a local browser QoL preference for café table beds.
 * It is never part of CoffeeSessionSettings, group snapshots, or faithful
 * audio masters — headphones-only atmosphere for live tables and replay viewing.
 */

export const PRISM_COFFEE_JAZZ_ATMOSPHERE_STORAGE_KEY =
  "prism_coffee_jazz_atmosphere_v1";

export const COFFEE_JAZZ_STATION_IDS = [
  "rainy-morning",
  "late-night-lounge",
  "sunny-brunch",
  "rhodes-nook",
  "dreamy-steam",
] as const;

export type CoffeeJazzStationId = (typeof COFFEE_JAZZ_STATION_IDS)[number];

export type CoffeeAtmosphereAudioSource = "fallback" | "custom";

export type CoffeeJazzAtmospherePreference = {
  enabled: boolean;
  stationId: CoffeeJazzStationId;
  source: CoffeeAtmosphereAudioSource;
  stationIdByGroupId: Record<string, CoffeeJazzStationId>;
};

export type CoffeeJazzStation = {
  id: CoffeeJazzStationId;
  label: string;
  audioUrl: string;
};

export const DEFAULT_COFFEE_JAZZ_ATMOSPHERE_PREFERENCE: CoffeeJazzAtmospherePreference =
  {
    enabled: true,
    stationId: "rainy-morning",
    source: "fallback",
    stationIdByGroupId: {},
  };

export const COFFEE_JAZZ_STATIONS: readonly CoffeeJazzStation[] = [
  {
    id: "rainy-morning",
    label: "Rainy Morning",
    audioUrl: "/audio/coffee/jazz/rainy-morning.mp3",
  },
  {
    id: "late-night-lounge",
    label: "Late-Night Lounge",
    audioUrl: "/audio/coffee/jazz/late-night-lounge.mp3",
  },
  {
    id: "sunny-brunch",
    label: "Sunny Brunch",
    audioUrl: "/audio/coffee/jazz/sunny-brunch.mp3",
  },
  {
    id: "rhodes-nook",
    label: "Rhodes Nook",
    audioUrl: "/audio/coffee/jazz/rhodes-nook.mp3",
  },
  {
    id: "dreamy-steam",
    label: "Dreamy Steam",
    audioUrl: "/audio/coffee/jazz/dreamy-steam.mp3",
  },
] as const;

/** Soft under-speech bed level for Coffee Jazz. */
export const COFFEE_JAZZ_BACKGROUND_MIX = 0.11;

/** Non-musical, loopable café room tone that sits beneath Coffee Jazz. */
export const COFFEE_SHOP_ENVIRONMENT_URL =
  "/audio/coffee/ambience/coffee-shop-foley-forest-loop.mp3";
export const COFFEE_SHOP_ENVIRONMENT_MIX = 0.055;
export const COFFEE_SHOP_ENVIRONMENT_DUCKED_MIX = 0.022;
export const COFFEE_SHOP_ENVIRONMENT_DUCK_MS = 220;

export function coffeeShopEnvironmentMix(
  foregroundVoiceActive: boolean,
): number {
  return foregroundVoiceActive
    ? COFFEE_SHOP_ENVIRONMENT_DUCKED_MIX
    : COFFEE_SHOP_ENVIRONMENT_MIX;
}

export function isCoffeeJazzStationId(
  value: unknown,
): value is CoffeeJazzStationId {
  return (
    typeof value === "string" &&
    (COFFEE_JAZZ_STATION_IDS as readonly string[]).includes(value)
  );
}

/** Selects one bundled Coffee song for a newly created group. */
export function randomCoffeeJazzStationId(
  random: () => number = Math.random,
): CoffeeJazzStationId {
  const sample = random();
  const boundedSample = Number.isFinite(sample)
    ? Math.min(Math.max(sample, 0), 1 - Number.EPSILON)
    : 0;
  return COFFEE_JAZZ_STATION_IDS[
    Math.floor(boundedSample * COFFEE_JAZZ_STATION_IDS.length)
  ]!;
}

export function isCoffeeAtmosphereAudioSource(
  value: unknown,
): value is CoffeeAtmosphereAudioSource {
  return value === "fallback" || value === "custom";
}

export function normalizeCoffeeJazzAtmospherePreference(
  raw: unknown,
): CoffeeJazzAtmospherePreference {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_COFFEE_JAZZ_ATMOSPHERE_PREFERENCE };
  }
  const record = raw as Record<string, unknown>;
  const stationIdByGroupId: Record<string, CoffeeJazzStationId> = {};
  if (
    record.stationIdByGroupId &&
    typeof record.stationIdByGroupId === "object" &&
    !Array.isArray(record.stationIdByGroupId)
  ) {
    for (const [groupId, stationId] of Object.entries(
      record.stationIdByGroupId as Record<string, unknown>,
    )) {
      if (groupId.trim() && isCoffeeJazzStationId(stationId)) {
        stationIdByGroupId[groupId] = stationId;
      }
    }
  }
  return {
    // Source selection replaced the old on/off pill. Table atmosphere is now
    // always present as either the chosen fallback or the generated group bed.
    enabled: true,
    stationId: isCoffeeJazzStationId(record.stationId)
      ? record.stationId
      : DEFAULT_COFFEE_JAZZ_ATMOSPHERE_PREFERENCE.stationId,
    source: isCoffeeAtmosphereAudioSource(record.source)
      ? record.source
      : DEFAULT_COFFEE_JAZZ_ATMOSPHERE_PREFERENCE.source,
    stationIdByGroupId,
  };
}

export function coffeeJazzStationById(
  stationId: CoffeeJazzStationId,
): CoffeeJazzStation {
  return (
    COFFEE_JAZZ_STATIONS.find((station) => station.id === stationId) ??
    COFFEE_JAZZ_STATIONS[0]!
  );
}

export function coffeeJazzBackgroundUrl(
  preference: CoffeeJazzAtmospherePreference,
): string | null {
  if (!preference.enabled) return null;
  return coffeeJazzStationById(preference.stationId).audioUrl;
}

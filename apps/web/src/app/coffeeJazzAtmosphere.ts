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

export type CoffeeJazzAtmospherePreference = {
  enabled: boolean;
  stationId: CoffeeJazzStationId;
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

export function isCoffeeJazzStationId(
  value: unknown,
): value is CoffeeJazzStationId {
  return (
    typeof value === "string" &&
    (COFFEE_JAZZ_STATION_IDS as readonly string[]).includes(value)
  );
}

export function normalizeCoffeeJazzAtmospherePreference(
  raw: unknown,
): CoffeeJazzAtmospherePreference {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_COFFEE_JAZZ_ATMOSPHERE_PREFERENCE };
  }
  const record = raw as Record<string, unknown>;
  return {
    enabled:
      typeof record.enabled === "boolean"
        ? record.enabled
        : DEFAULT_COFFEE_JAZZ_ATMOSPHERE_PREFERENCE.enabled,
    stationId: isCoffeeJazzStationId(record.stationId)
      ? record.stationId
      : DEFAULT_COFFEE_JAZZ_ATMOSPHERE_PREFERENCE.stationId,
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

export function loadCoffeeJazzAtmosphereFromBrowser(): CoffeeJazzAtmospherePreference {
  if (typeof window === "undefined") {
    return { ...DEFAULT_COFFEE_JAZZ_ATMOSPHERE_PREFERENCE };
  }
  try {
    const raw = window.localStorage.getItem(
      PRISM_COFFEE_JAZZ_ATMOSPHERE_STORAGE_KEY,
    );
    if (!raw) return { ...DEFAULT_COFFEE_JAZZ_ATMOSPHERE_PREFERENCE };
    return normalizeCoffeeJazzAtmospherePreference(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_COFFEE_JAZZ_ATMOSPHERE_PREFERENCE };
  }
}

export function persistCoffeeJazzAtmosphereToBrowser(
  preference: CoffeeJazzAtmospherePreference,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PRISM_COFFEE_JAZZ_ATMOSPHERE_STORAGE_KEY,
      JSON.stringify(normalizeCoffeeJazzAtmospherePreference(preference)),
    );
  } catch {
    // Private mode / quota — ignore; current session state still applies.
  }
}

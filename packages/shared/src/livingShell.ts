export const PRISM_STARTUP_PREFERENCES = [
  "home",
  "slate",
  "last_workspace",
] as const;

export type PrismStartupPreference =
  (typeof PRISM_STARTUP_PREFERENCES)[number];

export const DEFAULT_PRISM_STARTUP_PREFERENCE: PrismStartupPreference =
  "home";

export function normalizePrismStartupPreference(
  value: unknown,
  fallback: PrismStartupPreference = DEFAULT_PRISM_STARTUP_PREFERENCE,
): PrismStartupPreference {
  return typeof value === "string" &&
    (PRISM_STARTUP_PREFERENCES as readonly string[]).includes(value)
    ? (value as PrismStartupPreference)
    : fallback;
}

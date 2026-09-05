export const PRISM_STARTUP_FLAVOR_INITIAL_DELAY_MS = 2800;
export const PRISM_STARTUP_FLAVOR_INTERVAL_MS = 3200;
export const PRISM_STARTUP_SPECTRUM_SIZE = 5;

export const PRISM_STARTUP_FLAVOR_LINES = [
  "Pouring coffee...",
  "Warming up the bots...",
  "Finding a quiet corner for Zen...",
  "Tuning the Signal studio...",
  "Setting the Debate table...",
  "Winding the mansion clocks...",
  "Polishing the Theory Board...",
  "Rehearsing an objection...",
  "Dusting off the Story Slate...",
  "Mixing colors in the Avatar Studio...",
  "Lining up a few wildcards...",
  "Checking the archive for loose plot threads...",
  "Turning on the audience applause...",
  "Saving a seat for the unexpected...",
  "Asking the coffee bots to use coasters...",
  "Giving the narrator one last note...",
  "Making space for impossible ideas...",
  "Refracting one light into many colors...",
  "Sorting mysteries from red herrings...",
  "Teaching the chorus when not to interrupt...",
  "Checking the Hue Cable for tangles...",
  "Bringing the foundry up to temperature...",
  "Quieting the room before the first line...",
  "Letting the pixels stretch...",
] as const;

export interface PrismStartupFlavorStep {
  text: (typeof PRISM_STARTUP_FLAVOR_LINES)[number];
  nextCursor: number;
}

export function nextPrismStartupFlavorLine(
  cursor: number,
): PrismStartupFlavorStep {
  const safeCursor = Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
  const lineIndex = safeCursor % PRISM_STARTUP_FLAVOR_LINES.length;
  return {
    text: PRISM_STARTUP_FLAVOR_LINES[lineIndex],
    nextCursor: safeCursor + 1,
  };
}

export function nextPrismStartupSpectrumIndex(
  previousIndex: number,
  sample = Math.random(),
): number {
  const safePrevious = Number.isSafeInteger(previousIndex)
    ? ((previousIndex % PRISM_STARTUP_SPECTRUM_SIZE) +
        PRISM_STARTUP_SPECTRUM_SIZE) %
      PRISM_STARTUP_SPECTRUM_SIZE
    : 0;
  const safeSample = Number.isFinite(sample)
    ? Math.min(Math.max(sample, 0), 0.999999999)
    : 0;
  const nonRepeatingOffset =
    1 + Math.floor(safeSample * (PRISM_STARTUP_SPECTRUM_SIZE - 1));
  return (safePrevious + nonRepeatingOffset) % PRISM_STARTUP_SPECTRUM_SIZE;
}

export function prismStartupTraceText(text: string): string {
  return `${text.trimEnd().replace(/[.…]+$/u, "")}...`;
}

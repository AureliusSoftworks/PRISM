/**
 * Empty-mug reach/frown on every seat is extra paint during pileup. Skip the
 * visual while the table is crowded or already shedding frames.
 */
export function coffeeSeatShouldSkipEmptyCupVisual(args: {
  seatedCount: number;
  pileup: boolean;
  loadShedding: boolean;
}): boolean {
  if (args.loadShedding) return true;
  return args.pileup && args.seatedCount >= 4;
}

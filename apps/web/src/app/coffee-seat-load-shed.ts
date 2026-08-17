export const COFFEE_SEAT_LOAD_SHED_ENTER_FPS = 24;
export const COFFEE_SEAT_LOAD_SHED_EXIT_FPS = 42;

/**
 * Drop Coffee seats off Full HD materials only after a crowded table is
 * already missing frames. Hysteresis keeps the chassis from flickering.
 */
export function coffeeSeatShouldDropRenderedSize(args: {
  fps: number | null;
  seatedCount: number;
  currentlyShedding: boolean;
}): boolean {
  if (args.fps === null) return args.currentlyShedding;
  if (args.currentlyShedding) {
    return args.fps < COFFEE_SEAT_LOAD_SHED_EXIT_FPS;
  }
  return args.fps < COFFEE_SEAT_LOAD_SHED_ENTER_FPS && args.seatedCount >= 4;
}

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

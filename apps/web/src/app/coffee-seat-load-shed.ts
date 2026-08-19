export const COFFEE_SEAT_LOAD_SHED_ENTER_FPS = 24;

/**
 * Drop Coffee seats off Full HD materials once a live table misses frames,
 * and keep them there for the rest of the session.
 *
 * The shed is sticky because recovered FPS during a shed is mostly the shed's
 * own effect: re-promoting on an FPS band turns the seats into an HD<->Mini
 * oscillator (promote -> frames tank -> shed -> frames recover -> promote).
 * Review 2253b390 caught exactly that during arrivals — three seated bots,
 * frame rate bouncing 9/19/34/41/47 across both thresholds, avatars visibly
 * flickering — because the old exit gate released the shed whenever the table
 * was under four seats. Seat count decides nothing here; Full HD returns with
 * the next session.
 */
export function coffeeSeatShouldDropRenderedSize(args: {
  fps: number | null;
  currentlyShedding: boolean;
}): boolean {
  if (args.currentlyShedding) return true;
  return args.fps !== null && args.fps < COFFEE_SEAT_LOAD_SHED_ENTER_FPS;
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

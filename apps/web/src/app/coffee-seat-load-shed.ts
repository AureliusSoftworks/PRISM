export const COFFEE_SEAT_LOAD_SHED_ENTER_FPS = 24;
export const COFFEE_SEAT_LOAD_SHED_EXIT_FPS = 42;

/**
 * Drop Coffee seats off Full HD materials only after a crowded table is
 * already missing frames.
 *
 * The shed is sticky while the table stays crowded: recovered FPS during a
 * shed is mostly the shed's own effect, so re-promoting on an FPS band alone
 * turns the seats into an HD↔Mini oscillator (promote → frames tank → shed →
 * frames recover → promote…). Full HD returns once the crowd itself is gone
 * and frames are genuinely smooth again.
 */
export function coffeeSeatShouldDropRenderedSize(args: {
  fps: number | null;
  seatedCount: number;
  currentlyShedding: boolean;
}): boolean {
  if (args.fps === null) return args.currentlyShedding;
  if (args.currentlyShedding) {
    return (
      args.seatedCount >= 4 || args.fps < COFFEE_SEAT_LOAD_SHED_EXIT_FPS
    );
  }
  return args.fps < COFFEE_SEAT_LOAD_SHED_ENTER_FPS && args.seatedCount >= 4;
}

/**
 * Signal and Debate stages carry a small fixed cast, so there is no crowd to
 * thin: a stage that has missed frames once stays shed for the rest of its
 * live session, and Full HD returns with the next session. Re-promoting on
 * the shed's own recovered FPS would restart the HD↔Mini swap loop.
 */
export function stageShouldDropRenderedSize(args: {
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

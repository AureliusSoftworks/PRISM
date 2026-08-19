/**
 * Live reveal progress for the Coffee table, published outside React.
 *
 * The Coffee typewriter advances a character at a time on a RAF clock. Routing
 * that count through `HomeContent` state meant every character reconciled the
 * entire app surface — five HD seats, mugs, nameplates, table talk, and every
 * other lane's tree — which is what pinned a five-seat table at 1 FPS with
 * `busy 3519ms/s` (review 47d7aa3d).
 *
 * So the exact count lives here instead, in the same spirit as
 * `bindBotVoiceLightTarget`: publishers write, subscribers read, and nothing
 * above the speech bubble re-renders. Consumers that need the exact character
 * (the visible line, cut-in timing, action SFX) subscribe or read the snapshot;
 * the seat mouths and cue badges run off a deliberately coarse React state
 * committed on a fixed cadence.
 *
 * There is intentionally no frame-rate input anywhere in this module. Gating
 * publish rate on measured FPS is a feedback loop, not a fix: it widens exactly
 * when the table is worst and narrows as it recovers, so it oscillates instead
 * of settling. That is why `coffeeTypewriterCommitBudgetMs` is gone.
 */

let visibleLength = 0;
const listeners = new Set<() => void>();

/** The exact visible length — the replacement for `coffeeTypewriterLengthRef`. */
export function coffeeRevealVisibleLength(): number {
  return visibleLength;
}

/** Server render has never revealed anything yet. */
export function coffeeRevealServerVisibleLength(): number {
  return 0;
}

export function publishCoffeeRevealProgress(length: number): number {
  const next = Number.isFinite(length) && length > 0 ? Math.floor(length) : 0;
  if (next === visibleLength) return visibleLength;
  visibleLength = next;
  for (const listener of listeners) listener();
  return visibleLength;
}

export function subscribeCoffeeRevealProgress(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetCoffeeRevealProgressForTests(): void {
  visibleLength = 0;
  for (const listener of listeners) listener();
}

/**
 * Cadence for mirroring reveal progress into the coarse React state that drives
 * seat mouths, stage-direction badges, and gaze. One mouth phase: the seats
 * cannot animate faster than this anyway, so a tighter commit buys nothing and
 * costs a full-surface reconcile. Fixed on purpose — see the module note.
 */
export const COFFEE_REVEAL_COARSE_COMMIT_MS = 120;

/**
 * Whether the coarse React mirror should commit now. Always commits the final
 * character so a finished line never sits one phase short of complete.
 */
export function coffeeRevealCoarseShouldCommit(args: {
  nowMs: number;
  lastCommitAtMs: number;
  nextLength: number;
  totalLength: number;
}): boolean {
  if (args.nextLength >= args.totalLength) return true;
  return args.nowMs - args.lastCommitAtMs >= COFFEE_REVEAL_COARSE_COMMIT_MS;
}

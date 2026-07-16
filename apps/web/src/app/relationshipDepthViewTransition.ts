export interface RelationshipDepthNativeViewTransition {
  finished: Promise<void>;
  ready?: Promise<void>;
  updateCallbackDone?: Promise<void>;
  skipTransition?: () => void;
}

export interface RunRelationshipDepthViewTransitionOptions {
  startViewTransition: (
    update: () => void | Promise<void>,
  ) => RelationshipDepthNativeViewTransition;
  handoff: (insideNativeTransition: boolean) => void | Promise<void>;
  wait: (durationMs: number) => Promise<void>;
  timeoutMs: number;
  updateCallbackGraceMs: number;
  fallbackSettleMs: number;
}

export const RELATIONSHIP_DEPTH_REDUCED_CROSSFADE_MS = 140;

export function relationshipDepthNativeViewTransitionEligible({
  supported,
  reducedMotion: _reducedMotion,
  asyncHandoffSafe,
}: {
  supported: boolean;
  reducedMotion: boolean;
  asyncHandoffSafe: boolean;
}): boolean {
  // WebKit can lose DOM ownership when an async route commit removes the live
  // editor inside a native View Transition callback. Reduced motion changes
  // the animation, not that lifecycle constraint, so async handoffs always
  // use the manual crossfade.
  return supported && asyncHandoffSafe;
}

export function relationshipDepthManualBeatTiming({
  crossfade,
  reducedMotion,
}: {
  crossfade: boolean;
  reducedMotion: boolean;
}): { sourceMs: number; destinationMs: number } {
  const destinationMs = reducedMotion
    ? RELATIONSHIP_DEPTH_REDUCED_CROSSFADE_MS
    : 220;
  return {
    sourceMs: crossfade ? destinationMs : reducedMotion ? 40 : 80,
    destinationMs,
  };
}

/**
 * Runs a native View Transition without allowing a stalled snapshot or a
 * rejected update callback to strand relationship navigation. The handoff is
 * memoized so native, timeout, rejection, and late-callback paths can never
 * commit the destination more than once.
 */
export async function runRelationshipDepthViewTransition({
  startViewTransition,
  handoff,
  wait,
  timeoutMs,
  updateCallbackGraceMs,
  fallbackSettleMs,
}: RunRelationshipDepthViewTransitionOptions): Promise<"native" | "fallback"> {
  let handoffPromise: Promise<void> | null = null;
  const runHandoff = (insideNativeTransition: boolean): Promise<void> => {
    if (!handoffPromise) {
      handoffPromise = Promise.resolve().then(() =>
        handoff(insideNativeTransition),
      );
    }
    return handoffPromise;
  };

  const transition = startViewTransition(() => runHandoff(true));
  // `ready` rejects when a transition is deliberately skipped. Consume that
  // control-flow rejection so browsers do not surface it as an unhandled page
  // error while the fallback completes normally.
  void transition.ready?.catch(() => undefined);
  const outcome = await Promise.race([
    transition.finished.then(
      () => "finished" as const,
      () => "rejected" as const,
    ),
    wait(timeoutMs).then(() => "timeout" as const),
  ]);

  if (outcome !== "finished") {
    try {
      transition.skipTransition?.();
    } catch {
      // The manual handoff below remains authoritative when native cleanup
      // itself is unavailable.
    }
    if (outcome === "timeout" && transition.updateCallbackDone) {
      await Promise.race([
        transition.updateCallbackDone.catch(() => undefined),
        wait(updateCallbackGraceMs),
      ]);
    }
  }

  // A conforming finished promise implies the callback completed. Calling the
  // memoized handoff here also fails closed for incomplete test doubles and
  // browser edge cases where finished settles without invoking it.
  await runHandoff(false);
  if (outcome !== "finished") {
    await wait(fallbackSettleMs);
    return "fallback";
  }
  return "native";
}

import type { PreparedTurnV1 } from "@localai/shared";

export const SIGNAL_PREPARATION_POLL_WAIT_MS = 15_000;
export const SIGNAL_PREPARATION_MAX_WAIT_MS = 30_000;

export type SignalTurnPreparationWaitResult = {
  preparation: PreparedTurnV1;
  timedOut: boolean;
};

type SignalTurnPreparationRequest = (
  path: string,
  options?: RequestInit,
) => Promise<{ preparation: PreparedTurnV1 }>;

/**
 * Speculative preparation is only a head start. Once its short runway ends,
 * the live floor must be allowed to use the normal foreground recovery path.
 */
export async function waitForSignalTurnPreparation(args: {
  request: SignalTurnPreparationRequest;
  initial: PreparedTurnV1;
  signal: AbortSignal;
  maxWaitMs?: number;
  now?: () => number;
}): Promise<SignalTurnPreparationWaitResult> {
  const now = args.now ?? Date.now;
  const maxWaitMs = Math.max(
    1,
    Math.round(args.maxWaitMs ?? SIGNAL_PREPARATION_MAX_WAIT_MS),
  );
  const deadlineMs = now() + maxWaitMs;
  let preparation = args.initial;

  while (preparation.phase === "preparing") {
    const remainingMs = deadlineMs - now();
    if (remainingMs <= 0) {
      return { preparation, timedOut: true };
    }
    const status = await args.request(
      `/api/turn-preparations/${encodeURIComponent(preparation.id)}?waitMs=${Math.min(
        SIGNAL_PREPARATION_POLL_WAIT_MS,
        remainingMs,
      )}`,
      { signal: args.signal },
    );
    preparation = status.preparation;
  }

  return { preparation, timedOut: false };
}

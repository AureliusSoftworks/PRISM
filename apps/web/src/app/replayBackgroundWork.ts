/**
 * One background master per browser realm, including effect remounts. The next
 * directory poll retries admission; do not retain recordings or auth in a
 * global queue. A failed job always releases the slot.
 */
export class ReplayBackgroundWork {
  private active = false;

  async run(work: () => Promise<void>): Promise<boolean> {
    if (this.active) return false;
    this.active = true;
    try {
      await work();
      return true;
    } finally {
      this.active = false;
    }
  }
}

/** Bound independent decodes without changing source order or mixing samples. */
export async function mapReplayWorkInOrder<T, R>(
  items: readonly T[],
  concurrency: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const result = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const run = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        result[index] = await work(items[index]!);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  const workers = Array.from(
    { length: Math.min(items.length, Math.max(1, Math.floor(concurrency) || 1)) },
    run,
  );
  // Drain already-started decodes before releasing the master slot on failure.
  const settled = await Promise.allSettled(workers);
  const failure = settled.find((entry) => entry.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return result;
}

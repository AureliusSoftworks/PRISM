"use client";

export const SIGNAL_VOICE_PREFETCH_MAX_CONCURRENCY = 2;

type SignalVoicePrefetchTask<T> = (signal: AbortSignal) => Promise<T>;

interface SignalVoicePrefetchEntry<T> {
  episodeId: string;
  messageId: string;
  controller: AbortController;
  task: SignalVoicePrefetchTask<T>;
  resolve: (value: T | null) => void;
  promise: Promise<T | null>;
  started: boolean;
}

/**
 * Bounded, episode-scoped work queue for paid Signal voice preparation.
 * The caller owns the decoded-clip cache; this queue owns only in-flight
 * deduplication, concurrency, and stale/cancel invalidation.
 */
export class SignalVoicePrefetchScheduler<T> {
  private readonly entries = new Map<string, SignalVoicePrefetchEntry<T>>();
  private readonly queue: SignalVoicePrefetchEntry<T>[] = [];
  private readonly maxConcurrency: number;
  private activeCount = 0;

  constructor(maxConcurrency = SIGNAL_VOICE_PREFETCH_MAX_CONCURRENCY) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new Error("Signal voice prefetch concurrency must be positive.");
    }
    this.maxConcurrency = maxConcurrency;
  }

  schedule(args: {
    episodeId: string;
    messageId: string;
    task: SignalVoicePrefetchTask<T>;
  }): Promise<T | null> {
    const existing = this.entries.get(args.messageId);
    if (existing) return existing.promise;

    let resolveEntry!: (value: T | null) => void;
    const promise = new Promise<T | null>((resolve) => {
      resolveEntry = resolve;
    });
    const entry: SignalVoicePrefetchEntry<T> = {
      ...args,
      controller: new AbortController(),
      resolve: resolveEntry,
      promise,
      started: false,
    };
    this.entries.set(args.messageId, entry);
    this.queue.push(entry);
    this.drain();
    return promise;
  }

  invalidateMessage(episodeId: string, messageId: string): void {
    const entry = this.entries.get(messageId);
    if (!entry || entry.episodeId !== episodeId) return;
    this.invalidateEntry(entry);
  }

  invalidateEpisode(episodeId: string): void {
    for (const entry of [...this.entries.values()]) {
      if (entry.episodeId === episodeId) this.invalidateEntry(entry);
    }
  }

  clear(): void {
    for (const entry of [...this.entries.values()]) {
      this.invalidateEntry(entry);
    }
  }

  private invalidateEntry(entry: SignalVoicePrefetchEntry<T>): void {
    if (this.entries.get(entry.messageId) !== entry) return;
    this.entries.delete(entry.messageId);
    entry.controller.abort();
    if (!entry.started) {
      const queueIndex = this.queue.indexOf(entry);
      if (queueIndex >= 0) this.queue.splice(queueIndex, 1);
      entry.resolve(null);
    }
    this.drain();
  }

  private drain(): void {
    while (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      if (this.entries.get(entry.messageId) !== entry) continue;
      entry.started = true;
      this.activeCount += 1;
      void entry
        .task(entry.controller.signal)
        .then((value) =>
          entry.controller.signal.aborted ? entry.resolve(null) : entry.resolve(value),
        )
        .catch(() => entry.resolve(null))
        .finally(() => {
          this.activeCount = Math.max(0, this.activeCount - 1);
          if (this.entries.get(entry.messageId) === entry) {
            this.entries.delete(entry.messageId);
          }
          this.drain();
        });
    }
  }
}

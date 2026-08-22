export type PhosphorRasterRequest = {
  key: string;
  rasterize: () => Promise<string | null>;
  commit: (rasterUrl: string) => void;
};

/**
 * Shares unfinished raster work across React effect restarts while ensuring
 * that only the newest requested drawing can reach the DOM.
 */
export class PhosphorRasterSchedule {
  private latestKey: string | null = null;
  private committedKey: string | null = null;
  private readonly inFlight = new Map<string, Promise<string | null>>();

  request({ key, rasterize, commit }: PhosphorRasterRequest): () => void {
    this.latestKey = key;
    if (this.committedKey === key) return () => undefined;

    let request = this.inFlight.get(key);
    if (!request) {
      request = rasterize();
      this.inFlight.set(key, request);
      void request.then(
        () => {
          if (this.inFlight.get(key) === request) this.inFlight.delete(key);
        },
        () => {
          if (this.inFlight.get(key) === request) this.inFlight.delete(key);
        },
      );
    }

    let subscribed = true;
    void request.then(
      (rasterUrl) => {
        if (!subscribed || !rasterUrl || this.latestKey !== key) return;
        this.committedKey = key;
        commit(rasterUrl);
      },
      () => undefined,
    );
    return () => {
      subscribed = false;
    };
  }
}

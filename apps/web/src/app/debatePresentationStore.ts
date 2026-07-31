import type { DebateSpeechTiming } from "./DebateExperience";

export interface DebatePresentationSnapshot {
  sessionId: string | null;
  eventId: string | null;
  visibleContent: string;
  speechTiming: DebateSpeechTiming | null;
  revision: number;
}

export interface DebatePresentationStore {
  getSnapshot: () => DebatePresentationSnapshot;
  subscribe: (listener: () => void) => () => void;
  replace: (
    snapshot: Omit<DebatePresentationSnapshot, "revision">,
  ) => DebatePresentationSnapshot;
  update: (
    update:
      | Partial<Omit<DebatePresentationSnapshot, "revision">>
      | ((
          current: DebatePresentationSnapshot,
        ) => Partial<Omit<DebatePresentationSnapshot, "revision">> | null),
  ) => DebatePresentationSnapshot;
  clear: (sessionId?: string | null) => DebatePresentationSnapshot;
}

const emptySnapshot = (revision = 0): DebatePresentationSnapshot => ({
  sessionId: null,
  eventId: null,
  visibleContent: "",
  speechTiming: null,
  revision,
});

export function createDebatePresentationStore(): DebatePresentationStore {
  let snapshot = emptySnapshot();
  const listeners = new Set<() => void>();

  const publish = (
    next: Omit<DebatePresentationSnapshot, "revision">,
  ): DebatePresentationSnapshot => {
    if (
      next.sessionId === snapshot.sessionId &&
      next.eventId === snapshot.eventId &&
      next.visibleContent === snapshot.visibleContent &&
      next.speechTiming === snapshot.speechTiming
    ) {
      return snapshot;
    }
    snapshot = { ...next, revision: snapshot.revision + 1 };
    for (const listener of listeners) listener();
    return snapshot;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    replace(next) {
      return publish(next);
    },
    update(update) {
      const patch = typeof update === "function" ? update(snapshot) : update;
      if (!patch) return snapshot;
      return publish({
        sessionId: patch.sessionId ?? snapshot.sessionId,
        eventId: patch.eventId ?? snapshot.eventId,
        visibleContent: patch.visibleContent ?? snapshot.visibleContent,
        speechTiming:
          patch.speechTiming === undefined
            ? snapshot.speechTiming
            : patch.speechTiming,
      });
    },
    clear(sessionId) {
      if (
        sessionId !== undefined &&
        sessionId !== null &&
        snapshot.sessionId !== null &&
        snapshot.sessionId !== sessionId
      ) {
        return snapshot;
      }
      return publish(emptySnapshot(snapshot.revision));
    },
  };
}

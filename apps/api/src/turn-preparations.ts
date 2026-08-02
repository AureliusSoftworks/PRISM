import { randomUUID } from "node:crypto";
import {
  PREPARED_TURN_TTL_MS,
  preparedTurnCursorMatchesV1,
  type PreparedTurnCommitResultV1,
  type PreparedTurnCursorV1,
  type PreparedTurnSurfaceV1,
  type PreparedTurnUtteranceV1,
  type PreparedTurnV1,
} from "@localai/shared";

export const MAX_PREPARED_TURNS_PER_USER = 8;

export class TurnPreparationError extends Error {
  readonly code:
    | "not_found"
    | "not_ready"
    | "stale"
    | "expired"
    | "discarded"
    | "failed";

  constructor(
    code:
      | "not_found"
      | "not_ready"
      | "stale"
      | "expired"
      | "discarded"
      | "failed",
    message: string,
  ) {
    super(message);
    this.name = "TurnPreparationError";
    this.code = code;
  }
}

export interface PreparedTurnGenerationResult<TPayload = unknown> {
  speakerBotId: string | null;
  provisionalUtterances: PreparedTurnUtteranceV1[];
  payload: TPayload;
}

interface InternalPreparedTurn {
  userId: string;
  public: PreparedTurnV1;
  controller: AbortController;
  generationToken: string;
  generation: Promise<void>;
  payload: unknown;
  committedValue: unknown;
  commitPromise: Promise<void> | null;
}

export interface CreateTurnPreparationInput<TPayload> {
  userId: string;
  surface: PreparedTurnSurfaceV1;
  sessionId: string;
  stateCursor: PreparedTurnCursorV1;
  ttlMs?: number;
  run: (signal: AbortSignal) => Promise<PreparedTurnGenerationResult<TPayload>>;
}

export interface CommitTurnPreparationInput<TResult> {
  userId: string;
  preparationId: string;
  currentCursor: () => PreparedTurnCursorV1;
  commit: (payload: unknown) => Promise<{
    value: TResult;
    result: PreparedTurnCommitResultV1;
  }>;
}

function clonePreparation(value: PreparedTurnV1): PreparedTurnV1 {
  return {
    ...value,
    stateCursor: { ...value.stateCursor },
    provisionalUtterances: value.provisionalUtterances.map((utterance) => ({ ...utterance })),
    commitResult: value.commitResult ? { ...value.commitResult } : null,
  };
}

export class TurnPreparationRegistry {
  readonly #entries = new Map<string, InternalPreparedTurn>();
  readonly #bySession = new Map<string, string>();
  readonly #now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.#now = options.now ?? Date.now;
  }

  #sessionKey(userId: string, surface: PreparedTurnSurfaceV1, sessionId: string): string {
    return `${userId}\u001f${surface}\u001f${sessionId}`;
  }

  #setPhase(
    entry: InternalPreparedTurn,
    phase: PreparedTurnV1["phase"],
    patch: Partial<PreparedTurnV1> = {},
  ): void {
    const nowIso = new Date(this.#now()).toISOString();
    entry.public = { ...entry.public, ...patch, phase, updatedAt: nowIso };
  }

  #expire(entry: InternalPreparedTurn): void {
    if (
      entry.public.phase === "committed" ||
      entry.public.phase === "committing" ||
      entry.public.phase === "discarded"
    ) return;
    entry.controller.abort();
    entry.generationToken = randomUUID();
    entry.payload = undefined;
    this.#setPhase(entry, "expired", { error: "Preparation expired before commit." });
  }

  #cleanupExpired(): void {
    const now = this.#now();
    for (const entry of this.#entries.values()) {
      if (Date.parse(entry.public.expiresAt) <= now) this.#expire(entry);
    }
  }

  #entry(preparationId: string, userId: string): InternalPreparedTurn {
    this.#cleanupExpired();
    const entry = this.#entries.get(preparationId);
    if (!entry || entry.userId !== userId) {
      throw new TurnPreparationError("not_found", "Turn preparation not found.");
    }
    return entry;
  }

  #discardEntry(entry: InternalPreparedTurn, reason: string): void {
    if (
      entry.public.phase === "committed" ||
      entry.public.phase === "committing" ||
      entry.public.phase === "discarded"
    ) return;
    entry.controller.abort();
    entry.generationToken = randomUUID();
    entry.payload = undefined;
    this.#setPhase(entry, "discarded", { error: reason });
  }

  create<TPayload>(input: CreateTurnPreparationInput<TPayload>): PreparedTurnV1 {
    this.#cleanupExpired();
    const sessionKey = this.#sessionKey(input.userId, input.surface, input.sessionId);
    const previousId = this.#bySession.get(sessionKey);
    if (previousId) {
      const previous = this.#entries.get(previousId);
      if (previous) this.#discardEntry(previous, "Superseded by a newer preparation.");
    }

    const userEntries = [...this.#entries.values()]
      .filter((entry) => entry.userId === input.userId)
      .sort((a, b) => Date.parse(a.public.createdAt) - Date.parse(b.public.createdAt));
    while (userEntries.length >= MAX_PREPARED_TURNS_PER_USER) {
      const oldest = userEntries.shift();
      if (!oldest) break;
      this.#discardEntry(oldest, "Discarded to keep the preparation registry bounded.");
      this.#entries.delete(oldest.public.id);
      const oldestKey = this.#sessionKey(
        oldest.userId,
        oldest.public.surface,
        oldest.public.sessionId,
      );
      if (this.#bySession.get(oldestKey) === oldest.public.id) this.#bySession.delete(oldestKey);
    }

    const now = this.#now();
    const nowIso = new Date(now).toISOString();
    const ttlMs = Math.max(1, Math.min(input.ttlMs ?? PREPARED_TURN_TTL_MS, PREPARED_TURN_TTL_MS));
    const controller = new AbortController();
    const generationToken = randomUUID();
    const entry: InternalPreparedTurn = {
      userId: input.userId,
      public: {
        v: 1,
        id: randomUUID(),
        surface: input.surface,
        sessionId: input.sessionId,
        stateCursor: { ...input.stateCursor },
        phase: "preparing",
        provisionalUtterances: [],
        speakerBotId: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        expiresAt: new Date(now + ttlMs).toISOString(),
        error: null,
        commitResult: null,
      },
      controller,
      generationToken,
      generation: Promise.resolve(),
      payload: undefined,
      committedValue: undefined,
      commitPromise: null,
    };
    this.#entries.set(entry.public.id, entry);
    this.#bySession.set(sessionKey, entry.public.id);
    entry.generation = input
      .run(controller.signal)
      .then((generated) => {
        if (
          entry.generationToken !== generationToken ||
          controller.signal.aborted ||
          entry.public.phase !== "preparing" ||
          Date.parse(entry.public.expiresAt) <= this.#now()
        ) {
          return;
        }
        entry.payload = generated.payload;
        this.#setPhase(entry, "ready", {
          speakerBotId: generated.speakerBotId,
          provisionalUtterances: generated.provisionalUtterances.map((utterance) => ({
            ...utterance,
          })),
          error: null,
        });
      })
      .catch((error) => {
        if (
          entry.generationToken !== generationToken ||
          controller.signal.aborted ||
          entry.public.phase !== "preparing"
        ) {
          return;
        }
        entry.payload = undefined;
        this.#setPhase(entry, "failed", {
          error: error instanceof Error ? error.message.slice(0, 300) : "Preparation failed.",
        });
      });
    return clonePreparation(entry.public);
  }

  get(preparationId: string, userId: string): PreparedTurnV1 {
    return clonePreparation(this.#entry(preparationId, userId).public);
  }

  discard(preparationId: string, userId: string, reason = "Discarded by the client."): PreparedTurnV1 {
    const entry = this.#entry(preparationId, userId);
    this.#discardEntry(entry, reason);
    return clonePreparation(entry.public);
  }

  discardSession(
    userId: string,
    surface: PreparedTurnSurfaceV1,
    sessionId: string,
    reason: string,
  ): PreparedTurnV1 | null {
    const id = this.#bySession.get(this.#sessionKey(userId, surface, sessionId));
    if (!id) return null;
    const entry = this.#entries.get(id);
    if (!entry) return null;
    this.#discardEntry(entry, reason);
    return clonePreparation(entry.public);
  }

  discardUser(
    userId: string,
    reason: string,
  ): PreparedTurnV1[] {
    const discarded: PreparedTurnV1[] = [];
    for (const entry of this.#entries.values()) {
      if (entry.userId !== userId) continue;
      const previousPhase = entry.public.phase;
      this.#discardEntry(entry, reason);
      if (previousPhase !== "discarded" && entry.public.phase === "discarded") {
        discarded.push(clonePreparation(entry.public));
      }
    }
    return discarded;
  }

  async commit<TResult>(
    input: CommitTurnPreparationInput<TResult>,
  ): Promise<{ preparation: PreparedTurnV1; value: TResult }> {
    const entry = this.#entry(input.preparationId, input.userId);
    const currentPhase = (): PreparedTurnV1["phase"] => entry.public.phase;
    if (currentPhase() === "committed") {
      return {
        preparation: clonePreparation(entry.public),
        value: entry.committedValue as TResult,
      };
    }
    if (currentPhase() === "committing" && entry.commitPromise) {
      await entry.commitPromise;
      if (currentPhase() === "committed") {
        return {
          preparation: clonePreparation(entry.public),
          value: entry.committedValue as TResult,
        };
      }
      throw new TurnPreparationError(
        "failed",
        entry.public.error ?? "Turn preparation commit failed.",
      );
    }
    if (currentPhase() === "preparing") await entry.generation;
    if (currentPhase() === "committed") {
      return {
        preparation: clonePreparation(entry.public),
        value: entry.committedValue as TResult,
      };
    }
    if (currentPhase() === "committing" && entry.commitPromise) {
      await entry.commitPromise;
      if (currentPhase() === "committed") {
        return {
          preparation: clonePreparation(entry.public),
          value: entry.committedValue as TResult,
        };
      }
      throw new TurnPreparationError(
        "failed",
        entry.public.error ?? "Turn preparation commit failed.",
      );
    }
    this.#cleanupExpired();
    if (currentPhase() === "expired") {
      throw new TurnPreparationError("expired", "Turn preparation expired.");
    }
    if (currentPhase() === "discarded") {
      throw new TurnPreparationError("discarded", "Turn preparation was discarded.");
    }
    if (currentPhase() === "failed") {
      throw new TurnPreparationError("failed", entry.public.error ?? "Turn preparation failed.");
    }
    if (currentPhase() !== "ready") {
      throw new TurnPreparationError("not_ready", "Turn preparation is not ready.");
    }
    if (!preparedTurnCursorMatchesV1(entry.public.stateCursor, input.currentCursor())) {
      this.#discardEntry(entry, "The session changed before the prepared turn could commit.");
      throw new TurnPreparationError("stale", "The prepared turn is stale.");
    }
    this.#setPhase(entry, "committing");
    entry.commitPromise = (async () => {
      try {
        const committed = await input.commit(entry.payload);
        entry.committedValue = committed.value;
        entry.payload = undefined;
        this.#setPhase(entry, "committed", {
          commitResult: { ...committed.result },
          error: null,
        });
      } catch (error) {
        entry.committedValue = undefined;
        this.#setPhase(entry, "failed", {
          error:
            error instanceof Error
              ? error.message.slice(0, 300)
              : "Commit failed.",
        });
        throw error;
      }
    })();
    try {
      await entry.commitPromise;
      return {
        preparation: clonePreparation(entry.public),
        value: entry.committedValue as TResult,
      };
    } finally {
      entry.commitPromise = null;
    }
  }
}

export const turnPreparationRegistry = new TurnPreparationRegistry();

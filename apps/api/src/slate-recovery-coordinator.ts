import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_SLATE_RECOVERY_RETENTION,
  writeSlateRecoveryGeneration,
  type SlateRecoveryRetentionPolicy,
  type SlateRecoveryWriteResult,
} from "./slate-author-safety.ts";

export const DEFAULT_SLATE_RECOVERY_CADENCE_MS = 5 * 60_000;
export const DEFAULT_SLATE_RECOVERY_COALESCE_MS = 1_500;
export const DEFAULT_SLATE_RECOVERY_RETRY_MS = 60_000;

export interface SlateRecoveryProjectReference {
  userId: string;
  projectId: string;
}

export type SlateRecoveryTrigger = "mutation" | "milestone" | "forced" | "retry";

export interface SlateRecoveryScheduleInput extends SlateRecoveryProjectReference {
  reason?: string;
}

export interface SlateRecoveryScheduleReceipt extends SlateRecoveryProjectReference {
  accepted: boolean;
  trigger: SlateRecoveryTrigger;
  scheduledFor: string | null;
}

export interface SlateRecoveryCoordinatorStatus extends SlateRecoveryProjectReference {
  dirty: boolean;
  inFlight: boolean;
  scheduledFor: string | null;
  mutationSequence: number;
  protectedSequence: number;
  lastAttemptAt: string | null;
  lastProtectedAt: string | null;
  lastError: string | null;
  lastMirrorError: string | null;
}

export interface SlateRecoveryAttemptEvent extends SlateRecoveryProjectReference {
  trigger: SlateRecoveryTrigger;
  reasons: string[];
  mutationSequence: number;
  startedAt: string;
  completedAt: string;
  result: SlateRecoveryWriteResult;
}

export interface SlateRecoveryFailureEvent extends SlateRecoveryProjectReference {
  phase: "schedule" | "snapshot" | "mirror";
  trigger: SlateRecoveryTrigger;
  error: Error;
  willRetry: boolean;
}

export interface SlateRecoveryClock {
  now(): Date;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export type SlateRecoveryGenerationWriter = (
  db: DatabaseSync,
  userId: string,
  projectId: string,
  rootDirectory: string,
  options: {
    capturedAt: Date;
    mirrorDirectory: string | null;
    retention: SlateRecoveryRetentionPolicy;
  },
) => SlateRecoveryWriteResult | Promise<SlateRecoveryWriteResult>;

export interface SlateRecoveryCoordinatorConfig {
  db: DatabaseSync;
  /** Local/server-visible filesystem root. No network transport is performed. */
  rootDirectory: string;
  /** Optional local/server-visible mirror root selected outside this coordinator. */
  mirrorDirectoryForProject?: (
    reference: SlateRecoveryProjectReference,
  ) => string | null;
  cadenceMs?: number;
  coalesceMs?: number;
  failureRetryMs?: number;
  maxConcurrentSnapshots?: number;
  retention?: SlateRecoveryRetentionPolicy;
  clock?: SlateRecoveryClock;
  writer?: SlateRecoveryGenerationWriter;
  onProtected?: (event: SlateRecoveryAttemptEvent) => void;
  onFailure?: (event: SlateRecoveryFailureEvent) => void;
}

interface ProjectState extends SlateRecoveryProjectReference {
  key: string;
  dirty: boolean;
  inFlight: boolean;
  queued: boolean;
  timer: unknown | null;
  scheduledForMs: number | null;
  mutationSequence: number;
  protectedSequence: number;
  reasons: Set<string>;
  nextTrigger: SlateRecoveryTrigger;
  urgentAfterFlight: boolean;
  retryNotBeforeMs: number | null;
  lastAttemptAtMs: number | null;
  lastProtectedAtMs: number | null;
  lastError: string | null;
  lastMirrorError: string | null;
}

const triggerPriority: Record<SlateRecoveryTrigger, number> = {
  retry: 0,
  mutation: 1,
  milestone: 2,
  forced: 3,
};

const defaultClock: SlateRecoveryClock = {
  now: () => new Date(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function finiteNonNegative(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return Math.floor(resolved);
}

function normalizeReason(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.slice(0, 240) || fallback;
}

function errorValue(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value || "Slate recovery failed."));
}

function stateKey(reference: SlateRecoveryProjectReference): string {
  return `${reference.userId}\u0000${reference.projectId}`;
}

function validReference(reference: SlateRecoveryProjectReference): boolean {
  return (
    typeof reference.userId === "string" &&
    reference.userId.trim().length > 0 &&
    typeof reference.projectId === "string" &&
    reference.projectId.trim().length > 0
  );
}

/**
 * Coordinates recovery work behind successful author mutations. Scheduling is
 * fire-and-forget: failures are reported through status/callbacks and never
 * propagate into the mutation that asked for protection.
 */
export class SlateRecoveryCoordinator {
  private readonly db: DatabaseSync;
  private readonly rootDirectory: string;
  private readonly mirrorDirectoryForProject?: SlateRecoveryCoordinatorConfig["mirrorDirectoryForProject"];
  private readonly cadenceMs: number;
  private readonly coalesceMs: number;
  private readonly failureRetryMs: number;
  private readonly maxConcurrentSnapshots: number;
  private readonly retention: SlateRecoveryRetentionPolicy;
  private readonly clock: SlateRecoveryClock;
  private readonly writer: SlateRecoveryGenerationWriter;
  private readonly onProtected?: SlateRecoveryCoordinatorConfig["onProtected"];
  private readonly onFailure?: SlateRecoveryCoordinatorConfig["onFailure"];
  private readonly states = new Map<string, ProjectState>();
  private readonly retiredProjects = new Set<string>();
  private readonly readyQueue: string[] = [];
  private readonly idleWaiters = new Set<() => void>();
  private readonly projectIdleWaiters = new Map<string, Set<() => void>>();
  private activeSnapshots = 0;
  private accepting = true;
  private disposed = false;

  public constructor(config: SlateRecoveryCoordinatorConfig) {
    if (!config.rootDirectory.trim()) throw new Error("Slate recovery root directory is required.");
    this.db = config.db;
    this.rootDirectory = config.rootDirectory;
    this.mirrorDirectoryForProject = config.mirrorDirectoryForProject;
    this.cadenceMs = finiteNonNegative(
      config.cadenceMs,
      DEFAULT_SLATE_RECOVERY_CADENCE_MS,
      "Slate recovery cadence",
    );
    this.coalesceMs = finiteNonNegative(
      config.coalesceMs,
      DEFAULT_SLATE_RECOVERY_COALESCE_MS,
      "Slate recovery coalesce window",
    );
    this.failureRetryMs = finiteNonNegative(
      config.failureRetryMs,
      DEFAULT_SLATE_RECOVERY_RETRY_MS,
      "Slate recovery retry delay",
    );
    const concurrency = config.maxConcurrentSnapshots ?? 1;
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8) {
      throw new Error("Slate recovery concurrency must be an integer from 1 through 8.");
    }
    this.maxConcurrentSnapshots = concurrency;
    this.retention = config.retention ?? DEFAULT_SLATE_RECOVERY_RETENTION;
    this.clock = config.clock ?? defaultClock;
    this.writer = config.writer ?? writeSlateRecoveryGeneration;
    this.onProtected = config.onProtected;
    this.onFailure = config.onFailure;
  }

  /** Coalesces ordinary edits and protects active work at the configured cadence. */
  public schedulePostMutation(input: SlateRecoveryScheduleInput): SlateRecoveryScheduleReceipt {
    return this.schedule(input, "mutation", false);
  }

  /** Bypasses the ordinary cadence for accepted rewrites, imports, and other milestones. */
  public scheduleMilestone(input: SlateRecoveryScheduleInput): SlateRecoveryScheduleReceipt {
    return this.schedule(input, "milestone", true);
  }

  /** Requests protection at the next queue opportunity, including after an in-flight write. */
  public forceSnapshot(input: SlateRecoveryScheduleInput): SlateRecoveryScheduleReceipt {
    return this.schedule(input, "forced", true);
  }

  /** Convenient pass-through for route handlers after their mutation has succeeded. */
  public afterSuccessfulMutation<T>(
    value: T,
    input: SlateRecoveryScheduleInput,
  ): T {
    try {
      this.schedulePostMutation(input);
    } catch {
      // A future coordinator regression must still never overturn saved author work.
    }
    return value;
  }

  public status(reference: SlateRecoveryProjectReference): SlateRecoveryCoordinatorStatus | null {
    const state = this.states.get(stateKey(reference));
    return state ? this.publicStatus(state) : null;
  }

  public statuses(): SlateRecoveryCoordinatorStatus[] {
    return [...this.states.values()]
      .map((state) => this.publicStatus(state))
      .sort((left, right) => left.projectId.localeCompare(right.projectId));
  }

  /**
   * Permanently stops work for a project id and waits for any writer already
   * holding its plaintext snapshot to finish. Filesystem cleanup may safely
   * run after this resolves.
   */
  public async retireProject(reference: SlateRecoveryProjectReference): Promise<void> {
    if (!validReference(reference)) {
      throw new Error("Slate recovery project reference is required.");
    }
    const key = stateKey(reference);
    this.retiredProjects.add(key);
    const state = this.states.get(key);
    if (!state) return;

    this.cancelTimer(state);
    state.dirty = false;
    state.urgentAfterFlight = false;
    state.retryNotBeforeMs = null;
    state.reasons.clear();
    if (state.queued) {
      state.queued = false;
      for (let index = this.readyQueue.length - 1; index >= 0; index -= 1) {
        if (this.readyQueue[index] === key) this.readyQueue.splice(index, 1);
      }
    }
    if (state.inFlight) await this.waitForProjectIdle(key);
    this.states.delete(key);
    this.resolveIdleIfNeeded();
  }

  /** Allows protection to resume only when a destructive lifecycle action failed. */
  public resumeProject(reference: SlateRecoveryProjectReference): void {
    if (!validReference(reference)) return;
    this.retiredProjects.delete(stateKey(reference));
  }

  /**
   * Runs all currently dirty projects now and resolves after those attempts.
   * Failures remain visible in status but do not reject this drain operation.
   */
  public async flushPending(reason = "Lifecycle flush"): Promise<SlateRecoveryCoordinatorStatus[]> {
    for (const state of this.states.values()) {
      if (!state.dirty) continue;
      state.reasons.add(normalizeReason(reason, "Lifecycle flush"));
      this.promoteTrigger(state, "forced");
      this.cancelTimer(state);
      if (state.inFlight) state.urgentAfterFlight = true;
      this.enqueue(state);
    }
    this.pump();
    await this.waitForIdle();
    return this.statuses();
  }

  /** Waits only for queued/in-flight work; future cadence timers are intentionally ignored. */
  public waitForIdle(): Promise<void> {
    if (this.activeSnapshots === 0 && this.readyQueue.length === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }

  public async dispose(options: { flush?: boolean } = {}): Promise<void> {
    if (this.disposed) return;
    this.accepting = false;
    if (options.flush) await this.flushPending("Coordinator shutdown");
    this.disposed = true;
    for (const state of this.states.values()) this.cancelTimer(state);
    this.readyQueue.length = 0;
    await this.waitForIdle();
  }

  private schedule(
    input: SlateRecoveryScheduleInput,
    trigger: SlateRecoveryTrigger,
    urgent: boolean,
  ): SlateRecoveryScheduleReceipt {
    const rejected = (): SlateRecoveryScheduleReceipt => ({
      userId: input.userId,
      projectId: input.projectId,
      accepted: false,
      trigger,
      scheduledFor: null,
    });
    try {
      if (
        !this.accepting ||
        this.disposed ||
        !validReference(input) ||
        this.retiredProjects.has(stateKey(input))
      ) return rejected();
      const state = this.stateFor(input);
      state.mutationSequence += 1;
      state.dirty = true;
      state.reasons.add(normalizeReason(input.reason, trigger === "mutation" ? "Author edit" : "Author milestone"));
      this.promoteTrigger(state, trigger);
      const nowMs = this.clock.now().getTime();
      if (state.inFlight) {
        state.urgentAfterFlight ||= urgent;
      } else {
        const dueMs = urgent ? nowMs : this.ordinaryDueMs(state, nowMs);
        this.scheduleAt(state, dueMs);
      }
      return {
        userId: state.userId,
        projectId: state.projectId,
        accepted: true,
        trigger,
        scheduledFor: state.inFlight
          ? null
          : state.scheduledForMs === null
            ? null
            : new Date(state.scheduledForMs).toISOString(),
      };
    } catch (error) {
      this.safeFailure({
        userId: input.userId,
        projectId: input.projectId,
        phase: "schedule",
        trigger,
        error: errorValue(error),
        willRetry: false,
      });
      return rejected();
    }
  }

  private ordinaryDueMs(state: ProjectState, nowMs: number): number {
    const coalesced = nowMs + this.coalesceMs;
    const cadenceBoundary = state.lastProtectedAtMs === null
      ? coalesced
      : state.lastProtectedAtMs + this.cadenceMs;
    return Math.max(coalesced, cadenceBoundary, state.retryNotBeforeMs ?? 0);
  }

  private stateFor(reference: SlateRecoveryProjectReference): ProjectState {
    const key = stateKey(reference);
    const existing = this.states.get(key);
    if (existing) return existing;
    const created: ProjectState = {
      key,
      userId: reference.userId,
      projectId: reference.projectId,
      dirty: false,
      inFlight: false,
      queued: false,
      timer: null,
      scheduledForMs: null,
      mutationSequence: 0,
      protectedSequence: 0,
      reasons: new Set(),
      nextTrigger: "mutation",
      urgentAfterFlight: false,
      retryNotBeforeMs: null,
      lastAttemptAtMs: null,
      lastProtectedAtMs: null,
      lastError: null,
      lastMirrorError: null,
    };
    this.states.set(key, created);
    return created;
  }

  private promoteTrigger(state: ProjectState, trigger: SlateRecoveryTrigger): void {
    if (triggerPriority[trigger] > triggerPriority[state.nextTrigger]) {
      state.nextTrigger = trigger;
    }
  }

  private scheduleAt(state: ProjectState, dueMs: number): void {
    if (
      state.queued ||
      state.inFlight ||
      this.disposed ||
      this.retiredProjects.has(state.key)
    ) return;
    if (state.scheduledForMs !== null && state.scheduledForMs <= dueMs) return;
    this.cancelTimer(state);
    const nowMs = this.clock.now().getTime();
    state.scheduledForMs = dueMs;
    state.timer = this.clock.setTimeout(() => {
      state.timer = null;
      state.scheduledForMs = null;
      this.enqueue(state);
      this.pump();
    }, Math.max(0, dueMs - nowMs));
  }

  private cancelTimer(state: ProjectState): void {
    if (state.timer !== null) this.clock.clearTimeout(state.timer);
    state.timer = null;
    state.scheduledForMs = null;
  }

  private enqueue(state: ProjectState): void {
    if (
      state.queued ||
      state.inFlight ||
      !state.dirty ||
      this.disposed ||
      this.retiredProjects.has(state.key)
    ) return;
    state.queued = true;
    this.readyQueue.push(state.key);
  }

  private pump(): void {
    while (
      !this.disposed &&
      this.activeSnapshots < this.maxConcurrentSnapshots &&
      this.readyQueue.length > 0
    ) {
      const key = this.readyQueue.shift()!;
      const state = this.states.get(key);
      if (!state) continue;
      state.queued = false;
      if (!state.dirty || state.inFlight || this.retiredProjects.has(key)) continue;
      this.startAttempt(state);
    }
    this.resolveIdleIfNeeded();
  }

  private startAttempt(state: ProjectState): void {
    state.inFlight = true;
    this.activeSnapshots += 1;
    const attemptSequence = state.mutationSequence;
    const trigger = state.nextTrigger;
    const reasons = [...state.reasons];
    state.reasons.clear();
    state.nextTrigger = "mutation";
    state.urgentAfterFlight = false;
    const startedAt = this.clock.now();
    state.lastAttemptAtMs = startedAt.getTime();

    let mirrorDirectory: string | null = null;
    let mirrorConfigurationError: Error | null = null;
    if (this.mirrorDirectoryForProject) {
      try {
        mirrorDirectory = this.mirrorDirectoryForProject({
          userId: state.userId,
          projectId: state.projectId,
        });
      } catch (error) {
        const failure = errorValue(error);
        mirrorConfigurationError = failure;
        state.lastMirrorError = failure.message;
        this.safeFailure({
          userId: state.userId,
          projectId: state.projectId,
          phase: "mirror",
          trigger,
          error: failure,
          willRetry: false,
        });
      }
    }

    Promise.resolve()
      .then(() =>
        this.writer(
          this.db,
          state.userId,
          state.projectId,
          this.rootDirectory,
          {
            capturedAt: startedAt,
            mirrorDirectory,
            retention: this.retention,
          },
        ),
      )
      .then((result) => {
        const completedAt = this.clock.now();
        state.lastProtectedAtMs = completedAt.getTime();
        state.protectedSequence = Math.max(state.protectedSequence, attemptSequence);
        state.dirty = state.mutationSequence > attemptSequence;
        state.retryNotBeforeMs = null;
        state.lastError = null;
        state.lastMirrorError = result.mirror.status === "failed"
          ? result.mirror.error
          : mirrorConfigurationError?.message ?? null;
        if (result.mirror.status === "failed") {
          this.safeFailure({
            userId: state.userId,
            projectId: state.projectId,
            phase: "mirror",
            trigger,
            error: new Error(result.mirror.error ?? "Slate recovery mirror failed."),
            willRetry: false,
          });
        }
        this.safeProtected({
          userId: state.userId,
          projectId: state.projectId,
          trigger,
          reasons,
          mutationSequence: attemptSequence,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          result,
        });
      })
      .catch((error) => {
        const failure = errorValue(error);
        state.dirty = true;
        state.lastError = failure.message;
        state.retryNotBeforeMs = this.clock.now().getTime() + this.failureRetryMs;
        state.reasons.add(`Retry: ${reasons.join(", ") || "recovery protection"}`.slice(0, 240));
        if (state.mutationSequence === attemptSequence && !state.urgentAfterFlight) {
          state.nextTrigger = "retry";
        }
        this.safeFailure({
          userId: state.userId,
          projectId: state.projectId,
          phase: "snapshot",
          trigger,
          error: failure,
          willRetry:
            this.accepting && !this.disposed && !this.retiredProjects.has(state.key),
        });
      })
      .finally(() => {
        state.inFlight = false;
        this.activeSnapshots -= 1;
        if (state.dirty && !this.disposed && !this.retiredProjects.has(state.key)) {
          const nowMs = this.clock.now().getTime();
          const dueMs = state.urgentAfterFlight
            ? nowMs
            : state.retryNotBeforeMs ?? this.ordinaryDueMs(state, nowMs);
          state.urgentAfterFlight = false;
          this.scheduleAt(state, dueMs);
        }
        this.resolveProjectIdle(state.key);
        this.pump();
      });
  }

  private safeProtected(event: SlateRecoveryAttemptEvent): void {
    try {
      this.onProtected?.(event);
    } catch {
      // Observability must not become an author-safety failure source.
    }
  }

  private safeFailure(event: SlateRecoveryFailureEvent): void {
    try {
      this.onFailure?.(event);
    } catch {
      // Failure reporting is best-effort and isolated from saved author work.
    }
  }

  private publicStatus(state: ProjectState): SlateRecoveryCoordinatorStatus {
    return {
      userId: state.userId,
      projectId: state.projectId,
      dirty: state.dirty,
      inFlight: state.inFlight,
      scheduledFor: state.scheduledForMs === null
        ? null
        : new Date(state.scheduledForMs).toISOString(),
      mutationSequence: state.mutationSequence,
      protectedSequence: state.protectedSequence,
      lastAttemptAt: state.lastAttemptAtMs === null
        ? null
        : new Date(state.lastAttemptAtMs).toISOString(),
      lastProtectedAt: state.lastProtectedAtMs === null
        ? null
        : new Date(state.lastProtectedAtMs).toISOString(),
      lastError: state.lastError,
      lastMirrorError: state.lastMirrorError,
    };
  }

  private resolveIdleIfNeeded(): void {
    if (this.activeSnapshots !== 0 || this.readyQueue.length !== 0) return;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }

  private waitForProjectIdle(key: string): Promise<void> {
    if (!this.states.get(key)?.inFlight) return Promise.resolve();
    return new Promise((resolve) => {
      const waiters = this.projectIdleWaiters.get(key) ?? new Set<() => void>();
      waiters.add(resolve);
      this.projectIdleWaiters.set(key, waiters);
    });
  }

  private resolveProjectIdle(key: string): void {
    const waiters = this.projectIdleWaiters.get(key);
    if (!waiters) return;
    this.projectIdleWaiters.delete(key);
    for (const resolve of waiters) resolve();
  }
}

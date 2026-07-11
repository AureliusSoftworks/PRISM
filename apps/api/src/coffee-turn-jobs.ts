import { randomId } from "./security.ts";
import type {
  CoffeeTurnJobPhase,
  CoffeeTurnJobStatus,
  CoffeeTurnResponse,
  ReasoningEffort,
} from "@localai/shared";

const COFFEE_TURN_JOB_TTL_MS = 5 * 60_000;

type InternalCoffeeTurnJob = CoffeeTurnJobStatus & {
  userId: string;
  controller: AbortController;
  expiresAtMs: number;
};

const jobs = new Map<string, InternalCoffeeTurnJob>();

function isTerminalCoffeeTurnPhase(phase: CoffeeTurnJobPhase): boolean {
  return phase === "completed" || phase === "interrupted" || phase === "stale" || phase === "failed";
}

function nowIso(): string {
  return new Date().toISOString();
}

function publicStatus(job: InternalCoffeeTurnJob): CoffeeTurnJobStatus {
  return {
    id: job.id,
    conversationId: job.conversationId,
    phase: job.phase,
    speakerBotId: job.speakerBotId,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    interruptEligibleAt: job.interruptEligibleAt,
    ...(job.response ? { response: job.response } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

function cleanupExpiredJobs(nowMs = Date.now()): void {
  for (const [id, job] of jobs) {
    if (job.expiresAtMs <= nowMs) {
      job.controller.abort();
      jobs.delete(id);
    }
  }
}

export function coffeeThinkingCutInDelayMs(effort: ReasoningEffort | null | undefined): number {
  if (effort === "xhigh") return 15_000;
  if (effort === "high") return 11_000;
  if (effort === "medium") return 7_500;
  if (effort === "low") return 5_000;
  return 3_500;
}

export function startCoffeeTurnJob(args: {
  userId: string;
  conversationId: string | null;
  effort?: ReasoningEffort | null;
  /** Test and embedding override; production jobs use the five-minute default. */
  ttlMs?: number;
  run: (context: {
    signal: AbortSignal;
    setPhase: (phase: CoffeeTurnJobPhase, speakerBotId?: string | null) => void;
  }) => Promise<CoffeeTurnResponse>;
}): CoffeeTurnJobStatus {
  cleanupExpiredJobs();
  const startedAt = nowIso();
  const controller = new AbortController();
  const job: InternalCoffeeTurnJob = {
    id: randomId(12),
    userId: args.userId,
    conversationId: args.conversationId,
    phase: "routing",
    speakerBotId: null,
    startedAt,
    updatedAt: startedAt,
    interruptEligibleAt: null,
    controller,
    expiresAtMs: Date.now() + (args.ttlMs ?? COFFEE_TURN_JOB_TTL_MS),
  };
  const setPhase = (phase: CoffeeTurnJobPhase, speakerBotId?: string | null): void => {
    if (isTerminalCoffeeTurnPhase(job.phase)) return;
    job.phase = phase;
    if (speakerBotId !== undefined) job.speakerBotId = speakerBotId;
    job.updatedAt = nowIso();
    job.expiresAtMs = Date.now() + (args.ttlMs ?? COFFEE_TURN_JOB_TTL_MS);
    if (phase === "thinking" && !job.interruptEligibleAt) {
      job.interruptEligibleAt = new Date(
        Date.now() + coffeeThinkingCutInDelayMs(args.effort)
      ).toISOString();
    }
  };
  jobs.set(job.id, job);
  void args.run({ signal: controller.signal, setPhase }).then(
    (response) => {
      if (job.phase === "interrupted") return;
      job.response = response;
      job.speakerBotId = response.speakerBotId;
      setPhase(response.stale ? "stale" : "voicing", response.speakerBotId);
    },
    (error: unknown) => {
      if (job.phase === "interrupted" || controller.signal.aborted) return;
      job.error = error instanceof Error ? error.message : "Coffee turn failed.";
      setPhase("failed");
    }
  );
  return publicStatus(job);
}

export function getCoffeeTurnJob(userId: string, jobId: string): CoffeeTurnJobStatus | null {
  cleanupExpiredJobs();
  const job = jobs.get(jobId);
  return job?.userId === userId ? publicStatus(job) : null;
}

export function setCoffeeTurnJobPhase(
  userId: string,
  jobId: string,
  phase: Extract<CoffeeTurnJobPhase, "speaking" | "completed" | "reaction">
): CoffeeTurnJobStatus | null {
  cleanupExpiredJobs();
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId || isTerminalCoffeeTurnPhase(job.phase)) {
    return null;
  }
  job.phase = phase;
  job.updatedAt = nowIso();
  job.expiresAtMs = Date.now() + COFFEE_TURN_JOB_TTL_MS;
  return publicStatus(job);
}

export function interruptCoffeeTurnJob(userId: string, jobId: string): CoffeeTurnJobStatus | null {
  cleanupExpiredJobs();
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId) return null;
  if (job.phase !== "completed" && job.phase !== "failed" && job.phase !== "stale") {
    job.controller.abort();
    job.phase = "interrupted";
    job.updatedAt = nowIso();
    job.expiresAtMs = Date.now() + COFFEE_TURN_JOB_TTL_MS;
  }
  return publicStatus(job);
}

export function cancelCoffeeTurnJobsForConversation(userId: string, conversationId: string): number {
  let cancelled = 0;
  for (const job of jobs.values()) {
    if (job.userId !== userId || job.conversationId !== conversationId) continue;
    if (job.phase === "completed" || job.phase === "failed" || job.phase === "stale") continue;
    job.controller.abort();
    job.phase = "interrupted";
    job.updatedAt = nowIso();
    cancelled += 1;
  }
  return cancelled;
}

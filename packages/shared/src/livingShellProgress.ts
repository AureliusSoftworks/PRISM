export const PRISM_ONBOARDING_VERSION = 1;

export const PRISM_ONBOARDING_STAGES = [
  "intro",
  "awakening",
  "setup",
  "choices",
  "complete",
] as const;

export type PrismOnboardingStage =
  (typeof PRISM_ONBOARDING_STAGES)[number];

export type PrismIntroResolution = "pending" | "completed" | "skipped";

export interface PrismOnboardingState {
  stage: PrismOnboardingStage;
  introResolution: PrismIntroResolution;
  setupStep: number;
}

export const PRISM_TUTORIAL_IDS = [
  "zen",
  "chat",
  "coffee",
  "botcast",
  "slate",
] as const;

export type PrismTutorialId = (typeof PRISM_TUTORIAL_IDS)[number];
export type PrismTutorialStatus =
  | "pending"
  | "completed"
  | "skipped"
  | "remind";

export interface PrismTutorialState {
  status: PrismTutorialStatus;
  step: number;
  remindAfter: string | null;
}

export type PrismTutorialProgress = Record<
  PrismTutorialId,
  PrismTutorialState
>;

export const PRISM_CAPABILITY_IDS = [
  "slate",
  "zen",
  "marketplace",
  "signal",
  "coffee",
] as const;

export type PrismCapabilityId = (typeof PRISM_CAPABILITY_IDS)[number];
export type PrismCapabilityRevelationReason =
  | "available"
  | "existing_account"
  | "bot_saved"
  | "zen_reply_milestone"
  | "group_saved"
  | "prism_requested"
  | "restored";

export interface PrismCapabilityRevelation {
  revealed: boolean;
  revealedAt: string | null;
  reason: PrismCapabilityRevelationReason | null;
}

export type PrismCapabilityRevelations = Record<
  PrismCapabilityId,
  PrismCapabilityRevelation
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseStoredJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function createPendingPrismOnboardingState(): PrismOnboardingState {
  return { stage: "intro", introResolution: "pending", setupStep: 0 };
}

export function createCompletedPrismOnboardingState(): PrismOnboardingState {
  return { stage: "complete", introResolution: "completed", setupStep: 0 };
}

export function normalizePrismOnboardingState(
  value: unknown,
  onboardingVersion: unknown,
): PrismOnboardingState {
  const completed =
    typeof onboardingVersion === "number" &&
    Number.isFinite(onboardingVersion) &&
    onboardingVersion >= PRISM_ONBOARDING_VERSION;
  const fallback = completed
    ? createCompletedPrismOnboardingState()
    : createPendingPrismOnboardingState();
  const parsed = parseStoredJson(value);
  if (!isRecord(parsed)) return fallback;
  const stage = PRISM_ONBOARDING_STAGES.includes(
    parsed.stage as PrismOnboardingStage,
  )
    ? (parsed.stage as PrismOnboardingStage)
    : fallback.stage;
  const introResolution =
    parsed.introResolution === "completed" ||
    parsed.introResolution === "skipped" ||
    parsed.introResolution === "pending"
      ? parsed.introResolution
      : fallback.introResolution;
  const setupStep =
    typeof parsed.setupStep === "number" && Number.isFinite(parsed.setupStep)
      ? Math.max(0, Math.min(100, Math.floor(parsed.setupStep)))
      : 0;
  return { stage, introResolution, setupStep };
}

export function createPrismTutorialProgress(
  status: PrismTutorialStatus = "pending",
): PrismTutorialProgress {
  return Object.fromEntries(
    PRISM_TUTORIAL_IDS.map((id) => [
      id,
      { status, step: 0, remindAfter: null },
    ]),
  ) as PrismTutorialProgress;
}

export function createPrismCapabilityRevelations(
  options: { completed?: boolean; now?: string } = {},
): PrismCapabilityRevelations {
  const now = options.now ?? new Date().toISOString();
  return Object.fromEntries(
    PRISM_CAPABILITY_IDS.map((id) => [
      id,
      {
        revealed: true,
        revealedAt: now,
        reason: options.completed ? "existing_account" : "available",
      },
    ]),
  ) as PrismCapabilityRevelations;
}

export function normalizePrismCapabilityRevelations(
  value: unknown,
  options: { completedFallback?: boolean; now?: string } = {},
): PrismCapabilityRevelations {
  const parsed = parseStoredJson(value);
  const record = isRecord(parsed) ? parsed : {};
  const fallback = createPrismCapabilityRevelations({
    completed: options.completedFallback,
    now: options.now,
  });
  return Object.fromEntries(
    PRISM_CAPABILITY_IDS.map((id) => {
      const raw = record[id];
      if (typeof raw === "boolean") {
        return [
          id,
          raw
            ? {
                revealed: true,
                revealedAt: options.now ?? new Date().toISOString(),
                reason: "restored" as const,
              }
            : fallback[id],
        ];
      }
      if (!isRecord(raw)) return [id, fallback[id]];
      if (raw.revealed !== true) return [id, fallback[id]];
      const revealedAt =
        typeof raw.revealedAt === "string" &&
        Number.isFinite(Date.parse(raw.revealedAt))
          ? new Date(raw.revealedAt).toISOString()
          : options.now ?? new Date().toISOString();
      const reason =
        raw.reason === "available" ||
        raw.reason === "existing_account" ||
        raw.reason === "bot_saved" ||
        raw.reason === "zen_reply_milestone" ||
        raw.reason === "group_saved" ||
        raw.reason === "prism_requested" ||
        raw.reason === "restored"
          ? raw.reason
          : "restored";
      return [id, { revealed: true, revealedAt, reason }];
    }),
  ) as PrismCapabilityRevelations;
}

export function normalizePrismTutorialProgress(
  value: unknown,
  fallbackStatus: PrismTutorialStatus = "pending",
): PrismTutorialProgress {
  const parsed = parseStoredJson(value);
  const record = isRecord(parsed) ? parsed : {};
  const fallback = createPrismTutorialProgress(fallbackStatus);
  return Object.fromEntries(
    PRISM_TUTORIAL_IDS.map((id) => {
      const raw = record[id];
      if (typeof raw === "boolean") {
        return [
          id,
          {
            status: raw ? "completed" : "pending",
            step: 0,
            remindAfter: null,
          },
        ];
      }
      if (!isRecord(raw)) return [id, fallback[id]];
      const status =
        raw.status === "completed" ||
        raw.status === "skipped" ||
        raw.status === "remind" ||
        raw.status === "pending"
          ? raw.status
          : fallback[id].status;
      const step =
        typeof raw.step === "number" && Number.isFinite(raw.step)
          ? Math.max(0, Math.min(100, Math.floor(raw.step)))
          : 0;
      const remindAfter =
        status === "remind" &&
        typeof raw.remindAfter === "string" &&
        Number.isFinite(Date.parse(raw.remindAfter))
          ? new Date(raw.remindAfter).toISOString()
          : null;
      return [id, { status, step, remindAfter }];
    }),
  ) as PrismTutorialProgress;
}

export function prismTutorialShouldRun(
  state: PrismTutorialState,
  nowMs = Date.now(),
): boolean {
  if (state.status === "completed" || state.status === "skipped") return false;
  if (state.status !== "remind" || !state.remindAfter) return true;
  return Date.parse(state.remindAfter) <= nowMs;
}

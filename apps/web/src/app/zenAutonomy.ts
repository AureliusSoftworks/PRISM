export const ZEN_AUTONOMY_FIRST_IDLE_MS = 10 * 60 * 1000;
export const ZEN_AUTONOMY_SILENT_COOLDOWN_MS = 12 * 60 * 1000;
export const ZEN_AUTONOMY_SPOKEN_COOLDOWN_MS = 45 * 60 * 1000;
export const ZEN_AUTONOMY_MAX_SPOKEN_PER_VISIBLE_SESSION = 3;

export type ZenAutonomyEligibilityReason =
  | "eligible"
  | "disabled"
  | "wrong-view"
  | "hidden"
  | "pending"
  | "editing"
  | "draft"
  | "missing-conversation"
  | "in-flight"
  | "spoken-cap"
  | "cooldown"
  | "idle";

export interface ZenAutonomyEligibilityInput {
  view: "hub" | "chat" | "sandbox" | "coffee" | "botcast" | "story";
  enabled: boolean;
  documentVisible: boolean;
  hasConversation: boolean;
  pendingReply: boolean;
  editingMessageId: string | null;
  draft: string;
  inFlight: boolean;
  spokenCount: number;
  nowMs: number;
  lastActivityAtMs: number;
  cooldownUntilMs: number;
}

export interface ZenAutonomyEligibilityResult {
  eligible: boolean;
  reason: ZenAutonomyEligibilityReason;
  delayMs: number;
  idleMs: number;
}

/**
 * Returns whether Zen's autonomy scheduler may enqueue another state tick.
 */
export function zenAutonomySchedulerIsActive(input: {
  view: ZenAutonomyEligibilityInput["view"];
  enabled: boolean;
  hasUser: boolean;
}): boolean {
  return input.view === "chat" && input.enabled && input.hasUser;
}

export function resolveZenAutonomyEligibility(
  input: ZenAutonomyEligibilityInput
): ZenAutonomyEligibilityResult {
  const idleMs = Math.max(0, input.nowMs - input.lastActivityAtMs);
  const idleDueAtMs = input.lastActivityAtMs + ZEN_AUTONOMY_FIRST_IDLE_MS;
  const dueAtMs = Math.max(idleDueAtMs, input.cooldownUntilMs);
  const delayMs = Math.max(0, dueAtMs - input.nowMs);
  if (!input.enabled) return { eligible: false, reason: "disabled", delayMs, idleMs };
  if (input.view !== "chat") return { eligible: false, reason: "wrong-view", delayMs, idleMs };
  if (!input.documentVisible) return { eligible: false, reason: "hidden", delayMs, idleMs };
  if (!input.hasConversation) {
    return { eligible: false, reason: "missing-conversation", delayMs, idleMs };
  }
  if (input.pendingReply) return { eligible: false, reason: "pending", delayMs, idleMs };
  if (input.editingMessageId !== null) {
    return { eligible: false, reason: "editing", delayMs, idleMs };
  }
  if (input.draft.trim().length > 0) {
    return { eligible: false, reason: "draft", delayMs, idleMs };
  }
  if (input.inFlight) return { eligible: false, reason: "in-flight", delayMs, idleMs };
  if (input.spokenCount >= ZEN_AUTONOMY_MAX_SPOKEN_PER_VISIBLE_SESSION) {
    return { eligible: false, reason: "spoken-cap", delayMs, idleMs };
  }
  if (input.nowMs < input.cooldownUntilMs) {
    return { eligible: false, reason: "cooldown", delayMs, idleMs };
  }
  if (idleMs < ZEN_AUTONOMY_FIRST_IDLE_MS) {
    return { eligible: false, reason: "idle", delayMs, idleMs };
  }
  return { eligible: true, reason: "eligible", delayMs: 0, idleMs };
}

export function nextZenAutonomyCooldownUntilMs(
  nowMs: number,
  decision: ZenAutonomyDecisionLike | null | undefined
): number {
  return nowMs +
    (decision?.action === "speak"
      ? ZEN_AUTONOMY_SPOKEN_COOLDOWN_MS
      : ZEN_AUTONOMY_SILENT_COOLDOWN_MS);
}

export type ZenAutonomyDecisionLike =
  | { action: "silent" }
  | { action: "speak"; botId: string | null };

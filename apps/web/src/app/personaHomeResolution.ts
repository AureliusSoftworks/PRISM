/**
 * The History fields needed to prove that a saved episode belongs to one
 * persona relationship Home. Presentation-era fields such as `botId` and
 * `lastBotId` are deliberately absent: they cannot establish ownership.
 */
export interface PersonaHomeResolutionHistory {
  contextKey: string;
  contextKind: string;
  conversationId: string;
  ownerBotId: string | null;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  continuationConversationId: string | null;
}

export interface PersonaHomeResolutionSummary {
  id: string;
  createdAt?: string;
  updatedAt: string;
  history?: PersonaHomeResolutionHistory;
}

export interface ExistingPersonaHomeResolution<
  Summary extends PersonaHomeResolutionSummary,
> {
  contextKey: string;
  ownerBotId: string;
  conversationId: string;
  summary: Summary;
}

function isExactPersonaHome<Summary extends PersonaHomeResolutionSummary>(
  summary: Summary,
  ownerBotId: string,
  contextKey: string,
): boolean {
  const history = summary.history;
  return Boolean(
    summary.id &&
      history &&
      history.contextKind === "persona_home" &&
      history.contextKey === contextKey &&
      history.ownerBotId === ownerBotId &&
      history.conversationId === summary.id &&
      !history.archived,
  );
}

function firstValidTimestamp(...values: Array<string | undefined>): number {
  for (const value of values) {
    if (!value) continue;
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return Number.NEGATIVE_INFINITY;
}

function compareHomeRecency<Summary extends PersonaHomeResolutionSummary>(
  left: Summary,
  right: Summary,
): number {
  const leftUpdatedAt = firstValidTimestamp(
    left.history?.updatedAt,
    left.updatedAt,
  );
  const rightUpdatedAt = firstValidTimestamp(
    right.history?.updatedAt,
    right.updatedAt,
  );
  if (leftUpdatedAt !== rightUpdatedAt) {
    return leftUpdatedAt > rightUpdatedAt ? -1 : 1;
  }

  const leftCreatedAt = firstValidTimestamp(
    left.history?.createdAt,
    left.createdAt,
  );
  const rightCreatedAt = firstValidTimestamp(
    right.history?.createdAt,
    right.createdAt,
  );
  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt > rightCreatedAt ? -1 : 1;
  }

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/**
 * Resolves an already-saved persona Home from normalized History metadata.
 *
 * Every continuation hop must be a unique, unarchived episode with the exact
 * requested `bot:<id>` context and immutable owner. Missing or contradictory
 * data returns null so the caller can keep the visit pending and unsaved.
 */
export function resolveExistingPersonaHome<
  Summary extends PersonaHomeResolutionSummary,
>(
  requestedBotId: string | null | undefined,
  summaries: readonly Summary[],
): ExistingPersonaHomeResolution<Summary> | null {
  if (!requestedBotId) return null;

  const contextKey = `bot:${requestedBotId}`;
  const summariesById = new Map<string, Summary[]>();
  for (const summary of summaries) {
    if (!summary.id) continue;
    const matchingId = summariesById.get(summary.id);
    if (matchingId) matchingId.push(summary);
    else summariesById.set(summary.id, [summary]);
  }

  const resolveContinuation = (source: Summary): Summary | null => {
    if (!isExactPersonaHome(source, requestedBotId, contextKey)) return null;

    let continuationId = source.history?.continuationConversationId;
    const visitedIds = new Set<string>();
    while (continuationId) {
      if (visitedIds.has(continuationId)) return null;
      visitedIds.add(continuationId);

      const continuationCandidates = summariesById.get(continuationId);
      if (continuationCandidates?.length !== 1) return null;
      const continuation = continuationCandidates[0];
      if (!isExactPersonaHome(continuation, requestedBotId, contextKey)) {
        return null;
      }

      const nextId = continuation.history?.continuationConversationId;
      if (nextId === continuation.id) return continuation;
      continuationId = nextId;
    }
    return null;
  };

  const eligibleContinuations = new Map<string, Summary>();
  for (const summary of summaries) {
    const continuation = resolveContinuation(summary);
    if (continuation) {
      eligibleContinuations.set(continuation.id, continuation);
    }
  }

  const selected = [...eligibleContinuations.values()].sort(
    compareHomeRecency,
  )[0];
  if (!selected) return null;

  return {
    contextKey,
    ownerBotId: requestedBotId,
    conversationId: selected.id,
    summary: selected,
  };
}

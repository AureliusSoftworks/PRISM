/**
 * Full-bake orchestration for Debate spectator and Signal Watch.
 * Progressive append-only advances with persisted checkpoints so clients can
 * unlock early and resume after cancel/leave without regenerating past beats.
 */
import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  createEmptyLiveBakeArtifact,
  estimateSpokenDurationMs,
  humanizeLiveBakePhaseLabel,
  LIVE_BAKE_MAX_STEPS_DEBATE,
  LIVE_BAKE_MAX_STEPS_SIGNAL,
  debateSessionFloorIsSettled,
  type DebateSessionV1,
  type LiveBakeArtifactV1,
  type LiveBakeStatusV1,
  type LiveBakeUtteranceV1,
} from "@localai/shared";
import {
  advanceDebateSession,
  getDebateSession,
  type DebateAiRuntime,
} from "./debate.ts";
import {
  advanceBotcastEpisode,
  getBotcastEpisode,
  type BotcastGenerationOptions,
} from "./botcast.ts";
import { HttpError } from "./utils.http.ts";

function bakeIdempotencyKey(prefix: string, step: number): string {
  return `${prefix}-bake-${step}-${randomBytes(4).toString("hex")}`;
}

function debateEventToUtterance(
  event: DebateSessionV1["events"][number],
  index: number,
): LiveBakeUtteranceV1 | null {
  const text = typeof event.content === "string" ? event.content.trim() : "";
  if (!text) return null;
  if (
    event.kind === "judge_gavel" ||
    event.kind === "phase" ||
    event.kind === "case_board"
  ) {
    return null;
  }
  return {
    id: `debate-bake-${event.id || index}`,
    sourceEventId: event.id ?? null,
    speakerId: event.speakerBotId ?? event.speakerKind ?? "unknown",
    speakerRole: event.speakerKind ?? "speaker",
    text,
    spokenText: text,
    voiceEngine: "unknown",
    isPremium: false,
    audioUrl: null,
    durationMs: estimateSpokenDurationMs(text),
  };
}

function utterancesFromDebateSession(session: DebateSessionV1): LiveBakeUtteranceV1[] {
  return session.events
    .map((event, index) => debateEventToUtterance(event, index))
    .filter((row): row is LiveBakeUtteranceV1 => row !== null);
}

function eventsFromDebateSession(session: DebateSessionV1): LiveBakeArtifactV1["events"] {
  return session.events.map((event, index) => ({
    id: event.id ?? `event-${index}`,
    kind: event.kind ?? "speech",
    atMs: null,
    sourceEventId: event.id ?? null,
    payload: event as unknown as Record<string, unknown>,
  }));
}

function mergeDebateArtifact(
  previous: LiveBakeArtifactV1 | null | undefined,
  session: DebateSessionV1,
  status: LiveBakeStatusV1,
  phaseLabel: string,
  error: string | null = null,
): LiveBakeArtifactV1 {
  const base =
    previous && previous.sourceId === session.id
      ? previous
      : createEmptyLiveBakeArtifact({
          surface: "debate",
          sourceId: session.id,
          title: session.motion?.title ?? session.motion?.motion ?? "Debate",
          privacyMode: session.responseMode === "local" ? "local" : "online",
          createdAt: previous?.createdAt,
        });
  const utterances = utterancesFromDebateSession(session);
  const ready = status === "ready";
  return {
    ...base,
    title: session.motion?.title ?? session.motion?.motion ?? base.title,
    status,
    progress: {
      completedSteps: utterances.length,
      totalStepsEstimate: ready ? utterances.length : null,
      phaseLabel,
      heartbeatAt: status === "baking" ? new Date().toISOString() : base.progress.heartbeatAt ?? null,
    },
    completedAt: ready || status === "cancelled" || status === "failed"
      ? new Date().toISOString()
      : null,
    error,
    utterances,
    events: eventsFromDebateSession(session),
    sessionSnapshot: ready
      ? (session as unknown as Record<string, unknown>)
      : base.sessionSnapshot,
  };
}

export function persistDebateLiveBake(
  db: DatabaseSync,
  userId: string,
  session: DebateSessionV1,
): void {
  db.prepare(
    `UPDATE debate_sessions
        SET session_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(
    JSON.stringify(session),
    session.updatedAt ?? new Date().toISOString(),
    session.id,
    userId,
  );
}

/** Sync artifact forward from session events (append-only over existing history). */
export function syncDebateLiveBakeFromSession(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  status: LiveBakeStatusV1 = "baking",
  phaseLabel = "Preparing the gallery",
): LiveBakeArtifactV1 {
  const session = getDebateSession(db, userId, sessionId);
  const artifact = mergeDebateArtifact(
    session.liveBake,
    session,
    status,
    phaseLabel,
    status === "failed" ? session.liveBake?.error ?? null : null,
  );
  persistDebateLiveBake(db, userId, {
    ...session,
    liveBake: artifact,
    updatedAt: new Date().toISOString(),
  });
  return artifact;
}

/**
 * Advance a spectator Debate append-only from the true tip and persist checkpoints.
 */
export async function bakeDebateSpectatorSession(args: {
  db: DatabaseSync;
  userId: string;
  sessionId: string;
  /**
   * Resolved before every bake advance so Auto can re-route model/effort from
   * the latest transcript context. Fixed picks stay pinned via the same helper.
   */
  resolveRuntime: () => Promise<DebateAiRuntime>;
  signal?: AbortSignal;
  maxSteps?: number;
  onProgress?: (artifact: LiveBakeArtifactV1) => void;
}): Promise<{ session: DebateSessionV1; artifact: LiveBakeArtifactV1 }> {
  const { db, userId, sessionId } = args;
  const maxSteps = args.maxSteps ?? LIVE_BAKE_MAX_STEPS_DEBATE;
  let session = getDebateSession(db, userId, sessionId);
  if (session.playerRole !== "spectator") {
    throw new HttpError(409, "Full bake is only available for Spectator Debates.");
  }
  if (session.liveBake?.status === "ready" && debateSessionFloorIsSettled(session)) {
    return { session, artifact: session.liveBake };
  }

  let artifact = mergeDebateArtifact(
    session.liveBake,
    session,
    "baking",
    humanizeLiveBakePhaseLabel(
      session.stepKey,
      "Preparing the gallery",
    ),
  );
  persistDebateLiveBake(db, userId, {
    ...session,
    liveBake: artifact,
    updatedAt: new Date().toISOString(),
  });
  args.onProgress?.(artifact);

  try {
    for (let step = 0; step < maxSteps; step += 1) {
      if (args.signal?.aborted) {
        session = getDebateSession(db, userId, sessionId);
        artifact = mergeDebateArtifact(
          session.liveBake,
          session,
          "cancelled",
          "Bake cancelled",
          "Bake cancelled.",
        );
        persistDebateLiveBake(db, userId, {
          ...session,
          liveBake: artifact,
          updatedAt: new Date().toISOString(),
        });
        return {
          session: getDebateSession(db, userId, sessionId),
          artifact,
        };
      }
      session = getDebateSession(db, userId, sessionId);
      if (debateSessionFloorIsSettled(session)) {
        break;
      }
      if (session.status !== "live") {
        throw new HttpError(
          409,
          `Cannot bake while Debate status is ${session.status}.`,
        );
      }
      // Append-only: only advance when the floor still needs baker steps.
      // Re-resolve each step so Auto can switch as the proceeding grows.
      const runtime = await args.resolveRuntime();
      session = await advanceDebateSession(
        db,
        userId,
        sessionId,
        {
          expectedRevision: session.revision,
          idempotencyKey: bakeIdempotencyKey(sessionId, step),
        },
        runtime,
      );
      artifact = mergeDebateArtifact(
        session.liveBake,
        session,
        "baking",
        humanizeLiveBakePhaseLabel(session.stepKey, "Preparing the gallery"),
      );
      persistDebateLiveBake(db, userId, {
        ...session,
        liveBake: artifact,
        updatedAt: new Date().toISOString(),
      });
      args.onProgress?.(artifact);
    }

    session = getDebateSession(db, userId, sessionId);
    if (!debateSessionFloorIsSettled(session)) {
      throw new HttpError(
        504,
        "Debate bake hit the step limit before the proceeding finished.",
      );
    }

    artifact = mergeDebateArtifact(session.liveBake, session, "ready", "Ready");
    persistDebateLiveBake(db, userId, {
      ...session,
      liveBake: artifact,
      updatedAt: new Date().toISOString(),
    });
    return { session: getDebateSession(db, userId, sessionId), artifact };
  } catch (error) {
    if (args.signal?.aborted) {
      session = getDebateSession(db, userId, sessionId);
      artifact = mergeDebateArtifact(
        session.liveBake,
        session,
        "cancelled",
        "Bake cancelled",
        "Bake cancelled.",
      );
      persistDebateLiveBake(db, userId, {
        ...session,
        liveBake: artifact,
        updatedAt: new Date().toISOString(),
      });
      return { session: getDebateSession(db, userId, sessionId), artifact };
    }
    const message =
      error instanceof Error ? error.message : "Debate bake failed.";
    try {
      const current = getDebateSession(db, userId, sessionId);
      artifact = mergeDebateArtifact(
        current.liveBake,
        current,
        "failed",
        "Bake failed",
        message,
      );
      persistDebateLiveBake(db, userId, {
        ...current,
        liveBake: artifact,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // Best-effort persistence of failure state.
    }
    throw error;
  }
}

export function buildSignalLiveBakeArtifactFromEpisode(
  episode: ReturnType<typeof getBotcastEpisode>,
  options: {
    status?: LiveBakeStatusV1;
    baking?: boolean;
    error?: string | null;
  } = {},
): LiveBakeArtifactV1 {
  const utterances: LiveBakeUtteranceV1[] = episode.messages
    .filter(
      (message) =>
        typeof message.content === "string" && message.content.trim(),
    )
    .map((message, index) => {
      const text = message.content.trim();
      return {
        id: `signal-bake-${message.id || index}`,
        sourceEventId: message.id ?? null,
        speakerId: message.botId ?? "unknown",
        speakerRole: message.speakerRole ?? "speaker",
        text,
        spokenText: text,
        voiceEngine: "unknown",
        isPremium: false,
        audioUrl: null,
        durationMs: estimateSpokenDurationMs(text),
      };
    });

  const status: LiveBakeStatusV1 =
    options.status ??
    (episode.status === "completed"
      ? "ready"
      : options.baking
        ? "baking"
        : "cancelled");

  const artifact = createEmptyLiveBakeArtifact({
    surface: "signal",
    sourceId: episode.id,
    title: episode.title || episode.topic,
    privacyMode: episode.responseMode === "local" ? "local" : "online",
  });
  return {
    ...artifact,
    status,
    progress: {
      completedSteps: utterances.length,
      totalStepsEstimate: status === "ready" ? utterances.length : null,
      phaseLabel:
        status === "ready"
          ? "Ready"
          : status === "cancelled"
            ? "Bake cancelled"
            : status === "failed"
              ? "Bake failed"
              : humanizeLiveBakePhaseLabel(
                  episode.segment,
                  "Preparing the broadcast",
                ),
      heartbeatAt: status === "baking" ? new Date().toISOString() : null,
    },
    completedAt:
      status === "ready" || status === "cancelled" || status === "failed"
        ? new Date().toISOString()
        : null,
    error: options.error ?? null,
    utterances,
    events: episode.events.map((event, index) => ({
      id: event.id ?? `event-${index}`,
      kind: event.kind ?? "speech",
      atMs: null,
      sourceEventId: event.id ?? null,
      payload: event.payload ?? {},
    })),
    sessionSnapshot:
      status === "ready"
        ? (episode as unknown as Record<string, unknown>)
        : undefined,
  };
}

/**
 * Advance a Watch-mode Signal episode append-only from the true tip.
 * Episode messages are the durable checkpoint; artifact is derived on read.
 */
export async function bakeBotcastWatchEpisode(args: {
  db: DatabaseSync;
  userId: string;
  episodeId: string;
  /**
   * Resolved before every bake advance so Auto can re-route model/effort from
   * the latest episode context. Fixed picks stay pinned via the same helper.
   */
  resolveGeneration: () => Promise<BotcastGenerationOptions>;
  signal?: AbortSignal;
  maxSteps?: number;
  onProgress?: (artifact: LiveBakeArtifactV1) => void;
}): Promise<{
  episode: ReturnType<typeof getBotcastEpisode>;
  artifact: LiveBakeArtifactV1;
}> {
  const { db, userId, episodeId } = args;
  const maxSteps = args.maxSteps ?? LIVE_BAKE_MAX_STEPS_SIGNAL;
  let episode = getBotcastEpisode(db, userId, episodeId);
  if (episode.playbackMode !== "watch") {
    throw new HttpError(409, "Full bake is only available for Watch a show episodes.");
  }
  if (episode.guestKind === "producer") {
    throw new HttpError(409, "Watch a show requires a bot guest.");
  }
  if (episode.status === "completed") {
    const artifact = buildSignalLiveBakeArtifactFromEpisode(episode, {
      status: "ready",
    });
    return { episode, artifact };
  }

  let artifact = buildSignalLiveBakeArtifactFromEpisode(episode, {
    status: "baking",
    baking: true,
  });
  args.onProgress?.(artifact);

  try {
    for (let step = 0; step < maxSteps; step += 1) {
      if (args.signal?.aborted) {
        episode = getBotcastEpisode(db, userId, episodeId);
        artifact = buildSignalLiveBakeArtifactFromEpisode(episode, {
          status: "cancelled",
          error: "Bake cancelled.",
        });
        return { episode, artifact };
      }
      episode = getBotcastEpisode(db, userId, episodeId);
      if (episode.status === "completed") break;
      // Re-resolve each step so Auto can switch as the episode grows.
      const generation = {
        ...(await args.resolveGeneration()),
        signal: args.signal,
      };
      await advanceBotcastEpisode(db, userId, episodeId, {}, generation);
      episode = getBotcastEpisode(db, userId, episodeId);
      artifact = buildSignalLiveBakeArtifactFromEpisode(episode, {
        status: "baking",
        baking: true,
      });
      args.onProgress?.(artifact);
    }

    episode = getBotcastEpisode(db, userId, episodeId);
    if (episode.status !== "completed") {
      throw new HttpError(
        504,
        "Signal bake hit the step limit before the episode finished.",
      );
    }

    artifact = buildSignalLiveBakeArtifactFromEpisode(episode, {
      status: "ready",
    });
    return { episode, artifact };
  } catch (error) {
    if (args.signal?.aborted) {
      episode = getBotcastEpisode(db, userId, episodeId);
      artifact = buildSignalLiveBakeArtifactFromEpisode(episode, {
        status: "cancelled",
        error: "Bake cancelled.",
      });
      return { episode, artifact };
    }
    episode = getBotcastEpisode(db, userId, episodeId);
    artifact = buildSignalLiveBakeArtifactFromEpisode(episode, {
      status: "failed",
      error: error instanceof Error ? error.message : "Signal bake failed.",
    });
    throw error;
  }
}

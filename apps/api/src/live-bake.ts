/**
 * Full-bake orchestration for Debate spectator and Signal Watch.
 * Progressive append-only advances with persisted checkpoints so clients can
 * unlock early and resume after cancel/leave without regenerating past beats.
 */
import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  createEmptyLiveBakeArtifact,
  createLiveBakePlannedSynthesisTiming,
  estimateSpokenDurationMs,
  humanizeLiveBakePhaseLabel,
  LIVE_BAKE_MAX_STEPS_DEBATE,
  LIVE_BAKE_MAX_STEPS_SIGNAL,
  debateSessionFloorIsSettled,
  botcastLatestImageContextV1,
  botcastPreSessionImageShouldPresentOnNextTurnV1,
  type DebateSessionV1,
  type LiveBakeArtifactV1,
  type LiveBakeStatusV1,
  type LiveBakeUtteranceV1,
  type LiveBakeVoiceEngineV1,
} from "@localai/shared";
import {
  advanceDebateSession,
  debateMutationIsRevisionConflict,
  getDebateSession,
  type DebateAiRuntime,
} from "./debate.ts";
import {
  advanceBotcastEpisode,
  getBotcastEpisode,
  type BotcastGenerationOptions,
} from "./botcast.ts";
import { runWithUsageSession } from "./usage.ts";
import { HttpError } from "./utils.http.ts";

function bakeIdempotencyKey(prefix: string, step: number): string {
  return `${prefix}-bake-${step}-${randomBytes(4).toString("hex")}`;
}

export function debateSessionSupportsFullBake(session: DebateSessionV1): boolean {
  return (
    session.playerRole === "spectator" ||
    (session.format === "turnabout" &&
      session.formatState.format === "turnabout" &&
      Boolean(session.formatState.mysteryTrial))
  );
}

function debateBakeTargetReached(session: DebateSessionV1): boolean {
  return (
    debateSessionFloorIsSettled(session) ||
    (session.format === "turnabout" &&
      session.formatState.format === "turnabout" &&
      Boolean(session.formatState.mysteryTrial) &&
      session.status === "waiting_for_player" &&
      session.stepKey === "turnabout_action")
  );
}

function debateEventToUtterance(
  event: DebateSessionV1["events"][number],
  index: number,
  unsynthesizedVoiceEngine: "local" | "unknown",
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
    voiceEngine: unsynthesizedVoiceEngine,
    isPremium: false,
    audioUrl: null,
    durationMs: estimateSpokenDurationMs(text),
  };
}

function utterancesFromDebateSession(
  session: DebateSessionV1,
): LiveBakeUtteranceV1[] {
  const unsynthesizedVoiceEngine =
    session.responseMode === "local" ? "local" : "unknown";
  return session.events
    .map((event, index) =>
      debateEventToUtterance(event, index, unsynthesizedVoiceEngine),
    )
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
  plannedSynthesisEngine: LiveBakeVoiceEngineV1,
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
  const effectivePlannedSynthesisEngine =
    session.responseMode === "local" ? "local" : plannedSynthesisEngine;
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
    plannedSynthesisTiming: createLiveBakePlannedSynthesisTiming(
      effectivePlannedSynthesisEngine,
    ),
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
  plannedSynthesisEngine: LiveBakeVoiceEngineV1 = "unknown",
): LiveBakeArtifactV1 {
  const session = getDebateSession(db, userId, sessionId);
  const artifact = mergeDebateArtifact(
    session.liveBake,
    session,
    status,
    phaseLabel,
    plannedSynthesisEngine,
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
 * Advance a full-bake Debate append-only from the true tip. Spectator sessions
 * bake to completion; filed mystery courts bake to their first player action.
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
  /** Planned JIT synthesis path; LOCAL sessions override this to local. */
  plannedSynthesisEngine?: LiveBakeVoiceEngineV1;
  signal?: AbortSignal;
  maxSteps?: number;
  onProgress?: (artifact: LiveBakeArtifactV1) => void;
}): Promise<{ session: DebateSessionV1; artifact: LiveBakeArtifactV1 }> {
  const { db, userId, sessionId } = args;
  const plannedSynthesisEngine = args.plannedSynthesisEngine ?? "unknown";
  const maxSteps = args.maxSteps ?? LIVE_BAKE_MAX_STEPS_DEBATE;
  let session = getDebateSession(db, userId, sessionId);
  if (!debateSessionSupportsFullBake(session)) {
    throw new HttpError(409, "Full bake is unavailable for this Debate.");
  }
  if (session.liveBake?.status === "ready" && debateBakeTargetReached(session)) {
    const artifact = mergeDebateArtifact(
      session.liveBake,
      session,
      "ready",
      "Ready",
      plannedSynthesisEngine,
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

  let artifact = mergeDebateArtifact(
    session.liveBake,
    session,
    "baking",
    humanizeLiveBakePhaseLabel(
      session.stepKey,
      "Preparing the gallery",
    ),
    plannedSynthesisEngine,
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
          plannedSynthesisEngine,
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
      if (debateBakeTargetReached(session)) {
        break;
      }
      if (session.status === "paused") {
        artifact = mergeDebateArtifact(
          session.liveBake,
          session,
          "baking",
          humanizeLiveBakePhaseLabel(session.stepKey, "Gallery holding"),
          plannedSynthesisEngine,
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
      if (session.status !== "live") {
        throw new HttpError(
          409,
          `Cannot bake while Debate status is ${session.status}.`,
        );
      }
      // Append-only: only advance when the floor still needs baker steps.
      // Re-resolve each step so Auto can switch as the proceeding grows.
      const runtime = await args.resolveRuntime();
      try {
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
      } catch (error) {
        const latest = getDebateSession(db, userId, sessionId);
        if (latest.status === "paused") {
          artifact = mergeDebateArtifact(
            latest.liveBake,
            latest,
            "baking",
            humanizeLiveBakePhaseLabel(latest.stepKey, "Gallery holding"),
            plannedSynthesisEngine,
          );
          persistDebateLiveBake(db, userId, {
            ...latest,
            liveBake: artifact,
            updatedAt: new Date().toISOString(),
          });
          return { session: latest, artifact };
        }
        if (
          debateMutationIsRevisionConflict(error) &&
          latest.status === "live"
        ) {
          continue;
        }
        throw error;
      }
      artifact = mergeDebateArtifact(
        session.liveBake,
        session,
        "baking",
        humanizeLiveBakePhaseLabel(session.stepKey, "Preparing the gallery"),
        plannedSynthesisEngine,
      );
      persistDebateLiveBake(db, userId, {
        ...session,
        liveBake: artifact,
        updatedAt: new Date().toISOString(),
      });
      args.onProgress?.(artifact);
    }

    session = getDebateSession(db, userId, sessionId);
    if (!debateBakeTargetReached(session)) {
      throw new HttpError(
        504,
        "Debate bake hit the step limit before the proceeding finished.",
      );
    }

    artifact = mergeDebateArtifact(
      session.liveBake,
      session,
      "ready",
      "Ready",
      plannedSynthesisEngine,
    );
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
        plannedSynthesisEngine,
        "Bake cancelled.",
      );
      persistDebateLiveBake(db, userId, {
        ...session,
        liveBake: artifact,
        updatedAt: new Date().toISOString(),
      });
      return { session: getDebateSession(db, userId, sessionId), artifact };
    }
    const current = (() => {
      try {
        return getDebateSession(db, userId, sessionId);
      } catch {
        return null;
      }
    })();
    if (current?.status === "paused") {
      artifact = mergeDebateArtifact(
        current.liveBake,
        current,
        "baking",
        humanizeLiveBakePhaseLabel(current.stepKey, "Gallery holding"),
        plannedSynthesisEngine,
      );
      persistDebateLiveBake(db, userId, {
        ...current,
        liveBake: artifact,
        updatedAt: new Date().toISOString(),
      });
      return { session: current, artifact };
    }
    const message =
      error instanceof Error ? error.message : "Debate bake failed.";
    try {
      const failed = current ?? getDebateSession(db, userId, sessionId);
      artifact = mergeDebateArtifact(
        failed.liveBake,
        failed,
        "failed",
        "Bake failed",
        plannedSynthesisEngine,
        message,
      );
      persistDebateLiveBake(db, userId, {
        ...failed,
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
    /** Planned JIT synthesis path; LOCAL episodes override this to local. */
    plannedSynthesisEngine: LiveBakeVoiceEngineV1;
    status?: LiveBakeStatusV1;
    baking?: boolean;
    error?: string | null;
  },
): LiveBakeArtifactV1 {
  const plannedSynthesisEngine =
    episode.responseMode === "local"
      ? "local"
      : options.plannedSynthesisEngine;
  const unsynthesizedVoiceEngine =
    episode.responseMode === "local" ? "local" : "unknown";
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
        voiceEngine: unsynthesizedVoiceEngine,
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
    plannedSynthesisTiming: createLiveBakePlannedSynthesisTiming(
      plannedSynthesisEngine,
    ),
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
  /** Planned JIT synthesis path; LOCAL episodes override this to local. */
  plannedSynthesisEngine?: LiveBakeVoiceEngineV1;
  signal?: AbortSignal;
  maxSteps?: number;
  onProgress?: (artifact: LiveBakeArtifactV1) => void;
}): Promise<{
  episode: ReturnType<typeof getBotcastEpisode>;
  artifact: LiveBakeArtifactV1;
}> {
  const { db, userId, episodeId } = args;
  const plannedSynthesisEngine = args.plannedSynthesisEngine ?? "unknown";
  const maxSteps = args.maxSteps ?? LIVE_BAKE_MAX_STEPS_SIGNAL;
  let episode = getBotcastEpisode(db, userId, episodeId);
  if (episode.playbackMode !== "watch") {
    throw new HttpError(409, "Full bake is only available for Watch a show episodes.");
  }
  if (episode.guestKind === "producer") {
    throw new HttpError(409, "Watch a show requires a bot guest.");
  }
  if (episode.status === "cancelled") {
    const artifact = buildSignalLiveBakeArtifactFromEpisode(episode, {
      status: "cancelled",
      error: "Bake cancelled.",
      plannedSynthesisEngine,
    });
    return { episode, artifact };
  }
  if (episode.status === "completed") {
    const artifact = buildSignalLiveBakeArtifactFromEpisode(episode, {
      status: "ready",
      plannedSynthesisEngine,
    });
    return { episode, artifact };
  }

  let artifact = buildSignalLiveBakeArtifactFromEpisode(episode, {
    status: "baking",
    baking: true,
    plannedSynthesisEngine,
  });
  args.onProgress?.(artifact);

  try {
    for (let step = 0; step < maxSteps; step += 1) {
      if (args.signal?.aborted) {
        episode = getBotcastEpisode(db, userId, episodeId);
        artifact = buildSignalLiveBakeArtifactFromEpisode(episode, {
          status: "cancelled",
          error: "Bake cancelled.",
          plannedSynthesisEngine,
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
      const imageContext = botcastLatestImageContextV1(episode.events);
      // Watch never exposes a producer cue. Its setup image uses a stable
      // episode/image-derived host slot: sometimes it opens with the guest,
      // sometimes it waits for a later natural host handoff.
      const internalImageCue =
        imageContext?.phase === "queued" &&
        botcastPreSessionImageShouldPresentOnNextTurnV1({
          episodeId: episode.id,
          imageId: imageContext.imageId,
          messages: episode.messages,
        })
          ? { kind: "present_image" as const, imageId: imageContext.imageId }
          : undefined;
      await runWithUsageSession(
        {
          db,
          userId,
          privacyScope: "normal",
          mode: "signal",
          surface: "signal",
        },
        () =>
          advanceBotcastEpisode(
            db,
            userId,
            episodeId,
            internalImageCue ? { cue: internalImageCue } : {},
            generation,
            internalImageCue ? { allowWatchBake: true } : {},
          ),
      );
      episode = getBotcastEpisode(db, userId, episodeId);
      artifact = buildSignalLiveBakeArtifactFromEpisode(episode, {
        status: "baking",
        baking: true,
        plannedSynthesisEngine,
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
      plannedSynthesisEngine,
    });
    return { episode, artifact };
  } catch (error) {
    if (args.signal?.aborted) {
      episode = getBotcastEpisode(db, userId, episodeId);
      artifact = buildSignalLiveBakeArtifactFromEpisode(episode, {
        status: "cancelled",
        error: "Bake cancelled.",
        plannedSynthesisEngine,
      });
      return { episode, artifact };
    }
    episode = getBotcastEpisode(db, userId, episodeId);
    artifact = buildSignalLiveBakeArtifactFromEpisode(episode, {
      status: "failed",
      error: error instanceof Error ? error.message : "Signal bake failed.",
      plannedSynthesisEngine,
    });
    throw error;
  }
}

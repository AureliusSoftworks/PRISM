/**
 * Full-bake orchestration for Debate spectator and Signal Watch.
 * Builds a LiveBakeArtifactV1 by advancing the session to completion server-side
 * so the client can present without mid-show LLM stalls.
 */
import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  createEmptyLiveBakeArtifact,
  LIVE_BAKE_MAX_STEPS_DEBATE,
  LIVE_BAKE_MAX_STEPS_SIGNAL,
  debateSessionFloorIsSettled,
  type DebateSessionV1,
  type LiveBakeArtifactV1,
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
    durationMs: null,
  };
}

/**
 * Advance a spectator Debate to completion and attach a playable liveBake artifact.
 */
export async function bakeDebateSpectatorSession(args: {
  db: DatabaseSync;
  userId: string;
  sessionId: string;
  runtime: DebateAiRuntime;
  signal?: AbortSignal;
  maxSteps?: number;
  onProgress?: (artifact: LiveBakeArtifactV1) => void;
}): Promise<{ session: DebateSessionV1; artifact: LiveBakeArtifactV1 }> {
  const { db, userId, sessionId, runtime } = args;
  const maxSteps = args.maxSteps ?? LIVE_BAKE_MAX_STEPS_DEBATE;
  let session = getDebateSession(db, userId, sessionId);
  if (session.playerRole !== "spectator") {
    throw new HttpError(409, "Full bake is only available for Spectator Debates.");
  }
  if (session.liveBake?.status === "ready" && debateSessionFloorIsSettled(session)) {
    return { session, artifact: session.liveBake };
  }

  let artifact = createEmptyLiveBakeArtifact({
    surface: "debate",
    sourceId: session.id,
    title: session.motion?.title ?? session.motion?.motion ?? "Debate",
    privacyMode: session.responseMode === "local" ? "local" : "online",
  });
  artifact.status = "baking";
  artifact.progress = {
    completedSteps: 0,
    totalStepsEstimate: null,
    phaseLabel: "Preparing the gallery",
  };
  args.onProgress?.(artifact);

  try {
    for (let step = 0; step < maxSteps; step += 1) {
      if (args.signal?.aborted) {
        artifact = {
          ...artifact,
          status: "cancelled",
          error: "Bake cancelled.",
          completedAt: new Date().toISOString(),
        };
        persistDebateLiveBake(db, userId, {
          ...getDebateSession(db, userId, sessionId),
          liveBake: artifact,
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
      artifact = {
        ...artifact,
        progress: {
          completedSteps: step + 1,
          totalStepsEstimate: null,
          phaseLabel: session.stepKey || "Preparing",
        },
      };
      args.onProgress?.(artifact);
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
    }

    session = getDebateSession(db, userId, sessionId);
    if (!debateSessionFloorIsSettled(session)) {
      throw new HttpError(
        504,
        "Debate bake hit the step limit before the proceeding finished.",
      );
    }

    const utterances = session.events
      .map((event, index) => debateEventToUtterance(event, index))
      .filter((row): row is LiveBakeUtteranceV1 => row !== null);

    artifact = {
      ...artifact,
      status: "ready",
      progress: {
        completedSteps: utterances.length,
        totalStepsEstimate: utterances.length,
        phaseLabel: "Ready",
      },
      completedAt: new Date().toISOString(),
      error: null,
      utterances,
      events: session.events.map((event, index) => ({
        id: event.id ?? `event-${index}`,
        kind: event.kind ?? "speech",
        atMs: null,
        sourceEventId: event.id ?? null,
        payload: event as unknown as Record<string, unknown>,
      })),
      sessionSnapshot: session as unknown as Record<string, unknown>,
    };

    persistDebateLiveBake(db, userId, {
      ...session,
      liveBake: artifact,
      updatedAt: new Date().toISOString(),
    });
    return { session: getDebateSession(db, userId, sessionId), artifact };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Debate bake failed.";
    artifact = {
      ...artifact,
      status: "failed",
      error: message,
      completedAt: new Date().toISOString(),
    };
    try {
      const current = getDebateSession(db, userId, sessionId);
      persistDebateLiveBake(db, userId, { ...current, liveBake: artifact });
    } catch {
      // Best-effort persistence of failure state.
    }
    throw error;
  }
}

function persistDebateLiveBake(
  db: DatabaseSync,
  userId: string,
  session: DebateSessionV1,
): void {
  db.prepare(
    `UPDATE debate_sessions
        SET session_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(JSON.stringify(session), session.updatedAt, session.id, userId);
}

/**
 * Advance a Watch-mode Signal episode to completion and return a liveBake artifact.
 */
export async function bakeBotcastWatchEpisode(args: {
  db: DatabaseSync;
  userId: string;
  episodeId: string;
  generation: BotcastGenerationOptions;
  signal?: AbortSignal;
  maxSteps?: number;
  onProgress?: (artifact: LiveBakeArtifactV1) => void;
}): Promise<{
  episode: ReturnType<typeof getBotcastEpisode>;
  artifact: LiveBakeArtifactV1;
}> {
  const { db, userId, episodeId, generation } = args;
  const maxSteps = args.maxSteps ?? LIVE_BAKE_MAX_STEPS_SIGNAL;
  let episode = getBotcastEpisode(db, userId, episodeId);
  if (episode.playbackMode !== "watch") {
    throw new HttpError(409, "Full bake is only available for Watch a show episodes.");
  }
  if (episode.guestKind === "producer") {
    throw new HttpError(409, "Watch a show requires a bot guest.");
  }

  let artifact = createEmptyLiveBakeArtifact({
    surface: "signal",
    sourceId: episode.id,
    title: episode.title || episode.topic,
    privacyMode: episode.responseMode === "local" ? "local" : "online",
  });
  artifact.status = "baking";
  args.onProgress?.(artifact);

  try {
    for (let step = 0; step < maxSteps; step += 1) {
      if (args.signal?.aborted) {
        artifact = {
          ...artifact,
          status: "cancelled",
          error: "Bake cancelled.",
          completedAt: new Date().toISOString(),
        };
        return { episode: getBotcastEpisode(db, userId, episodeId), artifact };
      }
      episode = getBotcastEpisode(db, userId, episodeId);
      if (episode.status === "completed") break;
      artifact = {
        ...artifact,
        progress: {
          completedSteps: step + 1,
          totalStepsEstimate: null,
          phaseLabel: episode.segment,
        },
      };
      args.onProgress?.(artifact);
      await advanceBotcastEpisode(db, userId, episodeId, {}, generation);
    }

    episode = getBotcastEpisode(db, userId, episodeId);
    if (episode.status !== "completed") {
      throw new HttpError(
        504,
        "Signal bake hit the step limit before the episode finished.",
      );
    }

    const utterances: LiveBakeUtteranceV1[] = episode.messages
      .filter(
        (message) =>
          typeof message.content === "string" && message.content.trim(),
      )
      .map((message, index) => ({
        id: `signal-bake-${message.id || index}`,
        sourceEventId: message.id ?? null,
        speakerId: message.botId ?? "unknown",
        speakerRole: message.speakerRole ?? "speaker",
        text: message.content,
        spokenText: message.content,
        voiceEngine: "unknown",
        isPremium: false,
        audioUrl: null,
        durationMs: null,
      }));

    artifact = {
      ...artifact,
      status: "ready",
      progress: {
        completedSteps: utterances.length,
        totalStepsEstimate: utterances.length,
        phaseLabel: "Ready",
      },
      completedAt: new Date().toISOString(),
      error: null,
      utterances,
      events: episode.events.map((event, index) => ({
        id: event.id ?? `event-${index}`,
        kind: event.kind ?? "speech",
        atMs: null,
        sourceEventId: event.id ?? null,
        payload: event.payload ?? {},
      })),
      sessionSnapshot: episode as unknown as Record<string, unknown>,
    };
    return { episode, artifact };
  } catch (error) {
    artifact = {
      ...artifact,
      status: "failed",
      error: error instanceof Error ? error.message : "Signal bake failed.",
      completedAt: new Date().toISOString(),
    };
    throw error;
  }
}

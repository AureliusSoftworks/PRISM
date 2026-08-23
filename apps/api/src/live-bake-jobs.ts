/**
 * In-process progressive bake jobs for Debate Spectator and Signal Watch.
 * Jobs return immediately from the HTTP start route; clients poll session/episode.
 */
import type { DatabaseSync } from "node:sqlite";
import {
  type LiveBakeArtifactV1,
  type LiveBakeVoiceEngineV1,
} from "@localai/shared";
import {
  bakeBotcastWatchEpisode,
  bakeDebateSpectatorSession,
  buildSignalLiveBakeArtifactFromEpisode,
  debateSessionSupportsFullBake,
  syncDebateLiveBakeFromSession,
} from "./live-bake.ts";
import type { DebateAiRuntime } from "./debate.ts";
import { getDebateSession } from "./debate.ts";
import {
  getBotcastEpisode,
  type BotcastGenerationOptions,
} from "./botcast.ts";
import { HttpError } from "./utils.http.ts";

type JobKey = string;

type DebateJob = {
  surface: "debate";
  userId: string;
  sessionId: string;
  controller: AbortController;
  promise: Promise<void>;
};

type SignalJob = {
  surface: "signal";
  userId: string;
  episodeId: string;
  controller: AbortController;
  promise: Promise<void>;
};

type BakeJob = DebateJob | SignalJob;

function debateKey(userId: string, sessionId: string): JobKey {
  return `debate:${userId}:${sessionId}`;
}

function signalKey(userId: string, episodeId: string): JobKey {
  return `signal:${userId}:${episodeId}`;
}

export class LiveBakeJobManager {
  private readonly jobs = new Map<JobKey, BakeJob>();

  isDebateRunning(userId: string, sessionId: string): boolean {
    return this.jobs.has(debateKey(userId, sessionId));
  }

  isSignalRunning(userId: string, episodeId: string): boolean {
    return this.jobs.has(signalKey(userId, episodeId));
  }

  async startDebateBake(args: {
    db: DatabaseSync;
    userId: string;
    sessionId: string;
    /** Invoked before each bake step so Auto can re-route mid-bake. */
    resolveRuntime: () => Promise<DebateAiRuntime>;
    plannedSynthesisEngine: LiveBakeVoiceEngineV1;
  }): Promise<{ session: ReturnType<typeof getDebateSession>; liveBake: LiveBakeArtifactV1 }> {
    const key = debateKey(args.userId, args.sessionId);
    const existing = this.jobs.get(key);
    if (existing?.surface === "debate") {
      const session = getDebateSession(args.db, args.userId, args.sessionId);
      const liveBake =
        session.liveBake ??
        syncDebateLiveBakeFromSession(
          args.db,
          args.userId,
          args.sessionId,
          "baking",
          "Preparing the gallery",
          args.plannedSynthesisEngine,
        );
      return {
        session: getDebateSession(args.db, args.userId, args.sessionId),
        liveBake,
      };
    }

    const session = getDebateSession(args.db, args.userId, args.sessionId);
    if (!debateSessionSupportsFullBake(session)) {
      throw new HttpError(409, "Full bake is unavailable for this Debate.");
    }
    if (session.liveBake?.status === "ready") {
      const liveBake = syncDebateLiveBakeFromSession(
        args.db,
        args.userId,
        args.sessionId,
        "ready",
        "Ready",
        args.plannedSynthesisEngine,
      );
      return {
        session: getDebateSession(args.db, args.userId, args.sessionId),
        liveBake,
      };
    }

    const controller = new AbortController();
    const promise = bakeDebateSpectatorSession({
      db: args.db,
      userId: args.userId,
      sessionId: args.sessionId,
      resolveRuntime: args.resolveRuntime,
      plannedSynthesisEngine: args.plannedSynthesisEngine,
      signal: controller.signal,
    })
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        const current = this.jobs.get(key);
        if (current?.controller === controller) this.jobs.delete(key);
      });

    this.jobs.set(key, {
      surface: "debate",
      userId: args.userId,
      sessionId: args.sessionId,
      controller,
      promise,
    });

    // Yield so the first persist/heartbeat can land before we respond.
    await Promise.resolve();
    const latest = getDebateSession(args.db, args.userId, args.sessionId);
    const liveBake =
      latest.liveBake ??
      syncDebateLiveBakeFromSession(
        args.db,
        args.userId,
        args.sessionId,
        "baking",
        "Preparing the gallery",
        args.plannedSynthesisEngine,
      );
    return {
      session: getDebateSession(args.db, args.userId, args.sessionId),
      liveBake,
    };
  }

  cancelDebateBake(userId: string, sessionId: string): boolean {
    const key = debateKey(userId, sessionId);
    const job = this.jobs.get(key);
    if (!job || job.surface !== "debate") return false;
    job.controller.abort();
    return true;
  }

  async startSignalBake(args: {
    db: DatabaseSync;
    userId: string;
    episodeId: string;
    /** Invoked before each bake step so Auto can re-route mid-bake. */
    resolveGeneration: () => Promise<BotcastGenerationOptions>;
    plannedSynthesisEngine: LiveBakeVoiceEngineV1;
  }): Promise<{
    episode: ReturnType<typeof getBotcastEpisode>;
    liveBake: LiveBakeArtifactV1;
  }> {
    const key = signalKey(args.userId, args.episodeId);
    const episode = getBotcastEpisode(args.db, args.userId, args.episodeId);
    if (episode.playbackMode !== "watch") {
      throw new HttpError(409, "Full bake is only available for Watch a show episodes.");
    }
    if (episode.status === "cancelled") {
      return {
        episode,
        liveBake: buildSignalLiveBakeArtifactFromEpisode(episode, {
          status: "cancelled",
          error: "Bake cancelled.",
          plannedSynthesisEngine: args.plannedSynthesisEngine,
        }),
      };
    }
    const existing = this.jobs.get(key);
    if (existing?.surface === "signal") {
      return {
        episode,
        liveBake: buildSignalLiveBakeArtifactFromEpisode(episode, {
          status: episode.status === "completed" ? "ready" : "baking",
          plannedSynthesisEngine: args.plannedSynthesisEngine,
        }),
      };
    }

    if (episode.status === "completed") {
      return {
        episode,
        liveBake: buildSignalLiveBakeArtifactFromEpisode(episode, {
          status: "ready",
          plannedSynthesisEngine: args.plannedSynthesisEngine,
        }),
      };
    }

    const controller = new AbortController();
    const promise = bakeBotcastWatchEpisode({
      db: args.db,
      userId: args.userId,
      episodeId: args.episodeId,
      resolveGeneration: args.resolveGeneration,
      plannedSynthesisEngine: args.plannedSynthesisEngine,
      signal: controller.signal,
    })
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        const current = this.jobs.get(key);
        if (current?.controller === controller) this.jobs.delete(key);
      });

    this.jobs.set(key, {
      surface: "signal",
      userId: args.userId,
      episodeId: args.episodeId,
      controller,
      promise,
    });

    await Promise.resolve();
    const latest = getBotcastEpisode(args.db, args.userId, args.episodeId);
    return {
      episode: latest,
      liveBake: buildSignalLiveBakeArtifactFromEpisode(latest, {
        status: latest.status === "completed" ? "ready" : "baking",
        baking: true,
        plannedSynthesisEngine: args.plannedSynthesisEngine,
      }),
    };
  }

  cancelSignalBake(userId: string, episodeId: string): boolean {
    const key = signalKey(userId, episodeId);
    const job = this.jobs.get(key);
    if (!job || job.surface !== "signal") return false;
    job.controller.abort();
    return true;
  }
}

export const liveBakeJobs = new LiveBakeJobManager();

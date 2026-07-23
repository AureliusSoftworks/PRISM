import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  BotcastEpisodeSummary,
  ReplayRecordingV1,
} from "@localai/shared";
import {
  signalEpisodeArchiveActionLabel,
  signalReplayPremiumHasVideo,
  signalReplayRecordingHasVideo,
} from "./signalReplayVideoGate.ts";

function episode(status: "live" | "completed"): BotcastEpisodeSummary {
  return { status } as BotcastEpisodeSummary;
}

function recording(
  status: ReplayRecordingV1["status"],
  options: {
    premiumPhase?: "rendering_studio" | "ready";
    videoUrl?: string | null;
    premiumVideoUrl?: string | null;
  } = {},
): ReplayRecordingV1 {
  return {
    status,
    videoUrl: options.videoUrl ?? null,
    premiumProduction: {
      phase: options.premiumPhase ?? "rendering_studio",
      videoUrl: options.premiumVideoUrl ?? null,
    },
  } as unknown as ReplayRecordingV1;
}

describe("Signal episode video gate", () => {
  it("tracks standard and Premium exports independently", () => {
    assert.equal(signalReplayRecordingHasVideo(null), false);
    assert.equal(
      signalReplayRecordingHasVideo(
        recording("rendering", { videoUrl: "/api/replays/video" }),
      ),
      false,
    );
    assert.equal(signalReplayRecordingHasVideo(recording("ready")), false);
    assert.equal(
      signalReplayRecordingHasVideo(
        recording("ready_with_warnings", {
          videoUrl: "/api/replays/premium/video",
        }),
      ),
      true,
    );
    assert.equal(
      signalReplayPremiumHasVideo(
        recording("collecting", {
          premiumPhase: "ready",
          premiumVideoUrl: "/api/replays/premium/video",
        }),
      ),
      true,
    );
  });

  it("always opens completed episodes as local replay", () => {
    assert.equal(signalEpisodeArchiveActionLabel(episode("live"), null), "Resume episode");
    assert.equal(
      signalEpisodeArchiveActionLabel(episode("completed"), null),
      "Open local replay",
    );
    assert.equal(
      signalEpisodeArchiveActionLabel(
        episode("completed"),
        recording("rendering"),
      ),
      "Open local replay",
    );
    assert.equal(
      signalEpisodeArchiveActionLabel(
        episode("completed"),
        recording("ready", {
          videoUrl: "/api/replays/video",
        }),
      ),
      "Open replay · Video ready",
    );
  });
});

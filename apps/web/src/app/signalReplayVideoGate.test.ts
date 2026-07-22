import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  BotcastEpisodeSummary,
  ReplayRecordingV1,
} from "@localai/shared";
import {
  signalEpisodeArchiveActionLabel,
  signalReplayRecordingHasVideo,
} from "./signalReplayVideoGate.ts";

function episode(status: "live" | "completed"): BotcastEpisodeSummary {
  return { status } as BotcastEpisodeSummary;
}

function recording(
  status: ReplayRecordingV1["status"],
  options: { currentContract?: boolean; videoUrl?: string | null } = {},
): ReplayRecordingV1 {
  return {
    status,
    videoUrl: options.videoUrl ?? null,
    manifest: {
      visual: {
        metadata: {
          renderContract:
            options.currentContract === false
              ? "signal-studio-dom-v1"
              : "signal-studio-dom-v2",
        },
      },
    },
  } as unknown as ReplayRecordingV1;
}

describe("Signal episode video gate", () => {
  it("treats only a current, ready video as watchable", () => {
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
        recording("ready", {
          currentContract: false,
          videoUrl: "/api/replays/video",
        }),
      ),
      false,
    );
    assert.equal(
      signalReplayRecordingHasVideo(
        recording("ready_with_warnings", {
          videoUrl: "/api/replays/video",
        }),
      ),
      true,
    );
  });

  it("never calls an unfinished episode video a replay", () => {
    assert.equal(signalEpisodeArchiveActionLabel(episode("live"), null), "Resume episode");
    assert.equal(
      signalEpisodeArchiveActionLabel(episode("completed"), null),
      "Render episode video",
    );
    assert.equal(
      signalEpisodeArchiveActionLabel(
        episode("completed"),
        recording("rendering"),
      ),
      "Rebuilding episode video",
    );
    assert.equal(
      signalEpisodeArchiveActionLabel(
        episode("completed"),
        recording("ready", { videoUrl: "/api/replays/video" }),
      ),
      "Watch episode",
    );
  });
});

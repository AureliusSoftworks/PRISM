import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);

describe("Signal completion presentation", () => {
  it("publishes completion only after the final response finishes presenting", () => {
    const stagingAt = source.indexOf("const episodeBeforeResponseIsHeard");
    const completionAt = source.indexOf(
      'if (response.episode.status === "completed")',
      stagingAt,
    );
    const advancePresentationSource = source.slice(stagingAt, completionAt);
    const stagedEpisodeAt = advancePresentationSource.indexOf(
      "setEpisode(episodeBeforeResponseIsHeard)",
    );
    const responsePlaybackAt = advancePresentationSource.indexOf(
      "await playPreparedEpisodeMessage(",
    );
    const committedEpisodeAt = advancePresentationSource.indexOf(
      "setEpisode(response.episode)",
    );

    assert.ok(stagingAt >= 0 && completionAt > stagingAt);
    assert.ok(
      stagedEpisodeAt >= 0 && stagedEpisodeAt < responsePlaybackAt,
      "the audience receives the staged live episode before final-response playback",
    );
    assert.ok(
      responsePlaybackAt >= 0 && responsePlaybackAt < committedEpisodeAt,
      "completion cannot clear the stage until final-response playback resolves",
    );
    assert.doesNotMatch(
      advancePresentationSource.slice(responsePlaybackAt, committedEpisodeAt),
      /message\.speakerRole === "host"/u,
      "a final Guest coda receives the same presentation boundary as a Host sign-off",
    );
  });
});

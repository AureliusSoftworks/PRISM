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
    const returnAt = source.indexOf("return true;", completionAt);
    const advancePresentationSource = source.slice(stagingAt, returnAt);
    const stagedEpisodeAt = advancePresentationSource.indexOf(
      "setEpisode(episodeBeforeResponseIsHeard)",
    );
    const responsePlaybackAt = advancePresentationSource.indexOf(
      "await playPreparedEpisodeMessage(",
    );
    const awaitedOutroAt = advancePresentationSource.indexOf(
      "await playEpisodeOutro(",
    );
    const committedEpisodeAt = advancePresentationSource.indexOf(
      "setEpisode(response.episode)",
      awaitedOutroAt,
    );

    assert.ok(
      stagingAt >= 0 && completionAt > stagingAt && returnAt > completionAt,
    );
    assert.ok(
      stagedEpisodeAt >= 0 && stagedEpisodeAt < responsePlaybackAt,
      "the audience receives the staged live episode before final-response playback",
    );
    assert.ok(
      responsePlaybackAt >= 0 && responsePlaybackAt < awaitedOutroAt,
      "the outro cannot begin until final-response playback resolves",
    );
    assert.ok(
      awaitedOutroAt >= 0 && awaitedOutroAt < committedEpisodeAt,
      "completion cannot clear the stage until the outro/title lifecycle resolves",
    );
    assert.doesNotMatch(
      advancePresentationSource.slice(responsePlaybackAt, awaitedOutroAt),
      /message\.speakerRole === "host"/u,
      "a final Guest coda receives the same presentation boundary as a Host sign-off",
    );
    assert.match(
      advancePresentationSource.slice(responsePlaybackAt, completionAt),
      /response\.episode\.status !== "completed"[\s\S]*setEpisode\(response\.episode\)/u,
      "only a non-completed response may publish before the outro",
    );
  });
});

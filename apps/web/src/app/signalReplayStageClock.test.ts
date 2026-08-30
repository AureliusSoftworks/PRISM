import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { signalReplayOwnerBoundaryTimesMs } from "./signalReplayStageClock.ts";

const signalOwnerSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);

describe("signalReplayOwnerBoundaryTimesMs", () => {
  it("keeps semantic stage boundaries and ignores dense speech activity", () => {
    const speechActivityCues = Array.from({ length: 489 }, (_, index) => ({
      atMs: 2_000 + index * 50,
    }));

    assert.deepEqual(
      signalReplayOwnerBoundaryTimesMs({
        beats: [
          { startMs: 0, endMs: 2_000 },
          { startMs: 2_000, endMs: 8_000 },
        ],
        manifest: {
          direction: [
            { atMs: 2_500, endMs: 3_400 },
            { atMs: 6_000 },
          ],
          presentation: {
            speechActivityTracks: [{ cues: speechActivityCues }],
          },
        },
      }),
      [0, 2_000, 2_500, 3_400, 6_000, 8_000],
    );
  });

  it("normalizes, sorts, and deduplicates saved boundaries", () => {
    assert.deepEqual(
      signalReplayOwnerBoundaryTimesMs({
        beats: [{ startMs: -10, endMs: 1_000.4 }],
        manifest: {
          direction: [
            { atMs: 1_000.49, endMs: 1_500.8 },
            { atMs: 500.2 },
          ],
        },
      }),
      [0, 500, 1_000, 1_501],
    );
  });

  it("wires the owner to semantic boundaries while avatar tracks sample media directly", () => {
    const boundaryBlockStart = signalOwnerSource.indexOf(
      "const replayStageBoundaryTimesMs",
    );
    const boundaryBlockEnd = signalOwnerSource.indexOf(
      "useEffect(() =>",
      boundaryBlockStart,
    );
    assert.ok(boundaryBlockStart >= 0);
    assert.ok(boundaryBlockEnd > boundaryBlockStart);
    const boundaryBlock = signalOwnerSource.slice(
      boundaryBlockStart,
      boundaryBlockEnd,
    );

    assert.match(boundaryBlock, /signalReplayOwnerBoundaryTimesMs\(\{/u);
    assert.doesNotMatch(boundaryBlock, /speechActivityTracks/u);
    assert.match(
      signalOwnerSource,
      /<SignalLiveVisualSampler[\s\S]{0,700}replayAudioRef\.current\?\.currentTime/u,
    );
  });
});

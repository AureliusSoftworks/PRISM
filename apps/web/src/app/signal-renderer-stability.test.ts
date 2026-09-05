import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const source = readFileSync(
  fileURLToPath(new URL("./BotcastExperience.tsx", import.meta.url)),
  "utf8",
);
const css = readFileSync(
  fileURLToPath(new URL("./botcast.module.css", import.meta.url)),
  "utf8",
);

describe("Signal live renderer stability", () => {
  it("keeps generated studio artwork in a stable image element instead of turn-scoped CSS", () => {
    assert.equal(
      [
        ...source.matchAll(
          /<img\s+className=\{styles\.atmosphere\}\s+src=\{stageAtmosphere\.imageUrl\}/gu,
        ),
      ].length,
      2,
      "live and rehearsal stages should both use stable image elements",
    );
    assert.doesNotMatch(
      source,
      /\["--botcast-atmosphere" as string\]: `url\("\$\{stageAtmosphere\.imageUrl\}"\)`/u,
    );
    assert.match(css, /\.stageScene > img\.atmosphere\s*\{[^}]*object-fit:\s*cover/u);
    assert.doesNotMatch(
      css,
      /\.stageViewport\[data-studio-source="image"\] \.atmosphere\s*\{\s*background-image:/u,
    );
  });

  it("ends thinking before the randomized pause and lets a response cue play during it", () => {
    assert.match(
      source,
      /prepareEpisodeMessage\(message, response\.episode\);[\s\S]*?onResponseCueGeneration\?\.\([\s\S]*?waitForSignalResponseCadence\([\s\S]*?await finishResponseCue\?\.\(\);[\s\S]*?playPreparedEpisodeMessage/u,
    );
  });

  it("renders persisted interruption words as CC/transcript speech, not a floating action cue", () => {
    assert.match(source, /data-signal-reaction-caption="true"/u);
    assert.match(source, /data-signal-transcript-speech="true"/u);
    assert.match(source, /listenerReactionPlan\?\.interjectionAttempt/u);
  });
});

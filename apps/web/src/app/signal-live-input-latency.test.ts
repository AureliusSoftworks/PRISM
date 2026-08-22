import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Signal live Producer input latency", () => {
  it("keeps on-air answer keystrokes out of the full Signal render tree", () => {
    assert.match(
      signalSource,
      /const producerGuestAnswerDraftRef = useRef\(""\)/u,
    );
    assert.match(
      signalSource,
      /onChange: \(value\) => \{\s*producerGuestAnswerDraftRef\.current = value;\s*\}/u,
    );
    assert.doesNotMatch(
      signalSource,
      /renderProducerGuestComposer\?\.\(\{[\s\S]{0,1000}onChange: setProducerGuestAnswerDraft/u,
    );
  });

  it("submits from the native editor and clears it imperatively", () => {
    assert.match(
      pageSource,
      /const answer = signalGuestComposerRef\.current\?\.getValue\(\);\s*composer\.onSubmit\(answer\);\s*signalGuestComposerRef\.current\?\.setValue\(""\)/u,
    );
    assert.match(
      signalSource,
      /const rawDraft = overrideAnswer \?\? producerGuestAnswerDraftRef\.current/u,
    );
    assert.match(
      signalSource,
      /producerGuestAnswerDraftRef\.current = "";\s*setProducerGuestAnswerDraft\(""\);[\s\S]{0,500}await expandComposerDraft/u,
    );
  });

  it("does not force cup geometry layout after every Signal render", () => {
    assert.doesNotMatch(
      signalSource,
      /useLayoutEffect\(\(\) => \{\s*syncSignalSipMouthTargets\(\);\s*syncSignalCupTravel\(\);\s*\}\);/u,
    );
    assert.match(
      signalSource,
      /new MutationObserver\(syncSignalCupTravel\)[\s\S]{0,260}attributeFilter: \["data-sip-requested"\]/u,
    );
    assert.match(
      signalSource,
      /useLayoutEffect\(\(\) => \{\s*syncSignalSipMouthTargets\(\);\s*syncSignalCupTravel\(\);\s*\}, \[[\s\S]{0,260}activeEpisodeId[\s\S]{0,260}replayEpisode\?\.id/u,
    );
  });
});

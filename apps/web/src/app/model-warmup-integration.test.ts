import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const overlaySource = readFileSync(
  new URL("./ModelWarmupIntermission.tsx", import.meta.url),
  "utf8",
);
const coffeeCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const signalCss = readFileSync(
  new URL("./botcast.module.css", import.meta.url),
  "utf8",
);

describe("local model warmup intermission integration", () => {
  it("gates Coffee generation and restores the room before reveal", () => {
    assert.match(pageSource, /beginCoffeeModelPreparation\(true\)/u);
    assert.equal((pageSource.match(/ensureCoffeeModelReady\(initialWarmup\)/gu) ?? []).length, 2);
    assert.equal((pageSource.match(/await releaseCoffeeModelWarmup\(\);/gu) ?? []).length >= 4, true);
    assert.match(pageSource, /coffeeSessionClockHoldReasons\([\s\S]*modelWarmup:/u);
    assert.match(pageSource, /pauseCoffeeArrivalTimersForModelWarmup/u);
    assert.match(pageSource, /exitLabel=[\s\S]*"Back to setup"[\s\S]*"End session"/u);
  });

  it("persists Signal holds and resumes them after hydration", () => {
    assert.match(signalSource, /model-warmup-hold/u);
    assert.match(signalSource, /detail\.modelWarmupHoldStartedAt/u);
    assert.match(signalSource, /await releaseSignalModelWarmup\(opening\.episode\.id\)/u);
    assert.match(
      signalSource,
      /playPreparedEpisodeMessage\([\s\S]{0,120}opening\.message,[\s\S]{0,80}opening\.episode/u,
    );
    assert.match(
      signalSource,
      /prepareGuestResponseRef\.current\(currentEpisode, message\)/u,
    );
    assert.match(signalSource, /modelWarmupHoldDurationMs/u);
  });

  it("uses polite, non-speculative status with accessible recovery actions", () => {
    assert.match(overlaySource, /role=\{failed \? "alert" : "status"\}/u);
    assert.match(overlaySource, /aria-live=\{failed \? "assertive" : "polite"\}/u);
    assert.match(overlaySource, /PRISM is preparing the local model/u);
    assert.match(overlaySource, /elapsed/u);
    assert.doesNotMatch(overlaySource, /percent|estimated|ETA/iu);
    assert.match(overlaySource, /<button type="button" onClick=\{props\.onRetry\}>Try again<\/button>/u);
  });

  it("desaturates both scenes and honors reduced motion", () => {
    assert.match(coffeeCss, /data-model-warmup="held"[\s\S]*grayscale\(1\)/u);
    assert.match(signalCss, /data-model-warmup="held"[\s\S]*grayscale\(1\)/u);
    assert.match(coffeeCss, /prefers-reduced-motion: reduce/u);
    assert.match(signalCss, /prefers-reduced-motion: reduce/u);
  });
});

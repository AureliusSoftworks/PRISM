import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("./BotcastExperience.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./botcast.module.css", import.meta.url), "utf8");

describe("Signal experience shell", () => {
  it("uses Signal throughout player-facing applet chrome", () => {
    assert.match(source, />SIGNAL</u);
    assert.match(source, /<h1>Signal<\/h1>/u);
    assert.match(source, /aria-label="Signal shows"/u);
    assert.match(source, /aria-label="Signal replay cameras"/u);
    assert.doesNotMatch(source, />BOTCAST</u);
  });

  it("defaults replay to Auto and keeps manual camera selection viewer-local", () => {
    assert.match(source, /useState<BotcastCameraShot>\("auto"\)/u);
    assert.match(source, /\["auto", "left", "right", "wide"\]/u);
    assert.match(source, /setReplayCamera\(camera\)/u);
    assert.match(source, /replayTimeline\.messageStartMs\[index\]/u);
    assert.doesNotMatch(source, /index \* 4_500/u);
    assert.doesNotMatch(source, /PATCH[\s\S]{0,120}replayCamera/u);
  });

  it("renders the authored two-seat stage and empty-chair aftermath", () => {
    assert.match(source, /data-role="host"/u);
    assert.match(source, /data-role="guest"/u);
    assert.match(source, /Guest has left the studio/u);
    assert.match(source, /Host logo mug/u);
    assert.match(source, /Guest accent mug/u);
    assert.match(css, /\.hostSeat\s*\{\s*left:/u);
    assert.match(css, /\.guestSeat\s*\{\s*right:/u);
  });

  it("keeps Signal coffee cosmetic and producer direction private", () => {
    assert.doesNotMatch(source, /top.?off|refill|depletion/iu);
    assert.match(source, /Private line to host/u);
    assert.match(source, /never spoken or attributed to you/u);
  });
});

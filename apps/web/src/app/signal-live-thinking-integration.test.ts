import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const faceSource = readFileSync(
  new URL("./CoffeeSeatPlateEmoji.tsx", import.meta.url),
  "utf8",
);
const signalCss = readFileSync(
  new URL("./botcast.module.css", import.meta.url),
  "utf8",
);

describe("Signal live thinking animation", () => {
  it("renders generation and synthesis work through the authored face spinner", () => {
    const thinking = signalSource.slice(
      signalSource.indexOf("const roleIsThinking ="),
      signalSource.indexOf("const episodeStartedAtCandidate"),
    );
    assert.match(thinking, /busy[\s\S]{0,100}thinkingRole === role/u);
    assert.match(thinking, /liveStageThinkingRole === role/u);
    assert.match(
      pageSource,
      /showThinkingSpinner:\s*signalPrismThinking/u,
    );
    assert.match(
      pageSource,
      /showThinkingSpinner:\s*signalMannequinThinking/u,
    );
    assert.match(pageSource, /detailLevel:\s*"full"/u);
  });

  it("advances the bot's configured thinking frames with normal React state", () => {
    assert.match(faceSource, /COFFEE_SEAT_THINKING_SPINNER_FRAME_MS = 142/u);
    assert.match(
      faceSource,
      /thinkingSpinnerActive && fullMotion && blinkEnabled/u,
    );
    assert.match(
      faceSource,
      /setInterval\(\(\) => \{[\s\S]{0,180}setThinkingSpinnerFrameIndex[\s\S]{0,180}COFFEE_SEAT_THINKING_SPINNER_FRAME_MS/u,
    );
    assert.doesNotMatch(signalSource, /SignalLiveThinkingDomDriver/u);
    assert.doesNotMatch(pageSource, /data-prism-live-thinking-overlay/u);
    assert.doesNotMatch(pageSource, /preloadThinkingSpinner/u);
  });

  it("does not strip phosphor layers or semantic mug motion from live Signal", () => {
    assert.doesNotMatch(
      signalCss,
      /data-live-episode="true"[\s\S]{0,300}data-prism-priority-phosphor[\s\S]{0,300}content:\s*none/u,
    );
    assert.match(
      signalCss,
      /stageMug\[data-sipping="true"\][\s\S]{0,160}animation:\s*signalStageMugSip/u,
    );
  });
});

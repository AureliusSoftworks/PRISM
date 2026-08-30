import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");

const page = read("./page.tsx");
const signal = read("./BotcastExperience.tsx");
const signalCss = read("./botcast.module.css");
const debate = read("./DebateExperience.tsx");
const debateCss = read("./DebateExperience.module.css");
const flyting = read("./DebateFlyting.tsx");
const tutorials = read("./modeTutorials.ts");

describe("bot-grid hue lens contract", () => {
  it("enumerates every active BotPickerGrid surface with its canvas or chrome lens", () => {
    assert.equal((page.match(/<BotPickerGrid\b/gu) ?? []).length, 4);
    assert.match(page, /const renderChatBotPickerGrid/u);
    assert.match(page, /<HueLensControl[\s\S]{0,420}hueFilterCenter=\{hueFilterCenter\}/u);
    assert.match(page, /className=\{coffeeCanvasBotGridClassName\}/u);
    assert.match(page, /<HueLensControl[\s\S]{0,360}hueLensTrackSegments/u);

    assert.equal((signal.match(/<BotPickerGrid\b/gu) ?? []).length, 1);
    assert.match(signal, /className=\{styles\.signalBotPickerHueLens\}/u);
    assert.match(signal, /aria-label="Browse Signal guests by hue"/u);
    assert.match(signal, /aria-label="Clear Signal guest hue lens"/u);
    assert.match(signal, /debateCastLensSliderInputValue\([\s\S]{0,80}signalGridHueLensCenter/u);
    assert.match(signal, /debateCastHueFromLensSliderInput/u);
    assert.match(signalCss, /\.signalBotPicker\s*\{[^}]*align-content:\s*start/u);
    assert.match(signalCss, /\.signalBotPickerHueLens input\s*\{[^}]*writing-mode:\s*vertical-lr/u);

    assert.equal((debate.match(/<BotPickerGrid\b/gu) ?? []).length, 1);
    assert.match(debate, /className=\{styles\.castPickerHueLens\}/u);
    assert.match(debateCss, /\.castPickerHueLens input\[type="range"\]\s*\{[^}]*writing-mode:\s*vertical-lr/u);

    assert.equal((flyting.match(/<BotPickerGrid\b/gu) ?? []).length, 1);
    assert.match(flyting, /className=\{studioStyles\.castPickerHueLens\}/u);
    assert.match(flyting, /aria-label="Browse Flyting cast bots by hue"/u);
    assert.match(flyting, /aria-label="Clear Flyting cast hue lens"/u);

    assert.match(tutorials, /long horizontal hue lens browses the canvas grid/u);
    assert.match(tutorials, /card grid has its own vertical hue lens on the right/u);
  });

  it("keeps the Signal hue lens bounded to the scrollable bot-grid viewport", () => {
    assert.match(
      signalCss,
      /\.signalBotPickerGridWithHueLens\s*\{[^}]*--signal-bot-picker-viewport-max-height:\s*238px[^}]*max-height:\s*var\(--signal-bot-picker-viewport-max-height\)[^}]*overflow:\s*hidden/u,
    );
    assert.match(
      signalCss,
      /\.signalBotPickerHueLens input\s*\{[^}]*height:\s*auto[^}]*flex:\s*1 1 0/u,
    );
    assert.doesNotMatch(
      signalCss,
      /\.signalBotPickerHueLens input\s*\{[^}]*height:\s*100%/u,
    );
    assert.match(
      signal,
      /signalBotPickerViewportRef\.current\?\.querySelector<HTMLElement>[\s\S]{0,180}grid\.scrollTop = 0/u,
    );
    assert.match(signal, /ref=\{signalBotPickerViewportRef\}/u);
  });
});

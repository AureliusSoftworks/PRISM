import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const page = read("./page.tsx");
const sharedCss = read("./page.module.css");
const coffeeCurtain = read("./CoffeeIntroCurtain.tsx");
const coffeeCurtainCss = read("./CoffeeIntroCurtain.module.css");
const signal = read("./BotcastExperience.tsx");
const signalCss = read("./botcast.module.css");
const debate = read("./DebateExperience.tsx");
const debateCss = read("./DebateExperience.module.css");
const flyting = read("./DebateFlyting.tsx");
const flytingCss = read("./DebateFlyting.module.css");
const mystery = read("./DebateMysteryExperience.tsx");
const mysteryCss = read("./debateMystery.module.css");
const mysteryV2 = read("./DebateMysteryV2Experience.tsx");
const mysteryV2Css = read("./debateMysteryV2.module.css");

describe("social and experiential applet Light parity", () => {
  it("propagates the resolved theme through every formerly forced-Dark applet root", () => {
    assert.doesNotMatch(flyting, /data-theme="dark"/u);
    assert.equal(
      flyting.match(/data-theme=\{props\.theme\}/gu)?.length,
      3,
    );
    assert.match(
      flyting,
      /<FlytingSetupStageAlignmentPreview[\s\S]*?theme=\{props\.theme\}/u,
    );

    assert.doesNotMatch(mystery, /data-theme="dark"/u);
    assert.equal(
      mystery.match(/data-theme=\{props\.theme\}/gu)?.length,
      2,
    );
    assert.match(
      mystery,
      /<DebateEvidenceDocument[\s\S]{0,420}theme=\{props\.theme\}/u,
    );

    for (const root of [
      "forge",
      "titleCard",
      "caseOpening",
      "investigation",
      "court",
      "verdict",
    ]) {
      assert.match(
        mysteryV2,
        new RegExp(
          `className=\\{styles\\.${root}\\}[\\s\\S]{0,180}data-theme=\\{props\\.theme\\}`,
          "u",
        ),
        `${root} must inherit the resolved Whodunnit theme`,
      );
    }

    assert.match(coffeeCurtain, /theme: "light" \| "dark"/u);
    assert.match(coffeeCurtain, /data-theme=\{props\.theme\}/u);
    const curtainCalls = page.match(/<CoffeeIntroCurtain[\s\S]*?\/>/gu) ?? [];
    assert.equal(curtainCalls.length, 3);
    assert.ok(
      curtainCalls.every((call) => call.includes("theme={resolvedTheme}")),
      "Coffee intro, outro, and replay bookend must all inherit the shell theme",
    );
  });

  it("keeps Chat, Zen, and Coffee state controls authored in the shared Light shell", () => {
    assert.match(
      sharedCss,
      /\.themeLight\s*\{[\s\S]*--bg:\s*#edf5fc;[\s\S]*--fg:\s*#172638;/u,
    );
    assert.match(sharedCss, /\.themeLight \.messagesFrame\s*\{/u);
    assert.match(
      sharedCss,
      /\.themeLight \.zenWallpaperStyleOptionButton\[data-selected="true"\]/u,
    );
    assert.match(sharedCss, /\.themeLight \.zenInitialThinkingOverlay\s*\{/u);
    assert.match(sharedCss, /\.themeLight\.coffeeShell\s*\{/u);
    assert.match(sharedCss, /\.coffeePollPlayerOption\[data-selected="true"\]/u);
    assert.match(sharedCss, /\.coffeeReplayIconButton:disabled/u);
    assert.match(sharedCss, /\.coffeeTopicChip:focus-visible/u);

    assert.match(
      coffeeCurtainCss,
      /\.curtain\[data-theme="light"\]\s*\{[\s\S]*--coffee-curtain-ink:\s*#172638;[\s\S]*color-scheme:\s*light;/u,
    );
    assert.match(coffeeCurtainCss, /\.skip:hover\s*\{/u);
    assert.match(coffeeCurtainCss, /\.skip:focus-visible\s*\{/u);
    assert.match(coffeeCurtainCss, /\.skip:active\s*\{/u);
  });

  it("authors Forum, Turnabout, Jury, and Debate lifecycle chrome in Light", () => {
    assert.match(
      debate,
      /className=\{`\$\{styles\.lobby\} \$\{styles\.dashboard\}`\}[\s\S]{0,220}data-theme=\{props\.theme\}/u,
    );
    assert.match(
      debate,
      /className=\{styles\.live\}[\s\S]{0,220}data-theme=\{props\.theme\}/u,
    );
    assert.match(
      debate,
      /className=\{styles\.juryChamber\}[\s\S]{0,820}data-theme=\{props\.theme\}/u,
    );
    assert.match(
      debate,
      /className=\{styles\.persistentLeaveDock\}[\s\S]{0,180}data-theme=\{props\.theme\}/u,
    );

    assert.match(
      debateCss,
      /\.lobby\[data-theme="light"\],[\s\S]{0,80}\.setup\[data-theme="light"\]\s*\{/u,
    );
    assert.match(
      debateCss,
      /\.live\[data-theme="light"\]\s*\{[\s\S]*--debate-live-canvas:\s*#e8e6ec;[\s\S]*--debate-live-ink:\s*#2a2530;/u,
    );
    assert.match(debateCss, /\.live\[data-theme="light"\] \.juryRecord/u);
    assert.match(
      debateCss,
      /\.live\[data-theme="light"\] \.turnaboutActions blockquote/u,
    );
    assert.match(
      debateCss,
      /\.live\[data-theme="light"\] \.turnaboutEvidencePicker/u,
    );
    assert.match(
      debateCss,
      /\.live\[data-theme="light"\] \.judgeTargetChoices button\[data-selected="true"\]/u,
    );
    assert.match(debateCss, /:hover:not\(:disabled\)/u);
    assert.match(debateCss, /\.live :is\([^)]*\):focus-visible/u);
    assert.match(debateCss, /\.live button:disabled/u);
  });

  it("authors Signal replay chrome in Light while retaining only the cinematic screen aperture", () => {
    assert.match(
      signal,
      /className=\{styles\.shell\}[\s\S]{0,140}data-theme=\{theme\}/u,
    );
    assert.match(
      signalCss,
      /\.shell\[data-theme="light"\]\s*\{[\s\S]*--signal-replay-canvas:\s*#edf5fc;[\s\S]*--signal-replay-color-scheme:\s*light;/u,
    );
    assert.match(
      signalCss,
      /\.shell\[data-replay-episode="true"\]\s*\{[^}]*background:\s*var\(--signal-replay-shell-background\);[^}]*color-scheme:\s*var\(--signal-replay-color-scheme\);/u,
    );
    assert.match(
      signalCss,
      /\.replayLayout\[data-signal-replay="true"\]\s*\{[\s\S]*--botcast-panel:\s*var\(--signal-replay-panel\);[\s\S]*background:\s*var\(--signal-replay-room-background\);/u,
    );
    assert.match(
      signalCss,
      /\.shell\[data-theme="light"\]\[data-replay-episode="true"\] \.replayTransport\s*\{/u,
    );
    assert.match(
      signalCss,
      /\.shell\[data-theme="light"\]\[data-replay-episode="true"\][\s\S]{0,2200}:focus-visible/u,
    );
    assert.match(
      signalCss,
      /\.shell\[data-theme="light"\]\[data-replay-episode="true"\][\s\S]{0,2800}:disabled/u,
    );
    assert.match(signalCss, /\.replayScreen\s*\{[^}]*background:\s*#000;/u);
  });

  it("authors Flyting and both Whodunnit generations from their applet theme roots", () => {
    assert.match(
      flytingCss,
      /\.liveShell\[data-theme="light"\]\s*\{[\s\S]*--hall-header-surface:[\s\S]*--hall-authoring-surface:[\s\S]*--hall-authoring-ink:/u,
    );
    assert.match(flytingCss, /\[data-theme="light"\] \.hallStage\s*\{/u);
    assert.match(
      flytingCss,
      /\.liveShell\[data-theme="light"\] \.hallReceiverMatte\s*\{[^}]*mead-hall-keyed-base-light\.webp/u,
    );
    assert.match(
      flytingCss,
      /\.liveShell\[data-theme="light"\][\s\S]{0,160}\.hallCamera\[data-camera-view="moderator"\][\s\S]{0,120}\.hallReceiverMatte\s*\{[^}]*jarl-throne-keyed-base-light\.webp/u,
    );
    assert.match(
      flytingCss,
      /\.liveShell\[data-theme="light"\] \.flytingCourtGallery\s*\{[^}]*mead-hall-gallery-floor-light\.webp/u,
    );
    assert.doesNotMatch(
      flyting,
      /className=\{`\$\{studioStyles\.receiverMatte\} \$\{styles\.hallReceiverMatte\}`\}/u,
    );
    assert.match(flytingCss, /\.flytingCastSeatButton:hover:not\(:disabled\)/u);
    assert.match(flytingCss, /\.flytingCastSeatButton:focus-visible/u);

    assert.match(
      mysteryCss,
      /\.play\[data-theme="light"\]\s*\{[\s\S]*--mystery-ui-surface:[\s\S]*--mystery-map-room-selected:[\s\S]*color-scheme:\s*light;/u,
    );
    assert.match(mysteryCss, /\.play\[data-theme="light"\] \.mapRoom\[data-selected="true"\]/u);
    assert.match(mysteryCss, /\.play\[data-theme="light"\][\s\S]{0,10000}:focus-visible/u);
    assert.match(mysteryCss, /\.play\[data-theme="light"\][\s\S]{0,12000}:disabled/u);

    assert.match(
      mysteryV2Css,
      /\.forge\[data-theme="light"\],[\s\S]*\.verdict\[data-theme="light"\]\s*\{[\s\S]*--v2-bg:\s*#edf5fc;[\s\S]*color-scheme:\s*light;/u,
    );
    assert.match(
      mysteryV2Css,
      /\.investigation\[data-theme="light"\] \.mansionRoom\[data-selected="true"\]/u,
    );
    assert.match(mysteryV2Css, /\[data-theme="light"\][\s\S]{0,4200}:hover:not\(:disabled\)/u);
    assert.match(mysteryV2Css, /\[data-theme="light"\][\s\S]{0,5200}:focus-visible/u);
    assert.match(mysteryV2Css, /\[data-theme="light"\][\s\S]{0,5800}:disabled/u);
  });
});

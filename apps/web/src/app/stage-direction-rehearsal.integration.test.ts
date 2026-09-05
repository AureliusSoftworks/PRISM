import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (name: string): string =>
  readFileSync(new URL(name, import.meta.url), "utf8");

const debate = read("./DebateExperience.tsx");
const debateCss = read("./DebateExperience.module.css");
const signal = read("./BotcastExperience.tsx");
const signalCss = read("./botcast.module.css");
const page = read("./page.tsx");
const tutorials = read("./modeTutorials.ts");

describe("stage direction and rehearsal", () => {
  it("keeps Debate stage placement direct and canonical", () => {
    assert.match(debate, /data-tutorial-target="debate-stage-layout"/u);
    assert.match(debate, /onClick=\{openStageAlignment\}/u);
    assert.doesNotMatch(debate, /Close conversation/u);
    assert.doesNotMatch(debate, /Balanced forum/u);
    assert.doesNotMatch(debate, /Grand chamber/u);
    assert.doesNotMatch(debateCss, /\.stageDirectionOptions/u);

    assert.match(page, /data-settings-action="open-debate-alignment-lab"/u);
    assert.match(
      page,
      /\{DEBATE_STAGE_LAYOUT_AUTHORING_ENABLED \? \([\s\S]*?data-settings-action="open-debate-alignment-lab"/u,
    );
    assert.match(page, />Stage layout</u);
    assert.match(page, /alignmentLabLaunchToken=/u);
    assert.match(debate, /data-debate-stage-alignment-modal="true"/u);
    assert.match(debate, /Drag an item or use arrow keys to nudge by 0\.5%/u);
    assert.match(tutorials, /canonical Main arrangement/u);
    assert.match(tutorials, /data-tutorial-target="debate-stage-layout"/u);
  });

  it("opens Signal as a stage-first autosaving rehearsal", () => {
    assert.match(signal, />\s*Rehearse stage\s*</u);
    assert.match(signal, /Rehearsal mode/u);
    assert.match(signal, /data-tutorial-target="signal-studio-rehearsal"/u);
    assert.match(signal, /data-fine-tuning=\{studioFineTuningOpen/u);
    assert.match(
      signal,
      /aria-controls="signal-rehearsal-soundcheck signal-rehearsal-voices signal-rehearsal-camera signal-rehearsal-screen signal-rehearsal-atmosphere"/u,
    );
    assert.match(signal, /hidden=\{!studioFineTuningOpen\}/u);
    assert.match(
      signalCss,
      /stageLayoutEditor\[data-fine-tuning="false"\][\s\S]{0,220}stageViewportColumn/u,
    );
    assert.match(tutorials, /Rehearse stage opens a fullscreen, stage-first workspace/u);
    assert.match(tutorials, /Fine tuning reveals the Light and Dark previews/u);
  });
});

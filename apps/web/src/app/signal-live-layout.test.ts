import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("./botcast.module.css", import.meta.url),
  "utf8",
);

describe("Signal live viewport layout", () => {
  it("keeps identity plates outside the camera-transformed seats and caption lane", () => {
    assert.match(source, /className=\{styles\.stageNameplates\}/u);
    assert.match(source, /data-shot=\{args\.shot\}/u);
    assert.match(source, /styles\.hostNameplate/u);
    assert.match(source, /styles\.guestNameplate/u);

    const transformedScene = source.slice(
      source.indexOf(`className={styles.stageScene}`),
      source.indexOf(`className={styles.stageNameplates}`),
    );
    assert.doesNotMatch(transformedScene, /styles\.nameplate/u);

    assert.match(css, /\.stageNameplates\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*z-index:\s*17/iu);
    assert.match(css, /\.nameplate\s*\{[^}]*bottom:\s*clamp\(58px,\s*8\.5%,\s*72px\)/iu);
    assert.match(css, /\.hostNameplate\s*\{[^}]*left:\s*clamp\(/iu);
    assert.match(css, /\.guestNameplate\s*\{[^}]*right:\s*clamp\(/iu);
    assert.match(css, /\.stageNameplates\[data-shot="left"\] \.guestNameplate/iu);
    assert.match(css, /\.stageNameplates\[data-shot="right"\] \.hostNameplate/iu);
    assert.match(css, /\.liveCaption\s*\{[^}]*z-index:\s*18/iu);
  });

  it("reserves enough desktop height for a compact, reachable producer desk", () => {
    assert.match(css, /\.controlRoom\s*\{[^}]*margin:\s*8px auto 0/iu);
    assert.match(css, /\.producerControls\s*\{[^}]*gap:\s*10px;[^}]*padding:\s*12px/iu);
    assert.match(css, /\.producerDeskPrivateLine\s*\{[^}]*min-height:\s*48px/iu);
    assert.match(css, /\.producerControls textarea\s*\{[^}]*min-height:\s*48px;[^}]*max-height:\s*76px/iu);
    assert.match(css, /\.cueKey\s*\{[^}]*min-height:\s*86px;[^}]*height:\s*86px/iu);
    const cueBank = source.slice(
      source.indexOf(`className={styles.producerCueBank}`),
      source.indexOf(`</aside>`, source.indexOf(`className={styles.producerCueBank}`)),
    );
    assert.match(cueBank, /data-guest-walkoff-status=\{guestWalkOffRisk\.status\}/u);
    assert.match(cueBank, /className=\{styles\.guestAnnoyanceMeter\}/u);
    assert.match(
      css,
      /\.producerCueBank\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(58px,\s*1fr\)/iu,
    );
    assert.match(css, /\.guestAnnoyanceMeter\s*\{[^}]*min-height:\s*58px/iu);
    assert.match(
      css,
      /@media \(min-width: 901px\) and \(min-height: 760px\)[\s\S]*?\.shell\[data-live-episode="true"\] \.main\s*\{[^}]*overflow-y:\s*auto;[^}]*scrollbar-gutter:\s*stable;[^}]*\}[\s\S]*?calc\(\(100dvh - 412px\) \* 1\.7778\)/iu,
    );
    assert.match(
      css,
      /\.shell\[data-live-episode="true"\] \.producerCueComposer > small\s*\{[^}]*-webkit-line-clamp:\s*2/iu,
    );
  });
});

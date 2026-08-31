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
    assert.match(source, /className=\{styles\.nameplateRole\}>Host<\/span>/u);
    assert.match(source, /className=\{styles\.nameplateName\}/u);
    assert.match(
      source,
      /signalStudioNameplateSide\(studioLayout, "host"\)[\s\S]{0,160}styles\.leftNameplate[\s\S]{0,80}styles\.rightNameplate/u,
    );
    assert.match(
      source,
      /signalStudioNameplateSide\(studioLayout, "guest"\)[\s\S]{0,160}styles\.leftNameplate[\s\S]{0,80}styles\.rightNameplate/u,
    );

    const transformedScene = source.slice(
      source.indexOf(`className={styles.stageScene}`),
      source.indexOf(`className={styles.stageNameplates}`),
    );
    assert.doesNotMatch(transformedScene, /styles\.nameplate/u);

    assert.match(css, /\.stageNameplates\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*z-index:\s*17/iu);
    assert.match(css, /\.nameplate\s*\{[^}]*bottom:\s*clamp\(58px,\s*8\.5%,\s*72px\)/iu);
    assert.match(css, /\.leftNameplate\s*\{[^}]*left:\s*clamp\(/iu);
    assert.match(css, /\.rightNameplate\s*\{[^}]*right:\s*clamp\(/iu);
    assert.match(
      css,
      /\.nameplateName\s*\{[^}]*max-inline-size:\s*15ch;[^}]*text-wrap:\s*balance;[^}]*white-space:\s*normal/iu,
    );
    assert.match(css, /\.stageNameplates\[data-shot="left"\] \.guestNameplate/iu);
    assert.match(css, /\.stageNameplates\[data-shot="right"\] \.hostNameplate/iu);
    assert.match(css, /\.liveCaption\s*\{[^}]*z-index:\s*18/iu);
  });

  it("gives the desktop stage a wider runway above a compact, reachable producer desk", () => {
    assert.match(
      css,
      /\.liveLayout\s*\{[^}]*--signal-live-content-max-width:\s*1680px;[^}]*--signal-live-inline-gutter:\s*clamp\(8px,\s*1vw,\s*18px\)/iu,
    );
    assert.match(
      css,
      /@media \(min-width:\s*901px\)[\s\S]*?\.shell\[data-live-episode="true"\] \.liveLayout\s*\{[^}]*padding-inline:\s*var\(--signal-live-inline-gutter\)[^}]*\}[\s\S]*?\.shell\[data-live-episode="true"\] \.liveTopline,[\s\S]*?\.shell\[data-live-episode="true"\] \.liveCameraControls,[\s\S]*?\.shell\[data-live-episode="true"\] \.liveLayout \.stageViewport\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none/iu,
    );
    assert.match(
      css,
      /@media \(max-width:\s*900px\)[\s\S]*?\.showDashboard,\s*\.liveLayout,\s*\.replayLayout\s*\{[^}]*padding-inline:\s*12px/iu,
    );
    assert.doesNotMatch(css, /100dvh\s*-\s*412px/iu);
    assert.match(css, /\.controlRoom\s*\{[^}]*margin:\s*8px auto 0/iu);
    assert.match(
      css,
      /\.liveLayout \.controlRoom\s*\{[^}]*max-width:\s*var\(--signal-live-content-max-width\)/iu,
    );
    assert.match(
      css,
      /\.signalMemoryReceiptDetail\s*\{[^}]*max-width:\s*var\(--signal-live-content-max-width,\s*1680px\)/iu,
    );
    assert.match(
      css,
      /\.producerGuestComposerDock\s*\{[^}]*max-width:\s*var\(--signal-live-content-max-width,\s*1680px\)/iu,
    );
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
      /@media \(min-width: 901px\) and \(min-height: 760px\)[\s\S]*?\.shell\[data-live-episode="true"\] \.main\s*\{[^}]*overflow-y:\s*auto;[^}]*scrollbar-gutter:\s*stable;[^}]*\}/iu,
    );
    assert.match(
      css,
      /\.shell\[data-live-episode="true"\] \.producerCueComposer > small\s*\{[^}]*-webkit-line-clamp:\s*2/iu,
    );
  });
});

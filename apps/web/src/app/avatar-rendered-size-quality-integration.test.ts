import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const signalCss = readFileSync(
  new URL("./botcast.module.css", import.meta.url),
  "utf8",
);

test("the shared full-avatar renderer derives detail from on-screen size", () => {
  assert.match(pageSource, /avatarRenderedSizeTierForMeasurements/u);
  assert.match(pageSource, /element\.getBoundingClientRect\(\)\.width/u);
  assert.match(pageSource, /renderedSizeTier === "compact"/u);
  assert.match(pageSource, /data-render-detail=\{renderDetailLevel\}/u);
  assert.match(pageSource, /data-avatar-render-size-tier=\{renderedSizeTier\}/u);
});

test("compact avatars remove unreadable phosphor work but retain the live face", () => {
  const compactRules = pageCss.slice(
    pageCss.indexOf("Rendered-size quality"),
    pageCss.indexOf("Runtime pressure applies"),
  );
  assert.match(compactRules, /data-render-detail="compact"/u);
  assert.match(compactRules, /botFaceCrtNoiseLayer/u);
  assert.match(compactRules, /data-avatar-details-emission="glow"/u);
  assert.match(compactRules, /data-crt-glyph-layer="true"/u);
  assert.doesNotMatch(
    compactRules,
    /zenLiveBotPresenceFaceGlyph[^{]*\{[^}]*display:\s*none/u,
  );
  assert.doesNotMatch(
    compactRules,
    /coffeeSeatPlateEmoji[^{]*\{[^}]*animation:\s*none/u,
  );
});

test("runtime pressure removes Signal ambience without suppressing mouth state", () => {
  const runtimeRules = pageCss.slice(
    pageCss.indexOf("Runtime pressure applies"),
    pageCss.indexOf("@keyframes botAmbientHoverDrift"),
  );
  assert.match(runtimeRules, /data-prism-adaptive-quality="balanced"/u);
  assert.match(runtimeRules, /data-prism-adaptive-quality="minimal"/u);
  assert.doesNotMatch(runtimeRules, /coffeeSeatPlateEmoji/u);
  assert.match(signalCss, /data-prism-adaptive-quality="minimal"/u);
  assert.match(signalSource, /mouthShape:\s*ZenLiveBotMouthShape/u);
  assert.match(signalSource, /mouthShape,/u);
  assert.match(pageSource, /isTalking=\{avatarState\.talking\}/u);
  assert.match(pageSource, /mouthShape=\{avatarState\.mouthShape\}/u);
});

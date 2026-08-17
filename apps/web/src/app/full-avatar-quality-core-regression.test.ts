import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("./page.tsx", import.meta.url),
  "utf8",
);
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const globalCss = readFileSync(
  new URL("./globals.css", import.meta.url),
  "utf8",
);

function cssSection(start: string, end: string): string {
  return pageCss.slice(pageCss.indexOf(start), pageCss.indexOf(end));
}

test("full-avatar quality cuts never target the phosphor screen", () => {
  assert.match(
    pageCss,
    /data-crt-pixel-mask-ready="true"\]::after[\s\S]*mask-image:\s*var\(--crt-phosphor-pixel-mask\)/u,
  );
  assert.match(
    pageCss,
    /Micro convergence:[\s\S]*\[data-crt-glyph-layer="true"\]::after[\s\S]*background:/u,
  );

  for (const rules of [
    cssSection("Session bot visual quality", "Rendered-size quality"),
    cssSection("Rendered-size quality", "Runtime pressure may simplify"),
    cssSection("Runtime pressure may simplify", "@keyframes botAmbientHoverDrift"),
  ]) {
    assert.doesNotMatch(
      rules,
      /(?:FaceEmissionMask|CrtNoiseLayer|CrtBreathingLayer|CrtGrimeLayer|data-crt-glyph-layer|data-avatar-details-emission|data-avatar-details-motion-group|CrtPixelGridLayer|ScreenGlassOverlay)/u,
    );
  }

  assert.match(
    globalCss,
    /data-crt-phosphor="bot"\] \[data-prism-decorative-motion="true"\]/u,
    "global quality ceilings must exclude motion inside the bot phosphor screen",
  );
});

test("Signal uses the shared full-avatar renderer guarded above", () => {
  assert.match(signalSource, /renderAvatar\?:/u);
  assert.match(
    pageSource,
    /renderAvatar=\{\(botSummary, avatarState\) => \{[\s\S]*<ZenLiveBotMannequin/u,
  );
});

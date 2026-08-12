import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8");
const cssSource = readFileSync(join(appDir, "page.module.css"), "utf8");
const publicProfileDir = join(
  appDir,
  "../../public/bot-frame/glass-v1",
);

test("full avatars mount authored residue and distortion above phosphor", () => {
  assert.match(
    pageSource,
    /<BotFaceScreenGlass[\s\S]*className=\{styles\.zenLiveBotPresenceScreenGlass\}[\s\S]*authoredWear/,
  );
  assert.match(pageSource, /data-screen-glass-layer="distortion"/);
  assert.match(pageSource, /data-screen-glass-layer="residue"/);
  assert.match(
    cssSource,
    /\.zenLiveBotPresenceScreenGlass \.botFaceScreenGlassResidue[\s\S]*var\(--bot-screen-glass-residue-image\)/,
  );
  assert.match(
    cssSource,
    /\.zenLiveBotPresenceScreenGlass \.botFaceScreenGlassDistortion[\s\S]*backdrop-filter:\s*blur/,
  );
  const fullSizeGlassRule = cssSource.match(
    /\.zenLiveBotPresenceScreenGlass\s*\{[\s\S]*?\n\}/u,
  )?.[0];
  assert.ok(fullSizeGlassRule);
  assert.match(
    fullSizeGlassRule,
    /--bot-face-screen-glass-background:\s*none\s*;/u,
  );
  assert.match(
    fullSizeGlassRule,
    /--bot-face-screen-glass-opacity:\s*1\s*;/u,
  );
  assert.match(
    fullSizeGlassRule,
    /--bot-face-screen-specular-opacity:\s*0\.055\s*;/u,
  );
  assert.doesNotMatch(fullSizeGlassRule, /linear-gradient\(/u);
  const curvatureRule = cssSource.match(
    /\.botFaceCrtGrimeLayer\s*\{[\s\S]*?\n\}/u,
  )?.[0];
  assert.ok(curvatureRule);
  assert.doesNotMatch(curvatureRule, /linear-gradient\(/u);
  assert.doesNotMatch(curvatureRule, /--bot-face-screen-glare-[xy]/u);
  assert.doesNotMatch(
    readFileSync(join(appDir, "chatMiniBotAvatar.tsx"), "utf8"),
    /BotFaceScreenGlass|data-screen-glass-layer/,
  );
});

test("all authored glass profile pairs are installed", () => {
  for (let profile = 1; profile <= 12; profile += 1) {
    const token = String(profile).padStart(2, "0");
    assert.equal(
      existsSync(join(publicProfileDir, `glass-profile-${token}-residue.png`)),
      true,
    );
    assert.equal(
      existsSync(
        join(publicProfileDir, `glass-profile-${token}-distortion.png`),
      ),
      true,
    );
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./signalVisualPassports.tsx", import.meta.url),
  "utf8",
);
const experience = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const tutorial = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("Signal visual passports use complete lossless 2048px 16-cell pages", () => {
  assert.match(source, /SIGNAL_VISUAL_PASSPORT_PAGE_SIZE/u);
  assert.match(source, /SIGNAL_VISUAL_PASSPORTS_PER_PAGE/u);
  assert.match(source, /document\.fonts\.ready/u);
  assert.match(source, /canvas\.toDataURL\("image\/png"\)/u);
  assert.match(source, /Math\.ceil\(candidates\.length \/ SIGNAL_VISUAL_PASSPORTS_PER_PAGE\)/u);
  assert.match(source, /"neutral", "blink", "speech", "thinking"/u);
});

test("atlas cells contain opaque tokens and procedural cues but no bot names", () => {
  assert.match(source, /opaqueToken/u);
  assert.match(source, /source\.color/u);
  assert.match(source, /source\.glyph/u);
  assert.match(source, /source\.face/u);
  assert.match(source, /rasterizeVisibleAvatarDetailsRgba/u);
  assert.doesNotMatch(source, /source\.name/u);
});

test("Signal attaches fresh passports and refuses archived recognition proof", () => {
  assert.match(experience, /buildEpisodeVisualIdentity/u);
  assert.match(experience, /Preparing the episode image/u);
  assert.match(experience, /signalVisualIdentityNotice/u);
  assert.match(experience, /visualIdentity: episodeImageForTurn\.archivalProxyEpisodeId/u);
  assert.match(experience, /reason: "fresh_proof_required"/u);
  assert.match(experience, /visibility !== "hidden"/u);
  assert.match(experience, /scale !== "microscopic"/u);
  assert.match(experience, /!colorCycle/u);
  assert.match(experience, /resolveBotIdentityMirrorFaceV1/u);
  assert.match(experience, /resolveBotIdentityMirrorAvatarDetailsV1/u);
  assert.match(experience, /resolveBotIdentityShapeshiftFaceV1/u);
  assert.match(experience, /resolveBotIdentityShapeshiftAvatarDetailsV1/u);
});

test("Signal tutorial explains the three-cue and privacy contract", () => {
  assert.match(tutorial, /color, glyph, and face all uniquely match in the same region/u);
  assert.match(tutorial, /LOCAL keeps the source and references local/u);
  assert.match(tutorial, /opaque, name-free procedural references/u);
  assert.match(tutorial, /timeout continues the show without naming anyone/u);
  assert.match(
    tutorial,
    /Visual identity status stays out of the way for ordinary props and pictures/u,
  );
  assert.match(tutorial, /only when inspection actually finds a bot-like subject/u);
});

test("Signal excludes public catalog bots that are not installed", () => {
  assert.match(page, /bots\.filter\(\(bot\) => bot\.owned !== 0\)/u);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signal = readFileSync(new URL("./BotcastExperience.tsx", import.meta.url), "utf8");
const debate = readFileSync(new URL("./DebateExperience.tsx", import.meta.url), "utf8");

test("all live transcript copy surfaces use the shared focus annotation contract", () => {
  assert.match(page, /useLiveSessionFocusEvents\(\s*"coffee"/u);
  assert.match(page, /useLiveSessionFocusEvents\(\s*"story"/u);
  assert.match(page, /detail\?\.mode === "zen" \? "zen" : "chat"/u);
  assert.match(page, /const coffeeTranscriptText[\s\S]{0,6000}loadLiveSessionFocusEvents\(\s*"coffee"/u);
  assert.match(page, /download\.kind === "coffee-transcript"[\s\S]{0,3200}annotateTranscriptWithFocusEvents/u);
  assert.match(page, /copyPreviousCoffeeSessionVerboseTranscript[\s\S]{0,1600}annotateTranscriptWithFocusEvents/u);
  assert.match(page, /exportChat[\s\S]{0,900}annotateTranscriptWithFocusEvents/u);
  assert.match(page, /copyVerboseTranscriptToClipboard[\s\S]{0,900}annotateTranscriptWithFocusEvents/u);
  assert.match(page, /createConversationTranscriptStory[\s\S]{0,1200}annotateTranscriptWithFocusEvents/u);
  assert.match(page, /sourceApplet: "Story"[\s\S]{0,400}annotateTranscriptWithFocusEvents/u);
  assert.match(signal, /useLiveSessionFocusEvents\("signal"/u);
  assert.match(signal, /reviewTranscriptForEpisode[\s\S]{0,2800}annotateTranscriptWithFocusEvents/u);
  assert.match(debate, /useLiveSessionFocusEvents\([\s\S]{0,180}"debate"/u);
  assert.match(debate, /verboseTranscriptForSession[\s\S]{0,1700}annotateTranscriptWithFocusEvents/u);
  assert.match(debate, /copyCaseBoardTranscript[\s\S]{0,1200}annotateTranscriptWithFocusEvents/u);
  assert.match(debate, /copyJuryRecordForTarget[\s\S]{0,1500}annotateTranscriptWithFocusEvents/u);
  assert.match(debate, /copyAllDebateReviewData[\s\S]{0,2500}annotateTranscriptWithFocusEvents/u);
});

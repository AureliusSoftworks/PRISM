import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("Coffee prepares and plays source-linked local vocal-action streams", () => {
  assert.match(
    source,
    /const prefetchCoffeePreparedVoice = \([\s\S]{0,2400}performanceText: utterance\.text,[\s\S]{0,180}streamChunks: useLocalPerformanceStream/u,
  );
  assert.match(
    source,
    /prefetchCoffeePreparedVoice\(utterance, controller\.signal\)/u,
  );
  assert.match(
    source,
    /performanceText: message\.content,/u,
  );
  assert.match(source, /streamChunks: useLocalPerformanceStream/u);
  assert.match(
    source,
    /if \(clip\.kind === "stream"\)[\s\S]{0,700}enqueueChunkedEnglishVoice\(/u,
  );
});

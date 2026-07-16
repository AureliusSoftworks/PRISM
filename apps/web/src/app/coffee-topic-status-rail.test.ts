import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

test("Coffee topic stats share the permanent Table Talk rail", () => {
  const transcriptStart = pageSource.indexOf("const renderCoffeeTranscriptPanel");
  const transcriptEnd = pageSource.indexOf(
    "const renderCoffeeGroupSettingsModal",
    transcriptStart,
  );
  assert.notEqual(transcriptStart, -1);
  assert.ok(transcriptEnd > transcriptStart);

  const transcriptSource = pageSource.slice(transcriptStart, transcriptEnd);
  assert.match(transcriptSource, /\{renderCoffeeTopicStatus\(\)\}/);
  assert.match(transcriptSource, /className=\{styles\.coffeeThread\}/);
  assert.ok(
    transcriptSource.indexOf("renderCoffeeTopicStatus()") <
      transcriptSource.indexOf("className={styles.coffeeThread}"),
  );

  assert.match(pageSource, /className=\{styles\.coffeeTeamsStatusPanel\}/);
  assert.match(pageSource, /className=\{styles\.coffeePollResultsPanel\}/);
  assert.doesNotMatch(pageSource, /coffeeTeamsPanelMinimized/);
  assert.doesNotMatch(pageSource, /coffeePollPanelMinimized/);
  assert.doesNotMatch(pageSource, /coffeeTeamsBubble/);
  assert.doesNotMatch(pageSource, /coffeePollBubble/);
});

test("the shared topic split and Table Talk rail are directly resizable", () => {
  assert.match(
    pageSource,
    /role="separator"[\s\S]*aria-label="Resize Table talk sidebar"/,
  );
  assert.match(
    pageSource,
    /"--coffee-transcript-width" as string\]: `\$\{coffeeTranscriptPanelWidth\}px`/,
  );
  assert.match(
    css,
    /\.coffeeTopicStatusSlot\s*\{[\s\S]*resize:\s*vertical;/,
  );
  assert.match(
    css,
    /\.coffeeTranscriptResizeHandle\s*\{[\s\S]*cursor:\s*ew-resize;/,
  );
  assert.doesNotMatch(css, /\.coffeePollBubble/);
  assert.doesNotMatch(css, /\.coffeeTeamsBubble/);
});

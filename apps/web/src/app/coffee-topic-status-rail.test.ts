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

test("the selected Coffee topic stays framed under the navbar", () => {
  assert.match(pageSource, /className=\{styles\.coffeeMainChrome\}/);
  assert.match(pageSource, /className=\{styles\.coffeeSessionTopicFrame\}/);
  assert.match(
    pageSource,
    /data-tutorial-target="coffee-session-topic"/,
  );
  assert.match(
    pageSource,
    /coffeeSessionSurfaceActive &&[\s\S]*!\([\s\S]*coffeeSessionPhase === "finished" && !coffeeReplayActive[\s\S]*\) &&[\s\S]*coffeeConversation\?\.coffeeTopic\?\.trim\(\)/,
  );
  assert.match(
    pageSource,
    /className=\{styles\.coffeeSessionTopicLabel\}[\s\S]*Topic/,
  );
  assert.doesNotMatch(
    pageSource,
    /coffeeThread[\s\S]{0,400}coffeeSessionTopicFrame/,
  );

  assert.match(
    css,
    /\.coffeeSessionTopicTitle\s*\{[\s\S]*overflow-wrap:\s*anywhere;/,
  );
  assert.match(css, /\.coffeeMainChrome\s*\{[\s\S]*display:\s*grid;/);
  assert.match(
    css,
    /\.coffeeMain\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/,
  );
});

test("finished Coffee review hides the redundant topic frame under the navbar", () => {
  assert.match(
    pageSource,
    /coffeeSessionPhase === "finished" && !coffeeReplayActive/,
  );
  assert.match(
    pageSource,
    /className=\{`\$\{styles\.coffeeStageHeader\} \$\{styles\.coffeeReviewHeader\}`\}/,
  );
  assert.match(
    pageSource,
    /<span className=\{styles\.sectionLabel\}>Session complete<\/span>/,
  );
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./BotcastExperience.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./botcast.module.css", import.meta.url), "utf8");

test("live Signal adapts Coffee's canonical public transcript projection", () => {
  assert.match(page, /import \{ projectCoffeePublicTranscript \} from "\.\/coffee-replay"/u);
  assert.match(
    page,
    /projectCoffeePublicTranscript\(\{[\s\S]{0,900}botcastMessageIsAudibleToAudienceV1/u,
  );
  assert.match(page, /message\.id !== speakingMessageId/u);
  assert.match(page, /normalizeAccentForTheme\(/u);
  assert.match(page, /data-signal-transcript="true"/u);
  assert.match(page, /data-tutorial-target="botcast-transcript"/u);
});

test("live Signal keeps the stage and producer desk in one left column", () => {
  assert.match(page, /className=\{styles\.liveWorkspaceStageColumn\}/u);
  assert.match(
    css,
    /liveWorkspaceStageColumn \.stageViewport,[\s\S]{0,260}liveWorkspaceStageColumn \.controlRoom,[\s\S]{0,260}liveWorkspaceStageColumn \.producerGuestComposerDock/u,
  );
  assert.match(css, /width:\s*100%;[\s\S]{0,100}max-width:\s*none/u);
  assert.doesNotMatch(css, /--signal-live-desk-max-width/u);
});

test("MacBook Pro is the primary Signal live layout gate", () => {
  assert.match(page, /signalTranscriptScrollRef/u);
  assert.match(page, /signalTranscriptFollowsLatestRef/u);
  assert.match(page, /onScroll=\{\(event\) => \{/u);
  assert.match(
    page,
    /rail\.scrollHeight - rail\.scrollTop - rail\.clientHeight < 56/u,
  );
  assert.match(
    css,
    /--signal-transcript-min-width:\s*300px/u,
  );
  assert.match(
    css,
    /--signal-live-vertical-reserve:\s*420px/u,
  );
  assert.match(
    css,
    /--signal-live-stage-column-width:\s*min\([\s\S]{0,280}100dvh - var\(--signal-live-vertical-reserve\)[\s\S]{0,220}grid-template-columns: minmax\(0, var\(--signal-live-stage-column-width\)\) minmax\(var\(--signal-transcript-min-width\), 1fr\);/u,
  );
  assert.doesNotMatch(css, /justify-content:\s*center;[\s\S]{0,120}align-items:\s*start/u);
  assert.doesNotMatch(css, /--signal-live-workspace-left-width/u);
  assert.doesNotMatch(css, /100dvh\s*-\s*620px/u);
  assert.match(css, /\.signalTranscriptThread \{ min-height: 0; overflow-y: auto;/u);

  // The supplied 3456×2234 Retina screenshot is a 1728×1117 logical display.
  // Its 33px desktop title bar leaves a 1728×1084 webview. This is the first
  // acceptance size: the stage receives every height-safe pixel, then the
  // transcript absorbs the remaining width instead of leaving dead margins.
  const macBookProViewport = { width: 1728, height: 1084 };
  const inlinePadding = 18 * 2;
  const inlineGutter = Math.min(
    18,
    Math.max(8, macBookProViewport.width * 0.01),
  );
  const verticalReserve = 420;
  const transcriptMinWidth = 300;
  const workspaceWidth = macBookProViewport.width - inlinePadding;
  const heightSafeStageWidth =
    (macBookProViewport.height - verticalReserve) * 1.7778;
  const stageWidth = Math.min(
    workspaceWidth - transcriptMinWidth - inlineGutter,
    heightSafeStageWidth,
  );
  const transcriptWidth = workspaceWidth - stageWidth - inlineGutter;

  assert.ok(stageWidth > 1180);
  assert.ok(transcriptWidth >= transcriptMinWidth);
  assert.ok(stageWidth / 1.7778 + verticalReserve <= macBookProViewport.height);
  assert.equal(stageWidth + transcriptWidth + inlineGutter, workspaceWidth);
  assert.match(
    css,
    /\.signalTranscriptMessage \{[^}]*max-width:\s*min\(94%, 64ch\)/u,
  );
  assert.match(
    css,
    /@media \(min-width: 901px\) and \(max-width: 1220px\)/u,
  );
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\);/u);
  assert.match(
    css,
    /@media \(max-width: 900px\)[\s\S]*\.signalTranscriptRail \{[^}]*display: grid;/u,
  );
});

test("completed Signal sessions remain visible for the sign-off, then power down in the rail", () => {
  assert.match(
    page,
    /data-live-workspace=\{[\s\S]{0,120}episode\.playbackMode !== "watch" \? "true" : undefined/u,
  );
  assert.match(
    page,
    /\{episode\.playbackMode !== "watch" \? renderLiveTranscript\(\) : null\}/u,
  );
  assert.match(
    page,
    /empty:\s*episode\.status === "cancelled"/u,
  );
  assert.match(
    page,
    /data-signal-studio-state=\{args\.empty \? "empty" : "occupied"\}/u,
  );
  assert.match(
    page,
    /hostVisibleToAudience =\s*!args\.empty && !hostDeparted/u,
  );
  assert.match(
    page,
    /\{!args\.empty \? \(\s*<div\s*className=\{styles\.stageNameplates\}/u,
  );
  assert.match(
    page,
    /episode\.status === "live"\s*\? "● ON AIR"\s*:\s*"○ SHOW ENDED"/u,
  );
  assert.match(
    page,
    /const episodeOutroVisible = Boolean\([\s\S]{0,520}episodeOutro\.phase === "complete"[\s\S]{0,420}episodeOutro\.episode\.playbackMode !== "watch"/u,
  );
  assert.match(
    page,
    /episodeOutro && episodeOutroVisible && selectedShow/u,
  );
  assert.match(
    page,
    /data-signal-completed-copy="true"/u,
  );
  assert.match(page, /aria-label="Completed Signal session controls"/u);
  assert.match(page, /Private line · \{hostBot\?\.name \?\? "Host"\}/u);
  assert.match(page, /episode\.status === "completed"\s*\? "Signal complete"/u);
  assert.match(css, /signalGuestSignoffExit/u);
  assert.match(css, /signalHostSignoffExit/u);
  assert.match(
    page,
    /completedStudioUsesOutro\s*\? returnFromEpisodeOutro\(\)\s*:\s*returnFromCompletedEpisode\(\)/u,
  );
  assert.doesNotMatch(
    page,
    /episode\.status === "live" && episode\.playbackMode !== "watch"\s*\? renderLiveTranscript/u,
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("./botcast.module.css", import.meta.url),
  "utf8",
);
const tutorials = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

describe("Fullscreen Signal replay", () => {
  it("joins the recorded stage, transport, and focused cue sheet into one replay room", () => {
    const replayBranch = source.slice(
      source.indexOf("replayEpisode && selectedShow"),
      source.indexOf("selectedShow && showHasVacantHost"),
    );

    assert.match(replayBranch, /data-signal-replay="true"/u);
    assert.match(replayBranch, /data-signal-replay-room="true"/u);
    assert.match(replayBranch, /className=\{styles\.replayScreen\}/u);
    assert.match(replayBranch, /className=\{styles\.replayStage\}/u);
    assert.match(replayBranch, /className=\{styles\.replayPlayer\}/u);
    assert.match(replayBranch, /className=\{styles\.replayProgram\}/u);
    assert.doesNotMatch(replayBranch, /theater|proscenium|marquee|curtain/iu);
    assert.ok(
      replayBranch.indexOf("styles.replayStage") <
        replayBranch.indexOf("styles.replayPlayer"),
    );
    assert.ok(
      replayBranch.indexOf("styles.replayPlayer") <
        replayBranch.indexOf("styles.replayProgram"),
    );

    assert.match(source, /data-replay-episode=\{replayEpisode/u);
    assert.match(source, /!liveSessionActive && !replayEpisode/u);
    assert.match(
      css,
      /\.shell\[data-replay-episode="true"\]\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden/iu,
    );
    assert.match(
      css,
      /\.replayLayout\[data-signal-replay="true"\]\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden/iu,
    );
    assert.match(
      css,
      /\.replayRoom\s*\{[^}]*grid-template-columns:[^}]*overflow:\s*hidden/iu,
    );
    assert.match(
      css,
      /\.replayProgram \.replayTranscript\s*\{[^}]*overflow:\s*hidden/iu,
    );
    assert.doesNotMatch(css, /\.replay(?:Theater|Proscenium)/u);
    const replayOutroBlock = css.slice(
      css.indexOf(".replayBookend[data-kind=\"outro\"]"),
      css.indexOf(".replayBookend[data-kind=\"outro\"] .preRollSignalField"),
    );
    assert.equal(replayOutroBlock.includes("var(--botcast-curtain)"), false);
  });

  it("shows a saved persona review as its own prominent star-rating chip", () => {
    const replayBranch = source.slice(
      source.indexOf("replayEpisode && selectedShow"),
      source.indexOf("selectedShow && showHasVacantHost"),
    );

    assert.match(
      replayBranch,
      /\{replayEpisode\.personaReview \? \([\s\S]{0,240}data-signal-replay-review="true"/u,
    );
    assert.match(
      replayBranch,
      /signalAudienceRatingColor\([\s\S]{0,80}replayEpisode\.personaReview\.rating/u,
    );
    assert.match(
      replayBranch,
      /replayEpisode\.personaReview\.rating\.toFixed\(1\)[\s\S]{0,120}★/u,
    );
    assert.match(
      replayBranch,
      /<q>\{replayEpisode\.personaReview\.comment\}<\/q>/u,
    );
    assert.match(replayBranch, /\) : null\}/u);
    assert.match(
      css,
      /\.replayReviewChip\s*\{[^}]*--signal-rating-color:[^}]*border-radius:\s*999px/iu,
    );
    assert.match(
      tutorials,
      /saved Library-persona review, its reviewer, comment, and star rating appear in the compact replay header/u,
    );
  });

  it("themes replay chrome while keeping the recorded screen cinematic in narrow layouts", () => {
    assert.match(
      css,
      /\.shell\[data-theme="light"\]\s*\{[\s\S]*--signal-replay-canvas:\s*#edf5fc;[\s\S]*--signal-replay-color-scheme:\s*light;/u,
    );
    assert.match(
      css,
      /\.shell\[data-replay-episode="true"\]\s*\{[^}]*background:\s*var\(--signal-replay-shell-background\);[^}]*color-scheme:\s*var\(--signal-replay-color-scheme\);/u,
    );
    assert.match(
      css,
      /\.shell\[data-theme="light"\]\[data-replay-episode="true"\] \.replayTransport/u,
    );
    assert.match(css, /\.replayScreen\s*\{[^}]*background:\s*#000;/u);
    assert.match(
      css,
      /@media \(max-width:\s*900px\)[\s\S]*?\.shell\[data-replay-episode="true"\] \.replayRoom\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/iu,
    );
    assert.match(
      css,
      /\.shell\[data-replay-episode="true"\] \.replayRoom > \.replayProgram\s*\{[^}]*display:\s*none/iu,
    );
  });
});

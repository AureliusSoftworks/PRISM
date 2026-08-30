import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("./DebateExperience.module.css", import.meta.url),
  "utf8",
);

describe("active Debate archive card TLC", () => {
  it("keeps one primary way back into the current mystery run", () => {
    assert.match(
      source,
      /const isCurrentRun = openFamilyRun\?\.id === run\.id/u,
    );
    assert.match(
      source,
      /data-current=\{isCurrentRun \? "true" : undefined\}/u,
    );
    assert.match(
      source,
      /\{isCurrentRun \? \([\s\S]{0,500}archiveRunCurrent[\s\S]{0,500}: \([\s\S]{0,500}archiveRunOpenButton/u,
    );
    assert.match(source, /\{proceedingActionLabel\}/u);
  });

  it("presents the proceeding controls as one accessible action group", () => {
    assert.match(
      source,
      /className=\{styles\.archiveActions\}[\s\S]{0,120}role="group"[\s\S]{0,120}aria-label=\{`Actions for \$\{session\.title\}`\}/u,
    );
    assert.match(css, /\.archiveRunRow\[data-current="true"\]\s*\{/u);
    assert.equal(css.match(/\.sessionList > li/gu)?.length, 4);
    assert.doesNotMatch(css, /\.sessionList li/u);
    assert.match(css, /\.archiveRunCurrent\s*\{/u);
    assert.match(css, /\.archiveRunActions \.archiveRunOpenButton\s*\{/u);
    assert.match(
      css,
      /\.archiveActions > \.deleteButton\s*\{[^}]*margin-inline-start:\s*auto/u,
    );
  });

  it("gives every action a visible focus state and stacks safely when narrow", () => {
    assert.match(
      css,
      /:is\(\.archiveOpenButton, \.archiveReuseButton, \.deleteButton\):focus-visible/u,
    );
    assert.match(
      css,
      /@media \(max-width: 720px\)[\s\S]{0,900}\.archiveActions > \.archiveOpenButton/u,
    );
    assert.match(
      css,
      /@media \(max-width: 480px\)[\s\S]{0,900}\.archiveRunRow\s*\{[\s\S]{0,100}grid-template-columns:\s*minmax\(0, 1fr\)/u,
    );
  });
});

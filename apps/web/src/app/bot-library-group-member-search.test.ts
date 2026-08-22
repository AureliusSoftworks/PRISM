import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("bot group member search", () => {
  it("adds case-insensitive filtering and pinned selected-members ordering", () => {
    assert.match(
      pageSource,
      /const normalizedMemberQuery = memberQuery\.toLowerCase\(\);[\s\S]*?toLowerCase\(\)\s*\.includes\(normalizedMemberQuery\)/,
    );
    assert.match(
      pageSource,
      /const selectedMembers = sortedPanelBots\.filter\(/,
    );
    assert.match(
      pageSource,
      /const visibleMembers = \[\.\.\.selectedMembers, \.\.\.filteredCandidates\];/,
    );
  });

  it("exposes accessible search controls with a clear action", () => {
    assert.match(pageSource, /aria-label="Search bots in this group"/);
    assert.match(
      pageSource,
      /htmlFor="bot-library-group-member-search"[\s\S]*?id="bot-library-group-member-search"/,
    );
    assert.match(
      pageSource,
      /aria-label="Clear bot search"[\s\S]*?title="Clear bot search"/,
    );
    assert.match(pageSource, /type=\"search\"/);
    assert.match(pageSource, /setBotLibraryGroupMemberSearchQuery\(""\)/);
  });

  it("announces results while keeping selected bots understandable", () => {
    assert.match(pageSource, /No bots match that search\./);
    assert.match(pageSource, /No additional bots match\./);
    assert.match(pageSource, /Selected bots remain visible\./);
    assert.match(pageSource, /role="status"/);
    assert.match(pageSource, /aria-live="polite"/);
  });

  it("styles search control in both modal theme paths", () => {
    assert.match(cssSource, /\.botLibraryGroupMemberSearchField\s*\{/);
    assert.match(cssSource, /\.botLibraryGroupMemberSearch\s*\{/);
    assert.match(cssSource, /\.botLibraryGroupMemberSearch input\s*\{/);
    assert.match(cssSource, /\.botLibraryGroupMemberSearch button\s*\{/);
    assert.match(cssSource, /\.botLibraryGroupMemberSearchStatus\s*\{/);
  });

  it("exposes only group identity prose to universal Refract", () => {
    assert.match(
      pageSource,
      /<span>Name<\/span>[\s\S]*?<input[\s\S]*name="bot-library-group-name"[\s\S]*aria-label="Bot group name"[\s\S]*aria-describedby="bot-library-group-dialog-summary"[\s\S]*value=\{dialog\.name\}/,
    );
    assert.match(
      pageSource,
      /<span>Description<\/span>[\s\S]*?<textarea[\s\S]*name="bot-library-group-description"[\s\S]*aria-label="Bot group description"[\s\S]*aria-describedby="bot-library-group-dialog-summary"[\s\S]*value=\{dialog\.description\}/,
    );
    assert.match(
      pageSource,
      /<fieldset[\s\S]*className={styles\.botLibraryGroupMemberPicker}[\s\S]*data-prism-refract-ignore="true"[\s\S]*id="bot-library-group-member-search"/,
    );
  });
});

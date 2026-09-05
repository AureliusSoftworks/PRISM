import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

const panelInfoSource = pageSource.slice(
  pageSource.indexOf("function PanelSectionInfo"),
  pageSource.indexOf("function formatMemoryDossierDate"),
);
const ephemeralChatSettingsSource = pageSource.slice(
  pageSource.indexOf("const renderEphemeralChatProviderSetting"),
  pageSource.indexOf("const renderProviderModeToggle"),
);
const debateSettingsSource = pageSource.slice(
  pageSource.indexOf('activeSettingsScope === "debate"'),
  pageSource.indexOf('activeSettingsScope === "slate"'),
);

describe("webpage-curse settings contract", () => {
  it("uses a real question-mark help button for optional exposition", () => {
    assert.match(panelInfoSource, /icon = "help"/u);
    assert.match(panelInfoSource, /<button\s+type="button"/u);
    assert.match(panelInfoSource, /variant === "control"/u);
    assert.match(panelInfoSource, /role="button"[\s\S]*tabIndex=\{0\}/u);
    assert.match(panelInfoSource, /aria-describedby=\{id\}/u);
    assert.match(panelInfoSource, /role="tooltip"/u);
  });

  it("lets the ephemeral response selector carry its own live state", () => {
    assert.match(ephemeralChatSettingsSource, /<PanelSectionInfo/u);
    assert.match(ephemeralChatSettingsSource, /Use global toggle/u);
    assert.match(ephemeralChatSettingsSource, /Always LOCAL/u);
    assert.match(ephemeralChatSettingsSource, /Prefer ONLINE/u);
    assert.doesNotMatch(ephemeralChatSettingsSource, /Global by default/u);
    assert.doesNotMatch(
      ephemeralChatSettingsSource,
      /Follows the account-wide response toggle/u,
    );
  });

  it("keeps Debate's fixed ceremony detail optional", () => {
    assert.match(
      debateSettingsSource,
      /label="About Jury deliberation"[\s\S]*Pause and Resume remain silent/u,
    );
    assert.doesNotMatch(
      debateSettingsSource,
      /Jury deliberation follows one consistent automatic ceremony/u,
    );
    assert.doesNotMatch(
      debateSettingsSource,
      /New cases may draw up to two physical props/u,
    );
  });

  it("does not narrate the obvious Home composer and library actions", () => {
    assert.doesNotMatch(
      pageSource,
      /A continuous PRISM-only space for the present thread\. Send a message below/u,
    );
    assert.match(pageSource, /return descriptionPreview;/u);
  });

  it("keeps compact save docks responsive", () => {
    assert.match(
      pageCss,
      /\.settingsDockRow\[data-compact="true"\][\s\S]*justify-content: flex-end/u,
    );
    assert.match(
      pageCss,
      /@media \(max-width: 760px\)[\s\S]*\.settingsDockRow/u,
    );
  });
});

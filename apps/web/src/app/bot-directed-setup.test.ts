import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pickerSource = readFileSync(new URL("./BotPicker.tsx", import.meta.url), "utf8");
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const debateSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const whodunnitSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("bot-directed applet setup", () => {
  it("registers concrete shared picker tiles as the nearest Wield target", () => {
    assert.match(pickerSource, /directedSetupTarget\?: PrismRefractBotDirectedSetupTarget/u);
    assert.match(pickerSource, /if \(!directedSetupTargetId\) return/u);
    assert.match(pickerSource, /registerPrismRefractTarget\(directedSetupTargetId/u);
    assert.match(pickerSource, /data-prism-refract-id=\{directedSetupTarget\?\.id\}/u);
  });

  it("keeps Signal's captured guest fixed while synthesizing both booking fields", () => {
    assert.match(signalSource, /resolvedSignalBookingGuestId\(\{/u);
    assert.match(signalSource, /setGuestDraftId\(resolvedGuestId\)/u);
    assert.match(signalSource, /randomizeBooking\(direction, botId\)/u);
    assert.match(signalSource, /setTopicDraft\(topic\)[\s\S]*setProducerBriefDraft\(producerBrief\)/u);
  });

  it("keeps the captured Debate bot in its generated editable setup", () => {
    assert.match(debateSource, /anchorDebateSetupCast\(\{/u);
    assert.match(debateSource, /generateNewDuelFromPrism\(direction, \{/u);
    assert.match(
      debateSource,
      /pendingBotDirectedSetupAnchorRef\.current \?\? undefined/u,
    );
  });

  it("does not register individual Coffee bots as group-creation targets", () => {
    assert.doesNotMatch(pageSource, /coffee-setup-anchor-/u);
    assert.doesNotMatch(pageSource, /generateCoffeeGroupFromPrism/u);
  });

  it("builds a local editable Story draft around the anchor without starting it", () => {
    const start = pageSource.indexOf("const populateStorySetupAroundBot");
    const end = pageSource.indexOf("const renderStorySetup", start);
    assert.ok(start >= 0 && end > start);
    const setupSource = pageSource.slice(start, end);
    assert.match(setupSource, /setStorySelectedBotIds/u);
    assert.match(setupSource, /setStoryPremise/u);
    assert.doesNotMatch(setupSource, /createStorySessionFromDraft|\/api\/story\/sessions/u);
    assert.match(pageSource, /id: `story-setup-anchor-\$\{bot\.id\}`/u);
  });

  it("keeps a captured Whodunnit bot in a fully populated editable case setup", () => {
    assert.match(
      whodunnitSource,
      /id: `debate-setup-anchor-\$\{bot\.id\}-\$\{/u,
    );
    assert.match(whodunnitSource, /randomizeWhodunnitCastAroundBot/u);
    assert.match(whodunnitSource, /randomizeMysteryCastAroundBot/u);
    assert.match(whodunnitSource, /setMysteryInspiration/u);
  });
});

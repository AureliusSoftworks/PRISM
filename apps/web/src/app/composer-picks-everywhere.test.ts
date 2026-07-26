import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const slateSource = readFileSync(
  new URL("./SlateWorkspace.tsx", import.meta.url),
  "utf8",
);

describe("composer picks everywhere", () => {
  it("expands Prompt Center prompts and wildcard decks for non-chat composers", () => {
    assert.match(pageSource, /function expandComposerDraft\(rawDraft: string\)/u);
    assert.match(
      pageSource,
      /const renderPickAwareComposer = \([\s\S]{0,200}PickAwareComposerFieldState/u,
    );
    assert.match(
      pageSource,
      /promptPicks=\{commandCenterPromptPicks\}[\s\S]{0,120}wildcardPicks=\{composerWildcardDeckPicks\}/u,
    );
    assert.match(
      pageSource,
      /const renderPickAwareComposer = [\s\S]{0,1200}?chipPointerBehavior="delete"/u,
    );
  });

  it("wires Coffee table composers to prompts and wildcard decks", () => {
    assert.match(
      pageSource,
      /variant: "coffee-table"[\s\S]{0,2200}promptPicks: commandCenterPromptPicks[\s\S]{0,200}wildcardPicks: composerWildcardDeckPicks/u,
    );
    assert.match(
      pageSource,
      /const liveDraft = expandComposerDraft\((?:raw|assisted)Draft\)/u,
    );
  });

  it("preserves Signal's single-line topic input while enriching multiline composers", () => {
    assert.match(signalSource, /renderPickAwareComposer\?/u);
    assert.match(signalSource, /expandComposerDraft\?/u);
    assert.match(
      signalSource,
      /<input[\s\S]{0,120}id="signal-episode-topic"[\s\S]{0,160}setTopicDraft/u,
    );
    const topicFieldSource = signalSource.slice(
      signalSource.indexOf('<label htmlFor="signal-episode-topic">'),
      signalSource.indexOf('<label htmlFor="signal-producer-brief">'),
    );
    assert.doesNotMatch(
      topicFieldSource,
      /renderPickAwareComposer|textarea/u,
    );
    assert.match(
      signalSource,
      /id: "signal-producer-brief"[\s\S]{0,260}onChange: setProducerBriefDraft[\s\S]{0,420}resolvePicksToPlainText: true/u,
    );
    assert.match(
      pageSource,
      /field\.resolvePicksToPlainText[\s\S]{0,240}expandComposerDraft\([\s\S]{0,100}composerShortcutInsertionText\(command\)/u,
    );
    assert.equal(
      signalSource.match(/resolvePicksToPlainText: true/gu)?.length,
      3,
    );
    assert.match(
      pageSource,
      /shortcutChipsEnabled=\{!field\.resolvePicksToPlainText\}/u,
    );
    assert.match(
      pageSource,
      /variant === "signal"[\s\S]{0,500}shortcutChipsEnabled=\{variant !== "signal"\}/u,
    );
    assert.match(
      signalSource,
      /id: "botcast-premise-inspiration"[\s\S]{0,200}onChange: setShowPremiseInspirationDraft/u,
    );
    assert.match(
      signalSource,
      /id: `signal-show-premise-\$\{selectedShow\.id\}`[\s\S]{0,200}onChange: setShowPremiseDraft/u,
    );
    assert.match(
      signalSource,
      /currentTopic: topicDraft(?:\.trim\(\))?/u,
    );
    assert.match(
      signalSource,
      /expandComposerDraft\?\.\(producerBriefDraft\)\s*\?\?\s*producerBriefDraft/u,
    );
    assert.match(
      pageSource,
      /variant: "signal"[\s\S]{0,1400}promptPicks: commandCenterPromptPicks[\s\S]{0,200}wildcardPicks: composerWildcardDeckPicks/u,
    );
  });

  it("wires the Slate project companion to pick-aware expansion", () => {
    assert.match(slateSource, /renderPickAwareComposer\?/u);
    assert.match(slateSource, /expandComposerDraft\?/u);
    assert.match(
      slateSource,
      /renderPickAwareComposer\(\{[\s\S]{0,240}placeholder: "Catch the next idea/u,
    );
    assert.match(
      slateSource,
      /expandComposerDraft\?\.\(rawContent\)/u,
    );
    assert.match(
      pageSource,
      /<SlateWorkspace[\s\S]{0,800}renderPickAwareComposer=\{renderPickAwareComposer\}[\s\S]{0,200}expandComposerDraft=\{expandComposerDraft\}/u,
    );
  });
});

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
      /async function expandComposerDraftOperative\(rawDraft: string\): Promise<string>/u,
    );
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
      /const renderPickAwareComposer = [\s\S]{0,2400}?chipPointerBehavior="delete"/u,
    );
  });

  it("wires Coffee table composers to prompts and wildcard decks", () => {
    assert.match(
      pageSource,
      /variant: "coffee-table"[\s\S]{0,2200}promptPicks: commandCenterPromptPicks[\s\S]{0,200}wildcardPicks: composerWildcardDeckPicks/u,
    );
    assert.match(
      pageSource,
      /liveDraft = await expandComposerDraftOperative\((?:raw|assisted)Draft\)/u,
    );
    assert.doesNotMatch(
      pageSource,
      /if \(liveDraft !== coffeeDraft\) \{\s*setCoffeeDraft\(liveDraft\);/u,
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
      /id: "signal-producer-brief"[\s\S]{0,260}onChange: setProducerBriefDraft/u,
    );
    assert.doesNotMatch(signalSource, /resolvePicksToPlainText/u);
    assert.match(
      pageSource,
      /const resolveComposerPromptPickToPlainText = useCallback\(/u,
    );
    assert.match(
      pageSource,
      /const renderPickAwareComposer = [\s\S]{0,1800}?resolveShortcutPickToText=\{resolveComposerPromptPickToPlainText\}[\s\S]{0,120}shortcutChipsEnabled/u,
    );
    assert.match(
      pageSource,
      /resolveComposerPromptPickToPlainText[\s\S]{0,200}isComposerWildcardDeckPick[\s\S]{0,200}isCommandCenterPromptShortcut/u,
    );
    assert.doesNotMatch(
      pageSource,
      /shortcutChipsEnabled=\{variant !== "signal"\}/u,
    );
    assert.match(
      pageSource,
      /const textareaOverlayEnabled =\s*shortcutChipsEnabled \|\| writingAssistEnabled/u,
    );
    assert.match(
      pageSource,
      /data-rich-overlay=\{[\s\S]{0,100}textareaOverlayEnabled[\s\S]{0,100}data-plain-shortcuts=/u,
    );
    assert.match(
      signalSource,
      /id: "botcast-premise-inspiration"[\s\S]{0,200}onChange: setShowPremiseInspirationDraft/u,
    );
    // Saved show Premise stays a plain textarea; booking fields keep pick-aware powers.
    assert.match(
      signalSource,
      /id=\{`signal-show-premise-\$\{selectedShow\.id\}`\}[\s\S]{0,800}setShowPremiseDraft/u,
    );
    assert.match(
      signalSource,
      /currentTopic: topicDraft(?:\.trim\(\))?/u,
    );
    assert.match(
      signalSource,
      /await expandComposerDraft\?\.\(producerBriefDraft\)\)\s*\?\?\s*producerBriefDraft/u,
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
      /await expandComposerDraft\?\.\(rawContent\)/u,
    );
    assert.match(
      pageSource,
      /<SlateWorkspace[\s\S]{0,800}renderPickAwareComposer=\{renderPickAwareComposer\}[\s\S]{0,200}expandComposerDraft=\{expandComposerDraftOperative\}/u,
    );
  });

  it("wires Debate Territory to prompts and wildcard decks", () => {
    const debateSource = readFileSync(
      new URL("./DebateExperience.tsx", import.meta.url),
      "utf8",
    );
    assert.match(debateSource, /renderPickAwareComposer\?/u);
    assert.match(debateSource, /expandComposerDraft\?/u);
    assert.match(
      debateSource,
      /id: "debate-territory"[\s\S]{0,500}onChange: setTopic/u,
    );
    assert.doesNotMatch(debateSource, /resolvePicksToPlainText/u);
    assert.match(
      debateSource,
      /await expandDebateSeedDraft\(topic\)/u,
    );
    assert.match(
      pageSource,
      /resetSingleModeTutorial\("debate"\)[\s\S]{0,180}expandComposerDraft=\{expandComposerDraftOperative\}[\s\S]{0,120}renderPickAwareComposer=\{renderPickAwareComposer\}/u,
    );
  });
});

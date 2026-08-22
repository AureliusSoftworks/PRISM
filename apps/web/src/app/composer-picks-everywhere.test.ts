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

describe("composer shortcut language is Zen-only", () => {
  it("keeps Prompt Center authoring picks while gating session composers to Zen", () => {
    assert.match(
      pageSource,
      /const composerShortcutLanguageEnabled = chatImmersivePresentation/u,
    );
    assert.match(
      pageSource,
      /const sessionComposerPromptPicks = composerShortcutLanguageEnabled\s*\? commandCenterPromptPicks\s*: EMPTY_COMPOSER_COMMAND_PICKS/u,
    );
    assert.match(
      pageSource,
      /promptPicks=\{commandCenterPromptPicks\}[\s\S]{0,120}wildcardPicks=\{composerWildcardDeckPicks\}/u,
    );
    assert.match(
      pageSource,
      /const renderPickAwareComposer = \([\s\S]{0,200}PickAwareComposerFieldState/u,
    );
    assert.match(
      pageSource,
      /const renderPickAwareComposer = [\s\S]{0,2400}?promptPicks=\{EMPTY_COMPOSER_COMMAND_PICKS\}[\s\S]{0,200}wildcardPicks=\{EMPTY_COMPOSER_COMMAND_PICKS\}[\s\S]{0,200}shortcutChipsEnabled=\{false\}/u,
    );
    assert.match(
      pageSource,
      /function expandComposerDraft\(rawDraft: string\): string \{\s*return rawDraft;/u,
    );
    assert.match(
      pageSource,
      /async function expandComposerDraftOperative\(\s*rawDraft: string,\s*\): Promise<string> \{\s*return rawDraft;/u,
    );
    assert.match(
      pageSource,
      /composerShortcutLanguageEnabled &&[\s\S]{0,240}resolveCommandCenterPromptShortcuts/u,
    );
  });

  it("keeps Coffee table composers as ordinary text", () => {
    assert.match(
      pageSource,
      /variant: "coffee-table"[\s\S]{0,2200}promptPicks: EMPTY_COMPOSER_COMMAND_PICKS[\s\S]{0,200}wildcardPicks: EMPTY_COMPOSER_COMMAND_PICKS/u,
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

  it("preserves Signal's single-line topic input without shortcut language", () => {
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
      /variant: "signal"[\s\S]{0,1400}promptPicks: EMPTY_COMPOSER_COMMAND_PICKS[\s\S]{0,200}wildcardPicks: EMPTY_COMPOSER_COMMAND_PICKS/u,
    );
  });

  it("keeps the Slate project companion without expanding shortcut language", () => {
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
      /<SlateWorkspace[\s\S]{0,2400}renderPickAwareComposer=\{renderPickAwareComposer\}[\s\S]{0,200}expandComposerDraft=\{expandComposerDraftOperative\}/u,
    );
  });

  it("keeps Debate Territory as ordinary text", () => {
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
      /await expandDebateSeedDraft\(topicOverride \?\? topic\)/u,
    );
    assert.match(
      pageSource,
      /resetSingleModeTutorial\("debate"\)[\s\S]{0,180}expandComposerDraft=\{expandComposerDraftOperative\}[\s\S]{0,120}renderPickAwareComposer=\{renderPickAwareComposer\}/u,
    );
  });
});

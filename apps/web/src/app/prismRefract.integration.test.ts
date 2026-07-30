import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const companionSource = readFileSync(
  new URL("./PrismCompanion.tsx", import.meta.url),
  "utf8",
);
const refractSource = readFileSync(
  new URL("./prismRefract.ts", import.meta.url),
  "utf8",
);
const companionStyles = readFileSync(
  new URL("./prismCompanion.module.css", import.meta.url),
  "utf8",
);
const signalStyles = readFileSync(
  new URL("./botcast.module.css", import.meta.url),
  "utf8",
);
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const debateSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Prism Refract integration", () => {
  it("gives registered focused controls shortcut precedence and preserves companion fallback", () => {
    assert.match(
      companionSource,
      /focusedPrismRefractTargetId\(document\.activeElement\)[\s\S]*requestPrismRefract\(targetId, "focused-shortcut"\)[\s\S]*openAndFocus/u,
    );
    assert.match(
      signalSource,
      /id: "signal-create-host"[\s\S]*kind: "choice"/u,
    );
    assert.match(
      signalSource,
      /signal-episode-guest-[\s\S]*signal-episode-topic-[\s\S]*signal-producer-brief-[\s\S]*signal-episode-length-/u,
    );
    assert.match(
      signalSource,
      /signal-show-identity-name-[\s\S]*signal-show-identity-premise-/u,
    );
    assert.match(
      signalSource,
      /signal-show-header-name-[\s\S]*disabled: \(\) => busy \|\| Boolean\(replayEpisode\)/u,
    );
    assert.match(
      pageSource,
      /if \(view === "botcast"\)[\s\S]*<BotcastExperience[\s\S]*\{renderGlobalPrismCompanion\(\)\}/u,
    );
  });

  it("keeps Prism available for Debate setup and contextually refracts registered drafts", () => {
    assert.match(
      pageSource,
      /if \(view === "debate"\)[\s\S]*debateDraft: debateCompanionContext\.draft/u,
    );
    assert.match(
      pageSource,
      /onCompanionContextChange=\{setDebateCompanionContext\}[\s\S]*reason="debate-live-session"[\s\S]*\{renderGlobalPrismCompanion\(\)\}/u,
    );
    assert.match(
      debateSource,
      /id: "debate-setup-topic"[\s\S]*"debate\.setup\.topic"/u,
    );
    assert.match(
      debateSource,
      /id: "debate-setup-motion"[\s\S]*"debate\.setup\.motion"/u,
    );
    assert.match(
      debateSource,
      /id: "debate-setup-exhibit-adjective"[\s\S]*"debate\.setup\.exhibitObservation"/u,
    );
    assert.match(
      debateSource,
      /run: \(direction\) => synthesize\(direction\)/u,
    );
    assert.match(
      tutorialSource,
      /floating Prism remains available throughout setup[\s\S]*Wield Prism into a glowing setup field/u,
    );
  });

  it("pins keyboard acceptance, reroll swallowing, restoration, and magic prompt spaces", () => {
    assert.match(
      companionSource,
      /event\.key === " "[\s\S]*phase === "ready"[\s\S]*rerollPrismRefract\(\)[\s\S]*Prism is still refracting/u,
    );
    assert.match(
      companionSource,
      /event\.key === "Enter" \|\| event\.key === "Tab"[\s\S]*acceptPrismRefract/u,
    );
    assert.match(
      companionSource,
      /event\.key === "Escape"[\s\S]*releasePrismRefract\(true\)/u,
    );
    assert.match(
      companionSource,
      /phase === "prompting"[\s\S]*document\.activeElement === refractPromptRef\.current[\s\S]*return/u,
    );
    assert.match(
      companionSource,
      /const preventCapturedFieldInput[\s\S]*event\.preventDefault\(\)[\s\S]*"beforeinput"/u,
    );
  });

  it("rejects stale work and restores cursor/orb state on every release path", () => {
    assert.match(
      companionSource,
      /runId !== refractRunRef\.current/u,
    );
    assert.match(companionSource, /refractAbortRef\.current\?\.abort\(\)/u);
    assert.match(
      companionSource,
      /removeAttribute\(PRISM_REFRACT_CURSOR_ATTRIBUTE\)/u,
    );
    assert.match(
      companionSource,
      /prefers-reduced-motion: reduce[\s\S]*PRISM_REFRACT_TRAVEL_MS/u,
    );
    assert.match(
      companionSource,
      /Establish the traveling state before changing coordinates[\s\S]*requestAnimationFrame\([\s\S]*moveToTarget/u,
    );
    assert.match(
      companionSource,
      /className=\{styles\.refractGlyph\}[\s\S]*M16 5\.2 27 25H5Z/u,
    );
    assert.match(
      companionSource,
      /prismRefractTargetIdAtPoint\([\s\S]*"orb-drop"/u,
    );
    assert.match(
      companionSource,
      /const session = refractSessionRef\.current;[\s\S]*refractRunRef\.current \+= 1;[\s\S]*anchorRef\.current\?\.removeAttribute\("data-refracting"\)[\s\S]*updateRefractSession\(null\)/u,
    );
    assert.match(
      companionStyles,
      /\.avatar \{[\s\S]*opacity: 1;[\s\S]*transform: none;[\s\S]*transition:[\s\S]*opacity 180ms ease/u,
    );
  });

  it("wields Prism only into registered eligible controls and preserves native clicks elsewhere", () => {
    assert.match(
      companionSource,
      /current\.phase !== "following"[\s\S]*event\.pointerType === "touch"[\s\S]*event\.button !== 0/u,
    );
    assert.match(
      companionSource,
      /prismRefractTargetIdAtPoint\([\s\S]*!targetId \|\| !registration \|\| registration\.target\.disabled\?\.\(\)[\s\S]*return/u,
    );
    assert.match(
      companionSource,
      /requestPrismRefract\(targetId, "wield-click",[\s\S]*if \(!started\)[\s\S]*return[\s\S]*event\.preventDefault\(\)[\s\S]*event\.stopPropagation\(\)/u,
    );
    assert.doesNotMatch(refractSource, /shift-click|shiftKey|onClickCapture/u);
  });

  it("rerolls same-target modifier-clicks and accepts before chaining to another target", () => {
    assert.match(
      companionSource,
      /isPrismCompanionModifierHeld\(event, platform\)[\s\S]*prismRefractModifierClickDecision[\s\S]*decision === "reroll"[\s\S]*rerollPrismRefract\(\)[\s\S]*decision === "accept-and-begin"[\s\S]*acceptPrismRefract\(\)[\s\S]*"modifier-click"/u,
    );
    assert.match(
      companionSource,
      /wieldSuppressedClickRef\.current = shiftedRegistration\.element[\s\S]*event\.preventDefault\(\)[\s\S]*event\.stopPropagation\(\)/u,
    );
  });

  it("arms Wield Prism deliberately and follows through compositor frames", () => {
    assert.match(
      companionSource,
      /type: "modifier-down"[\s\S]*PRISM_WIELD_ARM_DELAY_MS/u,
    );
    assert.match(
      companionSource,
      /requestAnimationFrame\(flushPrismWieldFrame\)/u,
    );
    assert.match(
      companionSource,
      /anchor\.style\.transform = `translate3d\(\$\{pointer\.x\}px, \$\{pointer\.y\}px, 0\) translate\(-50%, -50%\)`/u,
    );
    assert.doesNotMatch(
      companionSource.match(
        /const flushPrismWieldFrame[\s\S]*?const schedulePrismWieldFrame/u,
      )?.[0] ?? "",
      /setPosition|setState/u,
    );
    assert.match(
      companionStyles,
      /\.anchor\[data-wielding="true"\][\s\S]*width: 28px[\s\S]*translate3d/u,
    );
    assert.match(
      companionStyles,
      /\.anchor\[data-wielding="true"\] \.avatar::after \{[\s\S]*radial-gradient\([\s\S]*#fff[\s\S]*box-shadow:[\s\S]*0 0 18px 5px #ffffff45/u,
    );
    assert.match(
      companionStyles,
      /\.anchor\[data-wielding="true"\] \.orb \{[\s\S]*opacity: 0;[\s\S]*transform: scale\(\.45\)/u,
    );
  });

  it("restores Wield Prism across focus, visibility, motion, surface, and suppression changes", () => {
    assert.match(
      companionSource,
      /const restoreOnBlur = \(\): void => resetPrismWield\(\)[\s\S]*window\.addEventListener\("blur", restoreOnBlur\)/u,
    );
    assert.match(
      companionSource,
      /visibilitychange[\s\S]*restoreOnVisibilityChange/u,
    );
    assert.match(
      companionSource,
      /prefers-reduced-motion: reduce[\s\S]*restoreOnReducedMotionChange/u,
    );
    assert.match(
      companionSource,
      /resetPrismWield\(\);[\s\S]*releasePrismRefract\(true\);[\s\S]*surfaceScope/u,
    );
    assert.match(
      companionSource,
      /if \(!companionSuppressed\) return;[\s\S]*resetPrismWield\(\);/u,
    );
  });

  it("keeps show premises as visible native multiline editors", () => {
    assert.match(
      signalSource,
      /signal-show-identity-premise-[\s\S]*<textarea[\s\S]*className=\{styles\.showLookPremiseInput\}[\s\S]*value=\{showPremiseDraft\}[\s\S]*rows=\{3\}[\s\S]*onBlur/u,
    );
    const identityPremiseBlock =
      signalSource.match(
        /id: `signal-show-identity-premise-\$\{selectedShow\.id\}`[\s\S]*?<\/PrismRefractTarget>/u,
      )?.[0] ?? "";
    assert.doesNotMatch(identityPremiseBlock, /renderPickAwareComposer/u);
  });

  it("releases magic prompts before handing off to the normal action workflow", () => {
    assert.match(
      companionSource,
      /const direction = refractPrompt\.trim\(\);[\s\S]*releasePrismRefract\(false\);[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*target\.run\(direction\)/u,
    );
  });

  it("uses the Zen-inspired rainbow flow while prose is generating", () => {
    assert.match(
      signalStyles,
      /data-prism-refract-state="generating"[\s\S]*--signal-refract-rainbow-period[\s\S]*linear-gradient\([\s\S]*var\(--prism-p\)[\s\S]*animation: signalRefractRainbowFlow 1\.7s linear infinite/u,
    );
    assert.match(
      signalStyles,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*data-prism-refract-state[\s\S]*animation: none/u,
    );
  });

  it("removes redundant Signal randomizer/save chrome and preserves normal magic clicks", () => {
    assert.doesNotMatch(signalSource, /Randomize booking|Save name|Save premise|Regenerate name/u);
    assert.doesNotMatch(signalSource, /contextualDiceButton|<Dices/u);
    for (const action of [
      "Complete this show",
      "Book for me",
      "Regenerate blurbs",
      "Refresh studio",
      "Refresh logo",
      "Create atmosphere",
    ]) {
      assert.match(signalSource, new RegExp(action, "u"));
    }
    assert.match(
      signalSource,
      /kind: "magic"[\s\S]*run: randomizeBooking[\s\S]*onClick=\{\(\) => void randomizeBooking\(\)\}/u,
    );
    assert.match(
      signalSource,
      /logo-direction[\s\S]*body: JSON\.stringify\(\{[\s\S]*direction/u,
    );
    assert.doesNotMatch(signalSource, /keywords: \[direction\]/u);
  });

  it("keeps the ritual skippable, remindable, resettable, and persisted outside the walkthrough", () => {
    assert.match(tutorialSource, /skippable Refract ritual/u);
    assert.match(tutorialSource, /skippable Wield Prism teaching beat/u);
    assert.match(
      tutorialSource,
      /Space rerolls[\s\S]*Option-clicking the same control[\s\S]*Control-clicking the same control[\s\S]*Enter or Tab keeps the current draft[\s\S]*Option-clicking a different registered control[\s\S]*Control-clicking a different registered control[\s\S]*Escape[\s\S]*restores/u,
    );
    assert.match(pageSource, /tutorialProgress\.prismWield/u);
    assert.match(pageSource, /tutorialProgress\.signalRefract/u);
    assert.match(
      pageSource,
      /resolveCompanionTutorial\("prismWield", "completed"\)/u,
    );
    assert.match(
      pageSource,
      /resolveCompanionTutorial\("signalRefract", "completed"\)/u,
    );
    assert.match(
      pageSource,
      /mode === "botcast"[\s\S]*prismWield:[\s\S]*status: "pending"[\s\S]*signalRefract:[\s\S]*status: "pending"/u,
    );
    assert.match(companionSource, /data-prism-wield-tutorial-card="true"/u);
    assert.match(
      companionSource,
      /Release \$\{modifierPresentation\.modifierLabel\} safely/u,
    );
  });
});

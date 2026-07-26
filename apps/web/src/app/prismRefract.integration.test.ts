import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const companionSource = readFileSync(
  new URL("./PrismCompanion.tsx", import.meta.url),
  "utf8",
);
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Prism Refract Signal integration", () => {
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
    assert.match(tutorialSource, /Space rerolls[\s\S]*Escape[\s\S]*restores/u);
    assert.match(pageSource, /tutorialProgress\.signalRefract/u);
    assert.match(pageSource, /resolveSignalRefractTutorial\("completed"\)/u);
    assert.match(pageSource, /resolveSignalRefractTutorial\("skipped"\)/u);
    assert.match(pageSource, /resolveSignalRefractTutorial\("remind"\)/u);
    assert.match(
      pageSource,
      /mode === "botcast"[\s\S]*signalRefract:[\s\S]*status: "pending"/u,
    );
  });
});

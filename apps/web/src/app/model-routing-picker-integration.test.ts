import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);
const reasoningEffortSource = readFileSync(
  new URL("../../../../packages/shared/src/reasoningEffort.ts", import.meta.url),
  "utf8",
);

function effortGlyphColors(level: string): string[] {
  const block = cssSource.match(
    new RegExp(
      `\\.modelEffortIcon\\[data-effort-level="${level}"\\] \\{([^}]+)\\}`,
      "u",
    ),
  )?.[1];
  assert.ok(block, `missing ${level} effort color rule`);
  return [...new Set(block.match(/#[0-9a-f]{6}/giu) ?? [])];
}

function lightEffortGlyphColors(level: string): string[] {
  const selector = `.modelEffortIcon[data-effort-level="${level}"]`;
  const selectorIndex = cssSource.indexOf(
    selector,
    cssSource.indexOf("Light surfaces"),
  );
  assert.notEqual(
    selectorIndex,
    -1,
    `missing light ${level} effort color rule`,
  );
  const blockEnd = cssSource.indexOf("}", selectorIndex);
  const block = cssSource.slice(selectorIndex, blockEnd);
  return [...new Set(block.match(/#[0-9a-f]{6}/giu) ?? [])];
}

function backgroundColors(block: string): string[] {
  const background = block.match(/background:\s*([\s\S]*?);/u)?.[1] ?? "";
  return [...new Set(background.match(/#[0-9a-f]{6}/giu) ?? [])];
}

function effortSliderColors(level: string): string[] {
  const block = cssSource.match(
    new RegExp(
      `\\.composeModelEffortSliderFill\\[data-effort-level="${level}"\\] \\{([^}]+)\\}`,
      "u",
    ),
  )?.[1];
  assert.ok(block, `missing ${level} effort slider color rule`);
  return backgroundColors(block);
}

function lightEffortSliderColors(level: string): string[] {
  const selector = `.composeModelEffortSliderFill[data-effort-level="${level}"]`;
  const selectorIndex = cssSource.indexOf(
    selector,
    cssSource.indexOf("Light surfaces mirror the glyph spectrum"),
  );
  assert.notEqual(
    selectorIndex,
    -1,
    `missing light ${level} effort slider color rule`,
  );
  const blockEnd = cssSource.indexOf("}", selectorIndex);
  const block = cssSource.slice(selectorIndex, blockEnd);
  return backgroundColors(block);
}

describe("shared routing model picker integration", () => {
  it("keeps response routing binary and makes Auto a model choice", () => {
    assert.match(pageSource, /const autoSelected = normalizedValue === autoOptionValue/u);
    assert.match(pageSource, /\(\["local", "online"\] as const\)\.map/u);
    assert.doesNotMatch(pageSource, /\["local", "auto", "online"\]/u);
  });

  it("never renders or emits the legacy Disabled model sentinel", () => {
    assert.match(pageSource, /isDisabledModelChoice\(value\)[\s\S]{0,80}autoOptionValue/u);
    assert.match(pageSource, /if \(isDisabledModelChoice\(nextValue\)\) return/u);
    assert.doesNotMatch(pageSource, /showDisabledOption|disabledOptionLabel/u);
    assert.doesNotMatch(pageSource, /Account default/u);
  });

  it("shows a noninteractive hollow Effort glyph while Auto is selected", () => {
    assert.match(pageSource, /function HollowTriangleEffortIcon/u);
    assert.match(
      pageSource,
      /const effortInteractionDisabled =[\s\S]{0,100}autoSelected/u,
    );
    assert.match(pageSource, /Effort chosen automatically/u);
    assert.match(pageSource, /<HollowTriangleEffortIcon \/>/u);
    assert.match(pageSource, /!autoSelected && effortControl\.capability\.mode/u);
  });

  it("shares the full mode-aware catalog with Chat, Coffee, Signal, and Debate", () => {
    assert.match(pageSource, /modeAwareModelOptions\(\{/u);
    assert.match(pageSource, /signalNavbarModelOptions/u);
    assert.match(pageSource, /debateNavbarResponseMode/u);
    assert.ok(
      (pageSource.match(/selectedProvider=\{/gu) ?? []).length >= 5,
      "expected the shared account, Chat, Coffee, Signal, and Debate pickers to tint from their selected provider",
    );
  });

  it("marks model rows by provider and gives each lane a distinct accent", () => {
    assert.match(pageSource, /data-model-provider=\{model\.provider\}/u);
    assert.match(
      cssSource,
      /composeModelOption\[data-model-provider="local"\][\s\S]{0,120}#68e6a6/u,
    );
    assert.match(
      cssSource,
      /composeModelOption\[data-model-provider="openai"\][\s\S]{0,120}#7db7ff/u,
    );
    assert.match(
      cssSource,
      /composeModelOption\[data-model-provider="anthropic"\][\s\S]{0,120}#d97757/u,
    );
  });

  it("persists effort per concrete model and exposes the split control everywhere", () => {
    assert.match(pageSource, /modelEffortPreferences/u);
    assert.match(pageSource, /\/api\/model-effort-preferences/u);
    assert.match(pageSource, /data-tutorial-target="model-effort"/u);
    assert.ok(
      (pageSource.match(/effortControl=\{/gu) ?? []).length >= 6,
      "expected the six visible picker placements to cover Chat/Zen, Sandbox, Coffee, Story, Debate, and Signal",
    );
  });

  it("explains disabled effort and discloses online multi-call simulation", () => {
    assert.match(pageSource, /data-glyph-tooltip=\{effortDisabledReason\}/u);
    assert.match(
      reasoningEffortSource,
      /Enable experimental simulated effort in Settings/u,
    );
    assert.ok(
      (pageSource.match(/Give unsupported models simulated effort/gu) ?? [])
        .length >= 2,
      "expected both Settings presentations to use provider-neutral copy",
    );
    assert.match(pageSource, /multiple provider calls/u);
    assert.match(pageSource, /increase[\s\S]{0,30}usage or cost/u);
  });

  it("uses None instead of Default for simulated non-thinking models", () => {
    assert.match(
      pageSource,
      /modelEffortValueForCapability\(capability, stored\)/u,
    );
    assert.match(
      pageSource,
      /capability\.mode === "simulated"[\s\S]{0,80}\? "none"[\s\S]{0,80}: "default"/u,
    );
    assert.match(
      tutorialSource,
      /Models without native reasoning begin at None and show only None through Extra High/u,
    );
  });

  it("uses the supplied effort symbols in a wheel, pointer, and keyboard slider", () => {
    assert.match(pageSource, /MODEL_EFFORT_ICON_PATHS/u);
    assert.match(
      pageSource,
      /<ModelEffortIcon level=\{effortControl\.value\}/u,
    );
    assert.match(pageSource, /onWheel=\{handleEffortWheel\}/u);
    assert.match(
      pageSource,
      /type="range"[\s\S]{0,400}aria-valuetext=\{effortLabel\}/u,
    );
    assert.match(cssSource, /mask: var\(--model-effort-icon\)/u);
    assert.match(
      cssSource,
      /data-effort-level="xhigh"[\s\S]{0,180}linear-gradient/u,
    );
    assert.match(cssSource, /writing-mode: vertical-lr/u);
    assert.doesNotMatch(pageSource, /composeModelEffortHint/u);
  });

  it("spins the selected Zen and Chat effort glyphs only during active generation", () => {
    assert.match(pageSource, /generating\?: boolean/u);
    assert.match(
      pageSource,
      /data-generating=\{generating \? "true" : undefined\}/u,
    );
    assert.ok(
      (pageSource.match(
        /generating=\{pendingReplyVisible \|\| sandboxSummaryBusy\}/gu,
      ) ?? []).length >= 1,
    );
    assert.match(
      pageSource,
      /generating=\{coffeeTurnRhythmState === "botThinking"\}/u,
    );
    assert.match(pageSource, /isPendingReplyVisible\(/u);
    assert.match(
      pageSource,
      /setPendingReplyConversationId\(\s*\(current\) => current \?\? event\.conversationId/u,
    );
    assert.match(
      cssSource,
      /composeModelEffortTrigger\[data-generating="true"\][\s\S]{0,200}animation: modelEffortThinkingSpin 1\.2s linear infinite/u,
    );
    assert.match(cssSource, /@keyframes modelEffortThinkingSpin/u);
    assert.match(
      cssSource,
      /@keyframes modelEffortThinkingSpin[\s\S]{0,120}transform: rotate\(360deg\)/u,
    );
    assert.match(
      cssSource,
      /prefers-reduced-motion: reduce[\s\S]{0,180}composeModelEffortTrigger\[data-generating="true"\][\s\S]{0,100}animation: none/u,
    );
  });

  it("keeps the Model and Effort Tab loop active while Shift remains held", () => {
    const modelKeySource = pageSource.match(
      /const handleModelKeyDown[\s\S]*?\n  \};/u,
    )?.[0];
    const effortKeySource = pageSource.match(
      /const handleEffortKeyDown[\s\S]*?\n  \};/u,
    )?.[0];

    assert.ok(modelKeySource);
    assert.ok(effortKeySource);
    assert.match(modelKeySource, /event\.key === "Tab"/u);
    assert.doesNotMatch(modelKeySource, /event\.shiftKey/u);
    assert.match(effortKeySource, /event\.key !== "Tab"/u);
    assert.doesNotMatch(effortKeySource, /event\.shiftKey/u);
    assert.match(
      pageSource,
      /activePickerControl\?\.dataset\.pickerSurface[\s\S]{0,220}keep repeated Tab presses[\s\S]{0,100}return;/u,
    );
    assert.match(tutorialSource, /even if Shift is still held/u);
  });

  it("hands a pointer-opened picker to its sibling when Tab is pressed", () => {
    assert.match(
      pageSource,
      /className=\{styles\.composeModelTrigger\}[\s\S]{0,220}onClick=\{\(event\) => \{[\s\S]{0,100}event\.currentTarget\.focus\(\)/u,
    );
    assert.match(
      pageSource,
      /className=\{styles\.composeModelEffortTrigger\}[\s\S]{0,700}onClick=\{\(event\) => \{[\s\S]{0,100}event\.currentTarget\.focus\(\)/u,
    );
    assert.match(
      pageSource,
      /if \(event\.key === "Tab" && !effortInteractionDisabled\)/u,
    );
    assert.match(tutorialSource, /Pressing Tab after clicking either picker/u);
  });

  it("adds exactly one spectrum color at each effort increase", () => {
    assert.deepEqual(effortGlyphColors("auto"), effortGlyphColors("none"));
    assert.equal(effortGlyphColors("minimal").length, 1);
    assert.notDeepEqual(
      effortGlyphColors("minimal"),
      effortGlyphColors("auto"),
    );
    assert.equal(effortGlyphColors("low").length, 2);
    assert.equal(effortGlyphColors("medium").length, 3);
    assert.equal(effortGlyphColors("high").length, 4);
    assert.equal(effortGlyphColors("xhigh").length, 5);
  });

  it("uses a darker light-mode palette without changing the spectrum counts", () => {
    assert.deepEqual(
      lightEffortGlyphColors("auto"),
      lightEffortGlyphColors("none"),
    );
    assert.deepEqual(lightEffortGlyphColors("minimal"), ["#2874b2"]);
    assert.equal(lightEffortGlyphColors("low").length, 2);
    assert.equal(lightEffortGlyphColors("medium").length, 3);
    assert.equal(lightEffortGlyphColors("high").length, 4);
    assert.deepEqual(lightEffortGlyphColors("xhigh"), [
      "#168461",
      "#2874b2",
      "#6650c7",
      "#ad3c84",
      "#c35432",
    ]);
    assert.match(
      cssSource,
      /body\[data-prism-theme="light"\][\s\S]{0,140}composeModelEffortSliderFill/u,
    );
  });

  it("matches the slider line spectrum to the selected effort glyph", () => {
    assert.match(
      pageSource,
      /composeModelEffortSliderFill[\s\S]{0,120}data-effort-level=\{effortControl\.value\}/u,
    );
    for (const level of [
      "auto",
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]) {
      assert.deepEqual(effortSliderColors(level), effortGlyphColors(level));
      assert.deepEqual(
        lightEffortSliderColors(level),
        lightEffortGlyphColors(level),
      );
    }
  });

  it("shows each saved effort glyph while reserving color for the selected model", () => {
    assert.match(pageSource, /rowValueForModel: \(model\) =>/u);
    assert.match(
      pageSource,
      /const rowEffort = effortControl\?\.rowValueForModel\(model\)/u,
    );
    assert.match(
      pageSource,
      /<ModelEffortIcon[\s\S]{0,120}level=\{rowEffort\}/u,
    );
    assert.match(
      pageSource,
      /isSelected[\s\S]{0,120}composeModelRowEffortIconMonochrome/u,
    );
    assert.match(
      pageSource,
      /composeModelOptionMain[\s\S]{0,700}composeModelOptionStatus[\s\S]{0,500}composeModelDefaultBadge[\s\S]{0,500}composeModelRowEffort/u,
    );
    assert.match(
      cssSource,
      /\.composeModelOptionStatus\s*\{[^}]*display:\s*inline-flex;[^}]*flex:\s*0 0 auto;[^}]*align-items:\s*center/u,
    );
    assert.match(
      cssSource,
      /\.modelEffortIcon\.composeModelRowEffortIconMonochrome\s*\{[^}]*background:\s*#ffffff;[^}]*filter:\s*none/u,
    );
    assert.match(
      cssSource,
      /body\[data-prism-theme="light"\][\s\S]{0,160}\.modelEffortIcon\.composeModelRowEffortIconMonochrome\s*\{[^}]*background:\s*#000000;[^}]*filter:\s*none/u,
    );
  });

  it("offers the global effort HUD and its capability-aware baseline shortcut", () => {
    assert.match(pageSource, /modelEffortHudTarget/u);
    assert.match(
      pageSource,
      /keyboardShortcutMatchesEvent\(keyboardShortcuts\.effortHud, event\)/u,
    );
    assert.match(
      pageSource,
      /key === "d"[\s\S]{0,300}modelEffortBaseline\(modelEffortHudTarget\.capability\)/u,
    );
    assert.match(cssSource, /\.modelEffortHud\b/u);
  });

  it("teaches the global profile without adding a first-run choice", () => {
    assert.match(tutorialSource, /saves Effort per concrete model/u);
    assert.match(
      tutorialSource,
      /model row shows its saved effort glyph on the right/u,
    );
    assert.match(tutorialSource, /selected model receives the spectrum color/u);
    assert.match(tutorialSource, /vertical slider/u);
    assert.match(tutorialSource, /selected effort glyph rotates in place/u);
    assert.match(tutorialSource, /one through five PRISM colors/u);
    assert.match(tutorialSource, /Hover a disabled glyph/u);
    assert.match(tutorialSource, /online simulation may add provider usage or cost/u);
    assert.match(tutorialSource, /Cmd\/Ctrl\+Shift\+E/u);
    assert.match(tutorialSource, /Shift\+Tab opens Model/u);
    assert.match(tutorialSource, /tap Tab again to commit it and move directly into Effort/u);
    assert.match(tutorialSource, /Settings → Shortcuts/u);
    assert.match(tutorialSource, /prepared work is discarded/u);
  });
});

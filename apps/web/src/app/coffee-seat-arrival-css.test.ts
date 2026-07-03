import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const cssPath = join(dirname(fileURLToPath(import.meta.url)), "page.module.css");
const css = readFileSync(cssPath, "utf8");

function ruleForSeatVector(
  kind: "arrival" | "finished",
  seatCount: number,
  layoutSeat: number
): string {
  const phaseNeedle = kind === "arrival" ? 'data-phase="arriving"' : 'data-phase="finished"';
  const stateNeedle = 'data-arrival-state="walking-in"';
  const countNeedle = `data-seat-count="${seatCount}"`;
  const layoutNeedle = `data-layout-seat="${layoutSeat}"`;
  const variableNeedle = kind === "arrival" ? "--coffee-walk-in-x" : "--coffee-walk-away-x";
  const matches = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  const match = matches
    .filter((entry) => {
      if (!(entry[2] ?? "").includes(variableNeedle)) return false;
      const selectors = (entry[1] ?? "").split(",").map((selector) => selector.trim());
      return selectors.some((selector) => {
        if (!selector.includes(".coffeeSeat")) return false;
        if (!selector.includes(phaseNeedle)) return false;
        if (kind === "arrival" && !selector.includes(stateNeedle)) return false;
        return selector.includes(countNeedle) && selector.includes(layoutNeedle);
      });
    })
    .at(-1);
  assert.ok(match, `Missing ${kind} vector for ${seatCount}:${layoutSeat}`);
  return match[2]!;
}

function assertWalkVector(
  seatCount: number,
  layoutSeat: number,
  expectedX: string,
  expectedY: string
): void {
  const rule = ruleForSeatVector("arrival", seatCount, layoutSeat);
  assert.match(rule, new RegExp(`--coffee-walk-in-x:\\s*${expectedX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*;`));
  assert.match(rule, new RegExp(`--coffee-walk-in-y:\\s*${expectedY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*;`));
}

function assertLeaveVector(
  seatCount: number,
  layoutSeat: number,
  expectedX: string,
  expectedY: string
): void {
  const rule = ruleForSeatVector("finished", seatCount, layoutSeat);
  assert.match(rule, new RegExp(`--coffee-walk-away-x:\\s*${expectedX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*;`));
  assert.match(rule, new RegExp(`--coffee-walk-away-y:\\s*${expectedY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*;`));
}

function ruleForSelectorNeedles(...needles: string[]): string {
  const match = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .find((entry) => needles.every((needle) => (entry[1] ?? "").includes(needle)));
  assert.ok(match, `Missing CSS rule containing ${needles.join(", ")}`);
  return match[2]!;
}

function ruleForExactSelector(selector: string): string {
  const match = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find((entry) =>
    (entry[1] ?? "")
      .split(",")
      .map((candidate) => candidate.trim())
      .includes(selector)
  );
  assert.ok(match, `Missing CSS rule for ${selector}`);
  return match[2]!;
}

describe("Coffee seat arrival CSS", () => {
  it("uses visual layout slots for walk-in vectors so bots enter from their side", () => {
    const genericSeatRuleIndex = css.indexOf(
      '.coffeeStage[data-phase="arriving"] .coffeeSeat[data-arrival-state="walking-in"][data-seat="4"]'
    );
    const layoutSeatRuleIndex = css.indexOf(
      '.coffeeStage[data-phase="arriving"] .coffeeSeat[data-arrival-state="walking-in"][data-seat-count="4"][data-layout-seat="0"]'
    );

    assert.notEqual(genericSeatRuleIndex, -1);
    assert.ok(layoutSeatRuleIndex > genericSeatRuleIndex);

    assertWalkVector(2, 0, "-72vw", "0px");
    assertWalkVector(2, 1, "72vw", "0px");
    assertWalkVector(3, 0, "0px", "-72vh");
    assertWalkVector(3, 1, "-72vw", "0px");
    assertWalkVector(3, 2, "72vw", "0px");
    assertWalkVector(4, 0, "-72vw", "0px");
    assertWalkVector(4, 1, "72vw", "0px");
    assertWalkVector(4, 2, "72vw", "0px");
    assertWalkVector(4, 3, "-72vw", "0px");
    assertWalkVector(5, 0, "0px", "-72vh");
    assertWalkVector(5, 1, "-72vw", "0px");
    assertWalkVector(5, 2, "72vw", "0px");
    assertWalkVector(5, 3, "-72vw", "0px");
    assertWalkVector(5, 4, "72vw", "0px");
  });

  it("uses per-bot motion variables for walk speed and settled offsets", () => {
    const seatRule = ruleForExactSelector(".coffeeSeat");
    assert.match(seatRule, /--coffee-arrival-walk-duration:\s*3200ms\s*;/);
    assert.match(seatRule, /--coffee-seat-offset-x:\s*0px\s*;/);
    assert.match(seatRule, /--coffee-seat-offset-y:\s*0px\s*;/);
    assert.match(
      seatRule,
      /transform:\s*translate\([\s\S]*calc\(-50%\s*\+\s*var\(--coffee-seat-offset-x\)\),[\s\S]*calc\(-50%\s*\+\s*var\(--coffee-seat-offset-y\)\)[\s\S]*\)/
    );

    const actionAnchorRule = ruleForExactSelector(".coffeeSeatActionAnchor");
    assert.match(actionAnchorRule, /--coffee-seat-offset-x:\s*0px\s*;/);
    assert.match(actionAnchorRule, /--coffee-seat-offset-y:\s*0px\s*;/);
    assert.match(
      actionAnchorRule,
      /transform:\s*translate\([\s\S]*calc\(-50%\s*\+\s*var\(--coffee-seat-offset-x\)\),[\s\S]*calc\(-50%\s*\+\s*var\(--coffee-seat-offset-y\)\)[\s\S]*\)/
    );

    const walkingRule = ruleForSelectorNeedles(
      '.coffeeStage[data-phase="arriving"] .coffeeSeat[data-arrival-state="walking-in"]'
    );
    assert.match(walkingRule, /var\(--coffee-arrival-walk-duration,\s*3200ms\)/);
    assert.match(
      walkingRule,
      /var\(--coffee-arrival-walk-easing,\s*cubic-bezier\(0\.16,\s*0\.84,\s*0\.26,\s*1\)\)/
    );
  });

  it("uses the same visual side mapping for finished-session departures", () => {
    assertLeaveVector(2, 0, "-72vw", "0px");
    assertLeaveVector(2, 1, "72vw", "0px");
    assertLeaveVector(3, 0, "0px", "-72vh");
    assertLeaveVector(3, 1, "-72vw", "0px");
    assertLeaveVector(3, 2, "72vw", "0px");
    assertLeaveVector(4, 0, "-72vw", "0px");
    assertLeaveVector(4, 1, "72vw", "0px");
    assertLeaveVector(4, 2, "72vw", "0px");
    assertLeaveVector(4, 3, "-72vw", "0px");
    assertLeaveVector(5, 0, "0px", "-72vh");
    assertLeaveVector(5, 1, "-72vw", "0px");
    assertLeaveVector(5, 2, "72vw", "0px");
    assertLeaveVector(5, 3, "-72vw", "0px");
    assertLeaveVector(5, 4, "72vw", "0px");
  });

  it("pins sip pucker glyphs to a stable font instead of bot mouth fonts", () => {
    const formalFaceFontRuleIndex = css.indexOf(
      '.coffeeSeatPlateEmoji [data-coffee-plate-emoji-part][data-face-font="formal"]'
    );
    const sipMouthRuleIndex = css.indexOf(
      '[data-coffee-plate-emoji-part="mouth"][data-coffee-plate-emoji-glyph="*"]'
    );
    assert.notEqual(formalFaceFontRuleIndex, -1);
    assert.ok(sipMouthRuleIndex > formalFaceFontRuleIndex);

    const rule = ruleForSelectorNeedles(
      ".coffeeSeatPlateEmoji",
      'data-coffee-plate-emoji-part="mouth"',
      'data-coffee-plate-emoji-glyph="*"'
    );
    assert.match(rule, /font-family:\s*var\(--font-ui-sans\),\s*system-ui,\s*sans-serif\s*;/);
    assert.match(rule, /font-weight:\s*760\s*;/);
    assert.match(rule, /letter-spacing:\s*0\s*;/);
  });
});

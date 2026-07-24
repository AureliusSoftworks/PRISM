import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const css = cssSource.replace(/\s+/gu, " ");

function ruleFor(selector: string, bodyNeedle?: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(
    `(?:^|\\})\\s*${escapedSelector}\\s*\\{`,
    "gu",
  );
  for (const match of css.matchAll(pattern)) {
    const start = match.index + match[0].lastIndexOf(selector);
    const end = css.indexOf("}", start);
    assert.notEqual(end, -1, `unterminated CSS rule for ${selector}`);
    const rule = css.slice(start, end + 1);
    if (!bodyNeedle || rule.includes(bodyNeedle)) return rule;
  }
  assert.fail(`missing CSS rule for ${selector}`);
}

function coordinate(rule: string, property: "left" | "top"): number {
  const value = Number(rule.match(new RegExp(`${property}: ([0-9.]+)%`))?.[1]);
  assert.ok(Number.isFinite(value), `missing ${property} coordinate`);
  return value;
}

test("Coffee keeps bot nameplates inside a responsive prose-safe envelope", () => {
  const nameplate = ruleFor(
    ".coffeeSeatGlowPill",
    "--coffee-seat-name-plate-width: clamp",
  );
  assert.match(
    nameplate,
    /--coffee-seat-name-plate-width: clamp\(204px, 17cqw, 232px\)/,
  );
  assert.match(
    nameplate,
    /--coffee-seat-name-plate-y: clamp\(-42px, -3\.65cqw, -26px\)/,
  );
  assert.match(nameplate, /width: var\(--coffee-seat-name-plate-width\)/);
  assert.doesNotMatch(nameplate, /clamp\(284px, 23vw, 304px\)/);

  const compact = ruleFor(
    '.coffeeStage[data-compact="true"] .coffeeSeatGlowPill',
  );
  assert.match(compact, /--coffee-seat-name-plate-width: min\(136px, 54vw\)/);
  assert.match(
    compact,
    /--coffee-seat-name-plate-y: clamp\(-17px, -2\.1vw, -8px\)/,
  );

  assert.match(
    css,
    /@media \(max-width: 640px\)[\s\S]*?\.coffeeSeatGlowPill \{ --coffee-seat-name-plate-width: min\(168px, 28vw\); --coffee-seat-name-plate-y: clamp\(-16px, -2\.2vw, -8px\);/,
  );
});

test("first-person prose reserves the nameplate corridor at normal and narrow widths", () => {
  assert.match(
    css,
    /--coffee-table-prose-inline-size: min\(42cqw, 560px\); width: var\(--coffee-table-prose-inline-size\)/,
  );
  assert.match(
    css,
    /@container \(max-width: 980px\)[\s\S]*?--coffee-table-prose-inline-size: min\(38cqw, 400px\)/,
  );
  assert.match(
    ruleFor(".coffeeSeatActionLayer"),
    /z-index: 7; pointer-events: none/,
  );
});

test("two-to-five-seat action anchors stay locked to their authored seats", () => {
  for (let count = 2; count <= 5; count += 1) {
    for (let layoutIndex = 0; layoutIndex < count; layoutIndex += 1) {
      const seat = ruleFor(
        `.coffeeStage:not([data-compact="true"]) .coffeeSeat[data-seat-count="${count}"][data-layout-seat="${layoutIndex}"]`,
      );
      const action = ruleFor(
        `.coffeeStage:not([data-compact="true"]) .coffeeSeatActionAnchor[data-seat-count="${count}"][data-layout-seat="${layoutIndex}"]`,
      );
      assert.deepEqual(
        [coordinate(action, "left"), coordinate(action, "top")],
        [coordinate(seat, "left"), coordinate(seat, "top")],
        `action anchor drifted from seat ${layoutIndex} of ${count}`,
      );
    }
  }

  assert.match(pageSource, /data-seat-count=\{coffeeSeatLayoutCount\}/);
  assert.match(pageSource, /data-seat-count=\{display\.seatCount\}/);
});

test("long bot names truncate safely in live and review layouts", () => {
  assert.match(
    ruleFor(".coffeeSeatGlowText span"),
    /overflow: hidden; text-overflow: ellipsis; white-space: nowrap/,
  );
  assert.match(
    pageSource,
    /const seatAriaLabel =[\s\S]*?`\$\{bot\.name\} at the coffee table`[\s\S]*?aria-label=\{seatAriaLabel\}/,
  );
});

test("review keeps the player off camera and restores bot seats", () => {
  assert.doesNotMatch(cssSource, /\.coffeeReplayPlayer(?:Seat|Avatar|Nameplate|Glyph)/u);
  assert.doesNotMatch(pageSource, /styles\.coffeeReplayPlayer(?:Seat|Avatar|Nameplate|Glyph)/u);
  assert.match(
    pageSource,
    /className=\{styles\.coffeeReplayOffCameraPotDock\}/u,
  );
  assert.match(
    css,
    /\.coffeeStage\[data-phase="finished"\]\[data-replay-active="true"\] \.coffeeSeat \{[\s\S]*?animation: none;[\s\S]*?var\(--coffee-seat-offset-x\)[\s\S]*?var\(--coffee-seat-offset-y\)/,
  );
});

test("Coffee has no player mug or sip path", () => {
  assert.doesNotMatch(cssSource, /\.coffeePlayerCup/u);
  assert.doesNotMatch(pageSource, /coffeePlayerSip|player-cup\/sip/u);
});

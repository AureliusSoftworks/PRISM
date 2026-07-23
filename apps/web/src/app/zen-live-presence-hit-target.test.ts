import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appDir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(appDir, "page.module.css"), "utf8");
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8").replace(/\s+/gu, " ");

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

describe("Zen live presence body hit target", () => {
  it("keeps the cursor surface aligned to the visible bot silhouette", () => {
    const bodyRule = ruleForExactSelector(".zenLiveBotPresenceBody");
    assert.match(bodyRule, /pointer-events:\s*none\s*;/);
    assert.doesNotMatch(bodyRule, /cursor:\s*grab\s*;/);

    const hitTargetRule = ruleForExactSelector(".zenLiveBotPresenceHitTarget");
    assert.match(hitTargetRule, /left:\s*49\.2%\s*;/);
    assert.match(hitTargetRule, /top:\s*50\.9%\s*;/);
    assert.match(hitTargetRule, /width:\s*77\.4%\s*;/);
    assert.match(hitTargetRule, /height:\s*78\.6%\s*;/);
    assert.match(hitTargetRule, /transform:\s*translate\(-50%,\s*-50%\)\s*;/);
    assert.match(hitTargetRule, /clip-path:\s*ellipse\(50% 50% at 50% 50%\)\s*;/);
    assert.match(hitTargetRule, /pointer-events:\s*auto\s*;/);
    assert.match(hitTargetRule, /cursor:\s*grab\s*;/);

    const draggingRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-dragging="true"] .zenLiveBotPresenceHitTarget'
    );
    assert.match(draggingRule, /cursor:\s*grabbing\s*;/);
  });

  it("keeps the silhouette geometry for body-local grab eligibility", () => {
    assert.match(
      pageSource,
      /data-zen-live-bot-body-frame="true"[\s\S]*?data-zen-live-bot-body-hit-target="true"/
    );
    assert.match(
      pageSource,
      /function measureZenLiveBotGrabGeometries\(\s*node: HTMLElement\s*,?\s*\): ZenLiveBotGrabGeometry\[\] \{/
    );
    assert.match(
      pageSource,
      /querySelectorAll\("\[data-zen-live-bot-body-hit-target='true'\]"\)/
    );
    assert.match(
      pageSource,
      /if \(hitTargetGeometries\.length > 0\) return hitTargetGeometries;/
    );
    assert.match(
      pageSource,
      /querySelector<HTMLElement>\("\[data-zen-live-bot-body-frame='true'\]"\)/
    );
    assert.match(
      pageSource,
      /function zenLiveBotAvatarPointerIsInsideBody\([\s\S]*?measureZenLiveBotGrabGeometries\(node\)\.some/
    );
    assert.match(
      pageSource,
      /zenLiveBotGrabGeometryContainsPointer\(geometry,\s*clientX,\s*clientY\)/
    );
    assert.match(
      pageSource,
      /function zenLiveBotAvatarPointerCanStartGrab\([\s\S]*?zenLiveBotAvatarPointerIsInsideBody\(node,\s*clientX,\s*clientY\)/
    );
  });

  it("allows surface grabs while excluding the composer and top bar", () => {
    assert.match(
      pageSource,
      /const ZEN_LIVE_BOT_AVATAR_SURFACE_SELECTOR = "\[data-zen-surface='true'\]";/
    );
    assert.match(
      pageSource,
      /const ZEN_LIVE_BOT_AVATAR_DRAG_BLOCKED_SELECTOR = \[[\s\S]*?"\[data-zen-live-bot-composer-boundary='true'\]"[\s\S]*?"\[data-zen-live-bot-drag-exclusion='top-bar'\]"/
    );
    assert.match(
      pageSource,
      /const ZEN_LIVE_BOT_AVATAR_DRAG_INTERACTIVE_SELECTOR = \[[\s\S]*?PRISM_APP_CURSOR_TEXT_SELECTOR,[\s\S]*?PRISM_APP_CURSOR_FINGER_SELECTOR,/
    );
    assert.match(
      pageSource,
      /function zenLiveBotAvatarSurfaceCanStartGrab\([\s\S]*?target\.closest\(ZEN_LIVE_BOT_AVATAR_SURFACE_SELECTOR\)/
    );
    assert.match(
      pageSource,
      /target\.closest\(ZEN_LIVE_BOT_AVATAR_DRAG_BLOCKED_SELECTOR\)/
    );
    assert.match(
      pageSource,
      /target\.closest\(ZEN_LIVE_BOT_AVATAR_DRAG_INTERACTIVE_SELECTOR\)/
    );
    assert.match(
      pageSource,
      /zenLiveBotAvatarPointMatchesSelector\(\s*clientX\s*,\s*clientY\s*,\s*ZEN_LIVE_BOT_AVATAR_DRAG_BLOCKED_SELECTOR\s*,?\s*\)/
    );
    assert.match(
      pageSource,
      /zenLiveBotAvatarSurfaceCanStartGrab\(\s*options\.eventTarget\s*,\s*clientX\s*,\s*clientY\s*,?\s*\)/
    );
    assert.match(pageSource, /data-zen-live-bot-drag-exclusion="top-bar"/);
    assert.match(pageSource, /data-zen-live-bot-composer-boundary="true"/);

    const globalDownStart = pageSource.indexOf("const handleGlobalPointerDown = (event: PointerEvent): void => {");
    assert.notEqual(globalDownStart, -1);
    const globalMoveStart = pageSource.indexOf("const handleGlobalPointerMove = (event: PointerEvent): void => {", globalDownStart);
    assert.notEqual(globalMoveStart, -1);
    const globalDownSource = pageSource.slice(globalDownStart, globalMoveStart);
    assert.match(globalDownSource, /const node = avatarRef\.current;/);
    assert.match(
      globalDownSource,
      /zenLiveBotAvatarPointerIsInsideBody\(node,\s*event\.clientX,\s*event\.clientY\)/
    );
    assert.match(
      globalDownSource,
      /zenLiveBotAvatarPointerIsInsideBody\(node,\s*event\.clientX,\s*event\.clientY\)[\s\S]*?\{\s+return;\s+\}/
    );
    assert.match(globalDownSource, /allowSurfaceDrag:\s*true/);
    assert.match(globalDownSource, /eventTarget:\s*event\.target/);
  });

  it("uses global pointer capture listeners for geometry-first grabs", () => {
    assert.match(pageSource, /const beginAvatarGrab = useCallback/);
    assert.match(pageSource, /const moveAvatarGrab = useCallback/);
    assert.match(pageSource, /const finishAvatarGrab = useCallback/);
    assert.match(
      pageSource,
      /window\.addEventListener\("pointerdown", handleGlobalPointerDown, true\)/
    );
    assert.match(
      pageSource,
      /window\.addEventListener\("pointermove", handleGlobalPointerMove, true\)/
    );
    assert.match(
      pageSource,
      /window\.addEventListener\("pointerup", handleGlobalPointerUp, true\)/
    );
    assert.match(
      pageSource,
      /window\.addEventListener\("pointercancel", handleGlobalPointerCancel, true\)/
    );
    assert.match(pageSource, /event\.stopPropagation\(\)/);
    assert.match(
      pageSource,
      /if \(dragState\.moved\) \{[\s\S]*?setAvatarPositionClamped\([\s\S]*?x: clientX - dragState\.offsetX,[\s\S]*?y: clientY - dragState\.offsetY,[\s\S]*?true,[\s\S]*?\);/
    );
    assert.doesNotMatch(pageSource, /startAvatarMomentum/);
    assert.doesNotMatch(pageSource, /resolveZenLiveBotAvatarReleaseVelocity/);
  });

  it("does not run bot cursor hover side effects on global pointer move", () => {
    const moveStart = pageSource.indexOf("const handleGlobalPointerMove = (event: PointerEvent): void => {");
    assert.notEqual(moveStart, -1);
    const upStart = pageSource.indexOf("const handleGlobalPointerUp = (event: PointerEvent): void => {", moveStart);
    assert.notEqual(upStart, -1);
    const moveSource = pageSource.slice(moveStart, upStart);
    assert.match(moveSource, /moveAvatarGrab\(/);
    assert.doesNotMatch(moveSource, /showAvatarGrabCursor/);
    assert.doesNotMatch(moveSource, /setAvatarGrabCursorForPointer/);
    assert.doesNotMatch(moveSource, /clearAvatarGrabCursor/);
    assert.doesNotMatch(moveSource, /zenLiveBotGrabTargetContainsEventTarget/);
    assert.doesNotMatch(moveSource, /measureZenLiveBotGrabGeometry/);
  });

  it("does not mount the removed custom bot cursor portal", () => {
    assert.doesNotMatch(pageSource, /type ZenLiveBotGrabCursorState/);
    assert.doesNotMatch(pageSource, /type ZenLiveBotGrabCursorPoint/);
    assert.doesNotMatch(pageSource, /avatarGrabCursor/);
    assert.doesNotMatch(pageSource, /showAvatarGrabCursor/);
    assert.doesNotMatch(pageSource, /clearAvatarGrabCursor/);
    assert.doesNotMatch(pageSource, /setAvatarGrabCursorForPointer/);
    assert.doesNotMatch(pageSource, /ZEN_LIVE_BOT_GRAB_CURSOR/);
    assert.doesNotMatch(pageSource, /styles\.zenLiveBotGrabCursor/);
  });

  it("starts mouse grabs through the pointer capture drag path", () => {
    const beginGrabStart = pageSource.indexOf("const beginAvatarGrab = useCallback");
    assert.notEqual(beginGrabStart, -1);
    const moveGrabStart = pageSource.indexOf("const moveAvatarGrab = useCallback", beginGrabStart);
    assert.notEqual(moveGrabStart, -1);
    const beginGrabSource = pageSource.slice(beginGrabStart, moveGrabStart);

    const pointerDownStart = pageSource.indexOf("const handleAvatarPointerDown = useCallback");
    assert.notEqual(pointerDownStart, -1);
    const pointerMoveStart = pageSource.indexOf("const handleAvatarPointerMove = useCallback", pointerDownStart);
    assert.notEqual(pointerMoveStart, -1);
    const pointerDownSource = pageSource.slice(pointerDownStart, pointerMoveStart);
    assert.doesNotMatch(beginGrabSource, /pointerType/);
    assert.doesNotMatch(pointerDownSource, /event\.pointerType === "mouse"/);
    assert.match(beginGrabSource, /captureTarget\.setPointerCapture\(pointerId\)/);
    assert.match(pointerDownSource, /beginAvatarGrab\(/);
    assert.match(pageSource, /onPointerDown=\{handleAvatarPointerDown\}/);
    assert.match(pageSource, /onMouseDown=\{handleAvatarMouseDown\}/);
  });
});

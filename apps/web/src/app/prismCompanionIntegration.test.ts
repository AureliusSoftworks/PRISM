import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(
  new URL("./PrismCompanion.tsx", import.meta.url),
  "utf8",
);
const companionCss = readFileSync(
  new URL("./prismCompanion.module.css", import.meta.url),
  "utf8",
);
const orbCss = readFileSync(
  new URL("./prism-orb.module.css", import.meta.url),
  "utf8",
);
const globalCss = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const handoffCanvas = readFileSync(
  new URL("./PrismHandoffCanvas.tsx", import.meta.url),
  "utf8",
);
const api = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);

test("mounts the global companion on every authenticated product shell", () => {
  assert.ok((page.match(/renderGlobalPrismCompanion\(\)/gu)?.length ?? 0) >= 7);
  assert.match(page, /surfaceId: "home"/u);
  assert.match(page, /surfaceId: "group-home"/u);
  assert.match(page, /surfaceId: "zen"/u);
  assert.match(page, /surfaceId: "prism-home"/u);
  assert.match(page, /surfaceId: "coffee"/u);
  assert.match(page, /surfaceId: "signal"/u);
  assert.match(page, /surfaceId: "slate"/u);
  assert.match(page, /surfaceId: "marketplace"/u);
  assert.match(page, /surfaceId: "avatar-studio"/u);
  assert.match(page, /surfaceId: "images"/u);
  assert.match(page, /surfaceId: "settings"/u);
});

test("keeps the companion explicit, keyboard accessible, and non-destructive", () => {
  assert.match(component, /aria-keyshortcuts="Alt\+Space Control\+Space"/u);
  assert.match(component, /createPortal\(/u);
  assert.match(component, /document\.body/u);
  assert.match(component, /window\.sessionStorage/u);
  assert.match(component, /onAction\(action\)/u);
  assert.doesNotMatch(component, /delete_bot|delete_project|delete_conversation/u);
  assert.match(handoffCanvas, /Exact source preview/u);
  assert.match(handoffCanvas, /Only this selection will cross surfaces/u);
});

test("keeps the newest two replies readable while older messages recede", () => {
  assert.match(
    component,
    /index >= Math\.max\(0, messages\.length - 2\)/u,
  );
  assert.match(component, /data-recent=/u);
  assert.match(
    companionCss,
    /\.bubble\[data-recent="true"\] \{ animation: bubbleArrive 240ms/u,
  );
  assert.match(companionCss, /\.bubble:not\(\[data-recent="true"\]\).*bubbleLife 34s/u);
  assert.match(companionCss, /filter: blur\(3px\)/u);
});

test("lets the player mute only Prism's widget voice", () => {
  assert.match(component, /prismCompanionSpeechStorageKey\(accountKey\)/u);
  assert.match(component, /aria-pressed=\{speechEnabled\}/u);
  assert.match(component, /Mute Prism voice/u);
  assert.match(component, /Enable Prism voice/u);
  assert.match(component, /if \(!speechEnabled \|\| !onSpeak\)/u);
  assert.match(component, /if \(!enabled\) cancelSpeech\(true\)/u);
  assert.match(companionCss, /\.composer \.voiceToggle/u);
});

test("reveals spoken Prism replies from the Zen audio clock", () => {
  assert.match(component, /preparePrismCompanionSpeechReveal/u);
  assert.match(component, /startPrismCompanionSpeechReveal/u);
  assert.match(component, /progressPrismCompanionSpeechReveal/u);
  assert.match(component, /prismCompanionSpeechVisibleContent/u);
  assert.match(page, /signal: callbacks\.signal/u);
  assert.match(
    page,
    /callbacks\.onPlaybackProgress\(\s*elapsedMs,\s*durationMs,\s*alignment/u,
  );
});

test("desaturates and pauses every app shell behind the open companion", () => {
  assert.match(component, /className=\{styles\.backdrop\}/u);
  assert.match(component, /data-open=\{open \? "true" : undefined\}/u);
  assert.match(
    component,
    /setPrismSystemPause\(PRISM_COMPANION_SYSTEM_PAUSE_REASON, true\)/u,
  );
  assert.match(component, /document\.getAnimations\(\)/u);
  assert.match(
    component,
    /querySelectorAll<HTMLMediaElement>\("audio, video"\)/u,
  );
  assert.ok(
    (component.match(/data-prism-system-pause-exempt="true"/gu)?.length ?? 0) >=
      2,
  );
  assert.match(companionCss, /\.backdrop \{[\s\S]*z-index: 854/u);
  assert.match(
    companionCss,
    /\.backdrop\[data-open="true"\] \{[\s\S]*pointer-events: auto[\s\S]*backdrop-filter: blur\(14px\) saturate\(0\)/u,
  );
  assert.match(companionCss, /\.anchor \{[\s\S]*z-index: 855/u);
  assert.match(
    globalCss,
    /html\[data-prism-system-paused="true"\][\s\S]*data-prism-system-pause-exempt[\s\S]*animation-play-state: paused !important/u,
  );
  assert.match(
    page,
    /document\.visibilityState === "visible" && !prismSystemPaused/u,
  );
  assert.match(
    page,
    /coffeeAutoplayPausedRef\.current =\s*coffeeAutoplayPaused \|\| prismSystemPaused/u,
  );
  assert.match(page, /systemPaused=\{prismSystemPaused\}/u);
});

test("gives only the companion orb momentum", () => {
  assert.match(component, /const startInertia = useCallback/u);
  assert.match(component, /stepPrismCompanionInertia/u);
  assert.match(component, /prefers-reduced-motion: reduce/u);
  assert.match(component, /data-inertial=\{inertial \? "true" : undefined\}/u);
  assert.doesNotMatch(page, /startAvatarMomentum|data-flinging/u);
});

test("plays varied glass taps on orb activation and wall rebounds", () => {
  assert.match(component, /if \(next\.bounced\) playPrismCompanionGlassTap\(\)/u);
  assert.ok(
    (component.match(/playPrismCompanionGlassTap\(\)/gu)?.length ?? 0) >= 3,
  );
  assert.match(component, /stopPrismCompanionGlassTapAudio\(\)/u);
});

test("moves the orb glare with the same screen-space light model as bot glass", () => {
  assert.match(component, /resolvePrismCompanionSurfaceGlare\(position\)/u);
  assert.match(component, /"--prism-orb-glare-x"/u);
  assert.match(component, /"--prism-orb-glare-y"/u);
  assert.match(
    orbCss,
    /circle at var\(--prism-orb-glare-x, 35%\)[\s\S]*var\(--prism-orb-glare-y, 24%\)/u,
  );
});

test("yields the floating assistant to focused embedded Prism presence", () => {
  assert.match(component, /useSyncExternalStore\(/u);
  assert.match(component, /companionSuppressed/u);
  assert.match(
    component,
    /typeof document === "undefined" \|\| companionSuppressed/u,
  );
  assert.match(component, /<PrismOrb aura=\{false\}/u);
  assert.match(orbCss, /\.aura::before/u);
});

test("folds the companion panel away when interaction returns to Zen", () => {
  assert.match(component, /prismCompanionDismissesOnExternalInteraction/u);
  assert.match(component, /const dismissIfExternal = \(event: Event\): void =>/u);
  assert.match(
    component,
    /window\.addEventListener\("pointerdown", dismissIfExternal, true\)/u,
  );
  assert.match(
    component,
    /window\.addEventListener\("focusin", dismissIfExternal, true\)/u,
  );
});

test("retires the full-manuscript Slate chat route in favor of global metadata", () => {
  assert.match(api, /Slate project chat has moved to the global Prism companion/u);
  assert.match(api, /route\("POST", "\/api\/prism-companion"/u);
});

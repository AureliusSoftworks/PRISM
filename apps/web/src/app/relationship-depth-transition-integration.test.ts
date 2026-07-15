import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

function sourceSlice(start: string, end: string): string {
  const startIndex = pageSource.indexOf(start);
  const endIndex = pageSource.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing source marker: ${start}`);
  assert.ok(endIndex > startIndex, `Missing source marker: ${end}`);
  return pageSource.slice(startIndex, endIndex);
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

describe("relationship-depth page integration", () => {
  it("routes the Home picker without invoking the message-generating guest handoff", () => {
    const directHomePicker = sourceSlice(
      "function handleZenPersonaSelectionChange",
      "function handleZenMentionPersonaSelection",
    );
    assert.match(directHomePicker, /visitZenHome\(nextBotId\)/);
    assert.doesNotMatch(
      directHomePicker,
      /commitZenPersonaTransition|sendMessage|personaTransition/,
    );

    const guestInvitation = sourceSlice(
      "function handleZenMentionPersonaSelection",
      "async function persistZenPersonaTransitionChoice",
    );
    assert.match(guestInvitation, /commitZenPersonaTransition\(botId\)/);
  });

  it("labels the direct picker as Home navigation and keeps guest controls out of it", () => {
    const picker = sourceSlice(
      "const renderHeaderModelPicker = (",
      "const renderImagesPanelModelPicker",
    );
    assert.match(picker, /"Visit a Zen Home"/);
    assert.match(picker, /ariaLabel="Zen Home"/);
    assert.doesNotMatch(
      picker,
      /menuFooter=\{renderZenPersonaTransitionChoiceControl\(\)\}/,
    );
  });

  it("presents Random, New, Intro, and Off only as a Zen guest-invitation setting", () => {
    const control = sourceSlice(
      "function ZenPersonaTransitionChoiceControl",
      "function normalizeZenPersonaTransitionChoice",
    );
    const normalizedControl = collapseWhitespace(control);
    assert.match(control, /aria-label="Guest invitation handoff"/);
    assert.match(control, />\s*Guest handoff\s*<\/span>/);
    assert.match(control, /label="About guest handoffs"/);
    assert.ok(
      normalizedControl.includes(
        "Used only when you invite a Facet into the current Home. New lets the guest speak first. Intro lets the current Facet introduce them. Off adds no handoff line. Random chooses among those three. Visiting another Home never adds a message.",
      ),
    );
    assert.doesNotMatch(
      control,
      /Facet transition style|>Switch<|About Facet switching/,
    );

    const zenSettings = sourceSlice(
      'id="zen-session-settings-title"',
      "Save Zen settings",
    );
    assert.match(
      zenSettings,
      /\{renderZenPersonaTransitionChoiceControl\(\)\}/,
    );
  });

  it("exposes one shared identity-anchor contract across Library, room, and Home", () => {
    for (const surface of ["library", "group-room", "home"] as const) {
      assert.match(
        pageSource,
        new RegExp(`data-relationship-depth-anchor="${surface}"`),
      );
    }
    assert.match(pageSource, /data-relationship-depth-identity=/);
    assert.match(
      pageSource,
      /\[data-relationship-depth-anchor\]\[data-relationship-depth-identity\]/,
    );

    const roomPresence = sourceSlice(
      "className={styles.botGroupWaitingRoomPresenceBody}",
      "<ZenLiveBotMannequin",
    );
    assert.match(
      roomPresence,
      /data-relationship-depth-anchor="group-room"/,
    );
    assert.match(roomPresence, /data-relationship-depth-identity=/);
  });

  it("uses the shared runner and restores the saved checkpoint for Back or Escape", () => {
    assert.match(pageSource, /\brunRelationshipDepthTransition\b/);
    assert.match(pageSource, /\breturnFromRelationshipDepth\b/);
    assert.match(
      pageSource,
      /event\.key !== "Escape"[\s\S]{0,500}returnFromRelationshipDepth\("escape"\)/,
    );
    assert.match(pageSource, /returnFromRelationshipDepth\("back"\)/);
  });

  it("runs reduced motion as a native crossfade with matched manual fallback beats", () => {
    const forwardRoute = sourceSlice(
      "async function runRelationshipDepthTransition",
      "async function returnFromRelationshipDepth",
    );
    const reverseRoute = sourceSlice(
      "async function returnFromRelationshipDepth",
      "async function visitZenHome",
    );

    for (const [route, safetyGate] of [
      [forwardRoute, "nativeCommitSafe"],
      [reverseRoute, "nativeRestoreSafe"],
    ] as const) {
      assert.match(
        route,
        /relationshipDepthNativeViewTransitionEligible\(\{[\s\S]{0,240}reducedMotion/,
      );
      assert.match(route, new RegExp(`asyncHandoffSafe: ${safetyGate}`));
      assert.match(
        route,
        /root\.dataset\.relationshipDepthRenderer = useNativeTransition/,
      );
      assert.match(
        route,
        /crossfade:[\s\S]{0,120}controllerState\.plan\.motion === "crossfade"[\s\S]{0,120}controllerState\.plan\.atmosphere === "crossfade"/,
      );
      assert.match(
        route,
        /root\.dataset\.relationshipDepthAtmosphere =\s*controllerState\.plan\.atmosphere/,
      );
      assert.match(
        route,
        /waitForRelationshipDepthBeat\(manualBeatTiming\.sourceMs\)[\s\S]{0,180}waitForRelationshipDepthBeat\(manualBeatTiming\.destinationMs\)/,
      );
    }
  });

  it("locks the whole surface only during transition beats", () => {
    assert.match(
      pageSource,
      /const relationshipDepthSurfaceLocked =\s*relationshipDepthInteractionLock === "surface"/,
    );
    assert.match(
      pageSource,
      /inert=\{relationshipDepthSurfaceLocked \? true : undefined\}/,
    );
    assert.match(
      pageSource,
      /aria-busy=\{relationshipDepthInputLocked \? true : undefined\}/,
    );
  });

  it("blocks ordinary Home navigation but settles active work before a room return", () => {
    const returnRoute = sourceSlice(
      "async function returnFromRelationshipDepth",
      "async function visitZenHome",
    );
    const visitRoute = sourceSlice(
      "async function visitZenHome",
      "useEffect(() => {\n    if (view !== \"chat\" || relationshipDepthReturnDepth <= 0)",
    );
    assert.match(
      returnRoute,
      /if \(activeTurnRunning && checkpoint\.surface !== "group-room"\) return/,
    );
    assert.match(
      visitRoute,
      /if \(pendingReplyVisible \|\| chatAssistantRevealInProgress\) return/,
    );
    assert.match(returnRoute, /interruptRelationshipDepthReturn\(\{/);
    assert.match(
      returnRoute,
      /pendingReplySettled: pendingSettlement\?\.settled/,
    );
    assert.match(
      returnRoute,
      /stopResponseAudio: stopVoicePlaybackForAssistantInterruption/,
    );
    assert.match(
      returnRoute,
      /finishRelationshipDepthAssistantRevealRef\.current\(\)/,
    );
    assert.doesNotMatch(
      returnRoute,
      /applyActiveAssistantRevealInterruption/,
    );
    assert.match(
      pageSource,
      /relationshipDepthReturnBlockedByReply[\s\S]{0,240}!relationshipDepthCanInterruptActiveTurn/,
    );
    assert.match(
      pageSource,
      /disabled=\{relationshipDepthReturnBlockedByReply\}/,
    );
  });

  it("restores room focus to an interactive presence instead of its hidden visual anchor", () => {
    const restoreFocus = sourceSlice(
      "function restoreRelationshipDepthFocus",
      "async function restoreRelationshipDepthCheckpoint",
    );
    assert.match(restoreFocus, /candidate\.closest<HTMLElement>/);
    assert.match(
      restoreFocus,
      /button, a, input, select, textarea, \[tabindex\]/,
    );
    assert.doesNotMatch(restoreFocus, /focusTarget\.tabIndex = -1/);
  });

  it("teaches Home depth and exact Back or Escape return semantics", () => {
    assert.match(tutorialSource, /heading: "Choose a relationship"/);
    assert.match(
      tutorialSource,
      /Back or Escape returns you to the wider Library or group room exactly where you left it\./,
    );
    assert.match(tutorialSource, /heading: "Continue this Home"/);
    assert.match(tutorialSource, /older continuity for this Home/);
    assert.doesNotMatch(tutorialSource, /heading: "Stay with PRISM"/);
  });
});

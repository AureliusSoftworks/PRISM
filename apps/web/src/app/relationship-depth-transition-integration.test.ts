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
  it("uses an immediate empty-Home selection and a guest handoff once the Home is established", () => {
    const headerBotPicker = sourceSlice(
      "function handleZenPersonaSelectionChange",
      "function handleZenMentionPersonaSelection",
    );
    assert.match(headerBotPicker, /zenSessionHasNotStarted\(\)/);
    assert.match(headerBotPicker, /armFreshZenPersona\(nextBotId\)/);
    assert.match(headerBotPicker, /commitZenPersonaTransition\(nextBotId\)/);
    assert.doesNotMatch(headerBotPicker, /visitZenHome\(nextBotId\)/);

    const guestInvitation = sourceSlice(
      "function handleZenMentionPersonaSelection",
      "async function persistZenPersonaTransitionChoice",
    );
    assert.match(guestInvitation, /commitZenPersonaTransition\(botId\)/);
  });

  it("labels the header picker as an invitation and restores its guest handoff footer", () => {
    const picker = sourceSlice(
      "const renderHeaderModelPicker = (",
      "const renderImagesPanelModelPicker",
    );
    assert.match(picker, /"Invite a Facet into this Home"/);
    assert.match(picker, /ariaLabel="Invite a Facet into this Home"/);
    assert.match(
      picker,
      /menuFooter=\{renderZenPersonaTransitionChoiceControl\(\)\}/,
    );
  });

  it("presents Random, New, Intro, and Off in both the picker and Zen guest-invitation settings", () => {
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
    assert.match(
      cssSource,
      /\.zenPersonaTransitionSegmentButton,\s*\.form \.zenPersonaTransitionSegmentButton\s*\{/,
    );
    assert.match(
      cssSource,
      /\.zenPersonaTransitionControl\s*\{[\s\S]*?flex-wrap:\s*wrap;/,
    );
    assert.match(
      cssSource,
      /\.zenPersonaTransitionSegments\s*\{[\s\S]*?flex:\s*1 1 188px;[\s\S]*?min-width:\s*min\(188px,\s*100%\);/,
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

  it("uses the shared runner and restores the saved checkpoint for Escape", () => {
    assert.match(pageSource, /\brunRelationshipDepthTransition\b/);
    assert.match(pageSource, /\breturnFromRelationshipDepth\b/);
    assert.match(
      pageSource,
      /event\.key !== "Escape"[\s\S]{0,500}returnFromRelationshipDepth\("escape"\)/,
    );
    assert.match(pageSource, /function jumpCanvasToCurrentGroupRoot\(/);
    assert.doesNotMatch(
      pageSource,
      /handleEmptyStateBackgroundClick[\s\S]{0,2500}returnFromRelationshipDepth\(/,
    );
  });

  it("gates native transitions by handoff safety and keeps matched manual fallback beats", () => {
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

  it("opens bot Home from the overview grid instead of resuming the latest chat", () => {
    const commitSelection = sourceSlice(
      "const commitEmptyStateBotSelection = useCallback(",
      "useEffect(() => {\n    if (view !== \"chat\") return;\n    const botId = pendingImportedChatBotSelectionRef.current;",
    );
    assert.match(
      commitSelection,
      /startFreshConversation\(false, \{ zenHomeBotId: botId \}\)/,
    );
    assert.doesNotMatch(
      commitSelection,
      /visitZenHome\(botId, \{[\s\S]{0,120}sourceSurface: "library"/,
    );
  });

  it("focuses a bot Home from its group chip while keeping older conversations selectable", () => {
    const sidebarRows = sourceSlice(
      "const renderConversationRow =",
      "function renderConversationGroupDeleteButton",
    );
    const categoryTile = sourceSlice(
      "const renderConversationGroupTile = (",
      "const renderConversationListContents =",
    );

    assert.match(
      sidebarRows,
      /<button[\s\S]*?void refreshConversation\(c\.id\)/,
    );
    assert.doesNotMatch(sidebarRows, /data-history-timeline-entry/);
    assert.doesNotMatch(sidebarRows, /conversationTimelineEntry/);
    assert.doesNotMatch(sidebarRows, /conversationGroupNewButton/);
    assert.match(
      categoryTile,
      /startFreshConversation\(false, \{ zenHomeBotId: group\.botId \}\)/,
    );
    assert.doesNotMatch(
      categoryTile,
      /visitZenHome\(group\.botId, \{[\s\S]{0,240}destination: \{ kind: "resolve" \}/,
    );
    assert.match(
      categoryTile,
      /aria-label=\{`Focus \$\{group\.name\}'s Home and expand conversations`\}/,
    );
    assert.doesNotMatch(categoryTile, /performShowAllBotsView\(group\.botId/);
    assert.doesNotMatch(cssSource, /\.conversationGroupNewButton\s*\{/);
    assert.doesNotMatch(cssSource, /\.conversationTimelineEntry\s*\{/);
  });

  it("resolves an existing Home from both Library and Home navigation unless pending is explicit", () => {
    const visitRoute = sourceSlice(
      "async function visitZenHome",
      'useEffect(() => {\n    if (view !== "chat" || relationshipDepthReturnDepth <= 0)',
    );

    assert.match(
      visitRoute,
      /const shouldKeepPendingHome = requestedDestination\.kind === "pending"/,
    );
    assert.match(
      visitRoute,
      /const shouldResolvePersistedHome =\s*!shouldKeepPendingHome &&\s*\(requestedDestination\.kind === "resolve" \|\|\s*requestedDestination\.kind === "infer"\)/,
    );
    assert.doesNotMatch(
      visitRoute,
      /requestedDestination\.kind === "infer" && sourceIsHome/,
    );
    assert.match(
      visitRoute,
      /Every ordinary Home visit resumes the latest continuation/,
    );
  });

  it("starts a fresh isolated conversation inside the active Home", () => {
    const startFresh = sourceSlice(
      "function startFreshConversation",
      "function setAppWidePrivateMode",
    );
    const sendSetup = sourceSlice(
      "const forceNewConversation =",
      "if (!trimmed && !isStarterPrompt",
    );

    assert.match(
      startFresh,
      /detail\s*\?\s*conversationEffectiveBotId\(detail\)\s*:\s*zenPersonaBotIdRef\.current/,
    );
    assert.match(startFresh, /armFreshZenPersona\(freshZenHomeBotId\)/);
    assert.match(
      sendSetup,
      /const forceNewConversation =\s*!isZenAutonomy[\s\S]{0,160}forceNewConversationOnNextSend/,
    );
    assert.doesNotMatch(sendSetup, /!isStarterPrompt/);
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

  it("guards relationship returns while Zen hue-directory escape stays local", () => {
    const returnRoute = sourceSlice(
      "async function returnFromRelationshipDepth",
      "async function visitZenHome",
    );
    const visitRoute = sourceSlice(
      "async function visitZenHome",
      "useEffect(() => {\n    if (view !== \"chat\" || relationshipDepthReturnDepth <= 0)",
    );
    const backgroundClick = sourceSlice(
      "function handleEmptyStateBackgroundClick",
      "const openEmptyStateBotSearch",
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
    assert.doesNotMatch(pageSource, /relationshipDepthReturnBlockedByReply/);
    assert.match(pageSource, /performShowAllBotsView\(\);\s*void openZenMode\(\)/);
    assert.match(pageSource, /function jumpCanvasToCurrentGroupRoot\(/);
    assert.match(
      backgroundClick,
      /if \(view === "chat"\) \{[\s\S]{0,500}chatPresentation === "zen"[\s\S]{0,900}jumpCanvasToCurrentGroupRoot\(\)/,
    );
    assert.doesNotMatch(
      backgroundClick,
      /returnFromRelationshipDepth\(|relationshipDepthReturnDepth|canvasBackgroundShouldZoomOutFocusedBot/,
    );
    assert.match(
      pageSource,
      /const renderSharedAppletBrand =[\s\S]*?data-shared-applet-brand=\{appletId\}/,
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

  it("teaches Home depth and exact Escape return semantics", () => {
    assert.match(tutorialSource, /heading: "Choose a relationship"/);
    assert.match(
      tutorialSource,
      /select the focused tile again to unfocus it; open its mini bot avatar for customization, or send a message to begin Zen\/Chat/,
    );
    assert.match(
      tutorialSource,
      /Clicking empty canvas space clears bot and hue focus while keeping the navbar’s current All Bots, Ungrouped, or saved-group selection/,
    );
    assert.match(
      tutorialSource,
      /Escape returns you to the wider Library or saved group grid exactly where you left it\./,
    );
    assert.match(tutorialSource, /heading: "Continue this Home"/);
    assert.match(tutorialSource, /older continuity for this Home/);
    assert.doesNotMatch(tutorialSource, /heading: "Stay with PRISM"/);
  });
});

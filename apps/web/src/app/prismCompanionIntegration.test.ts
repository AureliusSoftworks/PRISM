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
const tutorials = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);
const handoffCanvas = readFileSync(
  new URL("./PrismHandoffCanvas.tsx", import.meta.url),
  "utf8",
);
const api = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);

test("mounts the global companion on product shells but not top-bar main panels", () => {
  assert.ok((page.match(/renderGlobalPrismCompanion\(\)/gu)?.length ?? 0) >= 7);
  assert.match(page, /surfaceId: "home"/u);
  assert.match(page, /surfaceId: "group-home"/u);
  assert.match(page, /surfaceId: "zen"/u);
  assert.match(page, /surfaceId: "prism-home"/u);
  assert.match(page, /surfaceId: "coffee"/u);
  assert.match(page, /surfaceId: "signal"/u);
  assert.match(page, /surfaceId: "slate"/u);
  assert.doesNotMatch(page, /surfaceId: "marketplace"/u);
  assert.doesNotMatch(page, /surfaceId: "avatar-studio"/u);
  assert.doesNotMatch(page, /surfaceId: "images"/u);
  assert.doesNotMatch(page, /surfaceId: "settings"/u);
  assert.match(
    page,
    /prismCompanionDisabledByMainPanel\(panel, botAvatarCustomizerOpen\)[\s\S]*reason="main-menu-panel"/u,
  );
});

test("docks only in the live default Chat Home empty hero", () => {
  assert.match(
    page,
    /const prismHomeEmptyHeroVisible =\s*view === "chat" &&\s*zenEmptyHeroVisible &&\s*zenPersonaBot === null &&\s*activeBotLibraryGroupFilter === null;/u,
  );
  assert.match(
    page,
    /chatHomeHeroDocked=\{\s*prismHomeEmptyHeroVisible &&\s*panel === null &&\s*!botAvatarCustomizerOpen\s*\}/u,
  );
  assert.match(page, /data-prism-chat-home-orb-slot="true"/u);
  assert.match(
    page,
    /prismHomeEmptyHeroVisible \? \(\s*<span[\s\S]*?data-prism-chat-home-orb-slot="true"/u,
  );
  const deprecatedHubBranch =
    page.match(/if \(view === "hub"\)[\s\S]*?\/\/ ── Chat mode ──/u)?.[0] ?? "";
  assert.match(
    deprecatedHubBranch,
    /<PrismRefractionEmblem className=\{styles\.brandEmblem\}/u,
  );
  assert.doesNotMatch(deprecatedHubBranch, /CompanionOrbSlot|orb-slot/u);
  assert.doesNotMatch(page, /homeDocked=\{view === "hub"\}/u);
});

test("moves the existing companion without overwriting its saved dock and restores it", () => {
  assert.match(component, /chatHomeHeroDocked\?: boolean/u);
  assert.match(component, /queryPrismChatHomeOrbSlot/u);
  assert.match(component, /normalizedPrismOrbPositionForRect/u);
  assert.match(component, /window\.requestAnimationFrame\(syncEveryFrame\)/u);
  assert.match(component, /chatHomeOrbDocked && chatHomeDockPosition/u);
  assert.match(component, /positionRef\.current = position/u);
  assert.match(
    component,
    /if \(!chatHomeOrbDocked\) \{[\s\S]*setChatHomeDockPosition\(null\)[\s\S]*setChatHomeDockReturning\(true\)/u,
  );
  assert.match(
    component,
    /chatHomeOrbDocked \? undefined : beginDrag/u,
  );
  assert.match(component, /data-chat-home-orb-docked/u);
  assert.match(component, /data-chat-home-orb-returning/u);
});

test("keeps the docked orb continuously visible and preserves hero activation", () => {
  assert.match(
    component,
    /idleDimmed && !chatHomeOrbDocked \? "true" : undefined/u,
  );
  assert.match(
    component,
    /idleHidden && !chatHomeOrbDocked \? "true" : undefined/u,
  );
  assert.match(
    component,
    /softSynthesisActive \|\|\s*chatHomeOrbDocked/u,
  );
  assert.match(
    component,
    /if \(chatHomeOrbDocked\) \{\s*playPrismCompanionGlassTap\(\);\s*activatePrismConversation\(true\);\s*return;/u,
  );
  assert.match(
    page,
    /onChatHomeHeroActivate=\{\(\) => void summonPrismIntoFreshChat\(\)\}/u,
  );
  assert.match(
    page,
    /async function summonPrismIntoFreshChat[\s\S]*?newSession: true/u,
  );
});

test("welds live Home docking without lag and settles its return safely", () => {
  assert.doesNotMatch(
    companionCss,
    /\.anchor\[data-chat-home-orb-docked="true"\]\s*\{\s*transition:/u,
  );
  assert.match(
    companionCss,
    /data-chat-home-orb-returning="true"\] \{[\s\S]*left 380ms[\s\S]*top 380ms/u,
  );
  assert.match(
    companionCss,
    /prefers-reduced-motion: reduce[\s\S]*data-chat-home-orb-returning="true"[\s\S]*left 1ms linear[\s\S]*top 1ms linear/u,
  );
});

test("keeps the companion explicit, keyboard accessible, and capability-driven", () => {
  assert.match(
    component,
    /aria-keyshortcuts=\{[\s\S]*?shortcutPresentation\.aria/u,
  );
  assert.match(component, /\{shortcutPresentation\.label\}/u);
  assert.match(component, /keyboardShortcutMatchesEvent/u);
  assert.match(component, /createPortal\(/u);
  assert.match(component, /document\.body/u);
  assert.match(component, /window\.sessionStorage/u);
  assert.match(component, /onAction\(action\)/u);
  assert.match(component, /data-card-type=\{card\.type\}/u);
  assert.match(component, /\/api\/prism\/actions\/execute/u);
  assert.match(component, /\/api\/prism\/actions\/undo/u);
  assert.match(component, /contextTokenIds: contextTokenIdsRef\.current/u);
  assert.match(component, /Review exact changes/u);
  assert.match(component, /Estimated cost:/u);
  assert.match(component, /aria-label="Recent Prism activity"/u);
  assert.match(component, /prismActionLabel\(run\.capabilityId\)/u);
  assert.match(component, /prismActionStatusLabel\(run\.status\)/u);
  assert.match(component, /“undo that” reverses the latest meaningful action/u);
  assert.doesNotMatch(component, /delete_bot|delete_project|delete_conversation/u);
  assert.match(handoffCanvas, /Exact source preview/u);
  assert.match(handoffCanvas, /Only this selection will cross surfaces/u);
});

test("opens the assistant menu from the live orb while preserving Home hero Chat", () => {
  assert.match(component, /presentation\?: PrismCompanionPresentation/u);
  assert.doesNotMatch(component, /onZenSummon/u);
  assert.match(
    component,
    /keyboardShortcutMatchesEvent\(keyboardShortcut, event\)[\s\S]*?activatePrismConversation\(\)/u,
  );
  assert.doesNotMatch(component, /focusedPrismRefractTargetId/u);
  assert.match(component, /inheritChatHomeDockPosition\(\);[\s\S]*?setOpen\(true\)/u);
  assert.ok(
    (component.match(/activatePrismConversation\((?:true)?\)/gu)?.length ?? 0) >=
      4,
  );
  assert.match(page, /presentation=\{view === "chat" \? chatPresentation : null\}/u);
  assert.doesNotMatch(page, /onZenSummon=/u);
  assert.match(
    page,
    /const summonRunId = zenOpenRunRef\.current \+ 1;\s*zenOpenRunRef\.current = summonRunId;/u,
  );
  assert.ok(
    (page.match(/zenOpenRunRef\.current !== summonRunId/gu)?.length ?? 0) >= 3,
  );
});

test("keeps ordinary assistant talk in one account-scoped saved Prism chat", () => {
  assert.match(component, /prismCompanionSessionStorageKey\(accountKey\)/u);
  assert.match(component, /prismCompanionSessionIsReusable\(/u);
  assert.match(component, /zenSessionIdleGapMs/u);
  assert.match(component, /fetch\("\/api\/conversations\/zen\/open"/u);
  assert.match(component, /JSON\.stringify\(\{ botId: null, newSession: true \}\)/u);
  assert.match(component, /orchestrationOnly: true/u);
  assert.match(
    component,
    /const persistentConversation = privateMode\s*\? null\s*: await ensurePersistentConversation\(\);[\s\S]*?fetch\("\/api\/prism-companion"/u,
  );
  assert.match(
    component,
    /\.\.\.\(persistentConversation[\s\S]*?persistConversationId: persistentConversation\.id/u,
  );
  assert.match(component, /orchestrationResponse\.status !== 204/u);
  assert.match(
    component,
    /const persistedReceipt = await loadPersistentConversation\([\s\S]*?applySavedConversation\(persistedReceipt\)/u,
  );
  assert.match(component, /fetch\("\/api\/chat"/u);
  assert.match(component, /prismCompanionRequest: true/u);
  assert.match(component, /prismCompanionSurface: surface/u);
  assert.match(
    page,
    /onPersistentConversationChange=\{async \(conversationId\) => \{[\s\S]*?refreshConversations\(\)/u,
  );
});

test("isolates Private talk and hands either lane to focused chat", () => {
  assert.match(component, /prismCompanionPrivateRecoveryStorageKey\(accountKey\)/u);
  assert.match(component, /aria-pressed=\{privateMode\}/u);
  assert.match(component, /Not in history or memory/u);
  assert.match(component, /incognito: true/u);
  assert.match(component, /ephemeralMessages: privateTranscript/u);
  assert.match(
    component,
    /const persistentConversation = privateMode\s*\? null/u,
  );
  assert.match(component, /onContinueFocusedChat\?:/u);
  assert.match(component, /Continue in focused chat/u);
  assert.match(
    component,
    /await onContinueFocusedChat\(\{\s*privateMode,\s*conversationId: conversation\.id,\s*conversation,/u,
  );
  assert.doesNotMatch(component, /Ephemeral · latest 3 recover on this surface/u);
  assert.match(
    page,
    /onContinueFocusedChat=\{continuePrismAssistantInFocusedChat\}/u,
  );
  assert.match(
    page,
    /if \(!handoff\.privateMode\)[\s\S]*?refreshConversation\(handoff\.conversationId\)[\s\S]*?const privateConversation: ConversationDetail/u,
  );
  assert.match(
    page,
    /if \(view !== "chat"\) \{\s*pendingPrismFocusedChatHandoffRef\.current = handoff;\s*setSidebarOpen\(false\);\s*navigateToView\("chat"\);/u,
  );
  assert.match(
    page,
    /pendingPrismFocusedChatHandoffRef\.current \|\|\s*chatAutoRestoreSuppressed/u,
  );
  assert.match(
    page,
    /const handoff = pendingPrismFocusedChatHandoffRef\.current;[\s\S]*?pendingPrismFocusedChatHandoffRef\.current = null;[\s\S]*?continuePrismAssistantInFocusedChat\(handoff\)/u,
  );
  assert.match(
    page,
    /selectedIdRef\.current = handoff\.conversationId;\s*detailIdRef\.current = null;\s*await refreshConversation\(handoff\.conversationId\)/u,
  );
  assert.match(
    page,
    /selectedIdRef\.current = privateConversation\.id;\s*detailIdRef\.current = privateConversation\.id;\s*setSelectedId\(privateConversation\.id\);\s*setDetail\(privateConversation\)/u,
  );
});

test("gives full-size Prism Home the same orchestration, activity, and undo APIs", () => {
  assert.match(page, /orchestrationOnly: true/u);
  assert.match(page, /response\.status === 204/u);
  assert.match(page, /setPrismHomeOrchestrationCards\(payload\.cards\)/u);
  assert.match(page, /\/api\/prism\/actions\/execute/u);
  assert.match(page, /\/api\/prism\/actions\/undo/u);
  assert.match(page, /\/api\/prism\/actions\?limit=12/u);
  assert.match(page, /renderPrismHomeOrchestrationCards\(\)/u);
  assert.match(page, /Review exact changes/u);
  assert.match(page, /aria-label="Recent Prism activity"/u);
  assert.match(page, /prismActionLabel\(run\.capabilityId\)/u);
  assert.match(page, /prismActionStatusLabel\(run\.status\)/u);
  assert.match(api, /request\.orchestrationOnly === true/u);
  assert.match(api, /ctx\.res\.statusCode = 204/u);
  assert.doesNotMatch(api, /title: "One thing first"/u);
});

test("shows Prism's dedicated local model without inheriting the applet picker", () => {
  assert.match(page, /<span>Prism model<\/span>/u);
  assert.match(
    page,
    /Prism Home, the floating[\s\S]*Applet model pickers do not[\s\S]*change it/u,
  );
  assert.match(page, /const prismHomeUsesDedicatedLocalModel/u);
  assert.match(
    page,
    /Prism uses this dedicated local model\. Change it in Settings → Models\./u,
  );
  assert.match(
    tutorials,
    /Prism Home, the floating companion, Wield, and Refract always use the local Prism model/u,
  );
});

test("hands synthesized Signal bookings to the normal warmup and playback path", () => {
  const signal = readFileSync(
    new URL("./BotcastExperience.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /run\.capabilityId === "signal\.episode\.stage"/u);
  assert.match(page, /setSignalOrchestrationLaunch\(/u);
  assert.match(page, /orchestrationLaunch=\{signalOrchestrationLaunch\}/u);
  assert.match(signal, /orchestrationLaunchStagedTokenRef/u);
  assert.match(signal, /void startEpisodeRef\.current\(\)/u);
  assert.match(signal, /waitForModelPreparation/u);
  assert.match(signal, /setAutoRun\(true\)/u);
});

test("hands Story, Slate, and Image actions back to their normal product surfaces", () => {
  assert.match(page, /storySessionId: storySession\.id/u);
  assert.match(
    page,
    /onOpenImagePrompt=\{async \(prompt\) => \{[\s\S]*await openAllImagesPanel\(\)/u,
  );
  assert.match(page, /run\.capabilityId\.startsWith\("story\.session\."\)/u);
  assert.match(page, /await openStorySession\(resultSessionId\)/u);
  assert.match(page, /run\.capabilityId === "slate\.project\.create"/u);
  assert.match(page, /setRequestedSlateProjectId\(navigation\.slateProjectId\)/u);
  assert.match(page, /run\.capabilityId === "images\.delete"/u);
  assert.match(page, /await refreshImages\(imagePanelBotId\)/u);
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

test("copies a full companion bubble without hijacking links or text selection", () => {
  assert.match(
    component,
    /writePrismCompanionClipboard\(message\.content\)/u,
  );
  assert.match(component, /prismCompanionBubbleHasSelection/u);
  assert.match(
    component,
    /target\.closest\(\s*"a, button, input, textarea, select, summary"/u,
  );
  assert.match(component, /data-copied=\{copied \? "true" : undefined\}/u);
  assert.match(component, /`Copy \$\{speakerLabel\} message`/u);
  assert.match(component, /role="status"[\s\S]*aria-live="polite"/u);
  assert.match(companionCss, /\.bubble \{[\s\S]*cursor: copy/u);
  assert.match(
    companionCss,
    /\.bubble:hover \.copyButton,[\s\S]*\.bubble\[data-copied="true"\] \.copyButton/u,
  );
  assert.match(
    tutorials,
    /Click any Prism or You message bubble to copy its full text; dragging across text still selects it normally/u,
  );
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

test("keeps the app shell crisp behind a local focus orb while pausing motion", () => {
  assert.match(component, /className=\{styles\.backdrop\}/u);
  assert.match(component, /data-open=\{open \? "true" : undefined\}/u);
  assert.match(
    component,
    /setPrismSystemPause\(PRISM_COMPANION_SYSTEM_PAUSE_REASON, true\)/u,
  );
  assert.match(component, /setAppNavbarCompanionOpen\(open\)/u);
  assert.match(component, /setAppNavbarWielding\(true\)/u);
  assert.match(component, /setAppNavbarWielding\(false\)/u);
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
    /\.backdrop\[data-open="true"\] \{[\s\S]*background: transparent[\s\S]*pointer-events: auto[\s\S]*backdrop-filter: none/u,
  );
  assert.match(
    companionCss,
    /\.focusOrb \{[\s\S]*width: min\(74vw, 760px\)[\s\S]*radial-gradient[\s\S]*filter: blur\(26px\)/u,
  );
  assert.match(companionCss, /\.anchor \{[\s\S]*z-index: 855/u);
  assert.match(
    globalCss,
    /html\[data-prism-system-paused="true"\][\s\S]*data-prism-system-pause-exempt[\s\S]*animation-play-state: paused !important/u,
  );
  assert.match(
    globalCss,
    /html\[data-prism-companion-open="true"\][\s\S]*z-index: 860/u,
  );
  assert.match(
    globalCss,
    /html\[data-app-navbar-hidden="true"\][\s\S]*pointer-events: none/u,
  );
  assert.match(
    page,
    /document\.visibilityState === "visible" && !prismSystemPaused/u,
  );
  assert.match(
    page,
    /coffeeAutoplayPausedRef\.current =\s*coffeeAutoplayPaused \|\|\s*prismSystemPaused \|\|\s*prismPresentationSuspended/u,
  );
  assert.match(page, /acquirePrismLivingSession\("coffee"/u);
  assert.match(page, /const prismSystemPaused = useSyncExternalStore\(/u);
  assert.match(page, /const prismPresentationSuspended = useSyncExternalStore\(/u);
  assert.match(page, /prismPresentationSuspendedRef\.current/u);
  assert.match(page, /<PrismVisualLifecycleBridge \/>/u);
  assert.match(page, /armAppNavbarAutoHide\(\)/u);
  assert.match(page, /hideAppNavbarForImmersion\(\)/u);
  assert.match(page, /zenAutoHide = chatPresentation === "zen"/u);
  assert.match(page, /setAppNavbarAutoHideEnabled\(zenAutoHide\)/u);
});

test("gives only the companion orb momentum", () => {
  assert.match(component, /const startInertia = useCallback/u);
  assert.match(component, /stepPrismCompanionInertia/u);
  assert.match(component, /prefers-reduced-motion: reduce/u);
  assert.match(component, /data-inertial=\{inertial \? "true" : undefined\}/u);
  assert.doesNotMatch(page, /startAvatarMomentum|data-flinging/u);
});

test("collides the orb with open right navbar drawers and shoves left", () => {
  assert.match(component, /measurePrismCompanionRightPanelInsetPx/u);
  assert.match(component, /resolvePrismCompanionLiveBounds/u);
  assert.match(component, /resolvePrismCompanionRightPanelPush/u);
  assert.match(component, /const syncRightPanelCollisionBounds = useCallback/u);
  assert.match(component, /bounds: liveBoundsRef\.current/u);
  assert.match(component, /new ResizeObserver\(scheduleSync\)/u);
  assert.match(component, /data-right-panel-open/u);
  assert.match(component, /\[data-prism-panel\]/u);
});

test("docks the orb at the cursor on wield release and can fling with drag inertia", () => {
  assert.match(component, /wieldVelocitySampleRef/u);
  assert.match(component, /samplePrismCompanionDragVelocity\(/u);
  assert.match(component, /createPrismCompanionDragVelocitySample\(/u);
  assert.match(
    component,
    /releasePointer\.x \/ window\.innerWidth/u,
  );
  assert.match(component, /startInertia\(releaseVelocity\)/u);
  assert.match(component, /preserveCaptureReturn &&/u);
});

test("dims the idle orb after settle, then vanishes after the same delay", () => {
  assert.match(component, /PRISM_COMPANION_IDLE_DIM_MS = 3_000/u);
  assert.match(
    component,
    /PRISM_COMPANION_IDLE_VANISH_MS = PRISM_COMPANION_IDLE_DIM_MS/u,
  );
  assert.match(
    component,
    /data-idle-dimmed=\{\s*idleDimmed && !chatHomeOrbDocked \? "true" : undefined/u,
  );
  assert.match(
    component,
    /data-idle-hidden=\{\s*idleHidden && !chatHomeOrbDocked \? "true" : undefined/u,
  );
  assert.match(component, /const scheduleIdleDim = useCallback/u);
  assert.match(component, /const scheduleIdleVanish = useCallback/u);
  assert.match(component, /const clearIdleDim = useCallback/u);
  assert.match(
    component,
    /inheritChatHomeDockPosition\(\);[\s\S]{0,140}clearIdleDim\(\);[\s\S]{0,180}setOpen\(true\)/u,
  );
  assert.match(component, /clearIdleDim\(\);\s*stopInertia\(false\)/u);
  assert.match(
    component,
    /Revive a dimmed\/hidden orb as soon as Option wield begins/u,
  );
  assert.match(
    component,
    /idleDimmedRef\.current[\s\S]*playPrismCompanionGlassTap\(\);\s*return;/u,
  );
  assert.match(
    companionCss,
    /\[data-idle-dimmed="true"\][\s\S]*opacity:\s*0\.5/u,
  );
  assert.match(
    companionCss,
    /\[data-idle-dimmed="true"\][\s\S]*\.avatar::before[\s\S]*opacity:\s*0/u,
  );
  assert.match(
    companionCss,
    /\[data-idle-hidden="true"\][\s\S]*visibility:\s*hidden/u,
  );
  assert.match(
    companionCss,
    /\[data-idle-hidden="true"\][\s\S]*pointer-events:\s*none/u,
  );
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
  assert.match(component, /keepFieldRefract/u);
  assert.match(
    component,
    /if \(!keepFieldRefract\) \{\s*releasePrismRefract\(true\);/u,
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

test("soft synthesis keeps the real companion wieldable, draggable, and inertial", () => {
  assert.match(component, /usePrismSoftSynthesisUi/u);
  assert.match(component, /togglePrismSoftSynthesisExpanded/u);
  assert.match(component, /setPrismSoftSynthesisExpanded\(false\)/u);
  assert.match(component, /data-prism-companion-avatar="true"/u);
  assert.match(component, /styles\.softJobChip/u);
  assert.match(component, /softSynthesisActive/u);
  assert.doesNotMatch(component, /if \(softSynthesisLocked\) return;/u);
  assert.doesNotMatch(component, /softSynthesisUi\.lodged/u);
  assert.match(
    component,
    /if \(drag\.moved\) \{[\s\S]{0,260}startInertia\(\{ x: drag\.velocityX, y: drag\.velocityY \}\)/u,
  );
  assert.match(companionCss, /\.softJobChip\s*\{/u);
  assert.doesNotMatch(companionCss, /data-soft-lodged/u);
  assert.match(
    companionCss,
    /data-wielding="true"\] \.softJobChip/u,
  );
  assert.match(tutorials, /data-tutorial-target="prism-companion"/u);
});

test("keeps Prism anchored while an assistant menu is open", () => {
  assert.match(component, /prismWieldCanArm/u);
  assert.match(component, /prismWieldAvailabilityRef/u);
  assert.match(
    component,
    /companionMenuOpen: open,[\s\S]{0,120}softSynthesisMenuOpen:[\s\S]{0,120}softSynthesisUi\.expanded,[\s\S]{0,80}homeDocked: chatHomeOrbDocked/u,
  );
  assert.match(
    component,
    /if \(!prismWieldCanArm\(prismWieldAvailabilityRef\.current\)\) return;/u,
  );
  assert.match(
    component,
    /\(!menuOpen && !chatHomeOrbDocked\)[\s\S]*wieldStateRef\.current\.phase === "idle"[\s\S]*resetPrismWield\(false, false, \{ skipCursorDock: true \}\)/u,
  );
  assert.doesNotMatch(
    component,
    /if \(softSynthesisActive && softSynthesisUi\.expanded\) \{\s*setPrismSoftSynthesisExpanded\(false\)/u,
  );
  assert.match(
    tutorials,
    /menu is open, the Wield modifier leaves the assistant anchored/u,
  );
});

test("switches the floating Prism panel among Synthesis, Chat, and Notes", () => {
  assert.match(component, /PrismCompanionViewTabs/u);
  assert.match(component, /activeView="synthesis"/u);
  assert.match(component, /activeView="chat"/u);
  assert.match(component, /activeView="notes"/u);
  assert.match(component, /id="global-prism-synthesis"/u);
  assert.match(component, /Describe what you want to synthesize/u);
  assert.match(component, /await onOpenImagePrompt\(prompt\)/u);
  assert.match(page, /onOpenImagePrompt=\{async \(prompt\) =>/u);
  assert.match(page, /setImagePrompt\(prompt\)/u);
  assert.match(page, /await openAllImagesPanel\(\)/u);
  assert.match(component, /id="global-prism-notes"/u);
  assert.match(component, /fetch\("\/api\/prism\/notes"/u);
  assert.match(component, /method: personalNoteId \? "PUT" : "POST"/u);
  assert.match(component, /method: "DELETE"/u);
  assert.match(component, /Press Delete again to confirm/u);
});

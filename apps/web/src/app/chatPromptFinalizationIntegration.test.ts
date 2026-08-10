import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const serverSource = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);

test("locks Speech Type before awaiting canonical Prompt Center finalization", () => {
  const sendStart = pageSource.indexOf("async function sendMessage(");
  const finalizationStart = pageSource.indexOf(
    "if (composerCanonicalFinalizationNeeded)",
    sendStart,
  );
  const optimisticStart = pageSource.indexOf(
    "const optimisticMessageId = `pending-",
    finalizationStart,
  );
  const finalizationBlock = pageSource.slice(
    finalizationStart,
    optimisticStart,
  );

  assert.ok(sendStart >= 0);
  assert.ok(finalizationStart > sendStart);
  assert.ok(optimisticStart > finalizationStart);
  assert.match(
    finalizationBlock,
    /outgoingVoiceSelection = freezeChatTurnVoiceSelection\(\);[\s\S]*?await api<[\s\S]*?>\("\/api\/composer\/finalize"/u,
  );
  assert.match(
    finalizationBlock,
    /primeVoiceModePlaybackFromUserGesture\([\s\S]*?const finalizationController/u,
  );
  assert.match(
    finalizationBlock,
    /promptFinalizationAbortControllerRef\.current = finalizationController/u,
  );
  assert.match(
    finalizationBlock,
    /releaseChatTurnVoiceSelection\(\);[\s\S]*?setComposerDraftNow\(rawDraft\)/u,
  );
});

test("Shh during wildcard finalization cancels without inventing a bot cutoff reaction", () => {
  const handlerStart = pageSource.indexOf("const handleTypingIndicatorPress");
  const reactionGuard = pageSource.indexOf(
    "shhReactionStartedMessageIdsRef.current.has",
    handlerStart,
  );
  const preSpeechBlock = pageSource.slice(handlerStart, reactionGuard);
  assert.match(
    preSpeechBlock,
    /if \(!interruption\) \{[\s\S]*?promptFinalizationActive[\s\S]*?stopPendingReply\(\);[\s\S]*?return;/u,
  );
  assert.doesNotMatch(preSpeechBlock, /assistantInterruptionReaction/u);
});

test("immersive Zen speaks canonical prompt text and never paints the pending template", () => {
  assert.match(
    pageSource,
    /messageFinalizationAwaitsServer = false;[\s\S]*?composerFinalizedForSend = true;/u,
  );
  assert.match(
    pageSource,
    /if \(chatImmersivePresentation\) \{[\s\S]*?presentChatPlayerMessage\(\s*optimisticMessageId,\s*commandCenterPromptActive \? outboundPrompt : optimisticUserContent/u,
  );
  assert.match(
    pageSource,
    /const zenPlayerRevealMatches = Boolean\(\s*chatImmersivePresentation &&/u,
  );
  assert.match(
    pageSource,
    /const forcedVisibleTokenCount = zenPlayerRevealMatches\s*\? zenPlayerRevealTimeline\s*\? speechRevealVisibleTokenCount\(zenPlayerRevealTimeline\)\s*:\s*0/u,
  );
  assert.match(
    pageSource,
    /onStart: \(durationMs\) => \{[\s\S]*?beginReveal\(/u,
  );
});

test("the chat endpoint accepts only fully resolved canonical composer handoffs", () => {
  assert.match(serverSource, /route\("POST", "\/api\/composer\/finalize"/u);
  assert.match(
    serverSource,
    /resolvePromptWildcardsWithModel\([\s\S]*?cleanupResolvedPromptWithModel/u,
  );
  assert.match(
    serverSource,
    /const composerFinalized = body\.composerFinalized === true;/u,
  );
  assert.match(
    serverSource,
    /composerFinalized && initialWildcardNames\.length > 0[\s\S]*?Finalized composer input still contains unresolved wildcards/u,
  );
  assert.match(
    serverSource,
    /!composerFinalized &&[\s\S]*?resolvePromptWildcardsWithModel/u,
  );
  assert.match(
    serverSource,
    /privacyScope: incognito \? "private" : "normal"/u,
  );
});

test("long prompt finalization aborts only for an actual client disconnect", () => {
  const routeStart = serverSource.indexOf(
    'route("POST", "/api/composer/finalize"',
  );
  const routeEnd = serverSource.indexOf(
    'route("POST", "/api/prompt-center/preview/resolve"',
    routeStart,
  );
  const routeSource = serverSource.slice(routeStart, routeEnd);
  assert.ok(routeStart >= 0);
  assert.ok(routeEnd > routeStart);
  assert.match(routeSource, /ctx\.req\.once\("aborted", onClientClose\)/u);
  assert.match(routeSource, /ctx\.res\.once\("close", onClientClose\)/u);
  assert.doesNotMatch(routeSource, /ctx\.req\.once\("close", onClientClose\)/u);
  assert.doesNotMatch(routeSource, /ctx\.req\.off\("close", onClientClose\)/u);
});

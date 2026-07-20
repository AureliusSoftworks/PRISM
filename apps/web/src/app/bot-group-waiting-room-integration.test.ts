import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { BOT_GROUP_WAITING_ROOM_ENABLED } from "./botGroupWaitingRoom.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const waitingRoomSource = readFileSync(
  new URL("./botGroupWaitingRoom.ts", import.meta.url),
  "utf8",
);
const ambientSource = readFileSync(
  new URL("./botGroupWaitingRoomAmbient.ts", import.meta.url),
  "utf8",
);

const networkCallPatterns = [
  /\bfetch\s*\(/u,
  /\b(?:new\s+)?XMLHttpRequest\s*\(/u,
  /\b(?:new\s+)?WebSocket\s*\(/u,
  /\b(?:new\s+)?EventSource\s*\(/u,
  /\bnavigator\s*\.\s*sendBeacon\s*\(/u,
] as const;

function assertNoNetworkCalls(source: string): void {
  for (const pattern of networkCallPatterns) {
    assert.doesNotMatch(source, pattern);
  }
}

describe("bot group waiting-room integration", () => {
  it("temporarily keeps saved groups on the standard grid", () => {
    assert.equal(BOT_GROUP_WAITING_ROOM_ENABLED, false);
    assert.match(
      pageSource,
      /const botGroupWaitingRoomEligible =\s*BOT_GROUP_WAITING_ROOM_ENABLED &&\s*Boolean\(user\)/,
    );
  });

  it("keeps the room Chat-only and leaves Sandbox on the compact picker", () => {
    assert.match(
      pageSource,
      /const botGroupWaitingRoomVisitEligible =\s*botGroupWaitingRoomEligible &&\s*view === "chat"/,
    );
    assert.match(
      pageSource,
      /const groupWaitingRoom =\s*renderFocusedBotLibraryGroupWaitingRoom\(\{ heroBot \}\);/,
    );
    assert.match(
      pageSource,
      /\{groupWaitingRoom \?\?\s*renderChatBotPickerGrid\(emptyStatePickerGeometry\)\}/,
    );
    assert.equal(
      pageSource.match(/renderFocusedBotLibraryGroupWaitingRoom\(\{ heroBot \}\)/g)
        ?.length,
      1,
    );
    assert.match(pageSource, /\/\/ ── App shell \(Sandbox mode\) ──/);
  });

  it("excludes the special starter group and sources canonical saved membership", () => {
    assert.match(
      pageSource,
      /activeBotLibraryGroupFilter\.botIds\.filter\(\(botId\) =>\s*existingBotIds\.has\(botId\)/,
    );
    assert.match(
      pageSource,
      /activeBotLibraryGroupFilter\.id === BOT_LIBRARY_STARTER_GROUP_ID/,
    );
    assert.doesNotMatch(
      pageSource,
      /createBotGroupWaitingRoomVisit\([\s\S]{0,240}(?:localStorage|sessionStorage|api\()/,
    );
  });

  it("owns and cleans every rotation, handoff, visibility, and motion listener", () => {
    assert.match(
      pageSource,
      /clearBotGroupWaitingRoomRotationTimer\(false\);\s*clearBotGroupWaitingRoomHandoff\(\);/,
    );
    assert.match(
      pageSource,
      /document\.addEventListener\("visibilitychange", handleVisibilityChange\);/,
    );
    assert.match(
      pageSource,
      /document\.removeEventListener\("visibilitychange", handleVisibilityChange\);/,
    );
    assert.match(
      pageSource,
      /reducedMotionQuery\.addEventListener\("change", handleReducedMotionChange\);/,
    );
    assert.match(
      pageSource,
      /reducedMotionQuery\.removeEventListener\(\s*"change",\s*handleReducedMotionChange,?\s*\);/,
    );
    assert.match(pageSource, /botGroupWaitingRoomRotationRemainingRef/);
    assert.match(pageSource, /botGroupWaitingRoomRotationDeadlineRef/);
    assert.match(
      pageSource,
      /if \(contextChanged\) \{[\s\S]{0,360}clearBotGroupWaitingRoomHandoff\(\);/,
    );
    assert.match(
      pageSource,
      /botGroupWaitingRoomRenderActive &&\s*!botGroupWaitingRoomObscured[\s\S]{0,320}setBotGroupWaitingRoomRosterInteracting\(false\);/,
    );
  });

  it("uses semantic direct-manipulation presences without ambient writes", () => {
    assert.match(
      pageSource,
      /className=\{styles\.botGroupWaitingRoomPresenceButton\}[\s\S]{0,180}data-tutorial-target="chat-bot-picker"/,
    );
    assert.match(
      pageSource,
      /<ul[\s\S]*aria-label=\{`\$\{focusedGroup\.name\} waiting room roster`\}/,
    );
    assert.match(
      pageSource,
      /<ZenLiveBotMannequin[\s\S]*forceBlinkPhase=\{\s*botGroupWaitingRoomReducedMotion/,
    );
    assert.match(
      pageSource,
      /if \(botGroupWaitingRoomRenderActive\) \{\s*e\.preventDefault\(\);[\s\S]{0,180}beginBotGroupCoffeeStaging\(liveDraft\)/,
    );
    assert.match(
      pageSource,
      /view !== "chat" \|\|\s*!user \|\|\s*botGroupWaitingRoomVisitEligible \|\|[\s\S]{0,900}"\/api\/conversations\/zen\/open"/,
    );
    assert.match(
      pageSource,
      /previous\.id !== activeConversationId &&\s*!previous\.incognito &&\s*!botGroupWaitingRoomVisitEligible &&\s*!suppressRelationshipDepthRefresh/,
    );
    assert.match(pageSource, /`Visit \$\{bot\.name\}'s Zen Home`/);
    assert.match(
      pageSource,
      /resolveExistingPersonaHome\(\s*placement\.botId,\s*conversations/,
    );
    assert.match(
      pageSource,
      /visitZenHome\(placement\.botId,[\s\S]{0,900}kind: "pending"/,
    );
    assert.match(
      pageSource,
      /commitSourceVisit:[\s\S]{0,300}botGroupWaitingRoomVisitRef\.current = next/,
    );
    assert.match(
      pageSource,
      /await refreshConversation\(conversationId\);\s*options\.commitSourceVisit\?\.\(\);/,
    );
    assert.match(
      pageSource,
      /botGroupWaitingRoomWithReturnCheckpoint\(current,[\s\S]{0,260}botGroupWaitingRoomSnapshot\(current\)/,
    );
  });

  it("shares every obscuring surface between rotation and ambient pause inputs", () => {
    assert.match(
      pageSource,
      /const botGroupWaitingRoomObscured = Boolean\([\s\S]{0,460}sidebarOpen[\s\S]{0,460}panel !== null[\s\S]{0,460}botGroupCoffeeStaging !== null[\s\S]{0,460}botGroupRoomAtmosphereDialog !== null[\s\S]{0,460}imageLightbox !== null/,
    );
    assert.match(
      pageSource,
      /const botGroupWaitingRoomPaused =[\s\S]{0,240}botGroupWaitingRoomObscured/,
    );
    assert.match(
      pageSource,
      /const botGroupWaitingRoomAmbientIsPaused =[\s\S]{0,760}interacting:\s*botGroupWaitingRoomObscured/,
    );
  });

  it("gives the room one stable accessible name instead of reusing the group hero id", () => {
    const renderStart = pageSource.indexOf(
      "const renderFocusedBotLibraryGroupWaitingRoom",
    );
    const renderEnd = pageSource.indexOf(
      "const renderFocusedBotLibraryGroupHero",
      renderStart,
    );
    assert.ok(renderStart >= 0 && renderEnd > renderStart);
    const renderSource = pageSource.slice(renderStart, renderEnd);
    assert.match(
      renderSource,
      /aria-labelledby="bot-group-waiting-room-title"/,
    );
    assert.equal(
      renderSource.match(/id="bot-group-waiting-room-title"/g)?.length,
      1,
    );
    assert.doesNotMatch(
      renderSource,
      /aria-labelledby="bot-library-group-hero-title"/,
    );
  });

  it("pins room geometry, focus rings, handoff motion, and reduced-motion fallback", () => {
    assert.match(cssSource, /\.botGroupWaitingRoom \{/);
    assert.match(cssSource, /\.botGroupWaitingRoomPresenceButton:focus-visible/);
    assert.match(cssSource, /@keyframes botGroupWaitingRoomArrival/);
    assert.match(cssSource, /@keyframes botGroupWaitingRoomDeparture/);
    assert.match(
      pageSource,
      /data-room-transition-anchor=\{bot\.id\}[\s\S]*?<BotAmbientPresenceRig[\s\S]*?phaseOffsetSeconds=\{placementIndex \* 1\.8\}/,
    );
    assert.match(
      cssSource,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.botGroupWaitingRoomPresence/,
    );
  });

  it("keeps ambient theater deterministic, silent, ephemeral, and timer-bounded", () => {
    assertNoNetworkCalls(ambientSource);
    assert.doesNotMatch(
      ambientSource,
      /\b(?:api|localStorage|sessionStorage|indexedDB|speechSynthesis|AudioContext|setInterval|requestAnimationFrame|Math\.random|Date\.now)\b/,
    );
    assert.match(ambientSource, /canonical: false/);
    assert.match(ambientSource, /phase: "idle"/);

    const runtimeStart = pageSource.indexOf(
      "const botGroupWaitingRoomAmbientPlacements",
    );
    const runtimeEnd = pageSource.indexOf(
      "useEffect(() => {\n    if (!emptyStateSearchActive)",
      runtimeStart,
    );
    assert.ok(runtimeStart >= 0 && runtimeEnd > runtimeStart);
    const runtimeSource = pageSource.slice(runtimeStart, runtimeEnd);
    assert.equal(runtimeSource.match(/window\.setTimeout\(/g)?.length, 1);
    assertNoNetworkCalls(runtimeSource);
    assert.doesNotMatch(
      runtimeSource,
      /\b(?:api|localStorage|sessionStorage|speechSynthesis|AudioContext|setInterval|requestAnimationFrame)\b/,
    );
    assert.match(
      runtimeSource,
      /botGroupWaitingRoomVisitRef\.current\?\.visitSeed !== ambient\.visitSeed/,
    );
    assert.match(
      pageSource,
      /clearBotGroupWaitingRoomAmbientTimer\(false\)/,
    );
    assert.doesNotMatch(
      waitingRoomSource.match(
        /export function botGroupWaitingRoomSnapshot[\s\S]*?\n}/,
      )?.[0] ?? "",
      /ambient/i,
    );
  });

  it("keeps ambient theater running while the pointer merely rests over the room", () => {
    const renderStart = pageSource.indexOf(
      "const renderFocusedBotLibraryGroupWaitingRoom",
    );
    const renderEnd = pageSource.indexOf(
      "const renderFocusedBotLibraryGroupHero",
      renderStart,
    );
    assert.ok(renderStart >= 0 && renderEnd > renderStart);
    const renderSource = pageSource.slice(renderStart, renderEnd);
    assert.doesNotMatch(renderSource, /onPointerEnter=/);
    assert.doesNotMatch(renderSource, /onPointerLeave=/);
    assert.match(renderSource, /onPointerDownCapture=/);
    assert.match(renderSource, /onFocusCapture=/);
  });

  it("keeps ambient cues out of the accessibility tree and lowers roamer work", () => {
    const renderStart = pageSource.indexOf(
      "const renderFocusedBotLibraryGroupWaitingRoom",
    );
    const renderEnd = pageSource.indexOf(
      "const renderFocusedBotLibraryGroupHero",
      renderStart,
    );
    assert.ok(renderStart >= 0 && renderEnd > renderStart);
    const renderSource = pageSource.slice(renderStart, renderEnd);
    assert.match(
      renderSource,
      /data-room-ambient-cue="true"[\s\S]{0,180}aria-hidden="true"/,
    );
    assert.doesNotMatch(
      renderSource.match(
        /className=\{styles\.botGroupWaitingRoomAmbientCue\}[\s\S]{0,300}/,
      )?.[0] ?? "",
      /aria-live|role=/,
    );
    assert.match(
      renderSource,
      /placement\.role === "roamer" \? "reduced" : "full"/,
    );
    assert.match(
      renderSource,
      /placement\.role === "roamer"[\s\S]{0,80}\? "open"/,
    );
    assert.match(
      pageSource,
      /detailLevel === "full" \? \([\s\S]{0,420}data-crt-material-layer="noise"[\s\S]{0,260}data-crt-material-layer="breathing"/,
    );
    assert.match(
      cssSource,
      /data-room-render-detail="reduced"[\s\S]{0,900}data-crt-material-layer="noise"[\s\S]{0,900}display: none/,
    );
    assert.match(
      cssSource,
      /data-room-render-detail="reduced"[\s\S]{0,1200}--bot-face-ambient-glow-opacity: 0\.14/,
    );
  });
});

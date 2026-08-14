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
  it("enables living rooms behind the authored-group eligibility gate", () => {
    assert.equal(BOT_GROUP_WAITING_ROOM_ENABLED, true);
    assert.match(
      pageSource,
      /const botGroupWaitingRoomEligible =\s*BOT_GROUP_WAITING_ROOM_ENABLED &&\s*Boolean\(user\)/,
    );
  });

  it("keeps the room Chat-only and layers it around the existing grid", () => {
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
      /className=\{styles\.botGroupAquarium\}[\s\S]{0,320}\{groupWaitingRoom\}[\s\S]{0,160}\{renderChatBotPickerGrid\(emptyStatePickerGeometry\)\}/,
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

  it("measures actual room space without rotation or handoff schedulers", () => {
    assert.match(pageSource, /const observer = new ResizeObserver/);
    assert.match(pageSource, /observer\.observe\(room\)/);
    assert.match(pageSource, /return \(\) => observer\.disconnect\(\)/);
    assert.match(pageSource, /resolveBotGroupRoomLayout\(\{/);
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
    assert.doesNotMatch(pageSource, /botGroupWaitingRoomRotationRemainingRef/);
    assert.doesNotMatch(pageSource, /botGroupWaitingRoomRotationDeadlineRef/);
    assert.doesNotMatch(pageSource, /clearBotGroupWaitingRoomHandoff/);
    assert.match(
      pageSource,
      /botGroupWaitingRoomRenderActive &&\s*!botGroupWaitingRoomObscured[\s\S]{0,320}setBotGroupWaitingRoomRosterInteracting\(false\);/,
    );
  });

  it("uses semantic mini and micro presences without Zen activation", () => {
    assert.match(
      pageSource,
      /className=\{styles\.botGroupWaitingRoomPresenceButton\}[\s\S]{0,180}data-tutorial-target="chat-bot-picker"/,
    );
    assert.match(
      pageSource,
      /<ul[\s\S]*aria-label=\{`\$\{focusedGroup\.name\} room roster`\}/,
    );
    assert.match(
      pageSource,
      /<EmptyStateHeroMiniBot[\s\S]*size="room"[\s\S]*scheduleKey=\{`waiting-room-/,
    );
    assert.match(
      pageSource,
      /if \(botGroupWaitingRoomRenderActive\) \{\s*e\.preventDefault\(\);[\s\S]{0,180}beginBotGroupCoffeeStaging\(liveDraft\)/,
    );
    assert.match(pageSource, /<BotAvatarMicro/);
    assert.match(
      pageSource,
      /placement\.lod === "micro" && !placement\.promoted[\s\S]{0,320}setBotGroupWaitingRoomPromotedBotId\(placement\.botId\)/,
    );
    assert.match(
      pageSource,
      /openBotPanelHub\(bot, \{[\s\S]{0,320}origin: "group-room"/,
    );
    const presenceHandlerStart = pageSource.indexOf(
      "const handleBotGroupWaitingRoomPresenceClick",
    );
    const roomRenderStart = pageSource.indexOf(
      "const renderFocusedBotLibraryGroupWaitingRoom",
      presenceHandlerStart,
    );
    assert.ok(presenceHandlerStart >= 0 && roomRenderStart > presenceHandlerStart);
    const presenceHandlerSource = pageSource.slice(
      presenceHandlerStart,
      roomRenderStart,
    );
    assert.doesNotMatch(presenceHandlerSource, /visitZenHome|navigateToView\("zen"\)/);
    assert.match(
      pageSource,
      /botGroupWaitingRoomWithReturnCheckpoint\(current,[\s\S]{0,260}botGroupWaitingRoomSnapshot\(current\)/,
    );
  });

  it("pauses mini ambient presence behind every obscuring surface", () => {
    assert.match(
      pageSource,
      /const botGroupWaitingRoomObscured = Boolean\([\s\S]{0,460}sidebarOpen[\s\S]{0,460}panel !== null[\s\S]{0,460}botGroupCoffeeStaging !== null[\s\S]{0,460}botGroupRoomAtmosphereDialog !== null[\s\S]{0,460}imageLightbox !== null/,
    );
    assert.match(
      pageSource,
      /const botGroupWaitingRoomAmbientIsPaused =[\s\S]{0,760}botGroupWaitingRoomObscured/,
    );
    assert.match(
      pageSource,
      /roomActive:[\s\S]{0,180}botGroupWaitingRoomLayout\.lod === "mini"/,
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

  it("keeps living-room presences calm around the interactive center grid", () => {
    assert.match(cssSource, /\.botGroupWaitingRoom \{/);
    assert.match(cssSource, /\.botGroupWaitingRoomPresenceButton:focus-visible/);
    assert.doesNotMatch(cssSource, /@keyframes botGroupWaitingRoomArrival/);
    assert.doesNotMatch(cssSource, /@keyframes botGroupWaitingRoomDeparture/);
    assert.match(
      pageSource,
      /data-room-transition-anchor=\{bot\.id\}[\s\S]*?<EmptyStateHeroMiniBot/,
    );
    assert.match(cssSource, /@keyframes botGroupAquariumDrift/);
    assert.match(
      waitingRoomSource,
      /exclusionFootprint[\s\S]{0,260}roomCandidatesOutsideFootprint/,
    );
    assert.match(
      pageSource,
      /zenHueRootGeometry\.pickerWidth \+ motionGutter \* 2[\s\S]{0,500}exclusionFootprint/,
    );
    assert.match(
      pageSource,
      /data-room-roam-paused=\{[\s\S]{0,120}botGroupWaitingRoomRoamIsPaused/,
    );
    assert.doesNotMatch(pageSource, /beginBotGroupWaitingRoomPresenceDrag/);
    const heroStart = pageSource.indexOf(
      "const renderFocusedBotLibraryGroupHero",
    );
    const heroEnd = pageSource.indexOf(
      "const renderChatCanvasPickerControls",
      heroStart,
    );
    assert.ok(heroStart >= 0 && heroEnd > heroStart);
    assert.doesNotMatch(
      pageSource.slice(heroStart, heroEnd),
      /data-bot-group-room-drop-target=/,
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
    // One ambient timer plus one shared mini-blink timer. Neither fans out per
    // avatar, and the micro LOD pauses both.
    assert.equal(runtimeSource.match(/window\.setTimeout\(/g)?.length, 2);
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

  it("keeps ellipsis cues hidden and switches between mini and lightweight micro avatars", () => {
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
    assert.match(renderSource, /data-room-render-detail=\{miniPresence \? "mini" : "micro"\}/);
    assert.match(renderSource, /<span aria-hidden="true">…<\/span>/);
    assert.match(renderSource, /<BotGroupWaitingRoomPresenceAvatar/);
    assert.doesNotMatch(renderSource, /<ZenLiveBotMannequin|<BotAmbientPresenceRig/);
    assert.match(
      cssSource,
      /data-room-lod="micro"[\s\S]{0,180}\.botGroupWaitingRoomPresenceName[\s\S]{0,360}backdrop-filter: none[\s\S]{0,120}box-shadow: none/,
    );
    const compactAvatarStart = pageSource.indexOf(
      "const BotGroupWaitingRoomPresenceAvatar",
    );
    const compactAvatarEnd = pageSource.indexOf(
      "// ── Empty-state icon",
      compactAvatarStart,
    );
    assert.ok(compactAvatarStart >= 0 && compactAvatarEnd > compactAvatarStart);
    const compactAvatarSource = pageSource.slice(
      compactAvatarStart,
      compactAvatarEnd,
    );
    assert.match(compactAvatarSource, /memo\(/);
    assert.match(compactAvatarSource, /<EmptyStateHeroMiniBot/);
    assert.match(compactAvatarSource, /<BotAvatarMicro/);
    assert.match(waitingRoomSource, /BOT_GROUP_WAITING_ROOM_MAX_MINI_BOTS = 24/);
    assert.match(pageSource, /Showing \{staticRosterNames\.length\} of\{" "\}/);
  });
});

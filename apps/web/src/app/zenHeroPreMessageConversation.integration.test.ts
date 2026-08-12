import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const tutorials = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const zenShell = page.slice(
  page.indexOf('// ── Chat mode ──'),
  page.indexOf('// ── App shell (Sandbox mode) ──'),
);

test("hero mini-bot selection enters the live pre-message canvas without sending", () => {
  assert.match(
    page,
    /const \[zenPreMessageConversationActive, setZenPreMessageConversationActive\] =\s*useState\(false\);/u,
  );
  assert.match(
    page,
    /function handleZenHeroMiniBotSelection[\s\S]*?setForceNewConversationOnNextSend\(true\);[\s\S]*?setZenPreMessageConversationActive\(true\);[\s\S]*?focusDraftInput\(\);/u,
  );
  const handler = page.slice(
    page.indexOf("function handleZenHeroMiniBotSelection"),
    page.indexOf("function handleSandboxHeroStarter"),
  );
  assert.doesNotMatch(handler, /sendMessage\(/u);
  assert.doesNotMatch(handler, /starterPrompt/u);
  assert.doesNotMatch(page, /function startHeroConversation/u);
});

test("the pre-message canvas retains the Home card while preserving live roaming presence", () => {
  assert.match(
    page,
    /const zenEmptyHeroVisible =[\s\S]*?!zenPreMessageConversationActive/u,
  );
  assert.match(
    page,
    /const zenNewSessionPresenceDeferred =[\s\S]*?activeConversationIsEmpty && !zenPreMessageConversationActive/u,
  );
  assert.match(zenShell, /\{zenHomeHeroVisible &&\s*\(\(\) => \{/u);
  assert.match(zenShell, /data-zen-home-drop-target=/u);
  assert.match(zenShell, /onHomeDockRequest=\{handleZenHomeDockRequest\}/u);
  assert.match(
    page,
    /const zenLivePresenceAvatarSizePx\s*=\s*zenPreMessageConversationActive[\s\S]*?ZEN_LIVE_BOT_AVATAR_MINI_MAX_SIZE_PX/u,
  );
  assert.match(zenShell, /data-zen-pre-message-hero="true"/u);
  assert.doesNotMatch(zenShell, /data-bot-talk-hero="true"/u);
  assert.match(
    styles,
    /\.zenHomeRoaming \.emptyStateIconButton \{[\s\S]*?opacity: 0;[\s\S]*?pointer-events: none;/u,
  );
});

test("new chats and fresh persona selection return to the normal Home hero", () => {
  assert.match(
    page,
    /function startFreshConversation[\s\S]*?setZenPreMessageConversationActive\(false\);/u,
  );
  assert.match(
    page,
    /function armFreshZenPersona[\s\S]*?setZenPreMessageConversationActive\(false\);/u,
  );
  assert.match(
    page,
    /const zenRememberedWallpaperVisible\s*=\s*zenHomeHeroVisible/u,
  );
  assert.match(
    page,
    /function armFreshZenPersona[\s\S]*?rotateZenFallbackWallpaperSeed\(\);/u,
  );
});

test("dropping on the retained title card restores docked Home", () => {
  const handler = page.slice(
    page.indexOf("function handleZenHomeDockRequest"),
    page.indexOf("function handleSandboxHeroStarter"),
  );
  assert.match(handler, /data-zen-home-drop-target/u);
  assert.match(handler, /zenHomeDropTargetContainsPoint/u);
  assert.match(handler, /setZenPreMessageConversationActive\(false\);/u);
});

test("Zen guidance explains that hero selection does not send a message", () => {
  assert.match(
    tutorials,
    /Select the bot on its Home card to let it roam before you send/u,
  );
});

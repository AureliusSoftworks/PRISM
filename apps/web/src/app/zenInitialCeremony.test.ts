import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  zenInitialCeremonyCanReveal,
  zenInitialCeremonyShouldStart,
} from "./zenInitialCeremony.ts";

test("a pre-created empty Zen conversation still starts the ceremony", () => {
  assert.equal(
    zenInitialCeremonyShouldStart({
      initialZenOpeningTurn: true,
      assistantOnlyTurn: false,
      editingMessage: false,
      pendingIncognito: false,
      conversationIncognito: false,
    }),
    true,
  );
});

test("first Zen response never reveals before its stream is ready", () => {
  assert.equal(
    zenInitialCeremonyCanReveal({
      responseStreamReady: false,
      waitForAtmosphere: false,
      atmosphereEnabled: true,
      atmosphereImageId: "room",
      atmosphereStatus: "ready",
      imageLaneUnavailable: false,
    }),
    false,
  );
});

test("atmosphere waits are opt-in and terminal failures fall through", () => {
  const base = {
    responseStreamReady: true,
    atmosphereEnabled: true,
    atmosphereImageId: null,
    atmosphereStatus: "generating" as const,
    imageLaneUnavailable: false,
  };
  assert.equal(zenInitialCeremonyCanReveal({ ...base, waitForAtmosphere: false }), true);
  assert.equal(zenInitialCeremonyCanReveal({ ...base, waitForAtmosphere: true }), false);
  assert.equal(
    zenInitialCeremonyCanReveal({
      ...base,
      waitForAtmosphere: true,
      atmosphereStatus: "error",
    }),
    true,
  );
});

test("the Zen setting defaults off and retains the player's preference", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
  assert.match(page, /zenInitialAtmosphereWaitEnabled: false/);
  assert.match(page, /prism_zen_initial_atmosphere_wait/);
  assert.match(page, /Wait for atmosphere before entering chat/);
  assert.match(page, /data-zen-initial-ceremony-avatar/);
  assert.match(page, /<ZenLiveBotMannequin/);
  assert.match(page, /data-zen-initial-loading-screen/);
  assert.match(page, /showThinkingSpinner/);
  assert.match(page, /initialZenOpeningTurn: isInitialZenOpeningTurn/);
  assert.match(page, /conversationId: requestConversationId/);
  assert.match(page, /progressiveZenVoice: false/);
  assert.match(page, /zenFreshConversationHandoff !== null\) return 0/);
  assert.match(css, /data-avatar-handoff="true"/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOT_AVATAR_FOUNDRY_PIXEL_GRID_ZOOM_THRESHOLD,
  BOT_AVATAR_FOUNDRY_UPGRADE_NODES,
  botAvatarFoundryAtmosphere,
  botAvatarFoundryCameraForControl,
  botAvatarFoundryGenerationHoldMs,
  botAvatarFoundryIdentitySurfaceForNode,
  botAvatarFoundryModulePopulation,
  botAvatarFoundryPixelGridVisible,
  botAvatarFoundryScreenMode,
  botAvatarFoundryStatus,
  botAvatarFoundryTiming,
  botAvatarFoundryUpgradeNodeForControl,
  normalizeBotAvatarFoundryOrigin,
  normalizeBotAvatarFoundryViewport,
  transitionBotAvatarFoundry,
  zoomBotAvatarFoundryViewport,
  type BotAvatarFoundryState,
} from "./botAvatarFoundry.ts";

describe("Avatar Foundry presentation contracts", () => {
  it("uses a neutral theme atmosphere until a bot color is supplied", () => {
    assert.deepEqual(botAvatarFoundryAtmosphere(null, "dark"), {
      color: "#91a8bd",
      source: "neutral",
    });
    assert.deepEqual(botAvatarFoundryAtmosphere(undefined, "light"), {
      color: "#6f8498",
      source: "neutral",
    });
    assert.deepEqual(botAvatarFoundryAtmosphere(" #B4A ", "dark"), {
      color: "#bb44aa",
      source: "bot",
    });
    assert.deepEqual(botAvatarFoundryAtmosphere("#16C7A1", "light"), {
      color: "#16c7a1",
      source: "bot",
    });
    assert.equal(
      botAvatarFoundryAtmosphere("not-a-color", "dark").source,
      "neutral",
    );
  });

  it("keeps the shell dormant until the awakening", () => {
    for (const phase of [
      "arrival",
      "brief",
      "handoff",
      "generation",
      "error",
    ] as const) {
      assert.equal(botAvatarFoundryScreenMode(phase), "off");
    }
    assert.equal(botAvatarFoundryScreenMode("awakening"), "live");
    assert.equal(botAvatarFoundryScreenMode("editing"), "editing");
  });

  it("keeps module controls in overview while ink uses the CRT camera", () => {
    assert.equal(botAvatarFoundryCameraForControl("eyes"), "overview");
    assert.equal(botAvatarFoundryCameraForControl("mouth"), "overview");
    assert.equal(botAvatarFoundryCameraForControl("details"), "ink");
    assert.equal(botAvatarFoundryCameraForControl("profile"), "overview");
  });

  it("describes upgrade modules instead of literal body-part hotspots", () => {
    assert.deepEqual(
      BOT_AVATAR_FOUNDRY_UPGRADE_NODES.map((node) => node.label),
      ["Optics", "Vocalizer", "Ink display", "Identity core", "Shell"],
    );
    assert.ok(
      BOT_AVATAR_FOUNDRY_UPGRADE_NODES.every((node) =>
        node.ariaLabel.includes("module"),
      ),
    );
    assert.equal(
      new Set(BOT_AVATAR_FOUNDRY_UPGRADE_NODES.map((node) => node.color)).size,
      1,
    );
  });

  it("keeps saved bots online while draft lights reflect meaningful content", () => {
    assert.deepEqual(
      botAvatarFoundryModulePopulation({
        draftMode: false,
        identity: false,
        eyes: false,
        mouth: false,
        screen: false,
        chassis: false,
      }),
      {
        eyes: true,
        mouth: true,
        screen: true,
        glyph: true,
        chassis: true,
      },
    );
    assert.deepEqual(
      botAvatarFoundryModulePopulation({
        draftMode: true,
        identity: true,
        eyes: false,
        mouth: true,
        screen: false,
        chassis: true,
      }),
      {
        eyes: false,
        mouth: true,
        screen: false,
        glyph: true,
        chassis: true,
      },
    );
  });

  it("maps editor categories to the matching chassis-light module", () => {
    assert.equal(botAvatarFoundryUpgradeNodeForControl("eyes").id, "eyes");
    assert.equal(botAvatarFoundryUpgradeNodeForControl("voice").id, "mouth");
    assert.equal(botAvatarFoundryUpgradeNodeForControl("details").id, "screen");
    assert.equal(botAvatarFoundryUpgradeNodeForControl("profile").id, "glyph");
    assert.equal(
      botAvatarFoundryUpgradeNodeForControl("settings").id,
      "chassis",
    );
  });

  it("keeps Identity Core and Shell as distinct Identity surfaces", () => {
    assert.equal(
      botAvatarFoundryIdentitySurfaceForNode("glyph"),
      "identity-core",
    );
    assert.equal(botAvatarFoundryIdentitySurfaceForNode("chassis"), "shell");
    assert.equal(botAvatarFoundryIdentitySurfaceForNode("eyes"), null);
    assert.equal(botAvatarFoundryIdentitySurfaceForNode("mouth"), null);
    assert.equal(botAvatarFoundryIdentitySurfaceForNode("screen"), null);
  });

  it("clamps camera navigation without touching avatar values", () => {
    assert.deepEqual(
      normalizeBotAvatarFoundryViewport({ x: 999, y: -999, zoom: 9 }),
      { x: 320, y: -240, zoom: 1.85 },
    );
    const zoomedIn = zoomBotAvatarFoundryViewport(
      { x: 18, y: -12, zoom: 1 },
      -120,
    );
    assert.ok(zoomedIn.zoom > 1);
    assert.equal(zoomedIn.x, 18);
    assert.equal(zoomedIn.y, -12);
    assert.equal(
      zoomBotAvatarFoundryViewport({ x: 0, y: 0, zoom: 1.85 }, -999).zoom,
      1.85,
    );
  });

  it("reveals the authored pixel grid only at close camera zoom", () => {
    assert.equal(
      botAvatarFoundryPixelGridVisible(
        BOT_AVATAR_FOUNDRY_PIXEL_GRID_ZOOM_THRESHOLD - 0.01,
      ),
      false,
    );
    assert.equal(
      botAvatarFoundryPixelGridVisible(
        BOT_AVATAR_FOUNDRY_PIXEL_GRID_ZOOM_THRESHOLD,
      ),
      true,
    );
    assert.equal(botAvatarFoundryPixelGridVisible(Number.NaN), false);
  });

  it("normalizes a live companion origin without trusting invalid values", () => {
    assert.deepEqual(
      normalizeBotAvatarFoundryOrigin({ x: 1.4, y: -0.2, available: true }),
      { x: 1, y: 0, available: true },
    );
    assert.deepEqual(normalizeBotAvatarFoundryOrigin(null), {
      x: 0.92,
      y: 0.84,
      available: false,
    });
  });

  it("uses one quiet, concrete status line", () => {
    assert.equal(
      botAvatarFoundryStatus("awakening", "Mira"),
      "Mira is coming online.",
    );
    assert.match(botAvatarFoundryStatus("error"), /safe/u);
  });

  it("runs AI creation through every explicit phase", () => {
    let state: BotAvatarFoundryState = { phase: "arrival", path: null };
    state = transitionBotAvatarFoundry(state, { type: "landed" });
    assert.deepEqual(state, { phase: "brief", path: null });
    state = transitionBotAvatarFoundry(state, { type: "begin", path: "ai" });
    state = transitionBotAvatarFoundry(state, { type: "handoff-complete" });
    assert.deepEqual(state, { phase: "generation", path: "ai" });
    state = transitionBotAvatarFoundry(state, { type: "generation-resolved" });
    state = transitionBotAvatarFoundry(state, { type: "wake-complete" });
    assert.deepEqual(state, { phase: "editing", path: "ai" });
  });

  it("gives manual creation the same ritual with no generation hold", () => {
    let state: BotAvatarFoundryState = { phase: "brief", path: null };
    state = transitionBotAvatarFoundry(state, {
      type: "begin",
      path: "manual",
    });
    state = transitionBotAvatarFoundry(state, { type: "handoff-complete" });
    assert.deepEqual(state, { phase: "awakening", path: "manual" });
    state = transitionBotAvatarFoundry(state, { type: "wake-complete" });
    assert.equal(state.phase, "editing");
  });

  it("holds fast generation while allowing slow generation to resolve naturally", () => {
    assert.equal(botAvatarFoundryGenerationHoldMs(120, false), 860);
    assert.equal(botAvatarFoundryGenerationHoldMs(1_400, false), 0);
    assert.equal(botAvatarFoundryGenerationHoldMs(-20, false), 980);
  });

  it("keeps failure retryable and cancellation dormant", () => {
    const failed = transitionBotAvatarFoundry(
      { phase: "generation", path: "ai" },
      { type: "failed" },
    );
    assert.deepEqual(failed, { phase: "error", path: "ai" });
    assert.deepEqual(transitionBotAvatarFoundry(failed, { type: "retry" }), {
      phase: "handoff",
      path: "ai",
    });
    assert.deepEqual(transitionBotAvatarFoundry(failed, { type: "cancel" }), {
      phase: "brief",
      path: null,
    });
  });

  it("uses restrained timings under reduced motion", () => {
    const full = botAvatarFoundryTiming(false);
    const reduced = botAvatarFoundryTiming(true);
    assert.ok(reduced.arrivalMs < full.arrivalMs);
    assert.ok(reduced.handoffMs < full.handoffMs);
    assert.ok(reduced.minimumGenerationMs < full.minimumGenerationMs);
    assert.ok(reduced.awakeningMs < full.awakeningMs);
    assert.equal(botAvatarFoundryGenerationHoldMs(40, true), 140);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PRISM_STARTUP_ROOTS,
  PRISM_SURFACES,
  prismContextualSurfaceEntry,
  prismRestorableWorkspaceLocation,
  prismStartupLocationFor,
  prismStartupSurfaces,
  prismSurfacesByClassification,
  type PrismSurfaceCheckpoint,
  type PrismStartupPreference,
} from "./prismSurfaceRegistry.ts";

describe("PRISM living-shell surface registry", () => {
  it("classifies the public product surfaces by role", () => {
    assert.deepEqual(
      prismSurfacesByClassification("home").map((surface) => surface.id),
      ["home", "prism-home", "zen", "group-home"],
    );
    assert.deepEqual(
      prismSurfacesByClassification("experience").map((surface) => surface.id),
      ["coffee", "signal", "story"],
    );
    assert.deepEqual(
      prismSurfacesByClassification("studio").map((surface) => surface.id),
      ["slate"],
    );
    assert.deepEqual(
      prismSurfacesByClassification("tool").map((surface) => surface.id),
      ["marketplace", "avatar-studio", "images", "settings"],
    );
  });

  it("makes All Bots the canonical Home", () => {
    assert.equal(PRISM_SURFACES.home.name, "All Bots");
    assert.equal(PRISM_SURFACES.home.returnBehavior, "home_root");
    assert.deepEqual(PRISM_SURFACES.home.entryRequirement, { kind: "none" });
  });

  it("exposes only Home and Slate as explicit startup roots", () => {
    assert.deepEqual(PRISM_STARTUP_ROOTS, ["home", "slate"]);
    assert.deepEqual(
      prismStartupSurfaces().map((surface) => surface.id),
      ["home", "slate"],
    );
    assert.equal(
      Object.values(PRISM_SURFACES).every(
        (surface) =>
          surface.startupEligible ===
          PRISM_STARTUP_ROOTS.includes(surface.id as "home" | "slate"),
      ),
      true,
    );

    const lastWorkspacePreference: PrismStartupPreference = "last_workspace";
    assert.equal(lastWorkspacePreference, "last_workspace");
    assert.equal("last_workspace" in PRISM_SURFACES, false);
  });

  it("requires Coffee and Signal to begin from bot or group context", () => {
    assert.deepEqual(PRISM_SURFACES.coffee.entryRequirement, {
      kind: "selected_bots_or_group",
      minimumSelectedBots: 2,
      maximumSelectedBots: 5,
    });
    assert.deepEqual(PRISM_SURFACES.signal.entryRequirement, {
      kind: "selected_bot_or_group",
    });
    assert.equal(
      PRISM_SURFACES.coffee.returnBehavior,
      "restore_origin_checkpoint",
    );
    assert.equal(
      PRISM_SURFACES.signal.returnBehavior,
      "restore_origin_checkpoint",
    );
  });

  it("preserves the exact origin checkpoint for contextual surfaces", () => {
    const checkpoint: PrismSurfaceCheckpoint = {
      surfaceId: "group-home",
      location: "/?view=chat&group=midnight-table#members",
      selectedGroupId: "group-42",
      focusTarget: "bot-card-mira",
    };

    const entry = prismContextualSurfaceEntry("coffee", checkpoint);

    assert.equal(entry.destination.href, "/?view=coffee");
    assert.deepEqual(entry.origin, checkpoint);
    assert.notEqual(entry.origin, checkpoint);
    assert.throws(
      () => prismContextualSurfaceEntry("slate", checkpoint),
      /does not use a contextual return checkpoint/u,
    );
  });

  it("lets explicit URLs take precedence over account startup settings", () => {
    assert.equal(
      prismStartupLocationFor({
        explicitViewParam: "coffee",
        preference: "slate",
      }),
      null,
    );
    assert.equal(
      prismStartupLocationFor({
        explicitViewParam: null,
        preference: "slate",
      }),
      "/?view=slate",
    );
    assert.equal(
      prismStartupLocationFor({
        explicitViewParam: null,
        preference: "last_workspace",
        lastWorkspaceLocation: "/?view=chat&group=group-42#members",
      }),
      "/?view=chat&group=group-42#members",
    );
  });

  it("rejects unsafe or non-workspace recovery locations", () => {
    assert.equal(
      prismRestorableWorkspaceLocation("https://example.com/?view=slate"),
      null,
    );
    assert.equal(prismRestorableWorkspaceLocation("//example.com"), null);
    assert.equal(
      prismRestorableWorkspaceLocation("/?mode=login&view=slate"),
      null,
    );
    assert.equal(prismRestorableWorkspaceLocation("/?view=unknown"), null);
    assert.equal(
      prismStartupLocationFor({
        explicitViewParam: null,
        preference: "last_workspace",
        lastWorkspaceLocation: "javascript:alert(1)",
      }),
      "/?view=chat",
    );
  });
});

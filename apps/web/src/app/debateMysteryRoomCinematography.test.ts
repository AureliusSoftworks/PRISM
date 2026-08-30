import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  mysteryRoomCinematographyArtStyleV1,
  mysteryRoomCinematographyCanvasSize,
  mysteryRoomCinematographyLightSourceV1,
  mysteryRoomCinematographyProfileV1,
  mysteryRoomCinematographySeed,
  mysteryRoomLightIntensityV1,
  mysteryRoomUsesTemplateLightGeometryV1,
} from "./debateMysteryRoomCinematography.ts";

describe("Whodunnit investigation room cinematography", () => {
  it("ships the first semantic profile only for a Foyer", () => {
    assert.equal(mysteryRoomCinematographyProfileV1({ templateId: "foyer" })?.id, "foyer-v1");
    assert.equal(mysteryRoomCinematographyProfileV1({ name: "Foyer" })?.id, "foyer-v1");
    assert.equal(mysteryRoomCinematographyProfileV1({ templateId: "library" }), null);
  });

  it("renders Mosaic effects on the logical 320 by 180 grid", () => {
    assert.equal(mysteryRoomCinematographyArtStyleV1("url(/rooms/foyer-mosaic.webp)"), "mosaic");
    assert.equal(mysteryRoomCinematographyArtStyleV1("url(/api/room/file?style=mosaic)"), "mosaic");
    assert.equal(mysteryRoomCinematographyArtStyleV1("url(/rooms/foyer.webp)"), "illustrated");
    assert.deepEqual(mysteryRoomCinematographyCanvasSize("mosaic"), { width: 320, height: 180 });
    assert.deepEqual(mysteryRoomCinematographyCanvasSize("illustrated"), { width: 800, height: 450 });
  });

  it("moves live practicals but freezes them under Reduced Motion", () => {
    const emitter = mysteryRoomCinematographyProfileV1({ templateId: "foyer" })?.emitters.find(
      (candidate) => candidate.id === "stair-field",
    );
    assert.ok(emitter);
    assert.notEqual(
      mysteryRoomLightIntensityV1({ emitter, elapsedSeconds: 0, reducedMotion: false }),
      mysteryRoomLightIntensityV1({ emitter, elapsedSeconds: 0.7, reducedMotion: false }),
    );
    assert.equal(
      mysteryRoomLightIntensityV1({ emitter, elapsedSeconds: 0, reducedMotion: true }),
      mysteryRoomLightIntensityV1({ emitter, elapsedSeconds: 42, reducedMotion: true }),
    );
  });

  it("keeps deterministic grain variation stable per room", () => {
    assert.equal(mysteryRoomCinematographySeed("room-foyer"), mysteryRoomCinematographySeed("room-foyer"));
    assert.notEqual(mysteryRoomCinematographySeed("room-foyer"), mysteryRoomCinematographySeed("room-library"));
  });

  it("binds positional lights to the room art that authored them", () => {
    assert.equal(mysteryRoomCinematographyLightSourceV1({
      authoredLightCount: 2,
      templateLightingAligned: true,
      hasTemplateProfile: true,
    }), "authored", "saved room lights supersede the bundled template profile");
    assert.equal(mysteryRoomCinematographyLightSourceV1({
      authoredLightCount: 0,
      templateLightingAligned: true,
      hasTemplateProfile: true,
    }), "template", "the bundled foyer may use its matching emitter coordinates");
    assert.equal(mysteryRoomCinematographyLightSourceV1({
      authoredLightCount: 0,
      templateLightingAligned: false,
      hasTemplateProfile: true,
    }), "none", "custom foyer art must not inherit the PRISM foyer coordinates");
    assert.equal(mysteryRoomUsesTemplateLightGeometryV1({ imageId: "space-foyer" }), false);
    assert.equal(mysteryRoomUsesTemplateLightGeometryV1({ acceptedRoomAssetId: "accepted-space-foyer" }), false);
    assert.equal(mysteryRoomUsesTemplateLightGeometryV1({
      sealedAsset: { revealed: true, status: "ready" },
    }), false);
    assert.equal(mysteryRoomUsesTemplateLightGeometryV1({
      sealedAsset: { revealed: false, status: "pending" },
    }), true);
  });

  it("composites inside Investigation and keeps Court outside the effect layer", () => {
    const experience = readFileSync(
      new URL("./DebateMysteryV2Experience.tsx", import.meta.url),
      "utf8",
    );
    const component = readFileSync(
      new URL("./debateMysteryRoomCinematographyLayer.tsx", import.meta.url),
      "utf8",
    );
    const css = readFileSync(
      new URL("./debateMysteryRoomCinematography.module.css", import.meta.url),
      "utf8",
    );
    const tutorial = readFileSync(
      new URL("./modeTutorials.ts", import.meta.url),
      "utf8",
    );
    assert.equal(
      [...experience.matchAll(/<DebateMysteryRoomCinematographyLayer\b/gu)].length,
      1,
      "the treatment mounts only on the Investigation room stage",
    );
    assert.match(experience, /data-mystery-room-stage="true"/u);
    assert.match(experience, /<div className=\{styles\.roomParallaxLayer\}>[\s\S]*?<DebateMysteryRoomCinematographyLayer[\s\S]*?room=\{currentRoom\}[\s\S]*?lights=\{currentRoomLights\}[\s\S]*?templateLightingAligned=\{currentRoomUsesTemplateLightGeometry\}[\s\S]*?blurred=\{roomActorVisible\}[\s\S]*?reducedMotion=\{reducedMotion\}/u);
    assert.match(experience, /mansionLayout\.lights\.filter\(\(light\) => light\.roomId === currentRoom\.id\)/u);
    assert.match(experience, /mysteryRoomUsesTemplateLightGeometryV1\(\{[\s\S]*imageId: currentRoom\.imageId,[\s\S]*acceptedRoomAssetId:[\s\S]*sealedAsset: currentRoom\.sealedAsset/u);
    assert.match(experience, /whodunnitMansionRoomArtUrl\([\s\S]*state\.config\.mansionSnapshot\.sourceBundleId,[\s\S]*currentRoomLayoutEntity\.acceptedRoomAssetId,[\s\S]*effectiveInvestigationArtStyle/u);
    assert.match(component, /mansionDynamicLightFrameV2\(light, elapsedMs, reducedMotion\)/u);
    assert.match(component, /data-light-source=\{lightSource\}/u);
    assert.match(component, /window\.cancelAnimationFrame\(animationFrame\)/u);
    assert.match(component, /stageObserver\?\.disconnect\(\)/u);
    assert.match(component, /data-light-motion=\{props\.reducedMotion \? "frozen" : "live"\}/u);
    assert.match(css, /mix-blend-mode:\s*overlay/u);
    assert.match(css, /data-art-style="mosaic"[\s\S]*image-rendering:\s*pixelated/u);
    assert.match(css, /pointer-events:\s*none/u);
    assert.match(tutorial, /Investigation lighting stays room-scoped:[\s\S]*Custom or generated room art never borrows positional lights from a bundled PRISM room/u);
  });
});

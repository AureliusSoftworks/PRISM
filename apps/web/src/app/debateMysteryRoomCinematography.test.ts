import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  mysteryRoomCinematographyArtStyleV1,
  mysteryRoomCinematographyCanvasSize,
  mysteryRoomCinematographyProfileV1,
  mysteryRoomCinematographySeed,
  mysteryRoomLightIntensityV1,
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
    assert.equal(
      [...experience.matchAll(/<DebateMysteryRoomCinematographyLayer\b/gu)].length,
      1,
      "the treatment mounts only on the Investigation room stage",
    );
    assert.match(experience, /data-mystery-room-stage="true"/u);
    assert.match(experience, /<div className=\{styles\.roomParallaxLayer\}>[\s\S]*?<DebateMysteryRoomCinematographyLayer[\s\S]*?room=\{currentRoom\}[\s\S]*?blurred=\{roomActorVisible\}[\s\S]*?reducedMotion=\{reducedMotion\}/u);
    assert.match(component, /window\.cancelAnimationFrame\(animationFrame\)/u);
    assert.match(component, /stageObserver\?\.disconnect\(\)/u);
    assert.match(component, /data-light-motion=\{props\.reducedMotion \? "frozen" : "live"\}/u);
    assert.match(css, /mix-blend-mode:\s*overlay/u);
    assert.match(css, /data-art-style="mosaic"[\s\S]*image-rendering:\s*pixelated/u);
    assert.match(css, /pointer-events:\s*none/u);
  });
});

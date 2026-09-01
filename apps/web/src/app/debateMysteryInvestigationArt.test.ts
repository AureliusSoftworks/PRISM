import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { CURRENT_MANSION_ROOM_ART_CONTRACT } from "@localai/shared";
import {
  DEFAULT_WHODUNNIT_ROOM_UPGRADE_ENABLED,
  WHODUNNIT_PIXEL_ART_PRESENTATION_VERSION,
  WHODUNNIT_ROOM_UPGRADE_STORAGE_KEY,
  readWhodunnitRoomUpgradeEnabled,
  whodunnitBundledRoomArtPath,
  whodunnitBundledRoomArtPathForRoom,
  whodunnitInvestigationAvatarPresentation,
  whodunnitIllustratedRoomSubjectId,
  whodunnitMansionRoomArtUrl,
  whodunnitRoomArtStyleForUpgrade,
  whodunnitSealedRoomArtUrl,
  whodunnitSavedRoomArtUrl,
  writeWhodunnitRoomUpgradeEnabled,
  whodunnitDiscoveredMansionRoomArtV1,
} from "./debateMysteryInvestigationArt.ts";

describe("Whodunnit room-art upgrade state", () => {
  it("keeps Mosaic as the sole base and uses Forge only as an initial default", () => {
    assert.equal(DEFAULT_WHODUNNIT_ROOM_UPGRADE_ENABLED, false);
    assert.equal(
      WHODUNNIT_PIXEL_ART_PRESENTATION_VERSION,
      CURRENT_MANSION_ROOM_ART_CONTRACT.version,
    );
    assert.equal(readWhodunnitRoomUpgradeEnabled(null, "case-1", true), true);
    assert.equal(readWhodunnitRoomUpgradeEnabled({ getItem: () => "unknown" }, "case-1", false), false);
    assert.equal(readWhodunnitRoomUpgradeEnabled({ getItem: () => null }, "case-1", true), true);
    assert.equal(whodunnitRoomArtStyleForUpgrade(false, true), "mosaic");
    assert.equal(whodunnitRoomArtStyleForUpgrade(true, true), "illustrated");
    assert.equal(whodunnitRoomArtStyleForUpgrade(true, false), "mosaic");
  });

  it("persists the Upgraded switch per case and migrates the former style preference", () => {
    const writes: Array<[string, string]> = [];
    writeWhodunnitRoomUpgradeEnabled(
      { setItem: (key, value) => { writes.push([key, value]); } },
      true,
      "case-1",
    );
    assert.deepEqual(writes, [[
      `${WHODUNNIT_ROOM_UPGRADE_STORAGE_KEY}:case-1`,
      "on",
    ]]);
    const storage = {
      getItem: (key: string) => key === `${WHODUNNIT_ROOM_UPGRADE_STORAGE_KEY}:case-1`
        ? "off"
        : key === "prism.whodunnit.investigation-art-style.v1:legacy-case"
          ? "illustrated"
          : null,
    };
    assert.equal(readWhodunnitRoomUpgradeEnabled(storage, "case-1", true), false);
    assert.equal(readWhodunnitRoomUpgradeEnabled(storage, "case-2", false), false);
    assert.equal(readWhodunnitRoomUpgradeEnabled(storage, "legacy-case", false), true);
  });

  it("resolves bundled, sealed, and avatar variants as one presentation contract", () => {
    assert.equal(
      whodunnitBundledRoomArtPath("/debate/mystery/rooms/foyer.webp", "mosaic"),
      "/debate/mystery/rooms/foyer-mosaic.webp?pixelArt=6",
    );
    assert.equal(
      whodunnitBundledRoomArtPath("/debate/mystery/rooms/foyer.webp", "illustrated"),
      "/debate/mystery/rooms/foyer.webp",
    );
    assert.equal(
      whodunnitBundledRoomArtPath(
        "/debate/mystery/rooms/attic-mosaic.webp?pixelArt=2",
        "mosaic",
      ),
      "/debate/mystery/rooms/attic-mosaic.webp?pixelArt=6",
      "already-Mosaic paths receive the current presentation cache version",
    );
    assert.equal(
      whodunnitBundledRoomArtPathForRoom(
        { templateId: "guest-bedroom", bundledAssetPath: null },
        "mosaic",
      ),
      "/debate/mystery/rooms/bedroom-mosaic.webp?pixelArt=6",
      "legacy and imported Guest Bedrooms keep a bundled backdrop",
    );
    assert.equal(
      whodunnitBundledRoomArtPathForRoom(
        { templateId: "guest-bedroom", bundledAssetPath: "/custom/guest.webp" },
        "illustrated",
      ),
      "/custom/guest.webp",
      "explicit package art wins over the semantic template fallback",
    );
    assert.equal(
      whodunnitBundledRoomArtPathForRoom(
        { templateId: "unknown-room", bundledAssetPath: null },
        "mosaic",
      ),
      null,
    );
    assert.equal(whodunnitInvestigationAvatarPresentation("mosaic"), "mini");
    assert.equal(whodunnitInvestigationAvatarPresentation("illustrated"), "full");
    assert.equal(whodunnitIllustratedRoomSubjectId("room-2"), "room-2:illustrated-v1");
    assert.equal(
      whodunnitSealedRoomArtUrl({ sessionId: "case / 1", subjectId: "room / 2", style: "mosaic" }),
      "/api/debates/case%20%2F%201/mystery-assets/room/room%20%2F%202/file?style=mosaic&pixelArt=6",
    );
    assert.equal(
      whodunnitSavedRoomArtUrl("jungle / room", "mosaic"),
      "/api/images/jungle%20%2F%20room/file?style=mosaic&pixelArt=6",
    );
    const illustratedMansionRoom = whodunnitMansionRoomArtUrl(
      "banyan / copy",
      "dining / illustrated",
      "illustrated",
    );
    const mosaicMansionRoom = whodunnitMansionRoomArtUrl(
      "banyan / copy",
      "dining / illustrated",
      "mosaic",
    );
    assert.equal(
      illustratedMansionRoom,
      "/api/debates/mystery-mansions/banyan%20%2F%20copy/assets/dining%20%2F%20illustrated/file",
    );
    assert.equal(
      mosaicMansionRoom,
      `${illustratedMansionRoom}?style=mosaic&pixelArt=${WHODUNNIT_PIXEL_ART_PRESENTATION_VERSION}`,
    );
    assert.notEqual(mosaicMansionRoom, illustratedMansionRoom);
  });

  it("wires one Upgraded switch, per-room load fallback, and leaves Court on its authored cameras", () => {
    const experience = readFileSync(
      new URL("./DebateMysteryV2Experience.tsx", import.meta.url),
      "utf8",
    );
    const legacyExperience = readFileSync(
      new URL("./DebateMysteryExperience.tsx", import.meta.url),
      "utf8",
    );
    const css = readFileSync(new URL("./debateMysteryV2.module.css", import.meta.url), "utf8");
    assert.match(experience, /data-tutorial-target="mystery-v2-room-art-upgrade"/u);
    assert.match(experience, /aria-label="Upgraded room art"/u);
    assert.match(experience, /readWhodunnitRoomUpgradeEnabled\([\s\S]{0,140}window\.localStorage,[\s\S]{0,140}props\.session\.id,[\s\S]{0,140}state\.config\.assetSynthesis\.illustratedRooms/u);
    assert.match(experience, /writeWhodunnitRoomUpgradeEnabled\(window\.localStorage, enabled, props\.session\.id\)/u);
    assert.match(legacyExperience, /readWhodunnitRoomUpgradeEnabled\([\s\S]{0,140}window\.localStorage,[\s\S]{0,140}props\.session\.id/u);
    assert.match(legacyExperience, /writeWhodunnitRoomUpgradeEnabled\(window\.localStorage, enabled, props\.session\.id\)/u);
    assert.doesNotMatch(experience, />Pixel Art<|>Realistic</u);
    assert.doesNotMatch(legacyExperience, />Pixel Art<|>Realistic</u);
    assert.match(experience, /whodunnitBundledRoomArtPathForRoom/u);
    assert.match(experience, /const currentRoomMosaicUrl = currentRoomMosaicAssetUrl/u);
    assert.match(experience, /const currentRoomImageUrl = currentRoomArtStyle === "illustrated"/u);
    assert.match(experience, /const currentRoomMosaicAssetUrl = currentRoom\?\.sealedAsset\?\.revealed[\s\S]{0,320}whodunnitSealedRoomArtUrl\(\{[\s\S]{0,180}subjectId: currentRoom\.id,[\s\S]{0,100}style: "mosaic"/u);
    assert.match(experience, /const currentRoomUpgradeAssetUrl = currentRoom && currentRoomHasIllustratedUpgrade[\s\S]{0,320}subjectId: whodunnitIllustratedRoomSubjectId\(currentRoom\.id\),[\s\S]{0,100}style: "illustrated"/u);
    assert.doesNotMatch(experience, /sealedAssetObjectUrls\[sealedMysteryRoomArtKey/u);
    assert.doesNotMatch(experience, /sealedAssetObjectUrls\[sealedMysteryIllustratedRoomArtKey/u);
    assert.match(experience, /data-art-style="mosaic"[\s\S]{0,180}src=\{currentRoomMosaicUrl\}/u);
    assert.match(experience, /data-upgrade-layer="true"[\s\S]{0,420}onLoad=\{handleCurrentRoomUpgradeArtLoad\}[\s\S]{0,120}onError=\{handleCurrentRoomArtLoadError\}/u);
    assert.match(experience, /loadedUpgradeRoomIds\.has\(currentRoom\.id\)/u);
    assert.match(experience, /roomBackdropImage[\s\S]*roomParallaxLayer/u);
    assert.match(css, /\.roomBackdropImage[\s\S]*z-index: 1;[\s\S]*width: 100vw;[\s\S]*height: 100dvh;/u);
    assert.match(css, /\.roomBackdropImage\[data-art-style="mosaic"\][\s\S]*image-rendering: pixelated/u);
    assert.match(css, /\.roomBackdropImage\[data-upgrade-layer="true"\][\s\S]*opacity: 0;[\s\S]*data-loaded="true"[\s\S]*opacity: 1;/u);
    assert.match(css, /\.roomBackdrop\[data-art-style="mosaic"\][\s\S]*display: none/u);
    assert.match(css, /\.roomScene\[data-art-style="mosaic"\] \.roomParallaxLayer[\s\S]*transform: none/u);
    assert.match(experience, />Upgraded<\/button>/u);
    assert.match(experience, /renderMysteryBotAvatar\(currentBot, investigationAvatarPresentation/u);
    assert.match(experience, /renderMysteryBotAvatar\(courtPresentedWitnessBot, "full"/u);
    const roomAvatarMiniRule = css.match(
      /roomActor\[data-art-style="mosaic"\]\s*:global\(\[data-chat-mini-bot-avatar="true"\]\[data-size="room"\]\)\s*\{[\s\S]*?\}/u,
    );
    assert.ok(roomAvatarMiniRule);
    assert.match(roomAvatarMiniRule[0], /--chat-mini-bot-render-size:\s*min\(30rem, 44vw, 56vh\)/u);
    assert.match(roomAvatarMiniRule[0], /transform:\s*scale\(1\.19128713\)/u);
  });

  it("resolves ten playable cruise rooms while ambient architecture stays outside art coverage", () => {
    const playableRooms = Array.from({ length: 10 }, (_, index) => ({
      id: `active-${index + 1}`,
      sealedMosaicUrl: index < 7 ? `blob:generated-mosaic-${index + 1}` : null,
      bundledAssetPath: index >= 7 ? `/ship/compatible-${index + 1}-mosaic.webp` : null,
    }));
    const ambientSpaces = Array.from({ length: 42 }, (_, index) => ({ id: `ambient-${index + 1}` }));
    const resolved = playableRooms.map((room) => ({
      id: room.id,
      art: whodunnitDiscoveredMansionRoomArtV1({
        discovered: true,
        upgradeEnabled: false,
        illustratedReady: false,
        sealedMosaicUrl: room.sealedMosaicUrl,
        bundledAssetPath: room.bundledAssetPath,
      }),
    }));
    assert.equal(resolved.length, 10);
    assert.equal(resolved.filter((room) => room.art?.url.startsWith("blob:generated")).length, 7);
    assert.equal(resolved.filter((room) => room.art?.url.startsWith("/ship/compatible")).length, 3);
    assert.ok(resolved.every((room) => room.art?.style === "mosaic"));
    assert.equal(resolved.filter((room) => ambientSpaces.some((space) => space.id === room.id)).length, 0);
  });

  it("ships one Mosaic base for every bundled investigation room", () => {
    const names = readdirSync(new URL("../../public/debate/mystery/rooms", import.meta.url));
    const originals = names.filter((name) => name.endsWith(".webp") && !name.endsWith("-mosaic.webp"));
    assert.equal(originals.length, 16);
    for (const original of originals) {
      assert.ok(names.includes(original.replace(/\.webp$/u, "-mosaic.webp")), original);
    }
  });

  it("keeps a synthesized-only Attic playable in both presentation lanes", () => {
    const room = { templateId: "attic", bundledAssetPath: null };
    assert.equal(
      whodunnitBundledRoomArtPathForRoom(room, "mosaic"),
      "/debate/mystery/rooms/attic-mosaic.webp?pixelArt=6",
    );
    assert.equal(
      whodunnitBundledRoomArtPathForRoom(room, "illustrated"),
      "/debate/mystery/rooms/attic-mosaic.webp?pixelArt=6",
    );
  });
});

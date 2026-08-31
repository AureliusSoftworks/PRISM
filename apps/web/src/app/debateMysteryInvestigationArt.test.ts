import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { CURRENT_MANSION_ROOM_ART_CONTRACT } from "@localai/shared";
import {
  DEFAULT_WHODUNNIT_INVESTIGATION_ART_STYLE,
  WHODUNNIT_PIXEL_ART_PRESENTATION_VERSION,
  readWhodunnitInvestigationArtStyle,
  whodunnitBundledRoomArtPath,
  whodunnitBundledRoomArtPathForRoom,
  whodunnitInvestigationAvatarPresentation,
  whodunnitIllustratedRoomSubjectId,
  whodunnitMansionRoomArtUrl,
  whodunnitSealedRoomArtUrl,
  whodunnitSavedRoomArtUrl,
  writeWhodunnitInvestigationArtStyle,
} from "./debateMysteryInvestigationArt.ts";

describe("Whodunnit investigation art style", () => {
  it("defaults invalid and unavailable preferences to Pixel Art", () => {
    assert.equal(DEFAULT_WHODUNNIT_INVESTIGATION_ART_STYLE, "mosaic");
    assert.equal(
      WHODUNNIT_PIXEL_ART_PRESENTATION_VERSION,
      CURRENT_MANSION_ROOM_ART_CONTRACT.version,
    );
    assert.equal(readWhodunnitInvestigationArtStyle(null), "mosaic");
    assert.equal(readWhodunnitInvestigationArtStyle({ getItem: () => "unknown" }), "mosaic");
    assert.equal(readWhodunnitInvestigationArtStyle({ getItem: () => "illustrated" }), "illustrated");
  });

  it("defaults every new case to Mosaic and persists upgrades only within that case", () => {
    const writes: Array<[string, string]> = [];
    writeWhodunnitInvestigationArtStyle(
      { setItem: (key, value) => { writes.push([key, value]); } },
      "illustrated",
      "case-1",
    );
    assert.deepEqual(writes, [[
      "prism.whodunnit.investigation-art-style.v1:case-1",
      "illustrated",
    ]]);
    const storage = {
      getItem: (key: string) => key.endsWith(":case-1") ? "illustrated" : null,
    };
    assert.equal(readWhodunnitInvestigationArtStyle(storage, "case-1"), "illustrated");
    assert.equal(readWhodunnitInvestigationArtStyle(storage, "case-2"), "mosaic");
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

  it("wires the presentation-only toggle and leaves Court on its authored cameras", () => {
    const experience = readFileSync(
      new URL("./DebateMysteryV2Experience.tsx", import.meta.url),
      "utf8",
    );
    const legacyExperience = readFileSync(
      new URL("./DebateMysteryExperience.tsx", import.meta.url),
      "utf8",
    );
    const css = readFileSync(new URL("./debateMysteryV2.module.css", import.meta.url), "utf8");
    assert.match(experience, /data-tutorial-target="mystery-v2-room-art-style"/u);
    assert.match(experience, /readWhodunnitInvestigationArtStyle\([\s\S]{0,100}window\.localStorage,[\s\S]{0,100}props\.session\.id/u);
    assert.match(experience, /writeWhodunnitInvestigationArtStyle\(window\.localStorage, style, props\.session\.id\)/u);
    assert.match(legacyExperience, /readWhodunnitInvestigationArtStyle\([\s\S]{0,100}window\.localStorage,[\s\S]{0,100}props\.session\.id/u);
    assert.match(legacyExperience, /writeWhodunnitInvestigationArtStyle\(window\.localStorage, style, props\.session\.id\)/u);
    assert.match(experience, /whodunnitBundledRoomArtPathForRoom/u);
    assert.match(experience, /const currentRoomImageUrl = currentRoomAssetUrl/u);
    assert.match(experience, /className=\{styles\.roomBackdropImage\}/u);
    assert.match(experience, /data-art-style=\{effectiveInvestigationArtStyle\}/u);
    assert.match(experience, /src=\{currentRoomImageUrl\}/u);
    assert.match(experience, /roomBackdropImage[\s\S]*roomParallaxLayer/u);
    assert.match(css, /\.roomBackdropImage[\s\S]*z-index: 1;[\s\S]*width: 100vw;[\s\S]*height: 100dvh;/u);
    assert.match(css, /\.roomBackdropImage\[data-art-style="mosaic"\][\s\S]*image-rendering: pixelated/u);
    assert.match(css, /\.roomBackdrop\[data-art-style="mosaic"\][\s\S]*display: none/u);
    assert.match(css, /\.roomScene\[data-art-style="mosaic"\] \.roomParallaxLayer[\s\S]*transform: none/u);
    assert.match(experience, /Upgrade to Realistic · ONLINE/u);
    assert.match(experience, /renderMysteryBotAvatar\(currentBot, investigationAvatarPresentation/u);
    assert.match(experience, /renderMysteryBotAvatar\(courtPresentedWitnessBot, "full"/u);
    const roomAvatarMiniRule = css.match(
      /roomActor\[data-art-style="mosaic"\]\s*:global\(\[data-chat-mini-bot-avatar="true"\]\[data-size="room"\]\)\s*\{[\s\S]*?\}/u,
    );
    assert.ok(roomAvatarMiniRule);
    assert.match(roomAvatarMiniRule[0], /--chat-mini-bot-render-size:\s*min\(30rem, 44vw, 56vh\)/u);
    assert.match(roomAvatarMiniRule[0], /transform:\s*scale\(1\.19128713\)/u);
  });

  it("ships one Pixel Art sibling for every bundled investigation room", () => {
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

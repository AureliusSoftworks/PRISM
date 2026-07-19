import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BotcastShow } from "@localai/shared";

import { signalShowMagicManifest } from "./signalShowIdentity.ts";

function show(overrides: Partial<BotcastShow> = {}): BotcastShow {
  return {
    id: "show-1",
    hostBotId: "host-1",
    name: "Signal Test",
    premise: "A test show.",
    hostingStyle: "curious",
    accentColor: "#ffffff",
    fallbackStudioAccentVariant: 0,
    atmosphere: {} as BotcastShow["atmosphere"],
    studioIdentity: "A precise studio.",
    dashboardBlurbs: ["Already written."],
    dayAtmosphere: { imageUrl: "/day.png" } as BotcastShow["dayAtmosphere"],
    nightAtmosphere: {
      imageUrl: "/night.png",
    } as BotcastShow["nightAtmosphere"],
    studioLayout: {} as BotcastShow["studioLayout"],
    voiceLevelsByBotId: {},
    atmosphereMix: {} as BotcastShow["atmosphereMix"],
    logo: { imageUrl: "/logo.png" } as BotcastShow["logo"],
    introAudio: { source: "elevenlabs" } as BotcastShow["introAudio"],
    atmosphereAudio: {
      source: "elevenlabs",
    } as BotcastShow["atmosphereAudio"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    episodeCount: 0,
    ...overrides,
  };
}

describe("signalShowMagicManifest", () => {
  it("orders only missing visual assets so Light can follow Dark", () => {
    const manifest = signalShowMagicManifest(
      show({
        dayAtmosphere: { imageUrl: null } as BotcastShow["dayAtmosphere"],
        nightAtmosphere: {
          imageUrl: null,
        } as BotcastShow["nightAtmosphere"],
        logo: { imageUrl: null } as BotcastShow["logo"],
      }),
    );

    assert.deepEqual(manifest.missingArtwork, [
      "night-studio",
      "day-studio",
      "logo",
    ]);
  });

  it("preserves present artwork and treats both ElevenLabs files as one package", () => {
    const manifest = signalShowMagicManifest(
      show({
        introAudio: { source: "elevenlabs" } as BotcastShow["introAudio"],
        atmosphereAudio: {
          source: "bundled",
        } as BotcastShow["atmosphereAudio"],
      }),
    );

    assert.deepEqual(manifest.missingArtwork, []);
    assert.equal(manifest.needsTextIdentity, false);
    assert.equal(manifest.needsAudioPackage, true);
    assert.equal(manifest.complete, false);
  });

  it("identifies only the unfinished pieces on a legacy show", () => {
    const manifest = signalShowMagicManifest(
      show({
        dashboardBlurbs: [],
        dayAtmosphere: { imageUrl: null } as BotcastShow["dayAtmosphere"],
        atmosphereAudio: {
          source: "bundled",
        } as BotcastShow["atmosphereAudio"],
      }),
    );

    assert.equal(manifest.needsTextIdentity, true);
    assert.deepEqual(manifest.missingArtwork, ["day-studio"]);
    assert.equal(manifest.needsAudioPackage, true);
    assert.equal(manifest.complete, false);
  });

  it("is complete only when text, artwork, and the audio package are present", () => {
    assert.deepEqual(signalShowMagicManifest(show()), {
      needsTextIdentity: false,
      missingArtwork: [],
      needsAudioPackage: false,
      complete: true,
    });
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  coffeeGroupSoundtrackAudioUrl,
  coffeeGroupSoundtrackPlaybackUrl,
} from "./coffeeGroupSoundtrack.ts";

const ready = {
  status: "ready" as const,
  generating: false,
  provider: "elevenlabs" as const,
  model: "music_v2",
  prompt: "prompt",
  contentType: "audio/mpeg",
  durationMs: 90_000,
  revision: 3,
  updatedAt: "2026-08-15T00:00:00.000Z",
  undoAvailable: true,
};

describe("Coffee group soundtrack UI", () => {
  it("selects cached custom audio when ready and bundled Jazz for every unavailable state", () => {
    assert.equal(
      coffeeGroupSoundtrackAudioUrl("group/a", ready),
      "/api/coffee/groups/group%2Fa/soundtrack/audio?revision=3",
    );
    assert.equal(
      coffeeGroupSoundtrackPlaybackUrl({
        groupId: "group-a",
        soundtrack: ready,
        fallbackUrl: "/audio/coffee/jazz/rainy-morning.mp3",
        source: "custom",
      }),
      "/api/coffee/groups/group-a/soundtrack/audio?revision=3",
    );
    assert.equal(
      coffeeGroupSoundtrackPlaybackUrl({
        groupId: "group-a",
        soundtrack: ready,
        fallbackUrl: "/audio/coffee/jazz/rainy-morning.mp3",
        source: "fallback",
      }),
      "/audio/coffee/jazz/rainy-morning.mp3",
    );
  });

  it("wires the shared player, Custom-only Refract, one-step Undo, gentle release, and faithful-master exclusion", () => {
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const player = readFileSync(new URL("./SanctumAudioPlayer.tsx", import.meta.url), "utf8");
    assert.match(page, /aria-label="Coffee atmosphere audio source"/u);
    assert.match(page, />\s*Fallback\s*<\/button>/u);
    assert.match(page, />\s*Custom\s*<\/button>/u);
    assert.match(page, /<SanctumAudioPlayer/u);
    assert.match(page, /kicker="Table player"/u);
    assert.match(page, /Fallback song/u);
    assert.match(page, /source === "custom"/u);
    assert.match(page, /coffeeSoundtrackRegenerationAvailable/u);
    assert.match(
      page,
      /const coffeeGroupSoundtrackMagic: PrismRefractMagicTarget \| null/u,
    );
    assert.match(page, /id: `coffee-group-soundtrack-\$\{coffeeSelectedGroup\.id\}`/u);
    assert.match(page, /run: regenerateCoffeeGroupSoundtrack/u);
    assert.match(
      page,
      /<PrismRefractTarget target=\{coffeeGroupSoundtrackMagic\}>/u,
    );
    assert.match(
      page,
      /body: JSON\.stringify\(\{[\s\S]{0,160}preferredProvider: coffeeSessionProvider,[\s\S]{0,80}direction,/u,
    );
    assert.match(
      page,
      /onClick=\{\(\) => void regenerateCoffeeGroupSoundtrack\(\)\}/u,
    );
    assert.match(page, /soundtrack\/undo/u);
    assert.match(page, /↶ Undo/u);
    assert.doesNotMatch(page, /Sample group sound/u);
    assert.doesNotMatch(page, /■ Stop/u);
    assert.doesNotMatch(page, /coffeeSoundtrack(?:Genre|Mood|Instrument)(?:Draft|Value|Setting)/u);
    assert.match(page, /!\(coffeeReplayActive && coffeeReplayUsesAudioMaster\)/u);
    assert.match(page, /backgroundRecordable=\{false\}/u);
    assert.match(player, /routeAudioElementToPrismOutput/u);
    assert.match(player, /SANCTUM_AUDIO_PLAYER_RELEASE_MS = 320/u);
    assert.match(
      player,
      /audibleAudioTransitionVolumeAt\(\s*startVolume,\s*0,\s*progress,?\s*\)/u,
    );
  });

  it("documents creation and soundtrack behavior in both tutorial surfaces", () => {
    const onboarding = readFileSync(new URL("./firstRunOnboarding.ts", import.meta.url), "utf8");
    const tutorials = readFileSync(new URL("./modeTutorials.ts", import.meta.url), "utf8");
    assert.match(onboarding, /voice and music/u);
    assert.match(tutorials, /five bundled café songs selected at random/u);
    assert.match(tutorials, /choose Fallback to audition that song/u);
    assert.match(tutorials, /Refract appears only on that Custom action/u);
    assert.match(tutorials, /Undo swaps the current song with the immediately previous one/u);
    assert.match(tutorials, /approximately 90-second, loop-friendly lo-fi focus track/u);
    assert.match(tutorials, /light percussion groove/u);
    assert.match(tutorials, /jazzy or easy-listening foundation/u);
    assert.match(tutorials, /distinct, wholly original sonic fingerprint/u);
    assert.match(tutorials, /never layer over a faithful audio master/u);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  AUDIO_LIBRARY_AMBIENCE,
  AUDIO_LIBRARY_MUSIC,
  AUDIO_LIBRARY_SOUND_EFFECTS,
  audioLibraryClipsForBin,
  filterAudioLibraryClips,
} from "./audioLibraryCatalog.ts";

describe("audioLibraryCatalog", () => {
  it("keeps Space Lens audio bins empty of bundled runtime foley", () => {
    assert.equal(AUDIO_LIBRARY_SOUND_EFFECTS.length, 0);
    assert.equal(AUDIO_LIBRARY_MUSIC.length, 0);
    assert.equal(AUDIO_LIBRARY_AMBIENCE.length, 0);
    assert.equal(audioLibraryClipsForBin("effects").length, 0);
    assert.equal(audioLibraryClipsForBin("music").length, 0);
    assert.equal(audioLibraryClipsForBin("ambience").length, 0);
  });

  it("filters an empty or future player-owned clip list safely", () => {
    assert.deepEqual(
      filterAudioLibraryClips(AUDIO_LIBRARY_SOUND_EFFECTS, "gavel"),
      [],
    );
    assert.deepEqual(
      filterAudioLibraryClips(
        [
          {
            id: "user-1",
            label: "Soft whoosh",
            group: "uploads",
            groupLabel: "Uploaded",
            url: "/api/audio-assets/user-1/file",
            category: "effects",
            scope: "universal",
            status: "accepted",
            source: "uploaded",
            semanticRole: "paper-fold",
            automaticTags: ["paper", "fold"],
            playerTags: [],
            context: { object: "paper", action: "fold" },
            safety: "nonsemantic",
            durationMs: 800,
            loopable: false,
            applet: "whodunnit",
            provider: null,
            model: null,
            usageCount: 1,
            usageRefs: [],
            lastAccessedAt: null,
            readOnly: false,
          },
        ],
        "whoosh",
      ).map((clip) => clip.id),
      ["user-1"],
    );
  });
});

describe("audio library Space Lens wiring", () => {
  it("opens three exact audio categories from Assets while Storage remains accounting-only", () => {
    const storage = readFileSync(
      new URL("./StorageSettings.tsx", import.meta.url),
      "utf8",
    );
    const assets = readFileSync(
      new URL("./AssetsSettings.tsx", import.meta.url),
      "utf8",
    );
    const settings = readFileSync(
      new URL("./SettingsPanel.tsx", import.meta.url),
      "utf8",
    );
    const audioModal = readFileSync(
      new URL("./AudioLibrary.tsx", import.meta.url),
      "utf8",
    );
    const catalog = readFileSync(
      new URL("./audioLibraryCatalog.ts", import.meta.url),
      "utf8",
    );
    assert.match(settings, /scope: "storage"[\s\S]{0,180}scope: "assets"[\s\S]{0,180}scope: "network"/u);
    assert.match(assets, /AUDIO_LIBRARY_BINS\.map/u);
    assert.match(assets, /data-audio-asset-category=\{bin\}/u);
    assert.match(assets, /AudioLibraryModal/u);
    assert.doesNotMatch(storage, /AudioLibraryModal|AssetLibraryModal/u);
    assert.match(audioModal, /SanctumAudioPlayer/u);
    assert.match(audioModal, /data-audio-library-bin=\{bin\}/u);
    assert.match(audioModal, /\/api\/audio-library\?category=/u);
    assert.match(audioModal, /Mine/u);
    assert.match(audioModal, /PRISM/u);
    assert.match(audioModal, /Applet/u);
    assert.match(audioModal, /Frequently reused/u);
    assert.match(audioModal, /document\.body\.style\.overflow/u);
    assert.match(audioModal, /previouslyFocused/u);
    assert.match(storage, /\/api\/audio-assets\/cleanup/u);
    assert.match(storage, /rejected or unaccepted asset/u);
    assert.match(catalog, /music[\s\S]*effects[\s\S]*ambience/u);
    assert.doesNotMatch(catalog, /AUDIO_LIBRARY_SOUND_EFFECTS = \[[^\]]+\//u);
  });
});

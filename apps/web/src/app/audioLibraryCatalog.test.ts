import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  AUDIO_LIBRARY_MUSIC,
  AUDIO_LIBRARY_SOUND_EFFECTS,
  audioLibraryClipsForBin,
  filterAudioLibraryClips,
} from "./audioLibraryCatalog.ts";

describe("audioLibraryCatalog", () => {
  it("keeps Space Lens audio bins empty of bundled runtime foley", () => {
    assert.equal(AUDIO_LIBRARY_SOUND_EFFECTS.length, 0);
    assert.equal(AUDIO_LIBRARY_MUSIC.length, 0);
    assert.equal(audioLibraryClipsForBin("sound_effects").length, 0);
    assert.equal(audioLibraryClipsForBin("music").length, 0);
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
            source: "uploaded",
          },
        ],
        "whoosh",
      ).map((clip) => clip.id),
      ["user-1"],
    );
  });
});

describe("audio library Space Lens wiring", () => {
  it("opens Sound Effects and Music from Storage Settings", () => {
    const storage = readFileSync(
      new URL("./StorageSettings.tsx", import.meta.url),
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
    assert.match(storage, /AudioLibraryModal/u);
    assert.match(storage, /openAudioBin\("sound_effects"\)/u);
    assert.match(storage, /openAudioBin\("music"\)/u);
    assert.match(audioModal, /SanctumAudioPlayer/u);
    assert.match(audioModal, /data-audio-library-bin=\{bin\}/u);
    assert.match(audioModal, /\/api\/audio-library\?bin=/u);
    assert.match(catalog, /synthesized\/uploaded/iu);
    assert.doesNotMatch(catalog, /AUDIO_LIBRARY_SOUND_EFFECTS = \[[^\]]+\//u);
  });
});

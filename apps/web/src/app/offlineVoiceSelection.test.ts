import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  PRISM_BUILTIN_ENGLISH_VOICES,
  resolveLocalVoicePronunciationLocale,
} from "@localai/shared";
import {
  applyOfflineVoiceSelection,
  builtinVoiceSelectionValue,
  offlineVoiceOptionsForFilters,
  offlineVoiceSelectionValue,
  operatingSystemVoiceSelectionValue,
  type OfflineVoiceOption,
} from "./offlineVoiceSelection.ts";

const catalog: OfflineVoiceOption[] = [
  ...PRISM_BUILTIN_ENGLISH_VOICES.map((voice) => ({
    value: builtinVoiceSelectionValue(voice.voiceId),
    label: voice.name,
    kind: "builtin" as const,
    locale: voice.locale,
    presentation: voice.presentation,
  })),
  {
    value: operatingSystemVoiceSelectionValue("Samantha"),
    label: "Samantha",
    kind: "os",
    locale: "en-US",
  },
];

describe("offline voice selection", () => {
  it("keeps portable built-in identities independent of the host OS", () => {
    const selected = applyOfflineVoiceSelection(
      {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        systemVoiceName: "Alex",
        accentLocale: "en-US",
        pronunciationBase: "en-US",
      },
      builtinVoiceSelectionValue("voice-4"),
    );
    assert.equal(selected.baseVoiceId, "voice-4");
    assert.equal(selected.systemVoiceName, undefined);
    assert.equal(selected.pronunciationBase, "en-US");
    assert.equal(offlineVoiceSelectionValue(selected), "builtin:voice-4");
  });

  it("keeps a saved OS voice authoritative after the catalog opt-in changes", () => {
    const selected = applyOfflineVoiceSelection(
      {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        pronunciationBase: "en-GB",
      },
      operatingSystemVoiceSelectionValue("Samantha"),
    );
    assert.equal(selected.systemVoiceName, "Samantha");
    assert.equal(selected.pronunciationBase, "en-GB");
    assert.equal(offlineVoiceSelectionValue(selected), "os:Samantha");
  });

  it("filters named voices by presentation without grouping by locale", () => {
    const feminine = offlineVoiceOptionsForFilters(catalog, {
      presentation: "feminine",
    });
    assert.ok(feminine.length > 0);
    assert.ok(
      feminine.every(
        (voice) =>
          voice.kind === "builtin" &&
          voice.presentation === "feminine",
      ),
    );
    assert.ok(feminine.some((voice) => voice.label === "Pia"));
    assert.ok(feminine.some((voice) => voice.label === "Iris"));
    assert.equal(
      offlineVoiceOptionsForFilters(catalog, {
        presentation: "feminine",
      }).some((voice) => voice.kind === "os"),
      false,
    );
    assert.equal(
      offlineVoiceOptionsForFilters(catalog, {
        presentation: "any",
      }).some((voice) => voice.kind === "os"),
      true,
    );
  });

  it("preserves the full map-authored pronunciation while changing voices", () => {
    const pronunciation = {
      pronunciationBase: "en-US" as const,
      pronunciationMapPoint: { x: 0.226, y: 0.279 },
      speechprintInfluence: "southern-us-english" as const,
      speechprintStrength: "strong" as const,
      speechprintVariationSeed: "southern-demo",
    };
    const selected = applyOfflineVoiceSelection(
      {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        baseVoiceId: "voice-1",
        ...pronunciation,
      },
      builtinVoiceSelectionValue("voice-4"),
    );
    assert.equal(selected.baseVoiceId, "voice-4");
    assert.equal(selected.pronunciationBase, pronunciation.pronunciationBase);
    assert.deepEqual(
      selected.pronunciationMapPoint,
      pronunciation.pronunciationMapPoint,
    );
    assert.equal(
      selected.speechprintInfluence,
      pronunciation.speechprintInfluence,
    );
    assert.equal(selected.speechprintStrength, pronunciation.speechprintStrength);
    assert.equal(
      selected.speechprintVariationSeed,
      pronunciation.speechprintVariationSeed,
    );
    assert.equal(
      resolveLocalVoicePronunciationLocale(
        selected.pronunciationBase,
        selected.accentLocale,
      ),
      "en-US",
    );
  });
});

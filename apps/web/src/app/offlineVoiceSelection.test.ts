import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  PRISM_BUILTIN_ENGLISH_VOICES,
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
    label: voice.character,
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
      { ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1, systemVoiceName: "Alex" },
      builtinVoiceSelectionValue("voice-4"),
    );
    assert.equal(selected.baseVoiceId, "voice-4");
    assert.equal(selected.systemVoiceName, undefined);
    assert.equal(selected.accentLocale, "en-GB");
    assert.equal(offlineVoiceSelectionValue(selected), "builtin:voice-4");
  });

  it("keeps a saved OS voice authoritative after the catalog opt-in changes", () => {
    const selected = applyOfflineVoiceSelection(
      DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      operatingSystemVoiceSelectionValue("Samantha"),
      catalog,
    );
    assert.equal(selected.systemVoiceName, "Samantha");
    assert.equal(selected.accentLocale, "en-US");
    assert.equal(offlineVoiceSelectionValue(selected), "os:Samantha");
  });

  it("mixes American and British voices while filtering gender", () => {
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
    assert.deepEqual(
      new Set(feminine.map((voice) => voice.locale)),
      new Set(["en-US", "en-GB"]),
    );
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

  it("preserves pronunciation while selecting across gender and accent", () => {
    const selected = applyOfflineVoiceSelection(
      {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        baseVoiceId: "voice-1",
        pronunciationBase: "en-GB",
      },
      builtinVoiceSelectionValue("voice-5"),
      catalog,
    );
    assert.equal(
      PRISM_BUILTIN_ENGLISH_VOICES.find(
        (voice) => voice.voiceId === selected.baseVoiceId,
      )?.presentation,
      "masculine",
    );
    assert.equal(selected.pronunciationBase, "en-GB");
  });
});

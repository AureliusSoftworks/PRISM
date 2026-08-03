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
  selectOfflineVoiceAccent,
  selectOfflineVoicePresentation,
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

  it("filters exact accents and keeps OS voices under Any only", () => {
    const britishFeminine = offlineVoiceOptionsForFilters(catalog, {
      locale: "en-GB",
      presentation: "feminine",
    });
    assert.ok(britishFeminine.length > 0);
    assert.ok(
      britishFeminine.every(
        (voice) =>
          voice.kind === "builtin" &&
          voice.locale === "en-GB" &&
          voice.presentation === "feminine",
      ),
    );
    assert.equal(
      offlineVoiceOptionsForFilters(catalog, {
        locale: "en-US",
        presentation: "feminine",
      }).some((voice) => voice.kind === "os"),
      false,
    );
    assert.equal(
      offlineVoiceOptionsForFilters(catalog, {
        locale: "en-US",
        presentation: "any",
      }).some((voice) => voice.kind === "os"),
      true,
    );
  });

  it("selects a deterministic authored counterpart inside active filters", () => {
    const british = selectOfflineVoiceAccent(
      { ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1, baseVoiceId: "voice-3" },
      "en-GB",
      catalog,
      "masculine",
    );
    assert.equal(british.accentLocale, "en-GB");
    assert.equal(
      PRISM_BUILTIN_ENGLISH_VOICES.find(
        (voice) => voice.voiceId === british.baseVoiceId,
      )?.presentation,
      "masculine",
    );
    const feminine = selectOfflineVoicePresentation(
      british,
      "feminine",
      catalog,
    );
    assert.equal(feminine.accentLocale, "en-GB");
    assert.equal(
      PRISM_BUILTIN_ENGLISH_VOICES.find(
        (voice) => voice.voiceId === feminine.baseVoiceId,
      )?.presentation,
      "feminine",
    );
  });

  it("preserves an authored pronunciation override while voice filters change", () => {
    const selected = selectOfflineVoiceAccent(
      {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        baseVoiceId: "voice-1",
        pronunciationBase: "en-GB",
      },
      "en-US",
      catalog,
      "masculine",
    );
    assert.equal(selected.accentLocale, "en-US");
    assert.equal(selected.pronunciationBase, "en-GB");
  });
});

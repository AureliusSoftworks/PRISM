import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1 } from "@localai/shared";
import {
  applyOfflineVoiceSelection,
  builtinVoiceSelectionValue,
  offlineVoiceSelectionValue,
  operatingSystemVoiceSelectionValue,
} from "./offlineVoiceSelection.ts";

describe("offline voice selection", () => {
  it("keeps portable built-in identities independent of the host OS", () => {
    const selected = applyOfflineVoiceSelection(
      { ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1, systemVoiceName: "Alex" },
      builtinVoiceSelectionValue("voice-4"),
    );
    assert.equal(selected.baseVoiceId, "voice-4");
    assert.equal(selected.systemVoiceName, undefined);
    assert.equal(offlineVoiceSelectionValue(selected), "builtin:voice-4");
  });

  it("keeps a saved OS voice authoritative after the catalog opt-in changes", () => {
    const selected = applyOfflineVoiceSelection(
      DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      operatingSystemVoiceSelectionValue("Samantha"),
    );
    assert.equal(selected.systemVoiceName, "Samantha");
    assert.equal(offlineVoiceSelectionValue(selected), "os:Samantha");
  });
});

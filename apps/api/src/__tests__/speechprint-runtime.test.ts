import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  LOCAL_VOICE_SPEECHPRINT_CAPABILITIES,
  applyLocalVoiceSpeechprintToIpa,
} from "@localai/shared";
import { phonemize } from "phonemizer";

describe("Speechprint phoneme runtime snapshots", () => {
  it("pins every influence, genuine base, and strength to one qualified matrix", async () => {
    const rows: Array<{
      baseLocale: "en-US" | "en-GB";
      id: string;
      strength: string;
      ipa: string;
    }> = [];
    for (const baseLocale of ["en-US", "en-GB"] as const) {
      const ipa = (
        await phonemize(
          "Dr. Icarus can't drive PRISM 42 through river-road symbols ©™.",
          baseLocale === "en-GB" ? "en" : "en-us",
        )
      )
        .join(" ")
        .trim();
      for (const capability of LOCAL_VOICE_SPEECHPRINT_CAPABILITIES) {
        for (const strength of capability.strengths) {
          rows.push({
            baseLocale,
            id: capability.id,
            strength,
            ipa: applyLocalVoiceSpeechprintToIpa({
              ipa,
              speechprint: {
                influence: capability.id,
                strength,
                variationSeed: "snapshot-character-v1",
              },
            }).ipa,
          });
        }
      }
    }
    assert.equal(rows.length, 252);
    assert.equal(
      createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
      "5d2203640d06eaebd5ab321f18468e63c11abc7df531b6b037dccf8f0523bccf",
    );
  });
});

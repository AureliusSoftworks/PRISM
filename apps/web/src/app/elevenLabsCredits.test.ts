import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  elevenLabsCreditCheckAvailability,
  elevenLabsCreditPercentRemaining,
} from "./elevenLabsCredits.ts";

describe("ElevenLabs credit balance presentation", () => {
  it("calculates and clamps the remaining percentage", () => {
    assert.equal(
      elevenLabsCreditPercentRemaining({
        remainingCredits: 593_149,
        totalCredits: 600_005,
      }),
      99,
    );
    assert.equal(
      elevenLabsCreditPercentRemaining({
        remainingCredits: -10,
        totalCredits: 100,
      }),
      0,
    );
    assert.equal(
      elevenLabsCreditPercentRemaining({
        remainingCredits: 10,
        totalCredits: 0,
      }),
      0,
    );
  });

  it("allows only saved account keys while Prism is online", () => {
    assert.equal(
      elevenLabsCreditCheckAvailability({
        keySource: "saved",
        preferredProvider: "openai",
      }).canCheck,
      true,
    );
    assert.equal(
      elevenLabsCreditCheckAvailability({
        keySource: "saved",
        preferredProvider: "local",
      }).canCheck,
      false,
    );
    assert.match(
      elevenLabsCreditCheckAvailability({
        keySource: "server",
        preferredProvider: "openai",
      }).message,
      /balance stays private/i,
    );
  });
});

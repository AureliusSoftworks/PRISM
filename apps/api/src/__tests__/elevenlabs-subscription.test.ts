import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ElevenLabsSubscriptionError,
  getElevenLabsCreditBalance,
} from "../elevenlabs-subscription.ts";

describe("ElevenLabs subscription credits", () => {
  it("normalizes used, total, remaining, and reset values", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return new Response(
        JSON.stringify({
          tier: "creator",
          status: "active",
          character_count: 6_856,
          character_limit: 600_005,
          next_character_count_reset_unix: 1_800_000_000,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const balance = await getElevenLabsCreditBalance(
      " elevenlabs-test-key ",
      fetchImpl,
    );

    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]?.input,
      "https://api.elevenlabs.io/v1/user/subscription",
    );
    assert.equal(
      new Headers(calls[0]?.init?.headers).get("xi-api-key"),
      "elevenlabs-test-key",
    );
    assert.equal(balance.usedCredits, 6_856);
    assert.equal(balance.totalCredits, 600_005);
    assert.equal(balance.remainingCredits, 593_149);
    assert.equal(balance.resetAt, "2027-01-15T08:00:00.000Z");
    assert.equal(balance.tier, "creator");
    assert.equal(balance.status, "active");
  });

  it("explains restricted subscription permissions", async () => {
    const fetchImpl = (async () =>
      new Response("{}", { status: 403 })) as typeof fetch;

    await assert.rejects(
      () => getElevenLabsCreditBalance("restricted-key", fetchImpl),
      (error: unknown) => {
        assert.ok(error instanceof ElevenLabsSubscriptionError);
        assert.equal(error.status, 403);
        assert.match(error.message, /cannot access subscription details/i);
        return true;
      },
    );
  });

  it("rejects malformed successful responses", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ tier: "starter" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    await assert.rejects(
      () => getElevenLabsCreditBalance("test-key", fetchImpl),
      (error: unknown) => {
        assert.ok(error instanceof ElevenLabsSubscriptionError);
        assert.equal(error.status, 502);
        assert.match(error.message, /usable credit balance/i);
        return true;
      },
    );
  });
});

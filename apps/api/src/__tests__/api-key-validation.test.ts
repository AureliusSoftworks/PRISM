import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateApiKeyCredential,
  type ApiKeyValidationProvider,
} from "../api-key-validation.ts";

describe("validateApiKeyCredential", () => {
  it("checks OpenAI keys with the bearer auth header", async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), headers: new Headers(init?.headers) });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const result = await validateApiKeyCredential("openai", "sk-test", fetchImpl);

    assert.equal(result.valid, true);
    assert.equal(calls[0]?.url, "https://api.openai.com/v1/models");
    assert.equal(calls[0]?.headers.get("authorization"), "Bearer sk-test");
  });

  it("checks Anthropic keys with x-api-key and API version headers", async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), headers: new Headers(init?.headers) });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const result = await validateApiKeyCredential(
      "anthropic",
      "sk-ant-test",
      fetchImpl
    );

    assert.equal(result.valid, true);
    assert.equal(calls[0]?.url, "https://api.anthropic.com/v1/models");
    assert.equal(calls[0]?.headers.get("x-api-key"), "sk-ant-test");
    assert.equal(calls[0]?.headers.get("anthropic-version"), "2023-06-01");
  });

  it("checks ElevenLabs keys with the xi-api-key header", async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), headers: new Headers(init?.headers) });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const result = await validateApiKeyCredential(
      "elevenlabs",
      "xi-test",
      fetchImpl
    );

    assert.equal(result.valid, true);
    assert.equal(calls[0]?.url, "https://api.elevenlabs.io/v1/models");
    assert.equal(calls[0]?.headers.get("xi-api-key"), "xi-test");
  });

  it("reports rejected provider keys without throwing", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ detail: { status: "invalid_api_key" } }), {
        status: 401,
      })) as typeof fetch;

    const providers: ApiKeyValidationProvider[] = [
      "openai",
      "anthropic",
      "elevenlabs",
    ];
    for (const provider of providers) {
      const result = await validateApiKeyCredential(provider, "bad-key", fetchImpl);
      assert.equal(result.valid, false);
      assert.equal(result.status, 401);
      assert.match(result.detail ?? "", /rejected/);
    }
  });

  it("accepts ElevenLabs scoped keys that are recognized but lack model permissions", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ detail: { status: "missing_permissions" } }), {
        status: 401,
      })) as typeof fetch;

    const result = await validateApiKeyCredential(
      "elevenlabs",
      "restricted-xi-key",
      fetchImpl
    );

    assert.equal(result.valid, true);
    assert.equal(result.status, 401);
    assert.match(result.detail ?? "", /recognized/);
  });

  it("still rejects truly invalid ElevenLabs keys", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ detail: { status: "invalid_api_key" } }), {
        status: 401,
      })) as typeof fetch;

    const result = await validateApiKeyCredential(
      "elevenlabs",
      "bad-xi-key",
      fetchImpl
    );

    assert.equal(result.valid, false);
    assert.equal(result.status, 401);
    assert.match(result.detail ?? "", /rejected/);
  });
});

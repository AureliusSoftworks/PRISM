import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseHiddenBotModelIds,
  resolveNextSettings,
  sanitizeAnthropicKeyInput,
  sanitizeOpenAiKeyInput,
  type CurrentSettings,
} from "../settings.ts";

/**
 * These tests pin the PATCH /api/settings semantics. They exist because the
 * server has regressed twice on "obvious" fields:
 *   - `theme === "system"` was silently rejected, making the cycle button
 *     feel broken even though the frontend was doing the right thing.
 *   - `providerLocked` wasn't persisted, so the padlock felt random.
 * If a future change drops any of these cases, node --test will shout.
 */

function baseline(overrides: Partial<CurrentSettings> = {}): CurrentSettings {
  return {
    displayName: "Alex",
    theme: "dark",
    preferredProvider: "local",
    providerLocked: 0,
    autoMemory: 1,
    composerWritingAssist: 1,
    fallbackModelMessageStripe: 1,
    hiddenBotModelIds: "[]",
    preferredLocalModel: null,
    preferredOnlineModel: null,
    lenientLocalFallbackModel: null,
    lenientLocalImageFallbackModel: null,
    secondaryOllamaHost: null,
    comfyUiHost: null,
    preferredLocalImageModel: null,
    preferredOpenAiImageModel: null,
    comfyUiWorkflows: [],
    prismDefaultLlmModel: null,
    prismImageToolLlmModel: null,
    primaryOllamaHost: "http://localhost:11434",
    ...overrides,
  };
}

describe("resolveNextSettings — theme", () => {
  it("accepts 'light'", () => {
    const next = resolveNextSettings({ theme: "light" }, baseline());
    assert.equal(next.theme, "light");
  });

  it("accepts 'dark'", () => {
    const next = resolveNextSettings({ theme: "dark" }, baseline({ theme: "light" }));
    assert.equal(next.theme, "dark");
  });

  it("accepts 'system' (this is the previously-regressed case)", () => {
    const next = resolveNextSettings({ theme: "system" }, baseline({ theme: "dark" }));
    assert.equal(next.theme, "system");
  });

  it("keeps the stored theme when the field is missing", () => {
    const next = resolveNextSettings({}, baseline({ theme: "system" }));
    assert.equal(next.theme, "system");
  });

  it("keeps the stored theme when the value is garbage", () => {
    const next = resolveNextSettings({ theme: "purple" }, baseline({ theme: "light" }));
    assert.equal(next.theme, "light");
  });
});

describe("resolveNextSettings — displayName", () => {
  it("stores trimmed displayName", () => {
    const next = resolveNextSettings({ displayName: "  Jordan  " }, baseline());
    assert.equal(next.displayName, "Jordan");
  });

  it("keeps the stored displayName when field is missing, empty, or invalid", () => {
    const current = baseline({ displayName: "Taylor" });
    assert.equal(resolveNextSettings({}, current).displayName, "Taylor");
    assert.equal(resolveNextSettings({ displayName: "   " }, current).displayName, "Taylor");
    assert.equal(
      resolveNextSettings({ displayName: 42 as unknown as string }, current).displayName,
      "Taylor"
    );
  });

  it("caps displayName length at 80 characters", () => {
    const veryLong = `${"a".repeat(100)}`;
    const next = resolveNextSettings({ displayName: veryLong }, baseline());
    assert.equal(next.displayName.length, 80);
  });
});

describe("resolveNextSettings — preferredProvider", () => {
  it("accepts 'local', 'openai', and 'anthropic'", () => {
    assert.equal(
      resolveNextSettings({ preferredProvider: "local" }, baseline()).preferredProvider,
      "local"
    );
    assert.equal(
      resolveNextSettings({ preferredProvider: "openai" }, baseline()).preferredProvider,
      "openai"
    );
    assert.equal(
      resolveNextSettings({ preferredProvider: "anthropic" }, baseline()).preferredProvider,
      "anthropic"
    );
  });

  it("keeps the stored provider when the field is missing or invalid", () => {
    const current = baseline({ preferredProvider: "openai" });
    assert.equal(resolveNextSettings({}, current).preferredProvider, "openai");
    assert.equal(
      resolveNextSettings({ preferredProvider: "azure" }, current).preferredProvider,
      "openai"
    );
  });
});

describe("resolveNextSettings — providerLocked", () => {
  it("persists true as 1", () => {
    const next = resolveNextSettings({ providerLocked: true }, baseline());
    assert.equal(next.providerLocked, 1);
  });

  it("persists false as 0", () => {
    const next = resolveNextSettings(
      { providerLocked: false },
      baseline({ providerLocked: 1 })
    );
    assert.equal(next.providerLocked, 0);
  });

  it("keeps the stored lock when the field is missing", () => {
    const next = resolveNextSettings({}, baseline({ providerLocked: 1 }));
    assert.equal(next.providerLocked, 1);
  });

  it("ignores non-boolean values rather than coercing them", () => {
    // If a future client accidentally sends "true"/"false" strings, we want
    // the server to keep the existing value rather than silently flipping.
    const next = resolveNextSettings(
      { providerLocked: "true" as unknown as boolean },
      baseline({ providerLocked: 0 })
    );
    assert.equal(next.providerLocked, 0);
  });
});

describe("resolveNextSettings — autoMemory", () => {
  it("persists boolean values", () => {
    assert.equal(
      resolveNextSettings({ autoMemory: false }, baseline({ autoMemory: 1 })).autoMemory,
      0
    );
    assert.equal(
      resolveNextSettings({ autoMemory: true }, baseline({ autoMemory: 0 })).autoMemory,
      1
    );
  });

  it("keeps the stored value when the field is missing", () => {
    assert.equal(resolveNextSettings({}, baseline({ autoMemory: 1 })).autoMemory, 1);
  });
});

describe("resolveNextSettings — composerWritingAssist", () => {
  it("persists boolean values", () => {
    assert.equal(
      resolveNextSettings(
        { composerWritingAssist: false },
        baseline({ composerWritingAssist: 1 })
      ).composerWritingAssist,
      0
    );
    assert.equal(
      resolveNextSettings(
        { composerWritingAssist: true },
        baseline({ composerWritingAssist: 0 })
      ).composerWritingAssist,
      1
    );
  });

  it("keeps the stored value when the field is missing or invalid", () => {
    const current = baseline({ composerWritingAssist: 0 });
    assert.equal(resolveNextSettings({}, current).composerWritingAssist, 0);
    assert.equal(
      resolveNextSettings(
        { composerWritingAssist: "true" as unknown as boolean },
        current
      ).composerWritingAssist,
      0
    );
  });
});

describe("resolveNextSettings — fallbackModelMessageStripe", () => {
  it("persists boolean values", () => {
    assert.equal(
      resolveNextSettings(
        { fallbackModelMessageStripe: false },
        baseline({ fallbackModelMessageStripe: 1 })
      ).fallbackModelMessageStripe,
      0
    );
    assert.equal(
      resolveNextSettings(
        { fallbackModelMessageStripe: true },
        baseline({ fallbackModelMessageStripe: 0 })
      ).fallbackModelMessageStripe,
      1
    );
  });

  it("keeps the stored value when the field is missing or invalid", () => {
    const current = baseline({ fallbackModelMessageStripe: 0 });
    assert.equal(resolveNextSettings({}, current).fallbackModelMessageStripe, 0);
    assert.equal(
      resolveNextSettings(
        { fallbackModelMessageStripe: "false" as unknown as boolean },
        current
      ).fallbackModelMessageStripe,
      0
    );
  });
});

describe("resolveNextSettings — hiddenBotModelIds", () => {
  it("accepts a unique trimmed string list", () => {
    const next = resolveNextSettings(
      { hiddenBotModelIds: [" llama3.2 ", "llava", "llava", 42] },
      baseline()
    );
    assert.deepEqual(next.hiddenBotModelIds, ["llava"]);
  });

  it("never persists the required primary local model as hidden", () => {
    const next = resolveNextSettings(
      { hiddenBotModelIds: ["llama3.2", "gpt-4o-mini"] },
      baseline()
    );
    assert.deepEqual(next.hiddenBotModelIds, ["gpt-4o-mini"]);
  });

  it("keeps the stored list when the field is missing or invalid", () => {
    const current = baseline({
      hiddenBotModelIds: JSON.stringify(["gpt-3.5-turbo"]),
    });
    assert.deepEqual(
      resolveNextSettings({}, current).hiddenBotModelIds,
      ["gpt-3.5-turbo"]
    );
    assert.deepEqual(
      resolveNextSettings({ hiddenBotModelIds: "nope" }, current).hiddenBotModelIds,
      ["gpt-3.5-turbo"]
    );
  });
});

describe("resolveNextSettings — prismDefaultLlmModel", () => {
  it("stores trimmed override and clears with empty string", () => {
    const next = resolveNextSettings({ prismDefaultLlmModel: " mistral:latest " }, baseline());
    assert.equal(next.prismDefaultLlmModel, "mistral:latest");
    const cleared = resolveNextSettings(
      { prismDefaultLlmModel: "" },
      baseline({ prismDefaultLlmModel: "mistral:latest" })
    );
    assert.equal(cleared.prismDefaultLlmModel, null);
  });
});

describe("resolveNextSettings — prismImageToolLlmModel", () => {
  it("stores trimmed override and clears with empty string", () => {
    const next = resolveNextSettings(
      { prismImageToolLlmModel: " qwen3:latest " },
      baseline()
    );
    assert.equal(next.prismImageToolLlmModel, "qwen3:latest");
    const cleared = resolveNextSettings(
      { prismImageToolLlmModel: "" },
      baseline({ prismImageToolLlmModel: "qwen3:latest" })
    );
    assert.equal(cleared.prismImageToolLlmModel, null);
  });
});

describe("resolveNextSettings — preferred auto models", () => {
  it("stores trimmed values for local + online model hints", () => {
    const next = resolveNextSettings(
      { preferredLocalModel: " llama3.2 ", preferredOnlineModel: " gpt-4o-mini " },
      baseline()
    );
    assert.equal(next.preferredLocalModel, "llama3.2");
    assert.equal(next.preferredOnlineModel, "gpt-4o-mini");
  });

  it("clears each preference independently with empty string", () => {
    const current = baseline({
      preferredLocalModel: "llama3.2",
      preferredOnlineModel: "gpt-4o-mini",
    });
    const next = resolveNextSettings(
      { preferredLocalModel: "", preferredOnlineModel: " " },
      current
    );
    assert.equal(next.preferredLocalModel, null);
    assert.equal(next.preferredOnlineModel, null);
  });

  it("keeps existing values when invalid types are sent", () => {
    const current = baseline({
      preferredLocalModel: "llama3.2",
      preferredOnlineModel: "gpt-4o-mini",
    });
    const next = resolveNextSettings(
      {
        preferredLocalModel: 42 as unknown as string,
        preferredOnlineModel: true as unknown as string,
      },
      current
    );
    assert.equal(next.preferredLocalModel, "llama3.2");
    assert.equal(next.preferredOnlineModel, "gpt-4o-mini");
  });

  it("stores and clears the lenient local fallback model", () => {
    const stored = resolveNextSettings(
      { lenientLocalFallbackModel: " llama3.1:8b " },
      baseline()
    );
    assert.equal(stored.lenientLocalFallbackModel, "llama3.1:8b");

    const cleared = resolveNextSettings(
      { lenientLocalFallbackModel: " " },
      baseline({ lenientLocalFallbackModel: "llama3.1:8b" })
    );
    assert.equal(cleared.lenientLocalFallbackModel, null);
  });

  it("stores and clears the lenient local image fallback model", () => {
    const stored = resolveNextSettings(
      { lenientLocalImageFallbackModel: " comfyui:flux.safetensors " },
      baseline()
    );
    assert.equal(stored.lenientLocalImageFallbackModel, "comfyui:flux.safetensors");

    const cleared = resolveNextSettings(
      { lenientLocalImageFallbackModel: " " },
      baseline({ lenientLocalImageFallbackModel: "comfyui:flux.safetensors" })
    );
    assert.equal(cleared.lenientLocalImageFallbackModel, null);
  });
});

describe("parseHiddenBotModelIds", () => {
  it("falls back to an empty list for malformed stored JSON", () => {
    assert.deepEqual(parseHiddenBotModelIds("not-json"), []);
  });
});

describe("resolveNextSettings — secondaryOllamaHost", () => {
  it("normalizes a bare host into an Ollama base URL", () => {
    const next = resolveNextSettings(
      { secondaryOllamaHost: "192.168.1.50:11434/" },
      baseline()
    );
    assert.equal(next.secondaryOllamaHost, "http://192.168.1.50:11434");
  });

  it("clears the secondary host when the field is empty or null", () => {
    const current = baseline({ secondaryOllamaHost: "http://192.168.1.50:11434" });
    assert.equal(
      resolveNextSettings({ secondaryOllamaHost: "" }, current).secondaryOllamaHost,
      null
    );
    assert.equal(
      resolveNextSettings({ secondaryOllamaHost: null }, current).secondaryOllamaHost,
      null
    );
  });

  it("keeps the stored secondary host when the field is missing or invalidly typed", () => {
    const current = baseline({ secondaryOllamaHost: "http://192.168.1.50:11434" });
    assert.equal(resolveNextSettings({}, current).secondaryOllamaHost, current.secondaryOllamaHost);
    assert.equal(
      resolveNextSettings({ secondaryOllamaHost: 11434 }, current).secondaryOllamaHost,
      current.secondaryOllamaHost
    );
  });

  it("rejects loopback aliases for the primary host", () => {
    assert.throws(
      () => resolveNextSettings({ secondaryOllamaHost: "127.0.0.1:11434" }, baseline()),
      /different IP address/
    );
    assert.throws(
      () =>
        resolveNextSettings(
          { secondaryOllamaHost: "localhost:11434" },
          baseline({ primaryOllamaHost: "http://host.docker.internal:11434" })
        ),
      /different IP address/
    );
  });

  it("rejects the same IP even when the port is different", () => {
    assert.throws(
      () =>
        resolveNextSettings(
          { secondaryOllamaHost: "http://192.168.1.20:11435" },
          baseline({ primaryOllamaHost: "http://192.168.1.20:11434" })
        ),
      /different IP address/
    );
  });
});

describe("resolveNextSettings — comfyUiHost", () => {
  it("normalizes host + trims slashes", () => {
    const next = resolveNextSettings(
      { comfyUiHost: "192.168.1.10:8188/" },
      baseline()
    );
    assert.equal(next.comfyUiHost, "http://192.168.1.10:8188");
  });

  it("clears when empty string or null", () => {
    const current = baseline({ comfyUiHost: "http://127.0.0.1:8188" });
    assert.equal(resolveNextSettings({ comfyUiHost: "" }, current).comfyUiHost, null);
    assert.equal(resolveNextSettings({ comfyUiHost: null }, current).comfyUiHost, null);
  });

  it("keeps stored value when field missing or invalid type", () => {
    const current = baseline({ comfyUiHost: "http://127.0.0.1:8188" });
    assert.equal(resolveNextSettings({}, current).comfyUiHost, current.comfyUiHost);
    assert.equal(
      resolveNextSettings({ comfyUiHost: 8188 }, current).comfyUiHost,
      current.comfyUiHost
    );
  });

  it("throws on malformed URL", () => {
    assert.throws(() => resolveNextSettings({ comfyUiHost: "http://" }, baseline()), /ComfyUI host/);
  });
});

describe("resolveNextSettings — image panel model picks", () => {
  it("stores preferred local image model id", () => {
    const next = resolveNextSettings(
      { preferredLocalImageModel: "x/flux2-klein-4b" },
      baseline()
    );
    assert.equal(next.preferredLocalImageModel, "x/flux2-klein-4b");
  });

  it("stores preferred OpenAI image model id", () => {
    const next = resolveNextSettings(
      { preferredOpenAiImageModel: "dall-e-2" },
      baseline()
    );
    assert.equal(next.preferredOpenAiImageModel, "dall-e-2");
  });

  it("clears local image model when given empty string", () => {
    const current = baseline({ preferredLocalImageModel: "old" });
    assert.equal(
      resolveNextSettings({ preferredLocalImageModel: "" }, current).preferredLocalImageModel,
      null
    );
  });

  it("keeps stored ids when the patch omits them", () => {
    const current = baseline({
      preferredLocalImageModel: "comfyui:abc.safetensors",
      preferredOpenAiImageModel: "dall-e-3",
    });
    const next = resolveNextSettings({ theme: "light" }, current);
    assert.equal(next.preferredLocalImageModel, "comfyui:abc.safetensors");
    assert.equal(next.preferredOpenAiImageModel, "dall-e-3");
  });
});

describe("resolveNextSettings — openAiApiKey", () => {
  it("non-empty string is a replace", () => {
    const next = resolveNextSettings({ openAiApiKey: "sk-abc" }, baseline());
    assert.deepEqual(next.openAiKeyIntent, { action: "replace", plaintext: "sk-abc" });
  });

  it("whitespace trims, and an all-whitespace value is treated as 'keep'", () => {
    const next = resolveNextSettings({ openAiApiKey: "   " }, baseline());
    assert.deepEqual(next.openAiKeyIntent, { action: "keep" });
  });

  it("explicit null is a clear", () => {
    const next = resolveNextSettings({ openAiApiKey: null }, baseline());
    assert.deepEqual(next.openAiKeyIntent, { action: "clear" });
  });

  it("missing field is 'keep' so other PATCHes don't wipe the stored key", () => {
    const next = resolveNextSettings({}, baseline());
    assert.deepEqual(next.openAiKeyIntent, { action: "keep" });
  });

  it("strips a pasted `OPENAI_API_KEY=` prefix (the real-world foot-gun)", () => {
    // Users often copy the whole `.env` line and paste it into the Settings
    // input. Without sanitization, the saved Bearer token would be
    // `OPENAI_API_KEY=sk-...` and every chat call would 401.
    const next = resolveNextSettings(
      { openAiApiKey: "OPENAI_API_KEY=sk-proj-abc" },
      baseline()
    );
    assert.deepEqual(next.openAiKeyIntent, {
      action: "replace",
      plaintext: "sk-proj-abc",
    });
  });

  it("strips surrounding double quotes", () => {
    const next = resolveNextSettings(
      { openAiApiKey: '"sk-proj-abc"' },
      baseline()
    );
    assert.deepEqual(next.openAiKeyIntent, {
      action: "replace",
      plaintext: "sk-proj-abc",
    });
  });

  it("strips VAR= prefix + inner quotes in one pass", () => {
    const next = resolveNextSettings(
      { openAiApiKey: 'OPENAI_API_KEY="sk-proj-abc"' },
      baseline()
    );
    assert.deepEqual(next.openAiKeyIntent, {
      action: "replace",
      plaintext: "sk-proj-abc",
    });
  });
});

describe("resolveNextSettings — anthropicApiKey", () => {
  it("non-empty string is a replace", () => {
    const next = resolveNextSettings({ anthropicApiKey: "sk-ant-abc" }, baseline());
    assert.deepEqual(next.anthropicKeyIntent, {
      action: "replace",
      plaintext: "sk-ant-abc",
    });
  });

  it("whitespace keeps the stored key", () => {
    const next = resolveNextSettings({ anthropicApiKey: "   " }, baseline());
    assert.deepEqual(next.anthropicKeyIntent, { action: "keep" });
  });

  it("explicit null clears the stored key", () => {
    const next = resolveNextSettings({ anthropicApiKey: null }, baseline());
    assert.deepEqual(next.anthropicKeyIntent, { action: "clear" });
  });

  it("strips a pasted `ANTHROPIC_API_KEY=` prefix", () => {
    const next = resolveNextSettings(
      { anthropicApiKey: "ANTHROPIC_API_KEY=\"sk-ant-api03-abc\"" },
      baseline()
    );
    assert.deepEqual(next.anthropicKeyIntent, {
      action: "replace",
      plaintext: "sk-ant-api03-abc",
    });
  });
});

describe("sanitizeOpenAiKeyInput", () => {
  it("pass-through for a clean key", () => {
    assert.equal(sanitizeOpenAiKeyInput("sk-proj-abc123"), "sk-proj-abc123");
  });

  it("trims outer whitespace", () => {
    assert.equal(sanitizeOpenAiKeyInput("   sk-proj-abc  "), "sk-proj-abc");
  });

  it("strips a leading VAR= prefix (uppercase)", () => {
    assert.equal(
      sanitizeOpenAiKeyInput("OPENAI_API_KEY=sk-proj-abc"),
      "sk-proj-abc"
    );
  });

  it("strips a leading var= prefix (lowercase, case-insensitive)", () => {
    assert.equal(
      sanitizeOpenAiKeyInput("api_key=sk-proj-abc"),
      "sk-proj-abc"
    );
  });

  it("strips surrounding single quotes", () => {
    assert.equal(sanitizeOpenAiKeyInput("'sk-proj-abc'"), "sk-proj-abc");
  });

  it("strips both the VAR= prefix AND inner quotes", () => {
    assert.equal(
      sanitizeOpenAiKeyInput('OPENAI_API_KEY="sk-proj-abc"'),
      "sk-proj-abc"
    );
  });

  it("strips outer quotes first, then VAR= prefix", () => {
    assert.equal(
      sanitizeOpenAiKeyInput('"OPENAI_API_KEY=sk-proj-abc"'),
      "sk-proj-abc"
    );
  });

  it("does NOT touch a key with a dash before the first =", () => {
    // Guard against accidentally chopping a real key. Real OpenAI keys
    // start with `sk-` which contains a dash, so the VAR= regex can't
    // match them even case-insensitively.
    assert.equal(
      sanitizeOpenAiKeyInput("sk-proj-Ab12=something"),
      "sk-proj-Ab12=something"
    );
  });

  it("does NOT strip a mismatched quote pair", () => {
    assert.equal(sanitizeOpenAiKeyInput("\"sk-proj-abc"), "\"sk-proj-abc");
    assert.equal(sanitizeOpenAiKeyInput("sk-proj-abc'"), "sk-proj-abc'");
  });

  it("returns empty string for all-whitespace / pure quotes", () => {
    assert.equal(sanitizeOpenAiKeyInput("   "), "");
    assert.equal(sanitizeOpenAiKeyInput('""'), "");
  });
});

describe("sanitizeAnthropicKeyInput", () => {
  it("uses the same env-line stripping behavior as OpenAI keys", () => {
    assert.equal(
      sanitizeAnthropicKeyInput("ANTHROPIC_API_KEY='sk-ant-api03-abc'"),
      "sk-ant-api03-abc"
    );
  });
});

const minimalComfyWorkflow = (): Record<string, unknown> => ({
  "6": { class_type: "CLIPTextEncode", inputs: { text: "seed", clip: ["4", 1] } },
  "5": { class_type: "EmptyLatentImage", inputs: { width: 512, height: 512, batch_size: 1 } },
});

const minimalComfyPatch = () => ({
  positivePrompt: { nodeId: "6", inputKey: "text" },
  width: { nodeId: "5", inputKey: "width" },
  height: { nodeId: "5", inputKey: "height" },
});

describe("resolveNextSettings — comfyUiWorkflows", () => {
  it("keeps current workflows when the field is omitted", () => {
    const reg = [
      {
        id: "w1",
        label: "W",
        workflow: minimalComfyWorkflow(),
        patch: minimalComfyPatch(),
      },
    ];
    const next = resolveNextSettings({}, baseline({ comfyUiWorkflows: reg }));
    assert.deepEqual(next.comfyUiWorkflows, reg);
  });

  it("replaces workflows when a valid array is sent", () => {
    const reg = [
      {
        id: "flux-txt",
        label: "Flux",
        workflow: minimalComfyWorkflow(),
        patch: minimalComfyPatch(),
      },
    ];
    const next = resolveNextSettings({ comfyUiWorkflows: reg }, baseline());
    assert.equal(next.comfyUiWorkflows.length, 1);
    assert.equal(next.comfyUiWorkflows[0]?.id, "flux-txt");
  });

  it("throws when patch positivePrompt points at a missing input key", () => {
    assert.throws(
      () =>
        resolveNextSettings(
          {
            comfyUiWorkflows: [
              {
                id: "bad",
                label: "Bad",
                workflow: minimalComfyWorkflow(),
                patch: { positivePrompt: { nodeId: "6", inputKey: "nope" } },
              },
            ],
          },
          baseline()
        ),
      /no input/
    );
  });

  it("accepts remotePath-only binding without inline workflow", () => {
    const reg = [
      {
        id: "bind",
        label: "Bind",
        remotePath: "default/workflows/foo.json",
        patch: minimalComfyPatch(),
      },
    ];
    const next = resolveNextSettings({ comfyUiWorkflows: reg }, baseline());
    assert.equal(next.comfyUiWorkflows.length, 1);
    assert.equal(next.comfyUiWorkflows[0]?.remotePath, "default/workflows/foo.json");
    assert.equal(next.comfyUiWorkflows[0]?.workflow, undefined);
  });
});

describe("resolveNextSettings — independence", () => {
  // A partial PATCH must never clobber unrelated fields. This is the property
  // that makes the settings UI feel reliable.
  it("a lone `theme` patch doesn't touch anything else", () => {
    const current = baseline({
      theme: "dark",
      preferredProvider: "openai",
      providerLocked: 1,
      autoMemory: 0,
      composerWritingAssist: 0,
      fallbackModelMessageStripe: 0,
    });
    const next = resolveNextSettings({ theme: "system" }, current);
    assert.equal(next.theme, "system");
    assert.equal(next.preferredProvider, "openai");
    assert.equal(next.providerLocked, 1);
    assert.equal(next.autoMemory, 0);
    assert.equal(next.composerWritingAssist, 0);
    assert.equal(next.fallbackModelMessageStripe, 0);
    assert.deepEqual(next.openAiKeyIntent, { action: "keep" });
  });

  it("a lone `providerLocked` patch doesn't touch anything else", () => {
    const current = baseline({
      theme: "system",
      preferredProvider: "openai",
      providerLocked: 0,
      autoMemory: 1,
    });
    const next = resolveNextSettings({ providerLocked: true }, current);
    assert.equal(next.theme, "system");
    assert.equal(next.preferredProvider, "openai");
    assert.equal(next.providerLocked, 1);
    assert.equal(next.autoMemory, 1);
    assert.deepEqual(next.openAiKeyIntent, { action: "keep" });
  });
});

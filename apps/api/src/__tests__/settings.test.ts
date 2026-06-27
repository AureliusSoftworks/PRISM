import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DISABLED_MODEL_CHOICE } from "@localai/shared";
import {
  DEFAULT_ZEN_CANVAS_TYPING_SPEED,
  DEFAULT_ZEN_FRESH_START_GAP_MS,
  DEFAULT_ZEN_ASK_QUESTION_PATIENCE_ENABLED,
  DEFAULT_ZEN_ASK_QUESTION_PATIENCE_MS,
  DEFAULT_ZEN_MESSAGE_FONT_MAX_PX,
  DEFAULT_ZEN_MESSAGE_FONT_MIN_PX,
  DEFAULT_ZEN_MOOD_SENSITIVITY,
  DEFAULT_ZEN_RECENT_CONTEXT_MESSAGES,
  DEFAULT_ZEN_SESSION_IDLE_GAP_MS,
  DEFAULT_ZEN_WALLPAPER_BLURRED_EDGES_ENABLED,
  DEFAULT_ZEN_WALLPAPER_GRAYSCALE_ENABLED,
  DEFAULT_ZEN_WALLPAPER_OPACITY,
  DEFAULT_ZEN_WALLPAPER_REGEN_MESSAGE_INTERVAL,
  DEFAULT_ZEN_WALLPAPER_REVEAL_DELAY_MESSAGE_COUNT,
  DEFAULT_ZEN_WALLPAPER_REVEAL_SPAN_MESSAGE_COUNT,
  DEFAULT_ZEN_WALLPAPER_STYLE_NOTES,
  DEFAULT_ZEN_WALLPAPER_TEXT_MASK_ENABLED,
  MAX_ZEN_ASK_QUESTION_PATIENCE_MS,
  MAX_ZEN_CANVAS_TYPING_SPEED,
  MAX_ZEN_MESSAGE_FONT_SIZE_PX,
  MAX_ZEN_WALLPAPER_OPACITY,
  MAX_ZEN_WALLPAPER_STYLE_NOTES_LENGTH,
  MIN_ZEN_ASK_QUESTION_PATIENCE_MS,
  MIN_ZEN_CANVAS_TYPING_SPEED,
  MIN_ZEN_MESSAGE_FONT_SIZE_PX,
  MIN_ZEN_WALLPAPER_OPACITY,
  normalizeZenWallpaperStyleNotes,
  parseHiddenBotModelIds,
  parseHiddenComfyUiWorkflowIds,
  resolveNextSettings,
  sanitizeAnthropicKeyInput,
  sanitizeElevenLabsKeyInput,
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
    experimentalDualOllamaEnabled: 0,
    experimentalAllModelEffortEnabled: 0,
    psychicModeEnabled: 0,
    fallbackModelMessageStripe: 1,
    hiddenBotModelIds: "[]",
    hiddenComfyUiWorkflowIds: "[]",
    preferredLocalModel: null,
    preferredOnlineModel: null,
    lenientLocalFallbackModel: null,
    lenientLocalImageFallbackModel: null,
    secondaryOllamaHost: null,
    comfyUiHost: null,
    preferredLocalImageModel: null,
    preferredOpenAiImageModel: null,
    preferredZenWallpaperLocalImageModel: null,
    preferredZenWallpaperOpenAiImageModel: null,
    zenWallpaperOpacity: DEFAULT_ZEN_WALLPAPER_OPACITY,
    zenWallpaperTextMaskEnabled: DEFAULT_ZEN_WALLPAPER_TEXT_MASK_ENABLED ? 1 : 0,
    zenWallpaperGrayscaleEnabled: DEFAULT_ZEN_WALLPAPER_GRAYSCALE_ENABLED ? 1 : 0,
    zenWallpaperBlurredEdgesEnabled:
      DEFAULT_ZEN_WALLPAPER_BLURRED_EDGES_ENABLED ? 1 : 0,
    zenWallpaperStyleNotes: DEFAULT_ZEN_WALLPAPER_STYLE_NOTES,
    zenSessionIdleGapMs: DEFAULT_ZEN_SESSION_IDLE_GAP_MS,
    zenFreshStartGapMs: DEFAULT_ZEN_FRESH_START_GAP_MS,
    zenRecentContextMessages: DEFAULT_ZEN_RECENT_CONTEXT_MESSAGES,
    zenWallpaperRegenMessageInterval: DEFAULT_ZEN_WALLPAPER_REGEN_MESSAGE_INTERVAL,
    zenWallpaperRevealDelayMessageCount: DEFAULT_ZEN_WALLPAPER_REVEAL_DELAY_MESSAGE_COUNT,
    zenWallpaperRevealSpanMessageCount: DEFAULT_ZEN_WALLPAPER_REVEAL_SPAN_MESSAGE_COUNT,
    zenMoodSensitivity: DEFAULT_ZEN_MOOD_SENSITIVITY,
    zenCanvasTypingSpeed: DEFAULT_ZEN_CANVAS_TYPING_SPEED,
    zenMessageFontMinPx: DEFAULT_ZEN_MESSAGE_FONT_MIN_PX,
    zenMessageFontMaxPx: DEFAULT_ZEN_MESSAGE_FONT_MAX_PX,
    zenAskQuestionPatienceEnabled: DEFAULT_ZEN_ASK_QUESTION_PATIENCE_ENABLED ? 1 : 0,
    zenAskQuestionPatienceMs: DEFAULT_ZEN_ASK_QUESTION_PATIENCE_MS,
    zenAutonomyEnabled: 0,
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

describe("resolveNextSettings — experimentalDualOllamaEnabled", () => {
  it("persists boolean values", () => {
    assert.equal(
      resolveNextSettings(
        { experimentalDualOllamaEnabled: true },
        baseline({ experimentalDualOllamaEnabled: 0 })
      ).experimentalDualOllamaEnabled,
      1
    );
    assert.equal(
      resolveNextSettings(
        { experimentalDualOllamaEnabled: false },
        baseline({ experimentalDualOllamaEnabled: 1 })
      ).experimentalDualOllamaEnabled,
      0
    );
  });

  it("keeps the stored value when the field is missing or invalid", () => {
    const current = baseline({ experimentalDualOllamaEnabled: 1 });
    assert.equal(resolveNextSettings({}, current).experimentalDualOllamaEnabled, 1);
    assert.equal(
      resolveNextSettings(
        { experimentalDualOllamaEnabled: "true" as unknown as boolean },
        current
      ).experimentalDualOllamaEnabled,
      1
    );
  });
});

describe("resolveNextSettings — experimentalAllModelEffortEnabled", () => {
  it("persists boolean values", () => {
    assert.equal(
      resolveNextSettings(
        { experimentalAllModelEffortEnabled: true },
        baseline({ experimentalAllModelEffortEnabled: 0 })
      ).experimentalAllModelEffortEnabled,
      1
    );
    assert.equal(
      resolveNextSettings(
        { experimentalAllModelEffortEnabled: false },
        baseline({ experimentalAllModelEffortEnabled: 1 })
      ).experimentalAllModelEffortEnabled,
      0
    );
  });

  it("keeps the stored value when the field is missing or invalid", () => {
    const current = baseline({ experimentalAllModelEffortEnabled: 1 });
    assert.equal(resolveNextSettings({}, current).experimentalAllModelEffortEnabled, 1);
    assert.equal(
      resolveNextSettings(
        { experimentalAllModelEffortEnabled: "true" as unknown as boolean },
        current
      ).experimentalAllModelEffortEnabled,
      1
    );
  });
});

describe("resolveNextSettings — psychicModeEnabled", () => {
  it("persists boolean values", () => {
    assert.equal(
      resolveNextSettings(
        { psychicModeEnabled: true },
        baseline({ psychicModeEnabled: 0 })
      ).psychicModeEnabled,
      1
    );
    assert.equal(
      resolveNextSettings(
        { psychicModeEnabled: false },
        baseline({ psychicModeEnabled: 1 })
      ).psychicModeEnabled,
      0
    );
  });

  it("keeps the stored value when the field is missing or invalid", () => {
    const current = baseline({ psychicModeEnabled: 1 });
    assert.equal(resolveNextSettings({}, current).psychicModeEnabled, 1);
    assert.equal(
      resolveNextSettings(
        { psychicModeEnabled: "true" as unknown as boolean },
        current
      ).psychicModeEnabled,
      1
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

  it("stores disabled as an explicit internal model choice", () => {
    const next = resolveNextSettings(
      { prismDefaultLlmModel: ` ${DISABLED_MODEL_CHOICE} ` },
      baseline()
    );
    assert.equal(next.prismDefaultLlmModel, DISABLED_MODEL_CHOICE);
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

  it("stores disabled as an explicit image-request LLM choice", () => {
    const next = resolveNextSettings(
      { prismImageToolLlmModel: DISABLED_MODEL_CHOICE },
      baseline()
    );
    assert.equal(next.prismImageToolLlmModel, DISABLED_MODEL_CHOICE);
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

  it("stores disabled as an explicit local + online model hint", () => {
    const next = resolveNextSettings(
      {
        preferredLocalModel: DISABLED_MODEL_CHOICE,
        preferredOnlineModel: ` ${DISABLED_MODEL_CHOICE} `,
      },
      baseline()
    );
    assert.equal(next.preferredLocalModel, DISABLED_MODEL_CHOICE);
    assert.equal(next.preferredOnlineModel, DISABLED_MODEL_CHOICE);
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
      { preferredOpenAiImageModel: "gpt-image-1-mini" },
      baseline()
    );
    assert.equal(next.preferredOpenAiImageModel, "gpt-image-1-mini");
  });

  it("stores disabled as an explicit image panel lane choice", () => {
    const next = resolveNextSettings(
      {
        preferredLocalImageModel: DISABLED_MODEL_CHOICE,
        preferredOpenAiImageModel: DISABLED_MODEL_CHOICE,
      },
      baseline()
    );
    assert.equal(next.preferredLocalImageModel, DISABLED_MODEL_CHOICE);
    assert.equal(next.preferredOpenAiImageModel, DISABLED_MODEL_CHOICE);
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
      preferredOpenAiImageModel: "gpt-image-2",
    });
    const next = resolveNextSettings({ theme: "light" }, current);
    assert.equal(next.preferredLocalImageModel, "comfyui:abc.safetensors");
    assert.equal(next.preferredOpenAiImageModel, "gpt-image-2");
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

describe("resolveNextSettings — Zen Atmosphere model picks", () => {
  it("stores preferred local wallpaper image model id", () => {
    const next = resolveNextSettings(
      { preferredZenWallpaperLocalImageModel: "comfyui:ambient.safetensors" },
      baseline()
    );
    assert.equal(
      next.preferredZenWallpaperLocalImageModel,
      "comfyui:ambient.safetensors"
    );
  });

  it("stores preferred OpenAI wallpaper image model id", () => {
    const next = resolveNextSettings(
      { preferredZenWallpaperOpenAiImageModel: "gpt-image-2" },
      baseline()
    );
    assert.equal(next.preferredZenWallpaperOpenAiImageModel, "gpt-image-2");
  });

  it("stores disabled as an explicit Atmosphere lane choice", () => {
    const next = resolveNextSettings(
      {
        preferredZenWallpaperLocalImageModel: DISABLED_MODEL_CHOICE,
        preferredZenWallpaperOpenAiImageModel: DISABLED_MODEL_CHOICE,
      },
      baseline()
    );
    assert.equal(next.preferredZenWallpaperLocalImageModel, DISABLED_MODEL_CHOICE);
    assert.equal(next.preferredZenWallpaperOpenAiImageModel, DISABLED_MODEL_CHOICE);
  });

  it("clears wallpaper image model ids with empty strings", () => {
    const current = baseline({
      preferredZenWallpaperLocalImageModel: "old-local",
      preferredZenWallpaperOpenAiImageModel: "old-openai",
    });
    const next = resolveNextSettings(
      {
        preferredZenWallpaperLocalImageModel: "",
        preferredZenWallpaperOpenAiImageModel: "",
      },
      current
    );
    assert.equal(next.preferredZenWallpaperLocalImageModel, null);
    assert.equal(next.preferredZenWallpaperOpenAiImageModel, null);
  });

  it("keeps stored wallpaper ids when the patch omits them", () => {
    const current = baseline({
      preferredZenWallpaperLocalImageModel: "comfyui:ambient.safetensors",
      preferredZenWallpaperOpenAiImageModel: "gpt-image-2",
    });
    const next = resolveNextSettings({ theme: "light" }, current);
    assert.equal(
      next.preferredZenWallpaperLocalImageModel,
      "comfyui:ambient.safetensors"
    );
    assert.equal(next.preferredZenWallpaperOpenAiImageModel, "gpt-image-2");
  });
});

describe("resolveNextSettings — Zen Atmosphere opacity", () => {
  it("stores numeric and numeric-string opacity values", () => {
    assert.equal(
      resolveNextSettings({ zenWallpaperOpacity: 0.28 }, baseline()).zenWallpaperOpacity,
      0.28
    );
    assert.equal(
      resolveNextSettings({ zenWallpaperOpacity: "0.22" }, baseline()).zenWallpaperOpacity,
      0.22
    );
    assert.equal(
      resolveNextSettings({ zenWallpaperOpacity: 0.9 }, baseline()).zenWallpaperOpacity,
      0.9
    );
  });

  it("clamps opacity to the configured wallpaper range", () => {
    assert.equal(
      resolveNextSettings({ zenWallpaperOpacity: 0.01 }, baseline()).zenWallpaperOpacity,
      MIN_ZEN_WALLPAPER_OPACITY
    );
    assert.equal(
      resolveNextSettings({ zenWallpaperOpacity: 1.4 }, baseline()).zenWallpaperOpacity,
      MAX_ZEN_WALLPAPER_OPACITY
    );
  });

  it("keeps the stored opacity when omitted or invalid", () => {
    const current = baseline({ zenWallpaperOpacity: 0.19 });
    assert.equal(resolveNextSettings({}, current).zenWallpaperOpacity, 0.19);
    assert.equal(
      resolveNextSettings({ zenWallpaperOpacity: "nope" }, current).zenWallpaperOpacity,
      0.19
    );
  });
});

describe("resolveNextSettings — Zen Atmosphere text mask", () => {
  it("enforces the text-mask compatibility field even when clients send false", () => {
    assert.equal(
      resolveNextSettings({ zenWallpaperTextMaskEnabled: false }, baseline())
        .zenWallpaperTextMaskEnabled,
      true
    );
    assert.equal(
      resolveNextSettings(
        { zenWallpaperTextMaskEnabled: true },
        baseline({ zenWallpaperTextMaskEnabled: 0 })
      ).zenWallpaperTextMaskEnabled,
      true
    );
  });

  it("ignores stored false and invalid text-mask values", () => {
    const current = baseline({ zenWallpaperTextMaskEnabled: 0 });
    assert.equal(resolveNextSettings({}, current).zenWallpaperTextMaskEnabled, true);
    assert.equal(
      resolveNextSettings(
        { zenWallpaperTextMaskEnabled: "sometimes" },
        current
      ).zenWallpaperTextMaskEnabled,
      true
    );
  });
});

describe("resolveNextSettings — Zen Atmosphere grayscale", () => {
  it("stores the grayscale preference from boolean values", () => {
    assert.equal(
      resolveNextSettings({ zenWallpaperGrayscaleEnabled: true }, baseline())
        .zenWallpaperGrayscaleEnabled,
      true
    );
    assert.equal(
      resolveNextSettings(
        { zenWallpaperGrayscaleEnabled: false },
        baseline({ zenWallpaperGrayscaleEnabled: 1 })
      ).zenWallpaperGrayscaleEnabled,
      false
    );
  });

  it("preserves stored false and falls back for invalid grayscale values", () => {
    const current = baseline({ zenWallpaperGrayscaleEnabled: 0 });
    assert.equal(resolveNextSettings({}, current).zenWallpaperGrayscaleEnabled, false);
    assert.equal(
      resolveNextSettings(
        { zenWallpaperGrayscaleEnabled: "sometimes" },
        current
      ).zenWallpaperGrayscaleEnabled,
      false
    );
  });
});

describe("resolveNextSettings — Zen Atmosphere blurred edges", () => {
  it("stores the edge blur preference", () => {
    assert.equal(
      resolveNextSettings({ zenWallpaperBlurredEdgesEnabled: false }, baseline())
        .zenWallpaperBlurredEdgesEnabled,
      false
    );
    assert.equal(
      resolveNextSettings(
        { zenWallpaperBlurredEdgesEnabled: true },
        baseline({ zenWallpaperBlurredEdgesEnabled: 0 })
      ).zenWallpaperBlurredEdgesEnabled,
      true
    );
  });

  it("keeps the stored edge blur value when omitted or invalid", () => {
    const current = baseline({ zenWallpaperBlurredEdgesEnabled: 0 });
    assert.equal(
      resolveNextSettings({}, current).zenWallpaperBlurredEdgesEnabled,
      false
    );
    assert.equal(
      resolveNextSettings(
        { zenWallpaperBlurredEdgesEnabled: "sometimes" },
        current
      ).zenWallpaperBlurredEdgesEnabled,
      false
    );
  });
});

describe("resolveNextSettings — Zen Atmosphere style notes", () => {
  it("stores normalized style notes", () => {
    const next = resolveNextSettings(
      { zenWallpaperStyleNotes: "  misty\n glass,   paper grain  " },
      baseline()
    );

    assert.equal(next.zenWallpaperStyleNotes, "misty glass, paper grain");
  });

  it("clamps style notes to the configured limit", () => {
    const longNotes = "a".repeat(MAX_ZEN_WALLPAPER_STYLE_NOTES_LENGTH + 25);
    const next = resolveNextSettings(
      { zenWallpaperStyleNotes: longNotes },
      baseline()
    );

    assert.equal(
      next.zenWallpaperStyleNotes.length,
      MAX_ZEN_WALLPAPER_STYLE_NOTES_LENGTH
    );
    assert.equal(
      normalizeZenWallpaperStyleNotes(longNotes),
      "a".repeat(MAX_ZEN_WALLPAPER_STYLE_NOTES_LENGTH)
    );
  });

  it("clears style notes with an empty string", () => {
    const next = resolveNextSettings(
      { zenWallpaperStyleNotes: "   " },
      baseline({ zenWallpaperStyleNotes: "misty glass" })
    );

    assert.equal(next.zenWallpaperStyleNotes, "");
  });

  it("keeps stored style notes when omitted or invalid", () => {
    const current = baseline({ zenWallpaperStyleNotes: "woven texture" });

    assert.equal(resolveNextSettings({}, current).zenWallpaperStyleNotes, "woven texture");
    assert.equal(
      resolveNextSettings({ zenWallpaperStyleNotes: false }, current)
        .zenWallpaperStyleNotes,
      "woven texture"
    );
  });
});

describe("resolveNextSettings — Zen Mode settings", () => {
  it("stores Zen session and context settings", () => {
    const next = resolveNextSettings(
      {
        zenSessionIdleGapMs: 2 * 60 * 60 * 1000,
        zenFreshStartGapMs: 3 * 24 * 60 * 60 * 1000,
        zenRecentContextMessages: 42,
        zenWallpaperRegenMessageInterval: 24,
        zenWallpaperRevealDelayMessageCount: 3,
        zenWallpaperRevealSpanMessageCount: 10,
      },
      baseline()
    );

    assert.equal(next.zenSessionIdleGapMs, 2 * 60 * 60 * 1000);
    assert.equal(next.zenFreshStartGapMs, 3 * 24 * 60 * 60 * 1000);
    assert.equal(next.zenRecentContextMessages, 42);
    assert.equal(next.zenWallpaperRegenMessageInterval, 24);
    assert.equal(next.zenWallpaperRevealDelayMessageCount, 3);
    assert.equal(next.zenWallpaperRevealSpanMessageCount, 10);
  });

  it("keeps stored values when omitted or invalid", () => {
    const current = baseline({
      zenSessionIdleGapMs: 4 * 60 * 60 * 1000,
      zenFreshStartGapMs: 4 * 24 * 60 * 60 * 1000,
      zenRecentContextMessages: 44,
      zenWallpaperRegenMessageInterval: 40,
      zenWallpaperRevealDelayMessageCount: 6,
      zenWallpaperRevealSpanMessageCount: 16,
    });

    const next = resolveNextSettings(
      {
        zenSessionIdleGapMs: "nope",
        zenFreshStartGapMs: false,
        zenRecentContextMessages: null,
        zenWallpaperRegenMessageInterval: undefined,
        zenWallpaperRevealDelayMessageCount: "still nope",
        zenWallpaperRevealSpanMessageCount: Number.NaN,
      },
      current
    );

    assert.equal(next.zenSessionIdleGapMs, current.zenSessionIdleGapMs);
    assert.equal(next.zenFreshStartGapMs, current.zenFreshStartGapMs);
    assert.equal(next.zenRecentContextMessages, current.zenRecentContextMessages);
    assert.equal(next.zenWallpaperRegenMessageInterval, current.zenWallpaperRegenMessageInterval);
    assert.equal(
      next.zenWallpaperRevealDelayMessageCount,
      current.zenWallpaperRevealDelayMessageCount
    );
    assert.equal(
      next.zenWallpaperRevealSpanMessageCount,
      current.zenWallpaperRevealSpanMessageCount
    );
  });

  it("clamps fresh starts to happen no earlier than the idle session break", () => {
    const next = resolveNextSettings(
      {
        zenSessionIdleGapMs: 20 * 60 * 60 * 1000,
        zenFreshStartGapMs: 2 * 60 * 60 * 1000,
      },
      baseline()
    );

    assert.equal(next.zenSessionIdleGapMs, 20 * 60 * 60 * 1000);
    assert.equal(next.zenFreshStartGapMs, 20 * 60 * 60 * 1000);
  });

  it("clamps context and wallpaper counts to sane bounds", () => {
    const low = resolveNextSettings(
      {
        zenRecentContextMessages: 1,
        zenWallpaperRegenMessageInterval: 1,
        zenWallpaperRevealDelayMessageCount: -2,
        zenWallpaperRevealSpanMessageCount: 0,
      },
      baseline()
    );
    const high = resolveNextSettings(
      {
        zenRecentContextMessages: 999,
        zenWallpaperRegenMessageInterval: 999,
        zenWallpaperRevealDelayMessageCount: 999,
        zenWallpaperRevealSpanMessageCount: 999,
      },
      baseline()
    );

    assert.equal(low.zenRecentContextMessages, 10);
    assert.equal(low.zenWallpaperRegenMessageInterval, 3);
    assert.equal(low.zenWallpaperRevealDelayMessageCount, 0);
    assert.equal(low.zenWallpaperRevealSpanMessageCount, 1);
    assert.equal(high.zenRecentContextMessages, 80);
    assert.equal(high.zenWallpaperRegenMessageInterval, 100);
    assert.equal(high.zenWallpaperRevealDelayMessageCount, 20);
    assert.equal(high.zenWallpaperRevealSpanMessageCount, 50);
  });

  it("clamps Zen mood sensitivity while preserving current value for invalid input", () => {
    const current = baseline({ zenMoodSensitivity: 0.35 });
    assert.equal(resolveNextSettings({ zenMoodSensitivity: 0.8 }, current).zenMoodSensitivity, 0.8);
    assert.equal(resolveNextSettings({ zenMoodSensitivity: -1 }, current).zenMoodSensitivity, 0);
    assert.equal(resolveNextSettings({ zenMoodSensitivity: 2 }, current).zenMoodSensitivity, 1);
    assert.equal(
      resolveNextSettings({ zenMoodSensitivity: "nope" }, current).zenMoodSensitivity,
      0.35
    );
  });

  it("stores Zen canvas typing speed", () => {
    const next = resolveNextSettings({ zenCanvasTypingSpeed: 1.6 }, baseline());

    assert.equal(next.zenCanvasTypingSpeed, 1.6);
  });

  it("clamps Zen canvas typing speed while preserving current value for invalid input", () => {
    const current = baseline({ zenCanvasTypingSpeed: 1.25 });
    assert.equal(
      resolveNextSettings({ zenCanvasTypingSpeed: 0.1 }, current).zenCanvasTypingSpeed,
      MIN_ZEN_CANVAS_TYPING_SPEED
    );
    assert.equal(
      resolveNextSettings({ zenCanvasTypingSpeed: 5 }, current).zenCanvasTypingSpeed,
      MAX_ZEN_CANVAS_TYPING_SPEED
    );
    assert.equal(
      resolveNextSettings({ zenCanvasTypingSpeed: 1.234 }, current).zenCanvasTypingSpeed,
      1.23
    );
    assert.equal(
      resolveNextSettings({ zenCanvasTypingSpeed: "nope" }, current).zenCanvasTypingSpeed,
      1.25
    );
  });

  it("stores Zen message font bounds", () => {
    const next = resolveNextSettings(
      {
        zenMessageFontMinPx: 17.2,
        zenMessageFontMaxPx: 34.6,
      },
      baseline()
    );

    assert.equal(next.zenMessageFontMinPx, 17.2);
    assert.equal(next.zenMessageFontMaxPx, 34.6);
  });

  it("clamps Zen message font bounds while preserving current values for invalid input", () => {
    const current = baseline({
      zenMessageFontMinPx: 16.4,
      zenMessageFontMaxPx: 31.6,
    });

    assert.equal(
      resolveNextSettings({ zenMessageFontMinPx: 2 }, current).zenMessageFontMinPx,
      MIN_ZEN_MESSAGE_FONT_SIZE_PX
    );
    assert.equal(
      resolveNextSettings({ zenMessageFontMaxPx: 90 }, current).zenMessageFontMaxPx,
      MAX_ZEN_MESSAGE_FONT_SIZE_PX
    );
    assert.equal(
      resolveNextSettings({ zenMessageFontMinPx: 17.24 }, current).zenMessageFontMinPx,
      17.2
    );
    assert.equal(
      resolveNextSettings({ zenMessageFontMaxPx: 31.66 }, current).zenMessageFontMaxPx,
      31.7
    );
    assert.equal(
      resolveNextSettings({ zenMessageFontMinPx: "nope" }, current).zenMessageFontMinPx,
      16.4
    );
    assert.equal(
      resolveNextSettings({ zenMessageFontMaxPx: "nope" }, current).zenMessageFontMaxPx,
      31.6
    );
  });

  it("keeps Zen message max at or above the selected min", () => {
    const next = resolveNextSettings(
      {
        zenMessageFontMinPx: 24,
        zenMessageFontMaxPx: 18,
      },
      baseline()
    );

    assert.equal(next.zenMessageFontMinPx, 24);
    assert.equal(next.zenMessageFontMaxPx, 24);
  });

  it("stores AskQuestion patience timer settings", () => {
    const next = resolveNextSettings(
      {
        zenAskQuestionPatienceEnabled: true,
        zenAskQuestionPatienceMs: 40_000,
      },
      baseline()
    );

    assert.equal(next.zenAskQuestionPatienceEnabled, true);
    assert.equal(next.zenAskQuestionPatienceMs, 40_000);
  });

  it("clamps AskQuestion patience timing while preserving invalid values", () => {
    const current = baseline({
      zenAskQuestionPatienceEnabled: 1,
      zenAskQuestionPatienceMs: 50_000,
    });
    const low = resolveNextSettings({ zenAskQuestionPatienceMs: 1_000 }, current);
    const high = resolveNextSettings({ zenAskQuestionPatienceMs: 999_000 }, current);
    const stepped = resolveNextSettings({ zenAskQuestionPatienceMs: 45_000 }, current);
    const invalid = resolveNextSettings(
      {
        zenAskQuestionPatienceEnabled: "sometimes",
        zenAskQuestionPatienceMs: "nope",
      },
      current
    );

    assert.equal(low.zenAskQuestionPatienceMs, MIN_ZEN_ASK_QUESTION_PATIENCE_MS);
    assert.equal(high.zenAskQuestionPatienceMs, MAX_ZEN_ASK_QUESTION_PATIENCE_MS);
    assert.equal(stepped.zenAskQuestionPatienceMs, 50_000);
    assert.equal(invalid.zenAskQuestionPatienceEnabled, true);
    assert.equal(invalid.zenAskQuestionPatienceMs, 50_000);
  });

  it("stores Zen Autonomy while preserving current value for invalid input", () => {
    assert.equal(
      resolveNextSettings({ zenAutonomyEnabled: true }, baseline()).zenAutonomyEnabled,
      true
    );
    assert.equal(
      resolveNextSettings({ zenAutonomyEnabled: false }, baseline({ zenAutonomyEnabled: 1 }))
        .zenAutonomyEnabled,
      false
    );
    assert.equal(
      resolveNextSettings({}, baseline({ zenAutonomyEnabled: 1 })).zenAutonomyEnabled,
      true
    );
    assert.equal(
      resolveNextSettings(
        { zenAutonomyEnabled: "nope" },
        baseline({ zenAutonomyEnabled: 1 })
      ).zenAutonomyEnabled,
      true
    );
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

describe("resolveNextSettings — elevenLabsApiKey", () => {
  it("non-empty string is a replace", () => {
    const next = resolveNextSettings({ elevenLabsApiKey: "xi-abc" }, baseline());
    assert.deepEqual(next.elevenLabsKeyIntent, {
      action: "replace",
      plaintext: "xi-abc",
    });
  });

  it("whitespace keeps the stored key", () => {
    const next = resolveNextSettings({ elevenLabsApiKey: "   " }, baseline());
    assert.deepEqual(next.elevenLabsKeyIntent, { action: "keep" });
  });

  it("explicit null clears the stored key", () => {
    const next = resolveNextSettings({ elevenLabsApiKey: null }, baseline());
    assert.deepEqual(next.elevenLabsKeyIntent, { action: "clear" });
  });

  it("strips a pasted `ELEVENLABS_API_KEY=` prefix", () => {
    const next = resolveNextSettings(
      { elevenLabsApiKey: "ELEVENLABS_API_KEY=\"xi-abc\"" },
      baseline()
    );
    assert.deepEqual(next.elevenLabsKeyIntent, {
      action: "replace",
      plaintext: "xi-abc",
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

describe("sanitizeElevenLabsKeyInput", () => {
  it("uses the same env-line stripping behavior as OpenAI keys", () => {
    assert.equal(
      sanitizeElevenLabsKeyInput("ELEVENLABS_API_KEY='xi-abc'"),
      "xi-abc"
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

describe("resolveNextSettings — hiddenComfyUiWorkflowIds", () => {
  it("keeps current hidden workflows when the field is omitted", () => {
    const current = JSON.stringify(["comfyui-remote:default%2Fworkflows%2Fhidden.json"]);
    const next = resolveNextSettings(
      {},
      baseline({ hiddenComfyUiWorkflowIds: current })
    );
    assert.deepEqual(next.hiddenComfyUiWorkflowIds, [
      "comfyui-remote:default%2Fworkflows%2Fhidden.json",
    ]);
  });

  it("accepts only ComfyUI workflow model ids", () => {
    const next = resolveNextSettings(
      {
        hiddenComfyUiWorkflowIds: [
          " comfyui-remote:default%2Fworkflows%2Fhidden.json ",
          "comfyui-workflow:legacy",
          "llama3.2",
          "not-a-workflow",
        ],
      },
      baseline()
    );
    assert.deepEqual(next.hiddenComfyUiWorkflowIds, [
      "comfyui-remote:default%2Fworkflows%2Fhidden.json",
      "comfyui-workflow:legacy",
    ]);
  });

  it("parses stored hidden workflows defensively", () => {
    assert.deepEqual(
      parseHiddenComfyUiWorkflowIds(
        JSON.stringify([
          "comfyui-remote:workflows%2Fscene.json",
          "comfyui-remote:workflows%2Fscene.json",
          "gpt-5",
        ])
      ),
      ["comfyui-remote:workflows%2Fscene.json"]
    );
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

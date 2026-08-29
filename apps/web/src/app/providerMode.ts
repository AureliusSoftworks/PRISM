import { DISABLED_MODEL_CHOICE, isDisabledModelChoice } from "@localai/shared";

export type Provider = "local" | "ollama_cloud" | "openai" | "anthropic";
/** Global foreground ONLINE controls are deliberately OpenAI/Anthropic-only. */
export type OnlineProvider = "openai" | "anthropic";
export type ResponseMode = "local" | "online";
export type AutoResponseMode = ResponseMode | "auto";

const AUTO_MODEL_CHOICE = "auto";
export const OPENAI_FALLBACK_CHAT_MODEL_ID = "gpt-4o-mini";
export const ANTHROPIC_FALLBACK_CHAT_MODEL_ID = "claude-sonnet-4-6";

export interface ProviderModeModelOption {
  id: string;
  provider: Provider;
  disabledReason?: string;
  supportsStructuredOutput?: boolean;
  /** False only when Settings hides this enabled model from manual pickers. */
  showInGlobalPicker?: boolean;
}

export type ModelChoiceByProvider = Partial<Record<Provider, string>>;

export function normalizeProviderModeModelChoice(
  value: string | null | undefined
): string {
  const trimmed = value?.trim() ?? "";
  if (isDisabledModelChoice(trimmed)) return AUTO_MODEL_CHOICE;
  return trimmed.length > 0 ? trimmed : AUTO_MODEL_CHOICE;
}

export function responseModeForProvider(provider: Provider): ResponseMode {
  return provider === "local" ? "local" : "online";
}

export function nextResponseMode(mode: ResponseMode): ResponseMode {
  return mode === "local" ? "online" : "local";
}

export function autoResponseModeForProvider(
  provider: Provider,
  _autoEnabled: boolean,
  _autoAllowed = true
): AutoResponseMode {
  return responseModeForProvider(provider);
}

/**
 * Hard LOCAL privacy blocks online capabilities (Premium voice, ElevenLabs
 * credit checks, etc.). Auto model selection stays inside the active lane.
 */
export function blocksOnlineCapabilities(mode: AutoResponseMode): boolean {
  return mode === "local";
}

export function isOnlineProvider(provider: Provider): provider is OnlineProvider {
  return provider === "openai" || provider === "anthropic";
}

export function onlineProviderFallback(provider: Provider): OnlineProvider {
  return provider === "anthropic" ? "anthropic" : "openai";
}

export function fallbackOnlineModelIdsForProvider(
  provider: OnlineProvider,
  preferredOnlineModel?: string | null
): string[] {
  if (!isOnlineProvider(provider)) return [];
  const ids: string[] = [];
  const preferred = normalizeProviderModeModelChoice(preferredOnlineModel);
  if (preferred !== AUTO_MODEL_CHOICE && preferred !== DISABLED_MODEL_CHOICE) {
    const preferredProvider = inferOnlineProviderForModelChoice(
      preferred,
      [],
      provider
    );
    if (preferredProvider === provider) {
      ids.push(preferred);
    }
  }

  ids.push(
    provider === "anthropic"
      ? ANTHROPIC_FALLBACK_CHAT_MODEL_ID
      : provider === "openai"
        ? OPENAI_FALLBACK_CHAT_MODEL_ID
        : ""
  );

  return Array.from(new Set(ids.filter(Boolean)));
}

export function combinedOnlineModelOptions<T extends ProviderModeModelOption>(
  ...optionGroups: readonly (readonly T[])[]
): T[] {
  const seen = new Set<string>();
  return optionGroups.flatMap((options) =>
    options.filter((model) => {
      if (!isOnlineProvider(model.provider)) return false;
      const key = `${model.provider}:${model.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  );
}

export function filterVisibleModelOptions<T extends ProviderModeModelOption>(
  options: readonly T[],
  hiddenModelIds: readonly string[]
): T[] {
  const hidden = new Set(hiddenModelIds.map((id) => id.trim()).filter(Boolean));
  return options.filter(
    (model) => !hidden.has(model.id) && model.showInGlobalPicker !== false,
  );
}

export function filterVisibleOnlineModelOptions<T extends ProviderModeModelOption>(
  options: readonly T[],
  hiddenModelIds: readonly string[]
): T[] {
  return filterVisibleModelOptions(options, hiddenModelIds).filter(
    (model) => isOnlineProvider(model.provider),
  );
}

/**
 * Global picker visibility is player-owned. Capability-limited applets keep a
 * checked model visible and explain why it cannot run there instead of
 * silently removing it from the shared picker.
 */
export function markStructuredOutputModelsUnavailable<
  T extends ProviderModeModelOption,
>(options: readonly T[], surfaceLabel: string): T[] {
  return options.map((model) =>
    model.supportsStructuredOutput === false
      ? {
          ...model,
          disabledReason:
            model.disabledReason ??
            `${surfaceLabel} requires structured output, which this model's provider does not support yet.`,
        }
      : model,
  );
}

export function inferOnlineProviderForModelChoice(
  choice: string | null | undefined,
  onlineOptions: readonly ProviderModeModelOption[],
  fallbackProvider: Provider = "openai"
): OnlineProvider {
  const normalized = normalizeProviderModeModelChoice(choice);
  if (normalized === DISABLED_MODEL_CHOICE) {
    return onlineProviderFallback(fallbackProvider);
  }
  if (normalized !== AUTO_MODEL_CHOICE) {
    const exact = onlineOptions.find(
      (model) =>
        model.id === normalized &&
        isOnlineProvider(model.provider) &&
        !model.disabledReason
    );
    if (exact && isOnlineProvider(exact.provider)) return exact.provider;
    const id = normalized.toLowerCase();
    return id.startsWith("claude-") ? "anthropic" : "openai";
  }

  const firstAvailable = onlineOptions.find(
    (model) => isOnlineProvider(model.provider) && !model.disabledReason
  );
  if (firstAvailable && isOnlineProvider(firstAvailable.provider)) {
    return firstAvailable.provider;
  }
  return onlineProviderFallback(fallbackProvider);
}

export function resolveModelChoiceForResponseMode(args: {
  responseMode: ResponseMode;
  providerPreference: Provider;
  choices: ModelChoiceByProvider;
  onlineOptions: readonly ProviderModeModelOption[];
}): { provider: Provider; modelChoice: string } {
  if (args.responseMode === "local") {
    return {
      provider: "local",
      modelChoice: normalizeProviderModeModelChoice(args.choices.local),
    };
  }

  const preferredProvider = onlineProviderFallback(args.providerPreference);
  const otherProvider: OnlineProvider =
    preferredProvider === "openai" ? "anthropic" : "openai";
  const preferredChoice = normalizeProviderModeModelChoice(
    args.choices[preferredProvider]
  );
  if (preferredChoice === DISABLED_MODEL_CHOICE) {
    return {
      provider: preferredProvider,
      modelChoice: preferredChoice,
    };
  }
  if (preferredChoice !== AUTO_MODEL_CHOICE) {
    return {
      provider: inferOnlineProviderForModelChoice(
        preferredChoice,
        args.onlineOptions,
        preferredProvider
      ),
      modelChoice: preferredChoice,
    };
  }

  const otherChoice = normalizeProviderModeModelChoice(args.choices[otherProvider]);
  if (
    otherChoice !== AUTO_MODEL_CHOICE &&
    otherChoice !== DISABLED_MODEL_CHOICE
  ) {
    return {
      provider: inferOnlineProviderForModelChoice(
        otherChoice,
        args.onlineOptions,
        otherProvider
      ),
      modelChoice: otherChoice,
    };
  }

  return {
    provider: inferOnlineProviderForModelChoice(
      AUTO_MODEL_CHOICE,
      args.onlineOptions,
      preferredProvider
    ),
    modelChoice: AUTO_MODEL_CHOICE,
  };
}

export function applyOnlineModelChoice(args: {
  currentChoices: ModelChoiceByProvider;
  nextChoice: string;
  onlineOptions: readonly ProviderModeModelOption[];
  providerPreference: Provider;
}): { provider: OnlineProvider; choices: Record<Provider, string> } {
  const normalized = normalizeProviderModeModelChoice(args.nextChoice);
  const provider = inferOnlineProviderForModelChoice(
    normalized,
    args.onlineOptions,
    args.providerPreference
  );
  return {
    provider,
    choices: {
      local: normalizeProviderModeModelChoice(args.currentChoices.local),
      // A stale global Cloud model is never carried forward into foreground
      // state. Cloud remains selectable only in its dedicated background lane.
      ollama_cloud: AUTO_MODEL_CHOICE,
      openai: provider === "openai" ? normalized : AUTO_MODEL_CHOICE,
      anthropic: provider === "anthropic" ? normalized : AUTO_MODEL_CHOICE,
    },
  };
}

export function applyModelChoiceForResponseMode(args: {
  responseMode: AutoResponseMode;
  currentChoices: ModelChoiceByProvider;
  nextChoice: string;
  options: readonly ProviderModeModelOption[];
  providerPreference: Provider;
}): { provider: Provider; choices: Record<Provider, string> } {
  const normalized = normalizeProviderModeModelChoice(args.nextChoice);
  const selectedOption =
    normalized === AUTO_MODEL_CHOICE
      ? null
      : (args.options.find(
          (option) => option.id === normalized && !option.disabledReason,
        ) ?? null);
  const selectedProvider = selectedOption?.provider ?? args.providerPreference;

  if (args.responseMode === "auto" && normalized === AUTO_MODEL_CHOICE) {
    if (args.providerPreference === "local") {
      return {
        provider: "local",
        choices: {
          local: AUTO_MODEL_CHOICE,
          ollama_cloud: normalizeProviderModeModelChoice(
            args.currentChoices.ollama_cloud,
          ),
          openai: normalizeProviderModeModelChoice(args.currentChoices.openai),
          anthropic: normalizeProviderModeModelChoice(args.currentChoices.anthropic),
        },
      };
    }
    const provider = onlineProviderFallback(args.providerPreference);
    return {
      provider,
      choices: {
        local: normalizeProviderModeModelChoice(args.currentChoices.local),
        ollama_cloud: AUTO_MODEL_CHOICE,
        openai: AUTO_MODEL_CHOICE,
        anthropic: AUTO_MODEL_CHOICE,
      },
    };
  }

  if (
    args.responseMode === "local" ||
    (args.responseMode === "auto" && selectedProvider === "local")
  ) {
    return {
      provider: "local",
      choices: {
        local: normalized,
        ollama_cloud: normalizeProviderModeModelChoice(
          args.currentChoices.ollama_cloud,
        ),
        openai: normalizeProviderModeModelChoice(args.currentChoices.openai),
        anthropic: normalizeProviderModeModelChoice(args.currentChoices.anthropic),
      },
    };
  }

  return applyOnlineModelChoice({
    currentChoices: args.currentChoices,
    nextChoice: normalized,
    onlineOptions: args.options,
    providerPreference: selectedProvider,
  });
}

import { DISABLED_MODEL_CHOICE, isDisabledModelChoice } from "@localai/shared";

export type Provider = "local" | "openai" | "anthropic";
export type OnlineProvider = Exclude<Provider, "local">;
export type ResponseMode = "local" | "online";
export type AutoResponseMode = ResponseMode | "auto";

const AUTO_MODEL_CHOICE = "auto";
export const OPENAI_FALLBACK_CHAT_MODEL_ID = "gpt-4o-mini";
export const ANTHROPIC_FALLBACK_CHAT_MODEL_ID = "claude-sonnet-4-6";

export interface ProviderModeModelOption {
  id: string;
  provider: Provider;
  disabledReason?: string;
}

export type ModelChoiceByProvider = Partial<Record<Provider, string>>;

export function normalizeProviderModeModelChoice(
  value: string | null | undefined
): string {
  const trimmed = value?.trim() ?? "";
  if (isDisabledModelChoice(trimmed)) return DISABLED_MODEL_CHOICE;
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
  autoEnabled: boolean,
  autoAllowed = true
): AutoResponseMode {
  return autoEnabled && autoAllowed ? "auto" : responseModeForProvider(provider);
}

export function isOnlineProvider(provider: Provider): provider is OnlineProvider {
  return provider !== "local";
}

export function onlineProviderFallback(provider: Provider): OnlineProvider {
  return provider === "anthropic" ? "anthropic" : "openai";
}

export function fallbackOnlineModelIdsForProvider(
  provider: OnlineProvider,
  preferredOnlineModel?: string | null
): string[] {
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
      : OPENAI_FALLBACK_CHAT_MODEL_ID
  );

  return Array.from(new Set(ids));
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
  return options.filter((model) => !hidden.has(model.id));
}

export function filterVisibleOnlineModelOptions<T extends ProviderModeModelOption>(
  options: readonly T[],
  hiddenModelIds: readonly string[]
): T[] {
  return filterVisibleModelOptions(options, hiddenModelIds);
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
    return normalized.toLowerCase().startsWith("claude-") ? "anthropic" : "openai";
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
    normalized === AUTO_MODEL_CHOICE || normalized === DISABLED_MODEL_CHOICE
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

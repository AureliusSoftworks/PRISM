export type Provider = "local" | "openai" | "anthropic";
export type OnlineProvider = Exclude<Provider, "local">;
export type ResponseMode = "local" | "online";

const AUTO_MODEL_CHOICE = "auto";

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
  return trimmed.length > 0 ? trimmed : AUTO_MODEL_CHOICE;
}

export function responseModeForProvider(provider: Provider): ResponseMode {
  return provider === "local" ? "local" : "online";
}

export function nextResponseMode(mode: ResponseMode): ResponseMode {
  return mode === "local" ? "online" : "local";
}

export function isOnlineProvider(provider: Provider): provider is OnlineProvider {
  return provider !== "local";
}

export function onlineProviderFallback(provider: Provider): OnlineProvider {
  return provider === "anthropic" ? "anthropic" : "openai";
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

export function filterVisibleOnlineModelOptions<T extends ProviderModeModelOption>(
  options: readonly T[],
  hiddenModelIds: readonly string[]
): T[] {
  const hidden = new Set(hiddenModelIds.map((id) => id.trim()).filter(Boolean));
  return options.filter((model) => !hidden.has(model.id));
}

export function inferOnlineProviderForModelChoice(
  choice: string | null | undefined,
  onlineOptions: readonly ProviderModeModelOption[],
  fallbackProvider: Provider = "openai"
): OnlineProvider {
  const normalized = normalizeProviderModeModelChoice(choice);
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
  if (otherChoice !== AUTO_MODEL_CHOICE) {
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

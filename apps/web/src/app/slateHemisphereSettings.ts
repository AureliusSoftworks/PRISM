import type {
  SlateAiProvider,
  SlateDeliberationConfig,
  SlateProseMode,
} from "@localai/shared";

export interface SlateHemisphereModelOption {
  id: string;
  label: string;
  provider: SlateAiProvider;
  disabledReason?: string;
}

export interface SlateHemisphereSettingsSnapshot {
  projectId: string;
  projectTitle: string;
  proseMode: SlateProseMode;
  config: SlateDeliberationConfig;
  modelOptions: SlateHemisphereModelOption[];
}

export interface SlateHemisphereSettingsUpdate {
  projectId: string;
  config: SlateDeliberationConfig;
  revision: number;
}

export function emptySlateDeliberationConfig(): SlateDeliberationConfig {
  return {
    lux: { provider: null, model: null, directive: "" },
    umbra: { provider: null, model: null, directive: "" },
  };
}

export const FIRST_RUN_WELCOME_STORAGE_KEY = "prism_first_run_welcome_v1";
export const FIRST_RUN_SETUP_STORAGE_KEY = "prism_desktop_first_run_complete_v3";

export function clearFirstRunSetupCompletion(storage: {
  removeItem(key: string): void;
}): boolean {
  try {
    storage.removeItem(FIRST_RUN_SETUP_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export type FirstRunSetupStepId =
  | "place"
  | "provider"
  | "openai"
  | "anthropic"
  | "elevenlabs"
  | "local-model"
  | "online-model"
  | "auto-models"
  | "ready";

export interface FirstRunSetupStep {
  id: FirstRunSetupStepId;
  title: string;
  shortTitle: string;
  optional: boolean;
}

export const FIRST_RUN_SETUP_STEPS: readonly FirstRunSetupStep[] = [
  { id: "place", title: "Welcome home", shortTitle: "Welcome", optional: false },
  { id: "provider", title: "Choose your home base", shortTitle: "Privacy", optional: false },
  { id: "openai", title: "Connect OpenAI", shortTitle: "OpenAI", optional: true },
  { id: "anthropic", title: "Connect Anthropic", shortTitle: "Anthropic", optional: true },
  { id: "elevenlabs", title: "Connect ElevenLabs", shortTitle: "Voice", optional: true },
  { id: "local-model", title: "Pick your local default", shortTitle: "Local model", optional: true },
  { id: "online-model", title: "Pick your online default", shortTitle: "Online model", optional: true },
  { id: "auto-models", title: "Meet Auto recovery", shortTitle: "Auto", optional: true },
  { id: "ready", title: "Your place is ready", shortTitle: "Ready", optional: false },
] as const;

export function clampFirstRunSetupStepIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(FIRST_RUN_SETUP_STEPS.length - 1, Math.floor(index)));
}

export function firstRunSetupStepAt(index: number): FirstRunSetupStep {
  return FIRST_RUN_SETUP_STEPS[clampFirstRunSetupStepIndex(index)]!;
}

export function firstRunSetupProgressPercent(index: number): number {
  if (FIRST_RUN_SETUP_STEPS.length <= 1) return 100;
  return (clampFirstRunSetupStepIndex(index) / (FIRST_RUN_SETUP_STEPS.length - 1)) * 100;
}

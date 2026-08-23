export const FIRST_RUN_WELCOME_STORAGE_KEY = "prism_first_run_welcome_v1";
export const FIRST_RUN_SETUP_STORAGE_KEY = "prism_desktop_first_run_complete_v4";

export const FIRST_RUN_BATCH_FOUNDRY_GUIDANCE =
  "Batch Foundry opens its own constellation chamber, not Avatar Studio: it automatically creates and saves 2–10 bots from rich full drafts with optional Powers, revealing each saved bot in its fixed mini-avatar slot before opening one model-authored Library group. At 11–100 bots, it switches visibly to lean personality-first generation with Powers and bespoke avatar, Ink, and SFX customization off; every member still receives a persona-aware voice and saved Accent Map casting. Fictional and original personas keep Accent Map pronunciation off until you enable it; historically accurate real-person castings and curated real-person Marketplace installs begin with it on. The same fixed slots use static micro faces inside each generated color-and-glyph orb, and recoverable progress still saves automatically.";

export const FIRST_RUN_BOT_DIRECTED_SETUP_GUIDANCE =
  "In an editable Signal, Debate, or Story setup, hold Option to Wield Prism and capture a concrete bot tile. That bot stays fixed while the applet builds the rest of the editable setup around them; nothing begins until you choose the session’s start action.";

export const FIRST_RUN_COFFEE_GROUP_GUIDANCE =
  "Coffee Groups begin with an explicit choice of 2–5 Library bots. Configure bots changes those permanent members later; Invited and Away only change the next session, and saved sessions keep their original cast.";

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
  | "atmosphere"
  | "provider"
  | "openai"
  | "anthropic"
  | "elevenlabs"
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
  {
    id: "atmosphere",
    title: "Choose your first atmosphere",
    shortTitle: "Atmosphere",
    optional: false,
  },
  {
    id: "provider",
    title: "Choose your chat home base",
    shortTitle: "Chat privacy",
    optional: false,
  },
  { id: "openai", title: "Connect OpenAI", shortTitle: "OpenAI", optional: true },
  { id: "anthropic", title: "Connect Anthropic", shortTitle: "Anthropic", optional: true },
  {
    id: "elevenlabs",
    title: "Premium voice & music",
    shortTitle: "Voice & music",
    optional: true,
  },
  {
    id: "auto-models",
    title: "Meet contextual Auto",
    shortTitle: "Auto",
    optional: true,
  },
  { id: "ready", title: "Your place is ready", shortTitle: "Ready", optional: false },
] as const;

export function clampFirstRunSetupStepIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(
    0,
    Math.min(FIRST_RUN_SETUP_STEPS.length - 1, Math.floor(index)),
  );
}

export function firstRunSetupStepAt(index: number): FirstRunSetupStep {
  return FIRST_RUN_SETUP_STEPS[clampFirstRunSetupStepIndex(index)]!;
}

export function firstRunSetupProgressPercent(index: number): number {
  if (FIRST_RUN_SETUP_STEPS.length <= 1) return 100;
  return (clampFirstRunSetupStepIndex(index) / (FIRST_RUN_SETUP_STEPS.length - 1)) * 100;
}

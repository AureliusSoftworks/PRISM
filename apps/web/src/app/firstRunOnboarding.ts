export const FIRST_RUN_WELCOME_STORAGE_KEY = "prism_first_run_welcome_v1";
export const FIRST_RUN_SETUP_STORAGE_KEY = "prism_desktop_first_run_complete_v4";

export const FULLSCREEN_REFRACTION_GUIDANCE =
  "For a fullscreen refraction, X or Escape asks before cancelling. Keep waiting leaves generation running; confirming means you will have to regenerate the interrupted asset. Previously saved assets stay unchanged. Time remaining is an estimate from similar completed runs when available, and is unknown if no reliable estimate exists or the estimate is exceeded. Docked jobs and saved session preparation keep their own controls.";

const FIRST_RUN_BATCH_FOUNDRY_GUIDANCE_BASE =
  "Batch Foundry opens its own constellation chamber, not Avatar Studio: it automatically creates and saves 2–10 bots from rich full drafts with optional Powers, revealing each saved bot in its fixed mini-avatar slot before opening one model-authored Library group. Cursed Tongue is always a censor performance: public text uses visible bullet masks and voices replace each mask with an electronic censor beep, without generating a hidden uncensored curse word. At 11–100 bots, it switches visibly to lean personality-first generation with Powers and bespoke avatar, Ink, and SFX customization off; every member still receives a persona-aware voice and saved Accent Map casting. New casts keep pronunciation help off until you enable it separately in the TTS or Premium voice tab; curated real-person Marketplace installs preserve their established pronunciation-help defaults. The same fixed slots use static micro faces inside each generated color-and-glyph orb, and recoverable progress still saves automatically.";

export const FIRST_RUN_BATCH_FOUNDRY_GUIDANCE =
  FIRST_RUN_BATCH_FOUNDRY_GUIDANCE_BASE.replace(
    "static micro faces inside each generated color-and-glyph orb",
    "glyph-only Micro identities inside each generated color-and-glyph orb",
  );

const FIRST_RUN_BOT_DIRECTED_SETUP_GUIDANCE_BASE =
  "In an editable Signal, Debate, or Story setup, hold Option to Wield Prism and capture a concrete bot tile. That bot stays fixed while the applet builds the rest of the editable setup around them; nothing begins until you choose the session’s start action. Avatar Studio’s Ink Display also has an explicit Refract Ink prompt: it creates a bounded editable draft, never imported picture data, and nothing is saved until the Studio Save or Create action. In Whodunnit, Mystery Venue can propose an estate, vessel, habitat, facility, transport, or stranger setting from an optional description and an explicit investigation length; the proposal creates no art or library item until you choose Use Proposal. Its frozen intent keeps archetype, era, physical scale, and exclusions authoritative, while investigation length and the separately editable four-to-eight suspect count control only the playable subset. A disclosed generic fallback needs confirmation and a mismatch cannot be accepted. Production then reports whether Exterior, clue props, Mosaic rooms and their optional Upgraded derivatives, Music, Ambience, and Performance voices can be created before Case Forge begins. In Whodunnit Cast, Wielding a cast container opens a prompt-free Library group picker that stays open for repeated rerolls, while Wielding an individual seat or Library tile replaces that seat with a random Library bot. In Signal Rehearse, named stage presets carry only placement, cameras, screen treatment, room mix, and saved voice levels between shows; they never replace a show’s identity, cast, or artwork. Signal’s separate I Feel Lucky! shortcut is the intentional exception: it chooses the whole booking and immediately starts the show.";

export const FIRST_RUN_BOT_DIRECTED_SETUP_GUIDANCE =
  `${FIRST_RUN_BOT_DIRECTED_SETUP_GUIDANCE_BASE} ${FULLSCREEN_REFRACTION_GUIDANCE}`;

export const FIRST_RUN_COFFEE_GROUP_GUIDANCE =
  "Coffee Groups begin with an explicit choice of 2–5 Library bots. Configure bots changes those permanent members later; Invited and Away only change the next session, and saved sessions keep their original cast. Each new group also starts with one of five bundled café songs selected at random, while Custom voice and music synthesis remains explicit and privacy-gated.";

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
  | "ollama-cloud"
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
  {
    id: "ollama-cloud",
    title: "Connect Ollama Cloud",
    shortTitle: "Ollama Cloud",
    optional: true,
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

export const PRISM_APPLET_ORDER = [
  "chat",
  "zen",
  "arena",
  "polling",
  "coffee",
  "botcast",
  "feed",
  "games",
  "story",
  "gym",
  "slate",
  "pseudo",
  "surf",
] as const;

export type PrismAppletId = (typeof PRISM_APPLET_ORDER)[number];

export type PrismAppletStatus = "active" | "preview" | "planned";
export type BotPowerMuteModePolicy =
  | "enforced"
  | "not_applicable"
  | "required_before_activation";
export type BotPowerCandorModePolicy =
  | "direct"
  | "cue"
  | "adapted"
  | "irrelevant"
  | "deferred";
export type BotPowerEchoModePolicy = BotPowerMuteModePolicy;
export type BotPowerHearingRepeatModePolicy =
  | "cue"
  | "enforced"
  | "adapted"
  | "not_applicable"
  | "required_before_activation";
export type BotPowerGhostModePolicy =
  | "direct"
  | "cue"
  | "adapted"
  | "irrelevant"
  | "deferred";
export type BotPowerAvatarScaleModePolicy = BotPowerGhostModePolicy;
export type BotPowerVoicePresenceModePolicy = BotPowerGhostModePolicy;
export type BotPowerIntermittentMuteModePolicy =
  BotPowerHearingRepeatModePolicy;
export type BotPowerResponseBudgetModePolicy = BotPowerGhostModePolicy;
export type BotPowerInterruptionModePolicy = BotPowerGhostModePolicy;

export interface PrismAppletVersion {
  id: PrismAppletId;
  name: string;
  version: string;
  status: PrismAppletStatus;
}

export const PRISM_APPLETS: Record<PrismAppletId, PrismAppletVersion> = {
  chat: {
    id: "chat",
    name: "Chat",
    version: "1.11",
    status: "active",
  },
  zen: {
    id: "zen",
    name: "Zen",
    version: "1.10",
    status: "active",
  },
  arena: {
    id: "arena",
    name: "Arena",
    version: "0.0",
    status: "planned",
  },
  polling: {
    id: "polling",
    name: "Polling",
    version: "0.0",
    status: "planned",
  },
  coffee: {
    id: "coffee",
    name: "Coffee",
    version: "2.4",
    status: "active",
  },
  botcast: {
    id: "botcast",
    name: "Signal",
    version: "1.10",
    status: "active",
  },
  feed: {
    id: "feed",
    name: "Feed",
    version: "0.0",
    status: "planned",
  },
  games: {
    id: "games",
    name: "Games",
    version: "0.0",
    status: "planned",
  },
  story: {
    id: "story",
    name: "Story",
    version: "0.8",
    status: "preview",
  },
  gym: {
    id: "gym",
    name: "Gym",
    version: "0.0",
    status: "planned",
  },
  slate: {
    id: "slate",
    name: "Slate",
    version: "0.7",
    status: "preview",
  },
  pseudo: {
    id: "pseudo",
    name: "Pseudo",
    version: "0.0",
    status: "planned",
  },
  surf: {
    id: "surf",
    name: "Surf",
    version: "0.0",
    status: "planned",
  },
};

/** Every future bot-embodying applet must enforce mute before it can activate. */
export const BOT_POWER_MUTE_MODE_POLICY: Record<PrismAppletId, BotPowerMuteModePolicy> = {
  chat: "enforced",
  zen: "enforced",
  arena: "required_before_activation",
  polling: "required_before_activation",
  coffee: "enforced",
  botcast: "enforced",
  feed: "required_before_activation",
  games: "required_before_activation",
  story: "enforced",
  gym: "required_before_activation",
  slate: "not_applicable",
  pseudo: "required_before_activation",
  surf: "required_before_activation",
};

/** Exhaustive candor policy: future applets cannot inherit social pressure silently. */
export const BOT_POWER_CANDOR_MODE_POLICY: Record<PrismAppletId, BotPowerCandorModePolicy> = {
  chat: "cue",
  zen: "cue",
  arena: "deferred",
  polling: "deferred",
  coffee: "direct",
  botcast: "direct",
  feed: "deferred",
  games: "deferred",
  story: "adapted",
  gym: "deferred",
  slate: "irrelevant",
  pseudo: "deferred",
  surf: "deferred",
};

/** Every future bot-embodying applet must enforce addressed-speech echo before activation. */
export const BOT_POWER_ECHO_MODE_POLICY: Record<PrismAppletId, BotPowerEchoModePolicy> = {
  chat: "enforced",
  zen: "enforced",
  arena: "required_before_activation",
  polling: "required_before_activation",
  coffee: "enforced",
  botcast: "enforced",
  feed: "required_before_activation",
  games: "required_before_activation",
  story: "enforced",
  gym: "required_before_activation",
  slate: "not_applicable",
  pseudo: "required_before_activation",
  surf: "required_before_activation",
};

/** Exhaustive hard-of-hearing policy: planned conversational modes must choose a mood model first. */
export const BOT_POWER_HEARING_REPEAT_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerHearingRepeatModePolicy
> = {
  chat: "cue",
  zen: "cue",
  arena: "required_before_activation",
  polling: "required_before_activation",
  coffee: "enforced",
  botcast: "adapted",
  feed: "required_before_activation",
  games: "required_before_activation",
  story: "cue",
  gym: "required_before_activation",
  slate: "not_applicable",
  pseudo: "required_before_activation",
  surf: "required_before_activation",
};

/** Exhaustive ghost-Power policy: live avatars reveal only for speech. */
export const BOT_POWER_GHOST_MODE_POLICY: Record<PrismAppletId, BotPowerGhostModePolicy> = {
  chat: "direct",
  zen: "direct",
  arena: "deferred",
  polling: "deferred",
  coffee: "direct",
  botcast: "direct",
  feed: "deferred",
  games: "deferred",
  story: "adapted",
  gym: "deferred",
  slate: "irrelevant",
  pseudo: "deferred",
  surf: "deferred",
};

/** Exhaustive size-Power policy: bot embodiments share one restrained relative scale. */
export const BOT_POWER_AVATAR_SCALE_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerAvatarScaleModePolicy
> = {
  chat: "direct",
  zen: "direct",
  arena: "deferred",
  polling: "deferred",
  coffee: "direct",
  botcast: "direct",
  feed: "deferred",
  games: "deferred",
  story: "adapted",
  gym: "deferred",
  slate: "irrelevant",
  pseudo: "deferred",
  surf: "deferred",
};

/** Exhaustive voice-presence policy: text and fixed gain share one restrained trim. */
export const BOT_POWER_VOICE_PRESENCE_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerVoicePresenceModePolicy
> = {
  chat: "direct",
  zen: "direct",
  arena: "deferred",
  polling: "deferred",
  coffee: "direct",
  botcast: "direct",
  feed: "deferred",
  games: "deferred",
  story: "adapted",
  gym: "deferred",
  slate: "irrelevant",
  pseudo: "deferred",
  surf: "deferred",
};

/** Quiet's stable half-mute needs an explicit mood adaptation in every live bot mode. */
export const BOT_POWER_INTERMITTENT_MUTE_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerIntermittentMuteModePolicy
> = {
  chat: "enforced",
  zen: "enforced",
  arena: "required_before_activation",
  polling: "required_before_activation",
  coffee: "enforced",
  botcast: "enforced",
  feed: "required_before_activation",
  games: "required_before_activation",
  story: "adapted",
  gym: "required_before_activation",
  slate: "not_applicable",
  pseudo: "required_before_activation",
  surf: "required_before_activation",
};

/** Exhaustive response-budget policy: prose constraints adapt to each mode's required beats. */
export const BOT_POWER_RESPONSE_BUDGET_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerResponseBudgetModePolicy
> = {
  chat: "direct",
  zen: "direct",
  arena: "deferred",
  polling: "deferred",
  coffee: "adapted",
  botcast: "adapted",
  feed: "deferred",
  games: "deferred",
  story: "adapted",
  gym: "deferred",
  slate: "irrelevant",
  pseudo: "deferred",
  surf: "deferred",
};

/** Exhaustive interruption policy: each mode owns how live conversational openings work. */
export const BOT_POWER_INTERRUPTION_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerInterruptionModePolicy
> = {
  chat: "cue",
  zen: "cue",
  arena: "deferred",
  polling: "deferred",
  coffee: "direct",
  botcast: "adapted",
  feed: "deferred",
  games: "deferred",
  story: "adapted",
  gym: "deferred",
  slate: "irrelevant",
  pseudo: "deferred",
  surf: "deferred",
};

export const PRISM_TOP_LEVEL_SWITCHER_APPLET_IDS = [
  "chat",
  "coffee",
  "botcast",
  "slate",
] as const satisfies readonly PrismAppletId[];

export function prismTopLevelSwitcherApplets(): PrismAppletVersion[] {
  return PRISM_TOP_LEVEL_SWITCHER_APPLET_IDS.map((appletId) => PRISM_APPLETS[appletId]).filter(
    (applet) => applet.status !== "planned"
  );
}

export function prismPlannedRoadmapApplets(): PrismAppletVersion[] {
  return PRISM_APPLET_ORDER
    .map((appletId) => PRISM_APPLETS[appletId])
    .filter((applet) => applet.status === "planned");
}

export function prismAppletVersionLabel(appletId: PrismAppletId): string {
  return `v${PRISM_APPLETS[appletId].version}`;
}

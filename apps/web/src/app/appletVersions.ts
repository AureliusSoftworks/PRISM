export const PRISM_APPLET_ORDER = [
  "chat",
  "zen",
  "debate",
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
export type BotPowerBreathlessModePolicy = BotPowerMuteModePolicy;
export type BotPowerCandorModePolicy =
  | "direct"
  | "cue"
  | "adapted"
  | "irrelevant"
  | "deferred";
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
export type BotPowerAvatarColorCycleModePolicy = BotPowerGhostModePolicy;
export type BotPowerAvatarVisibilityModePolicy = BotPowerGhostModePolicy;
export type BotPowerVoicePresenceModePolicy = BotPowerGhostModePolicy;
export type BotPowerSpeechObfuscationModePolicy = BotPowerGhostModePolicy;
export type BotPowerCursedTongueModePolicy = BotPowerGhostModePolicy;
export type BotPowerAddressedFandomModePolicy = BotPowerGhostModePolicy;
export type BotPowerCredulityModePolicy = BotPowerGhostModePolicy;
export type BotPowerAntiTruthModePolicy = BotPowerGhostModePolicy;
export type BotPowerIntermittentMuteModePolicy =
  BotPowerHearingRepeatModePolicy;
export type BotPowerIntermittentAudibilityModePolicy = BotPowerGhostModePolicy;
export type BotPowerAnnoyanceModePolicy = BotPowerGhostModePolicy;
export type BotPowerResponseBudgetModePolicy = BotPowerGhostModePolicy;
export type BotPowerInterruptionModePolicy = BotPowerGhostModePolicy;
export type BotPowerIdentityMirrorModePolicy = BotPowerGhostModePolicy;
export type BotPowerIdentityShapeshiftModePolicy = BotPowerGhostModePolicy;
export type BotPowerFalseNameModePolicy = BotPowerGhostModePolicy;
export type BotPowerEternalIntroductionModePolicy = BotPowerGhostModePolicy;
export type BotPowerMoodBoostModePolicy = BotPowerGhostModePolicy;
export type BotPowerMoodDrainModePolicy = BotPowerGhostModePolicy;
export type BotPowerThemeCompoundModePolicy = BotPowerGhostModePolicy;
export type BotPowerSpectralPerceptionModePolicy = BotPowerGhostModePolicy;
export type BotPowerImmunityModePolicy = BotPowerGhostModePolicy;
export type BotPowerIneptitudeModePolicy = BotPowerGhostModePolicy;
export type BotPowerDesignationModePolicy = BotPowerGhostModePolicy;

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
    version: "1.41",
    status: "active",
  },
  zen: {
    id: "zen",
    name: "Zen",
    version: "1.40",
    status: "active",
  },
  debate: {
    id: "debate",
    name: "Debate",
    version: "0.34",
    status: "preview",
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
    version: "2.54",
    status: "active",
  },
  botcast: {
    id: "botcast",
    name: "Signal",
    version: "1.67",
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
    version: "0.33",
    status: "planned",
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
    version: "0.9",
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

/** The holder changes other bot names; hearers may take one soft social reaction beat. */
export const BOT_POWER_DESIGNATION_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerDesignationModePolicy
> = {
  chat: "cue",
  zen: "cue",
  debate: "direct",
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

/** Participant perception stays separate from the human live/replay projection. */
export const BOT_POWER_SPECTRAL_PERCEPTION_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerSpectralPerceptionModePolicy
> = {
  chat: "direct",
  zen: "direct",
  debate: "direct",
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

/** Other bots' Powers disappear only through the holder's participant view. */
export const BOT_POWER_IMMUNITY_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerImmunityModePolicy
> = {
  chat: "direct",
  zen: "direct",
  debate: "direct",
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

/** The holder visibly botches every instruction and bot-authored production role. */
export const BOT_POWER_INEPTITUDE_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerIneptitudeModePolicy
> = {
  chat: "direct",
  zen: "direct",
  debate: "adapted",
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

/** The holder's authored color stays the resting fallback in every projection. */
export const BOT_POWER_AVATAR_COLOR_CYCLE_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerAvatarColorCycleModePolicy
> = {
  chat: "direct",
  zen: "direct",
  debate: "direct",
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

/** Direct-address identity theft exists only where bots can address bots at runtime. */
export const BOT_POWER_IDENTITY_MIRROR_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerIdentityMirrorModePolicy
> = {
  chat: "irrelevant",
  zen: "irrelevant",
  debate: "direct",
  polling: "deferred",
  coffee: "direct",
  botcast: "direct",
  feed: "deferred",
  games: "deferred",
  story: "cue",
  gym: "deferred",
  slate: "irrelevant",
  pseudo: "deferred",
  surf: "deferred",
};

/** Session-sticky Library/Marketplace public form; reshuffles with short-term amnesia. */
export const BOT_POWER_IDENTITY_SHAPESHIFT_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerIdentityShapeshiftModePolicy
> = {
  chat: "direct",
  zen: "direct",
  debate: "direct",
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

/** Session-sticky believed persona name; reshuffles with short-term amnesia. */
export const BOT_POWER_FALSE_NAME_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerFalseNameModePolicy
> = {
  chat: "direct",
  zen: "direct",
  debate: "direct",
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

/** Every holder turn gets only the current other-speaker message and no older continuity. */
export const BOT_POWER_ETERNAL_INTRODUCTION_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerEternalIntroductionModePolicy
> = {
  chat: "direct",
  zen: "direct",
  debate: "adapted",
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

/**
 * Every future bot-embodying applet must implement mute before the applet
 * activates. This is a shipping requirement, never a bot eligibility gate.
 */
export const BOT_POWER_MUTE_MODE_POLICY: Record<PrismAppletId, BotPowerMuteModePolicy> = {
  chat: "enforced",
  zen: "enforced",
  debate: "enforced",
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

/**
 * Every future bot-embodying applet must suppress lung Foley for breathless
 * holders before the applet activates. Speech remains; breath Foley does not.
 */
export const BOT_POWER_BREATHLESS_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerBreathlessModePolicy
> = {
  chat: "enforced",
  zen: "enforced",
  debate: "enforced",
  polling: "required_before_activation",
  coffee: "enforced",
  botcast: "enforced",
  feed: "required_before_activation",
  games: "required_before_activation",
  story: "required_before_activation",
  gym: "required_before_activation",
  slate: "not_applicable",
  pseudo: "required_before_activation",
  surf: "required_before_activation",
};


/** Exhaustive gullibility policy: holder believes claims; soft cue in 1:1, direct in social modes. */
export const BOT_POWER_CREDULITY_MODE_POLICY: Record<PrismAppletId, BotPowerCredulityModePolicy> = {
  chat: "cue",
  zen: "cue",
  debate: "direct",
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

/** Exhaustive anti-truth policy: soft lies always; hard invert on addressed questions in live modes. */
export const BOT_POWER_ANTI_TRUTH_MODE_POLICY: Record<PrismAppletId, BotPowerAntiTruthModePolicy> = {
  chat: "direct",
  zen: "direct",
  debate: "adapted",
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

/** Exhaustive candor policy: future applets cannot inherit social pressure silently. */
export const BOT_POWER_CANDOR_MODE_POLICY: Record<PrismAppletId, BotPowerCandorModePolicy> = {
  chat: "cue",
  zen: "cue",
  debate: "direct",
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

/** Exhaustive current-addressee fandom policy: participant modes must name their focus. */
export const BOT_POWER_ADDRESSED_FANDOM_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerAddressedFandomModePolicy
> = {
  chat: "direct",
  zen: "direct",
  debate: "adapted",
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

/** Addressed recipient uplift is cue-only in 1:1 lanes and stateful in social modes. */
export const BOT_POWER_MOOD_BOOST_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerMoodBoostModePolicy
> = {
  chat: "cue",
  zen: "cue",
  debate: "adapted",
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

/** Direct-addresser mood drain is cue-only in 1:1 lanes and stateful in social modes. */
export const BOT_POWER_MOOD_DRAIN_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerMoodDrainModePolicy
> = {
  chat: "cue",
  zen: "cue",
  debate: "adapted",
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

/** Resolved-theme compounds reuse the exact active Joy/Sad policy per branch. */
export const BOT_POWER_THEME_COMPOUND_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerThemeCompoundModePolicy
> = {
  chat: "cue",
  zen: "cue",
  debate: "adapted",
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

/** Exhaustive hard-of-hearing policy: planned conversational modes must choose a mood model first. */
export const BOT_POWER_HEARING_REPEAT_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerHearingRepeatModePolicy
> = {
  chat: "cue",
  zen: "cue",
  debate: "enforced",
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
  debate: "direct",
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

/** Exhaustive visibility-Power policy: hidden and translucent are stable embodied states. */
export const BOT_POWER_AVATAR_VISIBILITY_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerAvatarVisibilityModePolicy
> = {
  chat: "direct",
  zen: "direct",
  debate: "direct",
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

/** Exhaustive six-tier size policy: embodiments use canonical scale and edge bias. */
export const BOT_POWER_AVATAR_SCALE_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerAvatarScaleModePolicy
> = {
  chat: "direct",
  zen: "direct",
  debate: "direct",
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
  debate: "direct",
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

/** Quiet listener rolls exist only where another bot can receive the line. */
export const BOT_POWER_INTERMITTENT_AUDIBILITY_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerIntermittentAudibilityModePolicy
> = {
  chat: "irrelevant",
  zen: "irrelevant",
  debate: "adapted",
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

/** Loud annoyance targets exactly one eligible audible bot, never the player. */
export const BOT_POWER_ANNOYANCE_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerAnnoyanceModePolicy
> = {
  chat: "irrelevant",
  zen: "irrelevant",
  debate: "adapted",
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

/** Exhaustive mumbling policy: only persisted public gibberish reaches listeners. */
export const BOT_POWER_SPEECH_OBFUSCATION_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerSpeechObfuscationModePolicy
> = {
  chat: "direct",
  zen: "direct",
  debate: "direct",
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

/** Public profanity is direct in live speech lanes and adapted to formal records. */
export const BOT_POWER_CURSED_TONGUE_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerCursedTongueModePolicy
> = {
  chat: "direct",
  zen: "direct",
  debate: "adapted",
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

/** Arbitrary intermittent-mute Powers retain an explicit mood adaptation in every live bot mode. */
export const BOT_POWER_INTERMITTENT_MUTE_MODE_POLICY: Record<
  PrismAppletId,
  BotPowerIntermittentMuteModePolicy
> = {
  chat: "enforced",
  zen: "enforced",
  debate: "enforced",
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
  debate: "adapted",
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
  debate: "adapted",
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
  "zen",
  "coffee",
  "debate",
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

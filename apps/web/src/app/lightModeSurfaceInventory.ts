import type { PrismAppletId, PrismAppletStatus } from "./appletVersions.ts";
import type { PrismSurfaceId } from "./prismSurfaceRegistry.ts";

/**
 * Whole-product Light-mode inventory.
 *
 * This is intentionally executable data rather than an audit document. The
 * companion test discovers every render-bearing TSX/CSS file and compares it
 * with the groups below, so adding a new surface without classifying it fails
 * loudly. Visual approval remains a separate, authenticated QA gate.
 */
export const PRISM_LIGHT_MODE_STATE_FAMILIES = [
  "entry",
  "setup",
  "loading",
  "empty",
  "permission",
  "live",
  "completed",
  "cancelled",
  "replay",
  "archive",
  "error",
  "modal",
  "popover",
  "interaction",
  "disabled",
  "responsive",
] as const;

export type PrismLightModeStateFamily =
  (typeof PRISM_LIGHT_MODE_STATE_FAMILIES)[number];

export type PrismLightModeStateOwnership =
  | "shared-source"
  | "applet-exception"
  | "not-player-visible";

export type PrismLightModeLifecycleContract = Record<
  PrismLightModeStateFamily,
  PrismLightModeStateOwnership
>;

function lifecycleContract(
  defaultOwnership: PrismLightModeStateOwnership,
  overrides: Partial<PrismLightModeLifecycleContract> = {},
): PrismLightModeLifecycleContract {
  return Object.fromEntries(
    PRISM_LIGHT_MODE_STATE_FAMILIES.map((state) => [
      state,
      overrides[state] ?? defaultOwnership,
    ]),
  ) as PrismLightModeLifecycleContract;
}

export interface PrismLightModeAppletContract {
  id: PrismAppletId;
  status: PrismAppletStatus;
  sourceOwner: "shared-source" | "applet-exception" | "planned";
  states: PrismLightModeLifecycleContract;
}

const plannedAppletStates = lifecycleContract("not-player-visible");

export const PRISM_LIGHT_MODE_APPLET_CONTRACTS = {
  chat: {
    id: "chat",
    status: "active",
    sourceOwner: "shared-source",
    states: lifecycleContract("shared-source"),
  },
  zen: {
    id: "zen",
    status: "active",
    sourceOwner: "applet-exception",
    states: lifecycleContract("shared-source", {
      live: "applet-exception",
      completed: "applet-exception",
      cancelled: "applet-exception",
      replay: "applet-exception",
      interaction: "applet-exception",
      responsive: "applet-exception",
    }),
  },
  debate: {
    id: "debate",
    status: "preview",
    sourceOwner: "applet-exception",
    states: lifecycleContract("applet-exception", {
      loading: "shared-source",
      permission: "shared-source",
      error: "shared-source",
      modal: "shared-source",
      popover: "shared-source",
      disabled: "shared-source",
    }),
  },
  polling: {
    id: "polling",
    status: "planned",
    sourceOwner: "planned",
    states: plannedAppletStates,
  },
  coffee: {
    id: "coffee",
    status: "active",
    sourceOwner: "applet-exception",
    states: lifecycleContract("applet-exception", {
      loading: "shared-source",
      permission: "shared-source",
      error: "shared-source",
      modal: "shared-source",
      popover: "shared-source",
      disabled: "shared-source",
    }),
  },
  botcast: {
    id: "botcast",
    status: "active",
    sourceOwner: "applet-exception",
    states: lifecycleContract("applet-exception", {
      loading: "shared-source",
      permission: "shared-source",
      error: "shared-source",
      modal: "shared-source",
      disabled: "shared-source",
    }),
  },
  feed: {
    id: "feed",
    status: "planned",
    sourceOwner: "planned",
    states: plannedAppletStates,
  },
  games: {
    id: "games",
    status: "planned",
    sourceOwner: "planned",
    states: plannedAppletStates,
  },
  story: {
    id: "story",
    status: "planned",
    sourceOwner: "planned",
    states: plannedAppletStates,
  },
  gym: {
    id: "gym",
    status: "planned",
    sourceOwner: "planned",
    states: plannedAppletStates,
  },
  slate: {
    id: "slate",
    status: "preview",
    sourceOwner: "applet-exception",
    states: lifecycleContract("applet-exception", {
      loading: "shared-source",
      permission: "shared-source",
      error: "shared-source",
      modal: "shared-source",
      popover: "shared-source",
      disabled: "shared-source",
    }),
  },
  pseudo: {
    id: "pseudo",
    status: "planned",
    sourceOwner: "planned",
    states: plannedAppletStates,
  },
  surf: {
    id: "surf",
    status: "planned",
    sourceOwner: "planned",
    states: plannedAppletStates,
  },
} as const satisfies Record<PrismAppletId, PrismLightModeAppletContract>;

export interface PrismLightModeSurfaceContract {
  id: PrismSurfaceId;
  sourceOwner: "shared-source" | "surface-exception" | "planned";
  fileGroupIds: readonly string[];
}

export const PRISM_LIGHT_MODE_SURFACE_CONTRACTS = {
  home: {
    id: "home",
    sourceOwner: "shared-source",
    fileGroupIds: [
      "shared-shell",
      "home-and-prism",
      "libraries-and-settings",
      "legal",
      "onboarding",
    ],
  },
  "prism-home": {
    id: "prism-home",
    sourceOwner: "shared-source",
    fileGroupIds: [
      "shared-shell",
      "home-and-prism",
      "prism-public-route",
      "identity-and-avatar",
      "legal",
      "onboarding",
    ],
  },
  zen: {
    id: "zen",
    sourceOwner: "surface-exception",
    fileGroupIds: ["shared-shell", "home-and-prism", "identity-and-avatar"],
  },
  "group-home": {
    id: "group-home",
    sourceOwner: "shared-source",
    fileGroupIds: ["shared-shell", "home-and-prism", "libraries-and-settings"],
  },
  coffee: {
    id: "coffee",
    sourceOwner: "surface-exception",
    fileGroupIds: ["shared-shell", "identity-and-avatar", "coffee"],
  },
  debate: {
    id: "debate",
    sourceOwner: "surface-exception",
    fileGroupIds: ["shared-shell", "identity-and-avatar", "debate"],
  },
  signal: {
    id: "signal",
    sourceOwner: "surface-exception",
    fileGroupIds: ["shared-shell", "identity-and-avatar", "signal"],
  },
  story: {
    id: "story",
    sourceOwner: "planned",
    fileGroupIds: ["shared-shell"],
  },
  slate: {
    id: "slate",
    sourceOwner: "surface-exception",
    fileGroupIds: ["shared-shell", "slate"],
  },
  marketplace: {
    id: "marketplace",
    sourceOwner: "shared-source",
    fileGroupIds: ["shared-shell", "libraries-and-settings"],
  },
  "avatar-studio": {
    id: "avatar-studio",
    sourceOwner: "shared-source",
    fileGroupIds: ["shared-shell", "identity-and-avatar"],
  },
  images: {
    id: "images",
    sourceOwner: "shared-source",
    fileGroupIds: ["shared-shell", "libraries-and-settings"],
  },
  settings: {
    id: "settings",
    sourceOwner: "shared-source",
    fileGroupIds: ["shared-shell", "libraries-and-settings"],
  },
} as const satisfies Record<PrismSurfaceId, PrismLightModeSurfaceContract>;

export type PrismLightModeFileClassification =
  | "shared-source"
  | "surface-exception"
  | "nonvisual-runtime"
  | "qa-fixture";

export interface PrismLightModeFileGroup {
  id: string;
  classification: PrismLightModeFileClassification;
  surfaceIds: readonly PrismSurfaceId[];
  files: readonly string[];
}

const ALL_PRODUCT_SURFACE_IDS = [
  "home",
  "prism-home",
  "zen",
  "group-home",
  "coffee",
  "debate",
  "signal",
  "story",
  "slate",
  "marketplace",
  "avatar-studio",
  "images",
  "settings",
] as const satisfies readonly PrismSurfaceId[];

export const PRISM_LIGHT_MODE_FILE_GROUPS = [
  {
    id: "shared-shell",
    classification: "shared-source",
    surfaceIds: ALL_PRODUCT_SURFACE_IDS,
    files: [
      "ActionSfxPackMagicButton.tsx",
      "BackendUnavailableNotice.tsx",
      "ClientInstallCoach.tsx",
      "ComposerBotMentionPopover.tsx",
      "ControlShortcutGuide.module.css",
      "ControlShortcutOverlay.tsx",
      "EnglishPacingCalibrateMagicButton.tsx",
      "GlyphTooltipLayer.tsx",
      "KeyboardShortcutSettings.tsx",
      "ModelWarmupIntermission.tsx",
      "NetworkAccessPanel.tsx",
      "OnlineAutoProviderTriangle.module.css",
      "OnlineAutoProviderTriangle.tsx",
      "PrismAppErrorFallback.tsx",
      "PrismBlockingLoader.tsx",
      "PrismChromeNotice.module.css",
      "PrismChromeNotice.tsx",
      "PrismFlightRecorderCard.tsx",
      "PrismMenu.module.css",
      "PrismMenu.tsx",
      "PrismRenderingDiagnosticsCard.tsx",
      "ReplayRecordingPanel.tsx",
      "SanctumAudioPlayer.module.css",
      "SanctumAudioPlayer.tsx",
      "SessionAtmosphereLayer.tsx",
      "SettingsPanel.tsx",
      "SpeechIntentReveal.tsx",
      "TextFieldContextMenu.tsx",
      "error.tsx",
      "global-error.tsx",
      "globals.css",
      "glyph-tooltip.module.css",
      "layout.tsx",
      "liveSessionChrome.module.css",
      "liveSessionChrome.tsx",
      "model-warmup-intermission.module.css",
      "page.module.css",
      "page.tsx",
      "prism-blocking-loader.module.css",
      "replayRecording.module.css",
      "speechIntentReveal.module.css",
    ],
  },
  {
    id: "home-and-prism",
    classification: "shared-source",
    surfaceIds: ["home", "prism-home", "zen", "group-home"],
    files: [
      "BotMentionRichText.tsx",
      "BotPicker.module.css",
      "BotPicker.tsx",
      "PrismCompanion.tsx",
      "PrismHandoffCanvas.tsx",
      "PrismOrb.tsx",
      "PrismTetrahedronNavigator.module.css",
      "PrismTetrahedronNavigator.tsx",
      "prism-orb.module.css",
      "prismCompanion.module.css",
      "prismCompanionPresence.tsx",
      "prismHandoffCanvas.module.css",
      "prismRefractionGate.tsx",
    ],
  },
  {
    id: "prism-public-route",
    classification: "shared-source",
    surfaceIds: ["prism-home"],
    files: ["prism/page.module.css", "prism/page.tsx"],
  },
  {
    id: "libraries-and-settings",
    classification: "shared-source",
    surfaceIds: ["home", "group-home", "marketplace", "images", "settings"],
    files: [
      "AssetLibrary.module.css",
      "AssetLibrary.tsx",
      "AssetsSettings.module.css",
      "AssetsSettings.tsx",
      "AudioLibrary.module.css",
      "AudioLibrary.tsx",
      "BotLibraryGroupSpectrumTile.module.css",
      "BotLibraryGroupSpectrumTile.tsx",
      "MemorySettings.module.css",
      "MemorySettings.tsx",
      "StorageSettings.module.css",
      "StorageSettings.tsx",
    ],
  },
  {
    id: "identity-and-avatar",
    classification: "shared-source",
    surfaceIds: [
      "home",
      "prism-home",
      "zen",
      "group-home",
      "coffee",
      "debate",
      "signal",
      "marketplace",
      "avatar-studio",
    ],
    files: [
      "AdjustmentPad.module.css",
      "AdjustmentPad.tsx",
      "AvatarDetailsEditor.tsx",
      "AvatarDetailsMask.tsx",
      "BotAvatarMicro.tsx",
      "BotCreationRitual.module.css",
      "BotCreationRitual.tsx",
      "BotPowerRune.module.css",
      "BotPowerRune.tsx",
      "CoffeeSeatPlateEmoji.tsx",
      "MiniAvatarDetailsInk.tsx",
      "PhosphorPixelGlyph.tsx",
      "PronunciationAtlas.module.css",
      "PronunciationAtlas.tsx",
      "ZenHueStringControl.module.css",
      "ZenHueStringControl.tsx",
      "avatar-details-editor.module.css",
      "avatar-details-mask.module.css",
      "chatMiniBotAvatar.module.css",
      "chatMiniBotAvatar.tsx",
      "phosphor-pixel-glyph.module.css",
    ],
  },
  {
    id: "legal",
    classification: "shared-source",
    surfaceIds: ["home", "prism-home"],
    files: [
      "EulaAgreement.tsx",
      "eula-agreement.module.css",
      "legal/eula/page.tsx",
    ],
  },
  {
    id: "onboarding",
    classification: "surface-exception",
    surfaceIds: ["home", "prism-home"],
    files: [
      "IdentityPresentationBlackout.tsx",
      "PrismFirstRunLivingLayer.module.css",
      "PrismFirstRunLivingLayer.tsx",
      "PrismIntroSequence.module.css",
      "PrismIntroSequence.tsx",
      "PrismLivingTutorial.module.css",
      "PrismLivingTutorial.tsx",
      "identityPresentationBlackout.module.css",
    ],
  },
  {
    id: "coffee",
    classification: "surface-exception",
    surfaceIds: ["coffee"],
    files: [
      "CoffeeAtmosphereScene.tsx",
      "CoffeeContextSparkLayer.tsx",
      "CoffeeGroupIdentitySection.tsx",
      "CoffeeIntroCurtain.module.css",
      "CoffeeIntroCurtain.tsx",
    ],
  },
  {
    id: "signal",
    classification: "surface-exception",
    surfaceIds: ["signal"],
    files: [
      "BotcastExperience.tsx",
      "SignalArtworkJobActivity.tsx",
      "SignalVoiceActionText.module.css",
      "SignalVoiceActionText.tsx",
      "botcast.module.css",
      "signalArtworkJobActivity.module.css",
      "signalVisualPassports.tsx",
    ],
  },
  {
    id: "debate",
    classification: "surface-exception",
    surfaceIds: ["debate"],
    files: [
      "DebateArchiveAssetsModal.tsx",
      "DebateDeadlineCountdown.tsx",
      "DebateEvidenceDocument.tsx",
      "DebateEvidenceMentionPopover.tsx",
      "DebateExhibitMagentaControls.tsx",
      "DebateExperience.module.css",
      "DebateExperience.tsx",
      "DebateFlyting.module.css",
      "DebateFlyting.tsx",
      "DebateForumAccentKeyLayers.tsx",
      "DebateForumScene.tsx",
      "DebateMysteryExperience.tsx",
      "DebateMysteryV2Experience.tsx",
      "InstalledCaseLibraryPanel.tsx",
      "InstalledMansionLibraryPanel.tsx",
      "MansionEditorDialog.tsx",
      "MysteryPropVisual.tsx",
      "SoftAssetJobActivity.tsx",
      "WhodunnitSetupDialog.tsx",
      "debateMystery.module.css",
      "debateMysteryRoomCinematography.module.css",
      "debateMysteryRoomCinematographyLayer.tsx",
      "debateMysteryV2.module.css",
      "softAssetJobActivity.module.css",
    ],
  },
  {
    id: "slate",
    classification: "surface-exception",
    surfaceIds: ["slate"],
    files: [
      "SlateCreativeStudiosDesk.tsx",
      "SlateDirectionQuestion.tsx",
      "SlateDirectorBar.tsx",
      "SlateFullBookReader.tsx",
      "SlateHemisphereSettingsPanel.tsx",
      "SlateManuscriptCanvas.tsx",
      "SlateMirrorDesk.tsx",
      "SlateStoryBibleDesk.tsx",
      "SlateStoryMap.tsx",
      "SlateWorkspace.tsx",
      "slateCreativeStudiosDesk.module.css",
      "slateDirectionQuestion.module.css",
      "slateDirectorBar.module.css",
      "slateFullBookReader.module.css",
      "slateManuscriptCanvas.module.css",
      "slateMirrorDesk.module.css",
      "slateStoryBibleDesk.module.css",
      "slateStoryMap.module.css",
      "slateWorkspace.module.css",
    ],
  },
  {
    id: "nonvisual-runtime",
    classification: "nonvisual-runtime",
    surfaceIds: ALL_PRODUCT_SURFACE_IDS,
    files: [
      "BlockBrowserInspection.tsx",
      "DisableNativeTextCorrection.tsx",
      "DisableNativeTooltips.tsx",
      "PrismAdaptiveDomQualityGovernor.tsx",
      "PrismLivePerformanceBodyMarker.tsx",
      "PrismVisualLifecycleBridge.tsx",
      "RenderPlatformAttribute.tsx",
      "ReplayMouthPresentationCapture.tsx",
      "ReplayRenderCoordinator.tsx",
      "TextEntryLengthDefaults.tsx",
    ],
  },
  {
    id: "qa-fixtures",
    classification: "qa-fixture",
    surfaceIds: [],
    files: [
      "qa-context-menus/ContextMenuFixtureGallery.module.css",
      "qa-context-menus/ContextMenuFixtureGallery.tsx",
      "qa-context-menus/page.tsx",
      "qa-prism-wield/PrismWieldFixture.tsx",
      "qa-prism-wield/page.tsx",
      "qa-prism-wield/prismWieldFixture.module.css",
      "qa-voice-sync/VoiceSyncLab.tsx",
      "qa-voice-sync/page.tsx",
      "qa-voice-sync/voiceSyncLab.module.css",
      "qa-whodunnit/WhodunnitFixture.tsx",
      "qa-whodunnit/page.tsx",
    ],
  },
] as const satisfies readonly PrismLightModeFileGroup[];

export const PRISM_LIGHT_MODE_PHASE_FOUR_INTERACTION_STATES = [
  "rest",
  "hover",
  "focus-visible",
  "active",
  "selected",
  "disabled",
  "busy",
  "drag-drop",
  "offline-privacy",
  "responsive",
] as const;

export type PrismLightModePhaseFourInteractionState =
  (typeof PRISM_LIGHT_MODE_PHASE_FOUR_INTERACTION_STATES)[number];

type PrismLightModePhaseFourCoverage = "covered" | "not-player-visible";

function phaseFourLifecycleCoverage(
  defaultCoverage: PrismLightModePhaseFourCoverage,
  overrides: Partial<
    Record<PrismLightModeStateFamily, PrismLightModePhaseFourCoverage>
  > = {},
): Record<PrismLightModeStateFamily, PrismLightModePhaseFourCoverage> {
  return Object.fromEntries(
    PRISM_LIGHT_MODE_STATE_FAMILIES.map((state) => [
      state,
      overrides[state] ?? defaultCoverage,
    ]),
  ) as Record<PrismLightModeStateFamily, PrismLightModePhaseFourCoverage>;
}

function phaseFourInteractionCoverage(
  defaultCoverage: PrismLightModePhaseFourCoverage,
  overrides: Partial<
    Record<
      PrismLightModePhaseFourInteractionState,
      PrismLightModePhaseFourCoverage
    >
  > = {},
): Record<
  PrismLightModePhaseFourInteractionState,
  PrismLightModePhaseFourCoverage
> {
  return Object.fromEntries(
    PRISM_LIGHT_MODE_PHASE_FOUR_INTERACTION_STATES.map((state) => [
      state,
      overrides[state] ?? defaultCoverage,
    ]),
  ) as Record<
    PrismLightModePhaseFourInteractionState,
    PrismLightModePhaseFourCoverage
  >;
}

export interface PrismLightModePhaseFourSurfaceFamilyContract {
  id:
    | "avatar-and-identity"
    | "slate"
    | "images-assets-audio"
    | "bots-marketplace-history"
    | "settings-administration-legal"
    | "public-prism-handoff"
    | "planned-utility-placeholders";
  fileGroupIds: readonly string[];
  evidenceFiles: readonly string[];
  states: Record<PrismLightModeStateFamily, PrismLightModePhaseFourCoverage>;
  interactions: Record<
    PrismLightModePhaseFourInteractionState,
    PrismLightModePhaseFourCoverage
  >;
}

/**
 * PRISM-biijf.4 parity matrix. Every real surface family carries the complete
 * lifecycle and interaction contract; future placeholders cover only the
 * shell states they actually render and explicitly remain non-functional.
 */
export const PRISM_LIGHT_MODE_PHASE_FOUR_SURFACE_FAMILIES = [
  {
    id: "avatar-and-identity",
    fileGroupIds: ["identity-and-avatar", "shared-shell"],
    evidenceFiles: [
      "page.tsx",
      "page.module.css",
      "BotCreationRitual.module.css",
      "avatar-details-editor.module.css",
      "PronunciationAtlas.module.css",
    ],
    states: phaseFourLifecycleCoverage("covered"),
    interactions: phaseFourInteractionCoverage("covered"),
  },
  {
    id: "slate",
    fileGroupIds: ["slate", "shared-shell"],
    evidenceFiles: [
      "SlateWorkspace.tsx",
      "slateWorkspace.module.css",
      "slateCreativeStudiosDesk.module.css",
      "slateStoryBibleDesk.module.css",
    ],
    states: phaseFourLifecycleCoverage("covered"),
    interactions: phaseFourInteractionCoverage("covered"),
  },
  {
    id: "images-assets-audio",
    fileGroupIds: ["libraries-and-settings", "shared-shell"],
    evidenceFiles: [
      "AssetLibrary.tsx",
      "AssetLibrary.module.css",
      "AudioLibrary.module.css",
      "AssetsSettings.module.css",
      "page.module.css",
    ],
    states: phaseFourLifecycleCoverage("covered"),
    interactions: phaseFourInteractionCoverage("covered"),
  },
  {
    id: "bots-marketplace-history",
    fileGroupIds: ["libraries-and-settings", "shared-shell"],
    evidenceFiles: ["page.tsx", "page.module.css", "BotPicker.module.css"],
    states: phaseFourLifecycleCoverage("covered"),
    interactions: phaseFourInteractionCoverage("covered"),
  },
  {
    id: "settings-administration-legal",
    fileGroupIds: ["libraries-and-settings", "legal", "shared-shell"],
    evidenceFiles: [
      "SettingsPanel.tsx",
      "page.module.css",
      "MemorySettings.module.css",
      "StorageSettings.module.css",
      "EulaAgreement.tsx",
      "eula-agreement.module.css",
    ],
    states: phaseFourLifecycleCoverage("covered"),
    interactions: phaseFourInteractionCoverage("covered"),
  },
  {
    id: "public-prism-handoff",
    fileGroupIds: ["prism-public-route"],
    evidenceFiles: ["prism/page.tsx", "prism/page.module.css", "layout.tsx"],
    states: phaseFourLifecycleCoverage("covered"),
    interactions: phaseFourInteractionCoverage("covered", {
      disabled: "not-player-visible",
      busy: "not-player-visible",
      "drag-drop": "not-player-visible",
      "offline-privacy": "not-player-visible",
    }),
  },
  {
    id: "planned-utility-placeholders",
    fileGroupIds: ["shared-shell"],
    evidenceFiles: ["page.tsx", "page.module.css", "PrismMenu.module.css"],
    states: phaseFourLifecycleCoverage("not-player-visible", {
      entry: "covered",
      interaction: "covered",
      disabled: "covered",
      responsive: "covered",
    }),
    interactions: phaseFourInteractionCoverage("not-player-visible", {
      rest: "covered",
      hover: "covered",
      "focus-visible": "covered",
      disabled: "covered",
      responsive: "covered",
    }),
  },
] as const satisfies readonly PrismLightModePhaseFourSurfaceFamilyContract[];

export const PRISM_LIGHT_MODE_PHASE_FIVE_INTERACTION_STATES = [
  "rest",
  "hover",
  "focus-visible",
  "pressed-active",
  "selected-checked",
  "disabled",
  "busy",
  "drag-drop",
  "resize",
  "resizable-modal-limits",
  "file-chooser-drop-zone",
  "range-slider",
  "scroll-boundary",
  "keyboard-navigation",
  "tooltip-context-menu-portal",
  "modal-popover-stacking",
] as const;

export const PRISM_LIGHT_MODE_PHASE_FIVE_LIFECYCLE_STATES = [
  "loading",
  "streaming",
  "thinking",
  "synthesis",
  "empty",
  "permission",
  "privacy",
  "offline",
  "error",
  "retry",
  "reconnect",
  "cancellation",
  "completion",
  "toast-status",
  "destructive-confirmation",
  "progress",
  "suspense",
  "route-recovery",
  "global-recovery",
] as const;

export const PRISM_LIGHT_MODE_PHASE_FIVE_RESPONSIVE_STATES = [
  "reference-1440x900",
  "narrower-width",
  "shorter-height",
  "no-page-scroll-live",
  "stable-transcript",
  "overflow-clipping",
  "modal-panel-resizing",
  "header-composer-collision",
  "safe-area",
  "zoom-friendly-units",
] as const;

export const PRISM_LIGHT_MODE_PHASE_FIVE_ACCESSIBILITY_STATES = [
  "theme-native-color-scheme",
  "semantic-contrast-tokens",
  "visible-focus",
  "disabled-affordance",
  "reduced-motion",
  "forced-colors",
  "screen-reader-status",
] as const;

export type PrismLightModePhaseFiveInteractionState =
  (typeof PRISM_LIGHT_MODE_PHASE_FIVE_INTERACTION_STATES)[number];
export type PrismLightModePhaseFiveLifecycleState =
  (typeof PRISM_LIGHT_MODE_PHASE_FIVE_LIFECYCLE_STATES)[number];
export type PrismLightModePhaseFiveResponsiveState =
  (typeof PRISM_LIGHT_MODE_PHASE_FIVE_RESPONSIVE_STATES)[number];
export type PrismLightModePhaseFiveAccessibilityState =
  (typeof PRISM_LIGHT_MODE_PHASE_FIVE_ACCESSIBILITY_STATES)[number];

type PrismLightModePhaseFiveCoverage =
  | "code-covered"
  | "not-player-visible";

function phaseFiveCoverage<T extends string>(
  states: readonly T[],
  defaultCoverage: PrismLightModePhaseFiveCoverage,
  overrides: Partial<Record<T, PrismLightModePhaseFiveCoverage>> = {},
): Record<T, PrismLightModePhaseFiveCoverage> {
  return Object.fromEntries(
    states.map((state) => [state, overrides[state] ?? defaultCoverage]),
  ) as Record<T, PrismLightModePhaseFiveCoverage>;
}

export interface PrismLightModePhaseFiveSurfaceFamilyContract {
  id:
    | "shared-shell-and-portals"
    | "first-run-and-onboarding"
    | "social-live-and-replay"
    | "creator-library-settings"
    | "public-prism-handoff"
    | "nonvisual-and-qa";
  playerVisible: boolean;
  fileGroupIds: readonly string[];
  evidenceFiles: readonly string[];
  interactions: Record<
    PrismLightModePhaseFiveInteractionState,
    PrismLightModePhaseFiveCoverage
  >;
  lifecycle: Record<
    PrismLightModePhaseFiveLifecycleState,
    PrismLightModePhaseFiveCoverage
  >;
  responsive: Record<
    PrismLightModePhaseFiveResponsiveState,
    PrismLightModePhaseFiveCoverage
  >;
  accessibility: Record<
    PrismLightModePhaseFiveAccessibilityState,
    PrismLightModePhaseFiveCoverage
  >;
}

/**
 * PRISM-biijf.5 code-coverage matrix. It exact-partitions every render-bearing
 * file group, including nonvisual and QA-only groups, so new transient or
 * responsive renderers cannot inherit an accidental implicit classification.
 * "code-covered" records source/test ownership only; authenticated visual QA
 * remains the parent gate.
 */
export const PRISM_LIGHT_MODE_PHASE_FIVE_SURFACE_FAMILIES = [
  {
    id: "shared-shell-and-portals",
    playerVisible: true,
    fileGroupIds: ["shared-shell", "home-and-prism"],
    evidenceFiles: [
      "globals.css",
      "page.module.css",
      "page.tsx",
      "ModelWarmupIntermission.tsx",
      "model-warmup-intermission.module.css",
      "PrismBlockingLoader.tsx",
      "PrismAppErrorFallback.tsx",
      "TextFieldContextMenu.tsx",
      "PrismMenu.tsx",
    ],
    interactions: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_INTERACTION_STATES,
      "code-covered",
    ),
    lifecycle: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_LIFECYCLE_STATES,
      "code-covered",
    ),
    responsive: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_RESPONSIVE_STATES,
      "code-covered",
    ),
    accessibility: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_ACCESSIBILITY_STATES,
      "code-covered",
    ),
  },
  {
    id: "first-run-and-onboarding",
    playerVisible: true,
    fileGroupIds: ["onboarding"],
    evidenceFiles: [
      "PrismFirstRunLivingLayer.tsx",
      "PrismFirstRunLivingLayer.module.css",
      "PrismIntroSequence.tsx",
      "PrismIntroSequence.module.css",
      "PrismLivingTutorial.tsx",
      "PrismLivingTutorial.module.css",
    ],
    interactions: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_INTERACTION_STATES,
      "code-covered",
      {
        "drag-drop": "not-player-visible",
        resize: "not-player-visible",
        "resizable-modal-limits": "not-player-visible",
        "file-chooser-drop-zone": "not-player-visible",
        "range-slider": "not-player-visible",
        "tooltip-context-menu-portal": "not-player-visible",
      },
    ),
    lifecycle: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_LIFECYCLE_STATES,
      "code-covered",
      {
        streaming: "not-player-visible",
        thinking: "not-player-visible",
        synthesis: "not-player-visible",
        reconnect: "not-player-visible",
        "destructive-confirmation": "not-player-visible",
        suspense: "not-player-visible",
        "route-recovery": "not-player-visible",
        "global-recovery": "not-player-visible",
      },
    ),
    responsive: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_RESPONSIVE_STATES,
      "code-covered",
      {
        "stable-transcript": "not-player-visible",
        "modal-panel-resizing": "not-player-visible",
        "header-composer-collision": "not-player-visible",
      },
    ),
    accessibility: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_ACCESSIBILITY_STATES,
      "code-covered",
    ),
  },
  {
    id: "social-live-and-replay",
    playerVisible: true,
    fileGroupIds: ["coffee", "signal", "debate"],
    evidenceFiles: [
      "page.tsx",
      "page.module.css",
      "BotcastExperience.tsx",
      "botcast.module.css",
      "DebateExperience.tsx",
      "DebateExperience.module.css",
      "DebateMysteryExperience.tsx",
      "debateMystery.module.css",
    ],
    interactions: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_INTERACTION_STATES,
      "code-covered",
    ),
    lifecycle: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_LIFECYCLE_STATES,
      "code-covered",
    ),
    responsive: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_RESPONSIVE_STATES,
      "code-covered",
    ),
    accessibility: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_ACCESSIBILITY_STATES,
      "code-covered",
    ),
  },
  {
    id: "creator-library-settings",
    playerVisible: true,
    fileGroupIds: [
      "libraries-and-settings",
      "identity-and-avatar",
      "legal",
      "slate",
    ],
    evidenceFiles: [
      "AssetLibrary.tsx",
      "AssetLibrary.module.css",
      "AudioLibrary.tsx",
      "MemorySettings.module.css",
      "AvatarDetailsEditor.tsx",
      "avatar-details-editor.module.css",
      "SlateWorkspace.tsx",
      "slateWorkspace.module.css",
      "EulaAgreement.tsx",
    ],
    interactions: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_INTERACTION_STATES,
      "code-covered",
    ),
    lifecycle: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_LIFECYCLE_STATES,
      "code-covered",
    ),
    responsive: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_RESPONSIVE_STATES,
      "code-covered",
    ),
    accessibility: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_ACCESSIBILITY_STATES,
      "code-covered",
    ),
  },
  {
    id: "public-prism-handoff",
    playerVisible: true,
    fileGroupIds: ["prism-public-route"],
    evidenceFiles: ["prism/page.tsx", "prism/page.module.css", "layout.tsx"],
    interactions: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_INTERACTION_STATES,
      "not-player-visible",
      {
        rest: "code-covered",
        hover: "code-covered",
        "focus-visible": "code-covered",
        "pressed-active": "code-covered",
        disabled: "code-covered",
        busy: "code-covered",
        "scroll-boundary": "code-covered",
        "keyboard-navigation": "code-covered",
        "modal-popover-stacking": "code-covered",
      },
    ),
    lifecycle: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_LIFECYCLE_STATES,
      "not-player-visible",
      {
        loading: "code-covered",
        permission: "code-covered",
        privacy: "code-covered",
        offline: "code-covered",
        error: "code-covered",
        retry: "code-covered",
        reconnect: "code-covered",
        completion: "code-covered",
        "toast-status": "code-covered",
        suspense: "code-covered",
        "route-recovery": "code-covered",
        "global-recovery": "code-covered",
      },
    ),
    responsive: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_RESPONSIVE_STATES,
      "code-covered",
      {
        "stable-transcript": "not-player-visible",
        "modal-panel-resizing": "not-player-visible",
        "header-composer-collision": "not-player-visible",
      },
    ),
    accessibility: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_ACCESSIBILITY_STATES,
      "code-covered",
    ),
  },
  {
    id: "nonvisual-and-qa",
    playerVisible: false,
    fileGroupIds: ["nonvisual-runtime", "qa-fixtures"],
    evidenceFiles: [
      "PrismVisualLifecycleBridge.tsx",
      "ReplayRenderCoordinator.tsx",
      "qa-context-menus/ContextMenuFixtureGallery.tsx",
    ],
    interactions: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_INTERACTION_STATES,
      "not-player-visible",
    ),
    lifecycle: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_LIFECYCLE_STATES,
      "not-player-visible",
    ),
    responsive: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_RESPONSIVE_STATES,
      "not-player-visible",
    ),
    accessibility: phaseFiveCoverage(
      PRISM_LIGHT_MODE_PHASE_FIVE_ACCESSIBILITY_STATES,
      "not-player-visible",
    ),
  },
] as const satisfies readonly PrismLightModePhaseFiveSurfaceFamilyContract[];

export const PRISM_LIGHT_MODE_PHASE_FIVE_VIEWPORT_SCENARIOS = [
  {
    id: "reference-1440x900",
    logicalWidth: 1440,
    logicalHeight: 900,
    isolates: "reference",
    fixedRequirement: false,
  },
  {
    id: "narrower-1180x900",
    logicalWidth: 1180,
    logicalHeight: 900,
    isolates: "width",
    fixedRequirement: false,
  },
  {
    id: "shorter-1440x720",
    logicalWidth: 1440,
    logicalHeight: 720,
    isolates: "height",
    fixedRequirement: false,
  },
  {
    id: "narrower-shorter-1180x720",
    logicalWidth: 1180,
    logicalHeight: 720,
    isolates: "combined",
    fixedRequirement: false,
  },
] as const;

/**
 * Exact structural-signal census used by the phase .5 regression. Counts are
 * deliberately grouped by the authoritative file inventory: adding hover,
 * state, lifecycle, responsive, or accessibility syntax fails until its owner
 * is consciously re-audited and this census is refreshed.
 */
export const PRISM_LIGHT_MODE_PHASE_FIVE_SIGNAL_BASELINES = [
  {
    groupId: "shared-shell",
    interaction: { files: 25, count: 2875 },
    lifecycle: { files: 20, count: 299 },
    responsive: { files: 20, count: 1724 },
    accessibility: { files: 27, count: 974 },
  },
  {
    groupId: "home-and-prism",
    interaction: { files: 8, count: 93 },
    lifecycle: { files: 3, count: 22 },
    responsive: { files: 8, count: 41 },
    accessibility: { files: 8, count: 49 },
  },
  {
    groupId: "prism-public-route",
    interaction: { files: 1, count: 10 },
    lifecycle: { files: 0, count: 0 },
    responsive: { files: 1, count: 14 },
    accessibility: { files: 1, count: 7 },
  },
  {
    groupId: "libraries-and-settings",
    interaction: { files: 9, count: 100 },
    lifecycle: { files: 4, count: 14 },
    responsive: { files: 6, count: 37 },
    accessibility: { files: 9, count: 44 },
  },
  {
    groupId: "identity-and-avatar",
    interaction: { files: 12, count: 92 },
    lifecycle: { files: 5, count: 21 },
    responsive: { files: 13, count: 63 },
    accessibility: { files: 10, count: 37 },
  },
  {
    groupId: "legal",
    interaction: { files: 2, count: 24 },
    lifecycle: { files: 1, count: 2 },
    responsive: { files: 1, count: 11 },
    accessibility: { files: 2, count: 12 },
  },
  {
    groupId: "onboarding",
    interaction: { files: 6, count: 62 },
    lifecycle: { files: 3, count: 5 },
    responsive: { files: 6, count: 71 },
    accessibility: { files: 7, count: 44 },
  },
  {
    groupId: "coffee",
    interaction: { files: 3, count: 5 },
    lifecycle: { files: 3, count: 5 },
    responsive: { files: 1, count: 4 },
    accessibility: { files: 4, count: 7 },
  },
  {
    groupId: "signal",
    interaction: { files: 3, count: 285 },
    lifecycle: { files: 3, count: 55 },
    responsive: { files: 3, count: 198 },
    accessibility: { files: 4, count: 83 },
  },
  {
    groupId: "debate",
    interaction: { files: 14, count: 959 },
    lifecycle: { files: 11, count: 132 },
    responsive: { files: 11, count: 725 },
    accessibility: { files: 13, count: 276 },
  },
  {
    groupId: "slate",
    interaction: { files: 16, count: 140 },
    lifecycle: { files: 5, count: 25 },
    responsive: { files: 9, count: 133 },
    accessibility: { files: 9, count: 35 },
  },
  {
    groupId: "nonvisual-runtime",
    interaction: { files: 1, count: 5 },
    lifecycle: { files: 0, count: 0 },
    responsive: { files: 0, count: 0 },
    accessibility: { files: 0, count: 0 },
  },
  {
    groupId: "qa-fixtures",
    interaction: { files: 5, count: 41 },
    lifecycle: { files: 2, count: 6 },
    responsive: { files: 4, count: 40 },
    accessibility: { files: 3, count: 15 },
  },
] as const;

export type PrismLightModeSharedSourceThemeContract =
  | "semantic-theme-source"
  | "theme-propagating-host"
  | "inherited-render-host"
  | "theme-independent-art";

export interface PrismLightModeSharedSourceAuditGroup {
  contract: PrismLightModeSharedSourceThemeContract;
  files: readonly string[];
  reason: string;
}

/**
 * Phase .2 shared-source audit. The companion regression exact-matches these
 * groups against every file classified as shared-source above, so a new shared
 * renderer cannot silently skip theme ownership review.
 */
export const PRISM_LIGHT_MODE_SHARED_SOURCE_AUDIT = [
  {
    contract: "semantic-theme-source",
    reason:
      "Owns semantic paint through shared tokens, an explicit Light selector, or the canonical body portal marker while retaining its authored Dark declarations.",
    files: [
      "ControlShortcutGuide.module.css",
      "OnlineAutoProviderTriangle.module.css",
      "PrismChromeNotice.module.css",
      "PrismMenu.module.css",
      "SanctumAudioPlayer.module.css",
      "globals.css",
      "glyph-tooltip.module.css",
      "liveSessionChrome.module.css",
      "model-warmup-intermission.module.css",
      "page.module.css",
      "prism-blocking-loader.module.css",
      "replayRecording.module.css",
      "speechIntentReveal.module.css",
      "BotPicker.module.css",
      "PrismTetrahedronNavigator.module.css",
      "prism-orb.module.css",
      "prismCompanion.module.css",
      "prismHandoffCanvas.module.css",
      "AssetLibrary.module.css",
      "AssetsSettings.module.css",
      "AudioLibrary.module.css",
      "MemorySettings.module.css",
      "StorageSettings.module.css",
      "AdjustmentPad.module.css",
      "BotCreationRitual.module.css",
      "PronunciationAtlas.module.css",
      "ZenHueStringControl.module.css",
      "avatar-details-editor.module.css",
      "chatMiniBotAvatar.module.css",
      "eula-agreement.module.css",
      "prism/page.module.css",
    ],
  },
  {
    contract: "theme-propagating-host",
    reason:
      "Reads, applies, or forwards the resolved theme for a document, portal, recovery, picker, or independently rendered identity surface.",
    files: [
      "ComposerBotMentionPopover.tsx",
      "PrismAppErrorFallback.tsx",
      "PrismBlockingLoader.tsx",
      "PrismMenu.tsx",
      "TextFieldContextMenu.tsx",
      "error.tsx",
      "global-error.tsx",
      "layout.tsx",
      "liveSessionChrome.tsx",
      "ModelWarmupIntermission.tsx",
      "page.tsx",
      "BotPicker.tsx",
      "PrismCompanion.tsx",
      "prismRefractionGate.tsx",
      "AssetLibrary.tsx",
      "AvatarDetailsEditor.tsx",
      "BotCreationRitual.tsx",
      "MiniAvatarDetailsInk.tsx",
      "chatMiniBotAvatar.tsx",
      "EulaAgreement.tsx",
      "prism/page.tsx",
    ],
  },
  {
    contract: "inherited-render-host",
    reason:
      "Owns structure or behavior while visible paint inherits the enclosing semantic or document theme contract.",
    files: [
      "ActionSfxPackMagicButton.tsx",
      "BackendUnavailableNotice.tsx",
      "ClientInstallCoach.tsx",
      "ControlShortcutOverlay.tsx",
      "EnglishPacingCalibrateMagicButton.tsx",
      "GlyphTooltipLayer.tsx",
      "KeyboardShortcutSettings.tsx",
      "NetworkAccessPanel.tsx",
      "OnlineAutoProviderTriangle.tsx",
      "PrismChromeNotice.tsx",
      "PrismFlightRecorderCard.tsx",
      "PrismRenderingDiagnosticsCard.tsx",
      "ReplayRecordingPanel.tsx",
      "SanctumAudioPlayer.tsx",
      "SessionAtmosphereLayer.tsx",
      "SettingsPanel.tsx",
      "SpeechIntentReveal.tsx",
      "BotMentionRichText.tsx",
      "PrismHandoffCanvas.tsx",
      "PrismOrb.tsx",
      "PrismTetrahedronNavigator.tsx",
      "prismCompanionPresence.tsx",
      "AssetsSettings.tsx",
      "AudioLibrary.tsx",
      "BotLibraryGroupSpectrumTile.tsx",
      "MemorySettings.tsx",
      "StorageSettings.tsx",
      "AdjustmentPad.tsx",
      "AvatarDetailsMask.tsx",
      "BotAvatarMicro.tsx",
      "BotPowerRune.tsx",
      "CoffeeSeatPlateEmoji.tsx",
      "PhosphorPixelGlyph.tsx",
      "PronunciationAtlas.tsx",
      "ZenHueStringControl.tsx",
      "legal/eula/page.tsx",
    ],
  },
  {
    contract: "theme-independent-art",
    reason:
      "Paints identity artwork, phosphor emission, or a media/art field whose physical material intentionally remains theme-independent inside either shell.",
    files: [
      "BotLibraryGroupSpectrumTile.module.css",
      "BotPowerRune.module.css",
      "avatar-details-mask.module.css",
      "phosphor-pixel-glyph.module.css",
    ],
  },
] as const satisfies readonly PrismLightModeSharedSourceAuditGroup[];

export const PRISM_LIGHT_MODE_SHARED_PRIMITIVE_FAMILIES = [
  "shell-page-base",
  "typography",
  "cards-surfaces",
  "fields-selects",
  "button-interaction",
  "popover-tooltip-context",
  "modal-backdrop",
  "loader-warmup",
  "lifecycle-status",
  "media-framing",
  "navigation-pickers",
  "companion-orb-menu",
  "settings-library",
  "identity-avatar",
  "portal-root",
  "selection-scrollbar",
] as const;

export type PrismLightModeSharedPrimitiveFamily =
  (typeof PRISM_LIGHT_MODE_SHARED_PRIMITIVE_FAMILIES)[number];

export interface PrismLightModeSharedPrimitiveContract {
  id: PrismLightModeSharedPrimitiveFamily;
  sourceFiles: readonly string[];
  contract: string;
}

/** Interaction/lifecycle coverage for the shared phase, independent of applet QA. */
export const PRISM_LIGHT_MODE_SHARED_PRIMITIVE_CONTRACTS = [
  {
    id: "shell-page-base",
    sourceFiles: ["globals.css", "page.module.css", "layout.tsx"],
    contract:
      "Document bootstrap and shell classes share cool semantic backgrounds, foregrounds, lines, elevation, color-scheme, and Dark-preserving fallbacks.",
  },
  {
    id: "typography",
    sourceFiles: ["globals.css", "page.module.css"],
    contract:
      "Shared type roles and muted/subtle text inherit theme semantics without fixed-Dark portal fallbacks.",
  },
  {
    id: "cards-surfaces",
    sourceFiles: [
      "page.module.css",
      "PrismChromeNotice.module.css",
      "AssetLibrary.module.css",
      "MemorySettings.module.css",
    ],
    contract:
      "Cards, notices, elevated panels, empty surfaces, and error surfaces resolve semantic fill, edge, ink, and shadow tokens.",
  },
  {
    id: "fields-selects",
    sourceFiles: [
      "page.module.css",
      "BotPicker.module.css",
      "AudioLibrary.module.css",
      "PronunciationAtlas.module.css",
    ],
    contract:
      "Inputs, textareas, searches, selects, and range controls resolve theme-native color-scheme plus visible focus and disabled states.",
  },
  {
    id: "button-interaction",
    sourceFiles: [
      "page.module.css",
      "PrismMenu.module.css",
      "SanctumAudioPlayer.module.css",
      "AssetsSettings.module.css",
    ],
    contract:
      "Resting, hover, focus-visible, active, selected, pressed, and disabled controls remain distinct in both themes.",
  },
  {
    id: "popover-tooltip-context",
    sourceFiles: [
      "PrismMenu.module.css",
      "glyph-tooltip.module.css",
      "ComposerBotMentionPopover.tsx",
      "TextFieldContextMenu.tsx",
    ],
    contract:
      "Portaled menus, mention lists, tooltips, and context menus use explicit theme data or canonical body semantics.",
  },
  {
    id: "modal-backdrop",
    sourceFiles: [
      "BotPicker.module.css",
      "AssetLibrary.module.css",
      "AudioLibrary.module.css",
      "MemorySettings.module.css",
      "prismHandoffCanvas.module.css",
    ],
    contract:
      "Modal panels stay elevated and readable while Light backdrops use a cool translucency instead of an unsupported fixed-Dark veil.",
  },
  {
    id: "loader-warmup",
    sourceFiles: [
      "PrismBlockingLoader.tsx",
      "prism-blocking-loader.module.css",
      "ModelWarmupIntermission.tsx",
      "model-warmup-intermission.module.css",
    ],
    contract:
      "Blocking, soft, and first-start warmup loaders follow the pre-painted body theme with semantic busy, failure, retry, and reduced-motion states.",
  },
  {
    id: "lifecycle-status",
    sourceFiles: [
      "BackendUnavailableNotice.tsx",
      "PrismAppErrorFallback.tsx",
      "PrismChromeNotice.module.css",
      "replayRecording.module.css",
    ],
    contract:
      "Loading, empty, reconnect, permission, completed, replay, cancellation, and error chrome use semantic status and recovery surfaces.",
  },
  {
    id: "media-framing",
    sourceFiles: [
      "SanctumAudioPlayer.module.css",
      "replayRecording.module.css",
      "AssetLibrary.module.css",
      "AudioLibrary.module.css",
    ],
    contract:
      "Media controls and metadata theme with the shell while image/video letterboxes remain intentional neutral scene material.",
  },
  {
    id: "navigation-pickers",
    sourceFiles: [
      "page.module.css",
      "BotPicker.module.css",
      "OnlineAutoProviderTriangle.module.css",
      "liveSessionChrome.module.css",
      "PronunciationAtlas.module.css",
    ],
    contract:
      "Navbar, model, effort, provider, bot, voice, and pronunciation pickers retain readable selected and focus states in Light.",
  },
  {
    id: "companion-orb-menu",
    sourceFiles: [
      "PrismCompanion.tsx",
      "prismCompanion.module.css",
      "prism-orb.module.css",
      "PrismTetrahedronNavigator.module.css",
    ],
    contract:
      "Companion, orb, radial handoff, navigator, and menu portals resolve the live body theme while preserving authored Dark staging.",
  },
  {
    id: "settings-library",
    sourceFiles: [
      "AssetLibrary.module.css",
      "AssetsSettings.module.css",
      "AudioLibrary.module.css",
      "MemorySettings.module.css",
      "StorageSettings.module.css",
      "page.module.css",
    ],
    contract:
      "Settings and library cards, lists, meters, cleanup dialogs, empty/error states, and media actions consume semantic tokens.",
  },
  {
    id: "identity-avatar",
    sourceFiles: [
      "AdjustmentPad.module.css",
      "BotCreationRitual.module.css",
      "BotPowerRune.module.css",
      "PronunciationAtlas.module.css",
      "avatar-details-editor.module.css",
      "chatMiniBotAvatar.module.css",
    ],
    contract:
      "Avatar controls and foundry chrome theme independently from identity color; CRT, rune, and authoring-screen darkness stays intentional art.",
  },
  {
    id: "portal-root",
    sourceFiles: [
      "globals.css",
      "layout.tsx",
      "PrismMenu.tsx",
      "PrismBlockingLoader.tsx",
      "BotPicker.tsx",
      "ControlShortcutOverlay.tsx",
      "AudioLibrary.tsx",
    ],
    contract:
      "The synchronous body marker is canonical for portals and failure UI; optional component theme props never force a stale Dark root.",
  },
  {
    id: "selection-scrollbar",
    sourceFiles: ["globals.css"],
    contract:
      "Text selection uses theme-owned ink/fill while the product-wide hidden-scrollbar behavior remains identical in both themes.",
  },
] as const satisfies readonly PrismLightModeSharedPrimitiveContract[];

export interface PrismLightModeIntentionalDarkMaterial {
  file: string;
  selector: string;
  reason: string;
}

/** Fixed-dark scene/media materials that are intentional, not UI defaults. */
export const PRISM_LIGHT_MODE_INTENTIONAL_DARK_MATERIALS = [
  {
    file: "replayRecording.module.css",
    selector: ".screen",
    reason:
      "The 16:9 playback letterbox stays neutral-black while the surrounding replay panel and controls theme with the shell.",
  },
  {
    file: "AssetLibrary.module.css",
    selector: ".studioPreview small",
    reason:
      "Labels overlay arbitrary image pixels and keep their neutral dark scrim in either shell for media readability.",
  },
  {
    file: "BotLibraryGroupSpectrumTile.module.css",
    selector: ".tile",
    reason:
      "The tile is identity artwork built from the group spectrum and atmosphere, not structural shell chrome.",
  },
  {
    file: "BotCreationRitual.module.css",
    selector: ".synthesisScreen",
    reason:
      "The active CRT synthesis aperture remains physical near-black scene material inside the explicitly themed foundry.",
  },
  {
    file: "BotPowerRune.module.css",
    selector: ".rune::before",
    reason:
      "The rune is an emissive CRT instrument whose dark aperture is independent of surrounding editor chrome.",
  },
  {
    file: "avatar-details-editor.module.css",
    selector: ".canvasFrame",
    reason:
      "Avatar Details paints authored phosphor pixels against the real dark screen aperture in both editor themes.",
  },
] as const satisfies readonly PrismLightModeIntentionalDarkMaterial[];

export interface PrismLightModeOpenException {
  file: string;
  owner: "shared-source" | "surface-exception";
  followup: "PRISM-biijf.2" | "PRISM-biijf.3" | "PRISM-biijf.4" | "PRISM-biijf.5";
  reason: string;
}

/** Static audit findings that still require a focused implementation/visual pass. */
export const PRISM_LIGHT_MODE_OPEN_EXCEPTIONS: readonly PrismLightModeOpenException[] = [];

/** Literal forced-dark roots are exact-counted by the inventory regression. */
export interface PrismLightModeForcedDarkRoot {
  file: string;
  occurrences: number;
}

export const PRISM_LIGHT_MODE_FORCED_DARK_ROOTS: readonly PrismLightModeForcedDarkRoot[] = [];

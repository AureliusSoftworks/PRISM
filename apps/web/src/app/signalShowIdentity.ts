import {
  BOTCAST_ECHO_DASHBOARD_BLURB_FALLBACK,
  BOTCAST_HOST_RECOVERY_QUESTION_TARGET,
  BOT_POWER_CANONICAL_SILENCE_V1,
  type BotcastShow,
} from "@localai/shared";

export type SignalMagicArtworkKind = "night-studio" | "day-studio" | "logo";

export type SignalShowMagicManifest = {
  needsTextIdentity: boolean;
  missingArtwork: SignalMagicArtworkKind[];
  needsAudioPackage: boolean;
  complete: boolean;
};

/**
 * Describes the durable identity pieces Magic can add without replacing an
 * existing image or audio choice. `dashboardBlurbs` is normally the persisted
 * sentinel for the generated text package. A muted host always owns `["..."]`,
 * so its original default `studioIdentity` distinguishes an unfinished show.
 */
export function signalShowMagicManifest(
  show: Pick<
    BotcastShow,
    | "dashboardBlurbs"
    | "hostRecoveryQuestions"
    | "studioIdentity"
    | "dayAtmosphere"
    | "nightAtmosphere"
    | "logo"
    | "introAudio"
    | "atmosphereAudio"
  >,
): SignalShowMagicManifest {
  const missingArtwork: SignalMagicArtworkKind[] = [];
  if (!show.nightAtmosphere.imageUrl) missingArtwork.push("night-studio");
  // The artwork job can derive Light only after it has a Dark source. Asking
  // for both preserves that dependency when neither exists.
  if (!show.dayAtmosphere.imageUrl) missingArtwork.push("day-studio");
  if (!show.logo.imageUrl) missingArtwork.push("logo");

  const hasOnlyCanonicalSilence =
    show.dashboardBlurbs.length === 1 &&
    show.dashboardBlurbs[0] === BOT_POWER_CANONICAL_SILENCE_V1;
  const hasOnlyCanonicalEchoBlurb =
    show.dashboardBlurbs.length === 1 &&
    show.dashboardBlurbs[0] === BOTCAST_ECHO_DASHBOARD_BLURB_FALLBACK;
  const usesFallbackStudioIdentity =
    /^Canonical persona-first set bible for\b/u.test(show.studioIdentity);
  const needsTextIdentity =
    show.dashboardBlurbs.length === 0 ||
    ((!hasOnlyCanonicalSilence && !hasOnlyCanonicalEchoBlurb) &&
      show.hostRecoveryQuestions.length !==
        BOTCAST_HOST_RECOVERY_QUESTION_TARGET) ||
    ((hasOnlyCanonicalSilence || hasOnlyCanonicalEchoBlurb) &&
      usesFallbackStudioIdentity);
  const needsAudioPackage =
    show.introAudio.source !== "elevenlabs" ||
    !show.introAudio.outdentAudioUrl ||
    show.atmosphereAudio.source !== "elevenlabs";

  return {
    needsTextIdentity,
    missingArtwork,
    needsAudioPackage,
    complete:
      !needsTextIdentity &&
      missingArtwork.length === 0 &&
      !needsAudioPackage,
  };
}

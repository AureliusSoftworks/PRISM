import type { BotcastShow } from "@localai/shared";

export type SignalMagicArtworkKind = "night-studio" | "day-studio" | "logo";

export type SignalShowMagicManifest = {
  needsTextIdentity: boolean;
  missingArtwork: SignalMagicArtworkKind[];
  needsAudioPackage: boolean;
  complete: boolean;
};

/**
 * Describes the durable identity pieces Magic can add without replacing an
 * existing image or audio choice. `dashboardBlurbs` is the persisted sentinel
 * for the generated text package; the other text fields always have defaults.
 */
export function signalShowMagicManifest(
  show: Pick<
    BotcastShow,
    | "dashboardBlurbs"
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

  const needsTextIdentity = show.dashboardBlurbs.length === 0;
  const needsAudioPackage =
    show.introAudio.source !== "elevenlabs" ||
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

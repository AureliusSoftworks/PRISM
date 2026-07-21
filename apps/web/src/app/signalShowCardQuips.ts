import {
  BOTCAST_DASHBOARD_BLURB_FALLBACKS,
  BOTCAST_ECHO_DASHBOARD_BLURB_FALLBACK,
  BOT_POWER_CANONICAL_SILENCE_V1,
  isBotcastEchoDashboardBlurb,
  type BotcastShow,
} from "@localai/shared";

type SignalShowCardBlurbContext = Pick<BotcastShow, "dashboardBlurbs">;

/**
 * These are the only local lines used until Magic creates the show's own batch.
 */
export function fallbackSignalShowCardBlurbs(): typeof BOTCAST_DASHBOARD_BLURB_FALLBACKS {
  return BOTCAST_DASHBOARD_BLURB_FALLBACKS;
}

export function signalShowCardBlurbs(
  show: SignalShowCardBlurbContext,
  hostMuted = false,
  hostEchoesAddressedSpeech = false,
): readonly string[] {
  if (hostMuted) return [BOT_POWER_CANONICAL_SILENCE_V1];
  if (hostEchoesAddressedSpeech) {
    const echoBlurb = show.dashboardBlurbs.find(isBotcastEchoDashboardBlurb);
    return [echoBlurb ?? BOTCAST_ECHO_DASHBOARD_BLURB_FALLBACK];
  }
  return show.dashboardBlurbs.length > 0
    ? show.dashboardBlurbs
    : fallbackSignalShowCardBlurbs();
}

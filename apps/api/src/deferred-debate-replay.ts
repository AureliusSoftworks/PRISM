/**
 * Deferred scaffolding notes for Debate faithful archive replay and
 * Premium ElevenLabs upgrades on Debate + Coffee.
 *
 * This module is intentionally documentation-only for Phase 5 of the
 * spectator/watch plan. Do not wire ReplaySurfaceV1 = "debate" into every
 * switch until live capture + archive Watch ship.
 */

import {
  LIVE_BAKE_PREMIUM_UPGRADE_SEAM,
  type FutureReplaySurfaceExtensionV1,
} from "@localai/shared";

/** Reserved surface id for future Debate audio-master archives. */
export const DEFERRED_DEBATE_REPLAY_SURFACE: FutureReplaySurfaceExtensionV1 =
  "debate";

/**
 * When Debate faithful masters land:
 * 1. Extend ReplaySurfaceV1 with "debate"
 * 2. Capture direction (cameras, mouths, gavel) like Signal/Coffee
 * 3. Prefer attaching spectator liveBake artifacts when already present
 * 4. Keep sealed reopen (perspective=replay) readable for older archives
 */
export const DEFERRED_DEBATE_FAITHFUL_REPLAY_CHECKLIST = [
  "Widen ReplaySurfaceV1 to include debate",
  "Capture live Judge/Participant/Spectator masters",
  "Archive Watch UI for Debate",
  "Optional migrate sealed reopen → faithful when master exists",
] as const;

/**
 * Premium upgrade generalization (Signal is the reference today):
 * startReplayPremiumProduction remains Signal-gated. When Coffee/Debate
 * masters exist, widen eligibility using LIVE_BAKE_PREMIUM_UPGRADE_SEAM and
 * skip takes already marked Premium / elevenlabs.
 */
export const DEFERRED_PREMIUM_UPGRADE_SURFACES =
  LIVE_BAKE_PREMIUM_UPGRADE_SEAM.deferredSurfaces;

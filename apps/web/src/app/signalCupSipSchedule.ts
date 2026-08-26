/**
 * Turn-anchored sip schedule for the Signal studio cups.
 *
 * Signal used to drive cup level from wall-clock time and render the sip
 * sprite from a separate predicate. The level stepped at every sip-cycle
 * boundary whether or not a sip was renderable, so review 12d3d47e reported
 * "Randy's coffee drained without him drinking it" — the cup emptied across
 * warmup holds and generation gaps nobody was drinking through.
 *
 * Coffee already solved this by deriving its sip count from the persisted
 * message timeline, which makes the count identical live and on replay and
 * safe to seek. Signal has the same substrate but never emits cup stage
 * actions (`allowCupActions: false`), so there is nothing to count — instead
 * the schedule is derived from the turn structure itself: a bot drinks while
 * the other chair is talking.
 *
 * The level counts only opportunities that have already left the screen, and
 * the sprite shows the one currently on it, so every step of the level is a
 * sip the viewer has watched.
 */

/** Sips land at most once per this many turns, before the rate multiplier. */
export const SIGNAL_CUP_SIP_MIN_TURN_GAP = 3;

export interface SignalCupSipTurn {
  id: string;
  speakerRole: "host" | "guest" | string;
}

export interface SignalCupSipScheduleV1 {
  /** Sips already finished — every one of these was on screen when it played. */
  sipCount: number;
  /** True when the turn on screen is this role's sip and they can take it. */
  sippingNow: boolean;
}

/**
 * Ambient Signal sips belong inside the other participant's audible line.
 * Requiring active speech prevents a queued/saved turn from triggering the
 * cup early during the silent handoff before playback begins.
 */
export function signalCupSipAllowedDuringSpeechV1(args: {
  roleSpeaking: boolean;
  otherRoleSpeaking: boolean;
  producerGuestRole?: boolean;
}): boolean {
  return (
    args.producerGuestRole !== true &&
    !args.roleSpeaking &&
    args.otherRoleSpeaking
  );
}

function stableUnitValue(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

/**
 * Turn gap for this cup's drinking rate. A faster rate drinks more often, so
 * the gap shrinks; a slower rate stretches it. Rate zero means the holder has
 * no cup at all and never reaches this function.
 */
export function signalCupSipTurnGapV1(powerRateMultiplier = 1): number {
  const rate =
    Number.isFinite(powerRateMultiplier) && powerRateMultiplier > 0
      ? powerRateMultiplier
      : 1;
  return Math.max(1, Math.round(SIGNAL_CUP_SIP_MIN_TURN_GAP / rate));
}

/**
 * Resolve how much of this role's cup is gone as of the turn on screen.
 *
 * `presentedIndex` is the index of the turn the viewer is watching: the live
 * episode's latest message, or the message under the replay playhead. The
 * caller holds the last presented index through gaps where no message is
 * active, so the level never snaps backwards between turns — pass null only
 * before the first turn has aired.
 */
export function signalCupSipScheduleV1(args: {
  episodeId: string;
  role: "host" | "guest";
  turns: readonly SignalCupSipTurn[];
  presentedIndex: number | null;
  powerRateMultiplier?: number;
  /** True only while this role is listening to the other participant speak. */
  sipAllowed?: boolean;
}): SignalCupSipScheduleV1 {
  if (
    typeof args.presentedIndex !== "number" ||
    !Number.isFinite(args.presentedIndex) ||
    args.turns.length === 0
  ) {
    return { sipCount: 0, sippingNow: false };
  }
  const presented = Math.min(
    Math.max(0, Math.floor(args.presentedIndex)),
    args.turns.length - 1,
  );
  const turnGap = signalCupSipTurnGapV1(args.powerRateMultiplier);

  let sipCount = 0;
  let sippingNow = false;
  let previousSipIndex: number | null = null;
  for (let index = 0; index <= presented; index += 1) {
    const turn = args.turns[index];
    if (!turn) continue;
    // A bot drinks while the other chair holds the floor, never through its
    // own turn — which is also when the sip sprite is suppressed.
    if (turn.speakerRole === args.role) continue;
    if (previousSipIndex !== null && index - previousSipIndex < turnGap) {
      continue;
    }
    // Seeded on the message id, not the index: an index-seeded coin would
    // re-decide every past turn if the transcript were ever re-sliced or
    // partially loaded, and replay would drift from the live session.
    if (
      stableUnitValue(
        `signal-cup-sip:${args.episodeId}:${args.role}:${turn.id}`,
      ) >= 0.5
    ) {
      continue;
    }
    previousSipIndex = index;
    // The sip on screen has not been swallowed yet. It joins the level only
    // once the turn advances, so the sprite always precedes the drop.
    if (index === presented) {
      sippingNow = args.sipAllowed !== false;
      continue;
    }
    sipCount += 1;
  }
  return { sipCount, sippingNow };
}

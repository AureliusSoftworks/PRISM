/**
 * Presentation-only Auto camera beats for long moderator monologues (intro,
 * recess/resume calls, phase bridges, and other extended floor control).
 * Prefer Wide → named advocate when a name is heard; otherwise take brief Wide
 * breaths on long prose, then return to the moderator before handoff.
 *
 * Advocate cuts are a queue: finish For before Against (or prose order), never
 * jump to the last eligible name just because reveal raced ahead.
 */

export type DebateModeratorCameraView =
  | "wide"
  | "left"
  | "moderator"
  | "right";

/** @deprecated Alias retained for call-site clarity during intro beats. */
export type DebateIntroCameraView = DebateModeratorCameraView;

/** Establish on Wide before a named advocate close-up. */
export const DEBATE_INTRO_WIDE_HOLD_MS = 980;

/** Brief Wide accent during long moderator prose without a name cue. */
export const DEBATE_MODERATOR_BREATH_WIDE_MS = 720;

/** Long enough that a static moderator lock feels monotonous. */
export const DEBATE_MODERATOR_MONOLOGUE_MIN_CHARS = 160;

/**
 * Once this much of the audible monologue remains after the final introducee
 * close-up has established, Auto latches back to the moderator for the handoff.
 */
export const DEBATE_INTRO_RETURN_MODERATOR_REMAINING_RATIO = 0.38;

/** Minimum close-up time on the final introducee before an intentional cut home. */
export const DEBATE_INTRO_FINAL_CLOSE_MS = 2_200;

/** Stay on an introducee close-up at least this long before queuing the next. */
export const DEBATE_INTRO_MIN_CLOSE_BEFORE_ADVANCE_MS = 1_400;

/**
 * Docket roll calls often list both advocates within a short span. When the
 * only name hits are that early cluster, stay on the speaking moderator.
 */
export const DEBATE_INTRO_DOCKET_CLUSTER_GAP = 96;

/**
 * Docket bookend after the formal motion/cast listing. Profile talk about each
 * advocate usually follows; camera cues prefer names after this point.
 */
const DEBATE_INTRO_PROFILE_BOOKEND =
  /\b(?:the\s+proceeding\s+may\s+begin|we\s+(?:may|can)\s+begin|let\s+(?:us|the\s+proceeding)\s+begin|with\s+that(?:\s+said)?(?:[,.]|\s)|(?:so|now)[,.]?\s+(?:let(?:'|’)s|we)\s+(?:meet|meet\s+our|hear\s+from|turn\s+to))\b/iu;

export type DebateIntroAdvocateCue = {
  kind: "advocate";
  side: "for" | "against";
  view: "left" | "right";
  /** Character index where this advocate name begins in the monologue. */
  offset: number;
  /** Visible length must reach this before the cue may arm. */
  armOffset: number;
};

export type DebateModeratorBreathCue = {
  kind: "breath";
  offset: number;
};

export type DebateModeratorCameraCue =
  | DebateIntroAdvocateCue
  | DebateModeratorBreathCue;

function debateIntroNameOffsetFrom(
  content: string,
  name: string,
  fromIndex: number,
): number | null {
  const needle = name.trim();
  if (!needle) return null;
  const haystack = content.toLocaleLowerCase();
  const index = haystack.indexOf(
    needle.toLocaleLowerCase(),
    Math.max(0, fromIndex),
  );
  return index >= 0 ? index : null;
}

/** Arm after most of the name has been revealed — not at the first letter. */
export function debateIntroNameArmOffset(
  nameOffset: number,
  name: string,
): number {
  const length = name.trim().length;
  const heard = Math.min(length, Math.max(2, Math.ceil(length * 0.6)));
  return nameOffset + heard;
}

/**
 * Prefer a later name mention (post-docket profile talk) when present; otherwise
 * the first mention. Second occurrences beat first-docket roll calls.
 */
export function debateIntroPreferredNameOffset(
  content: string,
  name: string,
): number | null {
  const first = debateIntroNameOffsetFrom(content, name, 0);
  if (first === null) return null;

  const bookend = DEBATE_INTRO_PROFILE_BOOKEND.exec(content);
  if (bookend && bookend.index != null) {
    const afterBookend = debateIntroNameOffsetFrom(
      content,
      name,
      bookend.index + bookend[0].length,
    );
    if (afterBookend !== null) return afterBookend;
  }

  const second = debateIntroNameOffsetFrom(
    content,
    name,
    first + name.trim().length,
  );
  return second ?? first;
}

/**
 * Ordered introduction cues from the saved monologue text. Missing names are
 * skipped so mumbled / incomplete lines stay on the moderator. Pure docket
 * roll calls (both names only once, clustered early) yield no advocate cuts.
 */
export function debateIntroAdvocateCues(args: {
  content: string;
  forName: string;
  againstName: string;
}): DebateIntroAdvocateCue[] {
  const forFirst = debateIntroNameOffsetFrom(args.content, args.forName, 0);
  const againstFirst = debateIntroNameOffsetFrom(
    args.content,
    args.againstName,
    0,
  );
  const forOffset = debateIntroPreferredNameOffset(args.content, args.forName);
  const againstOffset = debateIntroPreferredNameOffset(
    args.content,
    args.againstName,
  );

  const bookend = DEBATE_INTRO_PROFILE_BOOKEND.exec(args.content);
  const bookendEnd =
    bookend && bookend.index != null
      ? bookend.index + bookend[0].length
      : null;
  const forIsFirstOnly = forOffset !== null && forOffset === forFirst;
  const againstIsFirstOnly =
    againstOffset !== null && againstOffset === againstFirst;
  if (
    forIsFirstOnly &&
    againstIsFirstOnly &&
    forFirst !== null &&
    againstFirst !== null &&
    Math.abs(forFirst - againstFirst) <= DEBATE_INTRO_DOCKET_CLUSTER_GAP &&
    (bookendEnd === null ||
      Math.max(forFirst, againstFirst) < bookendEnd)
  ) {
    // Roll call only — keep Auto on the speaking moderator.
    return [];
  }

  const cues: DebateIntroAdvocateCue[] = [];
  if (forOffset !== null) {
    cues.push({
      kind: "advocate",
      side: "for",
      view: "left",
      offset: forOffset,
      armOffset: debateIntroNameArmOffset(forOffset, args.forName),
    });
  }
  if (againstOffset !== null) {
    cues.push({
      kind: "advocate",
      side: "against",
      view: "right",
      offset: againstOffset,
      armOffset: debateIntroNameArmOffset(againstOffset, args.againstName),
    });
  }
  return cues.sort((left, right) => left.offset - right.offset);
}

/**
 * Mid-monologue Wide breaths when advocate names are absent but the prose is
 * long enough to feel static on a locked moderator shot.
 */
export function debateModeratorBreathCues(
  content: string,
  minChars = DEBATE_MODERATOR_MONOLOGUE_MIN_CHARS,
): DebateModeratorBreathCue[] {
  const trimmed = content.trim();
  if (trimmed.length < minChars) return [];
  const ratios = trimmed.length >= minChars * 2 ? [0.34, 0.66] : [0.45];
  return ratios.map((ratio) => ({
    kind: "breath" as const,
    offset: Math.max(1, Math.floor(trimmed.length * ratio)),
  }));
}

export function debateModeratorCameraCues(args: {
  content: string;
  forName: string;
  againstName: string;
  /**
   * The introducee wide-cut sequence is intro cinematography. Later moderator
   * monologues mention the advocates constantly — challenge prompts, phase
   * bridges, rulings — and re-running "introducing the debaters" cuts on each
   * one reads as the camera thrashing Wide ↔ Moderator mid-session. Pass
   * false for any beat that is not the actual introduction; those get calm
   * breath cues only.
   */
  introducees?: boolean;
}): DebateModeratorCameraCue[] {
  if (args.introducees !== false) {
    const nameCues = debateIntroAdvocateCues(args);
    if (nameCues.length > 0) return nameCues;
  }
  return debateModeratorBreathCues(args.content);
}

export function debateEventIsModeratorIntro(event: {
  kind: string;
  speakerKind: string;
  stepKey?: string | null;
}): boolean {
  if (event.speakerKind !== "moderator") return false;
  if (event.kind === "intro") return true;
  return event.stepKey === "intro" || event.stepKey === "turnabout_intro";
}

/**
 * True for moderator floor prose that benefits from Auto camera dynamism —
 * openings, recess/resume calls, phase bridges, and other long monologues.
 */
export function debateEventIsModeratorMonologue(event: {
  kind: string;
  speakerKind: string;
  stepKey?: string | null;
  content?: string | null;
  gavelReason?: string | null;
}): boolean {
  if (event.speakerKind !== "moderator") return false;
  if (debateEventIsModeratorIntro(event)) return true;
  if (event.kind === "phase") return true;
  if (event.stepKey === "pause" || event.stepKey === "resume") return true;
  if (event.gavelReason === "pause" || event.gavelReason === "resume") {
    return true;
  }
  if (event.kind === "speech" || event.kind === "intro") {
    return (
      (event.content?.trim().length ?? 0) >= DEBATE_MODERATOR_MONOLOGUE_MIN_CHARS
    );
  }
  return false;
}

export type DebateModeratorCameraFocus =
  | "for"
  | "against"
  | `breath:${number}`
  /** Latched after introducees — prevents Wide↔Moderator flicker. */
  | "complete"
  | null;

function debateIntroAdvocateShot(
  cue: DebateIntroAdvocateCue,
  args: {
    nowMs: number;
    wideHoldStartedAtMs: number | null;
    focusedSide: DebateModeratorCameraFocus;
    nameWideHoldMs: number;
  },
): {
  view: DebateModeratorCameraView;
  wideHoldStartedAtMs: number | null;
  focusedSide: DebateModeratorCameraFocus;
} {
  const switchedIntroducee = args.focusedSide !== cue.side;
  const wideHoldStartedAtMs = switchedIntroducee
    ? args.nowMs
    : (args.wideHoldStartedAtMs ?? args.nowMs);
  if (args.nowMs - wideHoldStartedAtMs < args.nameWideHoldMs) {
    return {
      view: "wide",
      wideHoldStartedAtMs,
      focusedSide: cue.side,
    };
  }
  return {
    view: cue.view,
    wideHoldStartedAtMs,
    focusedSide: cue.side,
  };
}

/**
 * Resolve the Auto monologue shot from how much has been heard.
 * Name cues take priority as a sequential queue; otherwise long prose gets
 * brief Wide breaths. Default is the speaking moderator.
 */
export function resolveDebateModeratorCameraView(args: {
  content: string;
  visibleLength: number;
  forName: string;
  againstName: string;
  nowMs: number;
  wideHoldStartedAtMs: number | null;
  focusedSide: DebateModeratorCameraFocus;
  wideHoldMs?: number;
  breathWideMs?: number;
  returnModeratorRemainingRatio?: number;
  /** See debateModeratorCameraCues — false for non-intro monologues. */
  introducees?: boolean;
}): {
  view: DebateModeratorCameraView;
  wideHoldStartedAtMs: number | null;
  focusedSide: DebateModeratorCameraFocus;
} {
  const content = args.content.trim();
  const cues = debateModeratorCameraCues({
    content,
    forName: args.forName,
    againstName: args.againstName,
    introducees: args.introducees,
  });
  if (!content || cues.length === 0) {
    return {
      view: "moderator",
      wideHoldStartedAtMs: null,
      focusedSide: null,
    };
  }

  const visibleLength = Math.max(
    0,
    Math.min(content.length, Math.floor(args.visibleLength)),
  );
  const remainingRatio =
    content.length === 0 ? 0 : (content.length - visibleLength) / content.length;
  const returnRatio =
    args.returnModeratorRemainingRatio ??
    DEBATE_INTRO_RETURN_MODERATOR_REMAINING_RATIO;
  const nameWideHoldMs = args.wideHoldMs ?? DEBATE_INTRO_WIDE_HOLD_MS;
  const breathWideMs = args.breathWideMs ?? DEBATE_MODERATOR_BREATH_WIDE_MS;
  const finalCloseMs = DEBATE_INTRO_FINAL_CLOSE_MS;
  const minCloseBeforeAdvanceMs = DEBATE_INTRO_MIN_CLOSE_BEFORE_ADVANCE_MS;

  // Once the introducee sequence has cut home, stay home — clearing focus used
  // to re-arm the last name cue and flicker Wide ↔ Moderator every hold cycle.
  if (args.focusedSide === "complete") {
    return {
      view: "moderator",
      wideHoldStartedAtMs: null,
      focusedSide: "complete",
    };
  }

  if (visibleLength <= 0) {
    return {
      view: "moderator",
      wideHoldStartedAtMs: null,
      focusedSide: null,
    };
  }

  const advocateCues = cues.filter(
    (cue): cue is DebateIntroAdvocateCue => cue.kind === "advocate",
  );

  if (advocateCues.length > 0) {
    const currentIndex =
      args.focusedSide === "for" || args.focusedSide === "against"
        ? advocateCues.findIndex((cue) => cue.side === args.focusedSide)
        : -1;
    const currentCue = currentIndex >= 0 ? advocateCues[currentIndex]! : null;
    const nextCue =
      currentIndex >= 0 ? (advocateCues[currentIndex + 1] ?? null) : null;

    if (currentCue) {
      const holdElapsedMs =
        args.wideHoldStartedAtMs != null
          ? args.nowMs - args.wideHoldStartedAtMs
          : 0;
      const closeEstablished = holdElapsedMs >= nameWideHoldMs;
      const introduceeDwellDone =
        holdElapsedMs >= nameWideHoldMs + minCloseBeforeAdvanceMs;
      const nextArmed =
        nextCue != null && visibleLength >= nextCue.armOffset;
      const isFinal = nextCue == null;
      const finalReadyToLeave =
        isFinal &&
        closeEstablished &&
        (holdElapsedMs >= nameWideHoldMs + finalCloseMs ||
          remainingRatio <= returnRatio);

      if (finalReadyToLeave) {
        return {
          view: "moderator",
          wideHoldStartedAtMs: null,
          focusedSide: "complete",
        };
      }

      // Queue: finish this introducee's dwell before starting the next, even if
      // reveal already raced past later name offsets.
      if (introduceeDwellDone && nextArmed) {
        return debateIntroAdvocateShot(nextCue, {
          nowMs: args.nowMs,
          wideHoldStartedAtMs: null,
          focusedSide: args.focusedSide,
          nameWideHoldMs,
        });
      }

      return debateIntroAdvocateShot(currentCue, {
        nowMs: args.nowMs,
        wideHoldStartedAtMs: args.wideHoldStartedAtMs,
        focusedSide: args.focusedSide,
        nameWideHoldMs,
      });
    }

    // Not yet on an introducee — arm the first cue whose name has been heard.
    const firstArmed = advocateCues.find(
      (cue) => visibleLength >= cue.armOffset,
    );
    const lastAdvocate = advocateCues[advocateCues.length - 1]!;
    const pastIntroducees = visibleLength > lastAdvocate.offset;
    // Cleared focus late in the handoff window — latch home instead of
    // replaying the queue from For.
    if (
      pastIntroducees &&
      remainingRatio <= returnRatio &&
      args.focusedSide === null
    ) {
      return {
        view: "moderator",
        wideHoldStartedAtMs: null,
        focusedSide: "complete",
      };
    }
    if (firstArmed) {
      return debateIntroAdvocateShot(firstArmed, {
        nowMs: args.nowMs,
        wideHoldStartedAtMs: args.wideHoldStartedAtMs,
        focusedSide: args.focusedSide,
        nameWideHoldMs,
      });
    }

    return {
      view: "moderator",
      wideHoldStartedAtMs: null,
      focusedSide: null,
    };
  }

  // Breath-only monologues (no advocate name queue).
  let activeBreath: DebateModeratorBreathCue | null = null;
  for (const cue of cues) {
    if (cue.kind === "breath" && visibleLength > cue.offset) {
      activeBreath = cue;
    }
  }
  if (!activeBreath) {
    return {
      view: "moderator",
      wideHoldStartedAtMs: null,
      focusedSide: null,
    };
  }

  const focusKey = `breath:${activeBreath.offset}` as const;
  const switched = args.focusedSide !== focusKey;
  const wideHoldStartedAtMs = switched
    ? args.nowMs
    : (args.wideHoldStartedAtMs ?? args.nowMs);
  if (args.nowMs - wideHoldStartedAtMs < breathWideMs) {
    return {
      view: "wide",
      wideHoldStartedAtMs,
      focusedSide: focusKey,
    };
  }
  return {
    view: "moderator",
    wideHoldStartedAtMs,
    focusedSide: focusKey,
  };
}

/** @deprecated Prefer resolveDebateModeratorCameraView. */
export function resolveDebateIntroCameraView(args: {
  content: string;
  visibleLength: number;
  forName: string;
  againstName: string;
  nowMs: number;
  wideHoldStartedAtMs: number | null;
  focusedSide: "for" | "against" | null;
  wideHoldMs?: number;
  returnModeratorRemainingRatio?: number;
}): {
  view: DebateIntroCameraView;
  wideHoldStartedAtMs: number | null;
  focusedSide: "for" | "against" | null;
} {
  const resolved = resolveDebateModeratorCameraView({
    ...args,
    focusedSide: args.focusedSide,
  });
  return {
    view: resolved.view,
    wideHoldStartedAtMs: resolved.wideHoldStartedAtMs,
    focusedSide:
      resolved.focusedSide === "for" || resolved.focusedSide === "against"
        ? resolved.focusedSide
        : null,
  };
}

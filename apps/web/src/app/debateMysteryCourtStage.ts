import type { WhodunnitInterrogationPhase } from "./debateMysteryInterrogation";

export type WhodunnitCourtCamera =
  | "wide"
  | "witness"
  | "prosecution"
  | "defense"
  | "judge";

/**
 * Whodunnit owns its camera cuts. The finite Court dialogue stream supplies
 * speaker identity; entrance beats briefly restore the establishing view.
 */
export function resolveWhodunnitCourtCamera(args: {
  /** The Court is still assembling; the establishing view holds. */
  arrival?: boolean;
  defenseDialogueActive: boolean;
  defendantDialogueActive: boolean;
  establishingWitness: boolean;
  interrogationPhase: WhodunnitInterrogationPhase | null;
  judgeDialogueActive: boolean;
  prosecutionDialogueActive: boolean;
}): WhodunnitCourtCamera {
  if (
    args.arrival ||
    args.establishingWitness ||
    args.interrogationPhase === "prosecutor_entrance" ||
    args.interrogationPhase === "suspect_entrance"
  ) {
    return "wide";
  }
  if (args.judgeDialogueActive) return "judge";
  if (args.prosecutionDialogueActive) return "prosecution";
  if (args.defenseDialogueActive || args.defendantDialogueActive) return "defense";
  return "witness";
}

export function whodunnitCourtCameraLabel(camera: WhodunnitCourtCamera): string {
  if (camera === "wide") return "Wide courtroom view";
  if (camera === "witness") return "Witness stand view";
  if (camera === "prosecution") return "Prosecution podium view";
  if (camera === "defense") return "Defense podium view";
  return "Judge bench view";
}

/** One gallery seat walks in every beat; the house then settles before the
 * judge speaks. An empty gallery still gives the Court its establishing beat. */
export const WHODUNNIT_COURT_ARRIVAL_SEAT_MS = 700;
export const WHODUNNIT_COURT_ARRIVAL_SETTLE_MS = 900;
export const WHODUNNIT_COURT_ARRIVAL_MIN_MS = 2_400;
const WHODUNNIT_COURT_ARRIVAL_REDUCED_MS = 600;

export interface WhodunnitCourtArrivalProgress {
  revealedCount: number;
  complete: boolean;
  ratio: number;
}

/**
 * The Court assembles before anyone speaks. Seats fill at a steady walk while
 * the wide camera holds; only when the last seat has landed and the house has
 * settled does testimony begin. Reduced motion seats everyone at once.
 */
export function whodunnitCourtArrivalProgress(args: {
  seatCount: number;
  elapsedMs: number;
  reducedMotion: boolean;
}): WhodunnitCourtArrivalProgress {
  const seats = Math.max(0, Math.floor(args.seatCount));
  const elapsed = Math.max(0, args.elapsedMs);
  if (args.reducedMotion) {
    return {
      revealedCount: seats,
      complete: elapsed >= WHODUNNIT_COURT_ARRIVAL_REDUCED_MS,
      ratio: Math.min(1, elapsed / WHODUNNIT_COURT_ARRIVAL_REDUCED_MS),
    };
  }
  const totalMs = Math.max(
    WHODUNNIT_COURT_ARRIVAL_MIN_MS,
    seats * WHODUNNIT_COURT_ARRIVAL_SEAT_MS + WHODUNNIT_COURT_ARRIVAL_SETTLE_MS,
  );
  return {
    revealedCount: Math.min(seats, Math.floor(elapsed / WHODUNNIT_COURT_ARRIVAL_SEAT_MS)),
    complete: elapsed >= totalMs,
    ratio: Math.min(1, elapsed / totalMs),
  };
}

export interface WhodunnitCourtGallerySeat<T> {
  bot: T;
  role: "juror" | "suspect";
  side: "left" | "right";
  /** Horizontal seat position across the back rows, in percent of the stage. */
  xPercent: number;
  row: 0 | 1;
}

/**
 * The public gallery: the jury first, then every suspect who is neither on the
 * stand nor in the dock. Seats alternate aisles from the front, which is also
 * the order they walk in.
 */
export function whodunnitCourtGallerySeats<T extends { id: string }>(args: {
  jurors: readonly T[];
  suspects: readonly T[];
  excludeBotIds: ReadonlySet<string>;
}): WhodunnitCourtGallerySeat<T>[] {
  const seen = new Set<string>();
  const roster: Array<{ bot: T; role: "juror" | "suspect" }> = [];
  for (const [role, bots] of [["juror", args.jurors], ["suspect", args.suspects]] as const) {
    for (const bot of bots) {
      if (args.excludeBotIds.has(bot.id) || seen.has(bot.id)) continue;
      seen.add(bot.id);
      roster.push({ bot, role });
    }
  }
  return roster.map((seat, index) => {
    const side = index % 2 === 0 ? "left" : "right";
    const aisleIndex = Math.floor(index / 2);
    const slot = aisleIndex % 4;
    return {
      ...seat,
      side,
      xPercent: side === "left" ? 7 + slot * 11 : 93 - slot * 11,
      row: aisleIndex >= 4 ? 1 : 0,
    };
  });
}

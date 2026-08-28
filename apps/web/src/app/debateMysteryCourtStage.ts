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
  defenseDialogueActive: boolean;
  defendantDialogueActive: boolean;
  establishingWitness: boolean;
  interrogationPhase: WhodunnitInterrogationPhase | null;
  judgeDialogueActive: boolean;
  prosecutionDialogueActive: boolean;
}): WhodunnitCourtCamera {
  if (
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

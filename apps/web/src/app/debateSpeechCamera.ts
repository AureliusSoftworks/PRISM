/**
 * Auto coverage for ordinary Debate floor speech. Moderator intros keep their
 * own name-cue choreography; this planner only leaves a lingering close-up.
 */

import {
  autoCameraCoverageBeatAt,
  autoCameraCoverageNextBoundaryMs,
  planAutoCameraCoverage,
} from "@localai/shared";

export type DebateSpeechCameraRole = "for" | "moderator" | "against";
export type DebateSpeechCameraView = "wide" | "left" | "moderator" | "right";

const DEBATE_COVERAGE_CUTAWAYS: Record<
  DebateSpeechCameraRole,
  readonly DebateSpeechCameraView[]
> = {
  // Forum seats only. The Jury chamber is a required deliberation scene,
  // never an Auto glance.
  for: ["right", "moderator"],
  against: ["left", "moderator"],
  moderator: ["left", "right"],
};

export function debateSpeakerCameraView(
  role: DebateSpeechCameraRole,
): DebateSpeechCameraView {
  if (role === "for") return "left";
  if (role === "against") return "right";
  return "moderator";
}

function debateCoverageBeats(args: {
  durationMs: number;
  seed: string;
  content: string;
}) {
  return planAutoCameraCoverage({
    utteranceDurationMs: args.durationMs,
    seed: args.seed,
    content: args.content,
    allowCutaway: true,
    listenerCount: 2,
  });
}

export function resolveDebateSpeechCoverageView(args: {
  speakerRole: DebateSpeechCameraRole;
  elapsedMs: number;
  durationMs: number;
  seed: string;
  content: string;
}): DebateSpeechCameraView | null {
  const beats = debateCoverageBeats(args);
  const beat = autoCameraCoverageBeatAt(beats, args.elapsedMs);
  if (!beat) return null;
  if (beat.kind === "wide") return "wide";
  const targets = DEBATE_COVERAGE_CUTAWAYS[args.speakerRole];
  return targets[beat.cutawayIndex % targets.length] ?? "wide";
}

export function debateSpeechCoverageNextTickMs(args: {
  elapsedMs: number;
  durationMs: number;
  seed: string;
  content: string;
}): number | null {
  return autoCameraCoverageNextBoundaryMs(
    debateCoverageBeats(args),
    args.elapsedMs,
  );
}

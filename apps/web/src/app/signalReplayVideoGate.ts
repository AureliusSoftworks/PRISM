import type {
  BotcastEpisodeSummary,
  ReplayRecordingV1,
} from "@localai/shared";

export function signalReplayRecordingHasVideo(
  recording: ReplayRecordingV1 | null,
): boolean {
  return Boolean(
    recording &&
      (recording.status === "ready" || recording.status === "ready_with_warnings") &&
      recording.videoUrl,
  );
}

export function signalReplayPremiumHasVideo(
  recording: ReplayRecordingV1 | null,
): boolean {
  return Boolean(
    recording?.premiumProduction?.phase === "ready" &&
      recording.premiumProduction.videoUrl,
  );
}

export function signalEpisodeArchiveActionLabel(
  item: BotcastEpisodeSummary,
  recording: ReplayRecordingV1 | null,
): string {
  if (item.status === "live") return "Resume episode";
  return signalReplayRecordingHasVideo(recording)
    ? "Open replay · Video ready"
    : "Open local replay";
}

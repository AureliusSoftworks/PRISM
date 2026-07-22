import type {
  BotcastEpisodeSummary,
  ReplayRecordingV1,
} from "@localai/shared";

export function signalReplayRecordingHasVideo(
  recording: ReplayRecordingV1 | null,
): boolean {
  return Boolean(
    recording &&
      recording.premiumProduction?.phase === "ready" &&
      recording.premiumProduction.videoUrl,
  );
}

export function signalEpisodeArchiveActionLabel(
  item: BotcastEpisodeSummary,
  recording: ReplayRecordingV1 | null,
): string {
  if (item.status === "live") return "Resume episode";
  return signalReplayRecordingHasVideo(recording)
    ? "Open replay · Premium ready"
    : "Open local replay";
}

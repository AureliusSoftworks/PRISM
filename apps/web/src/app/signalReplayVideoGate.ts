import type {
  BotcastEpisodeSummary,
  ReplayRecordingV1,
} from "@localai/shared";

export function signalReplayRecordingHasVideo(
  recording: ReplayRecordingV1 | null,
): boolean {
  return Boolean(
    recording &&
      recording.manifest?.visual.metadata?.renderContract ===
        "signal-studio-dom-v2" &&
      (recording.status === "ready" ||
        recording.status === "ready_with_warnings") &&
      recording.videoUrl,
  );
}

export function signalEpisodeArchiveActionLabel(
  item: BotcastEpisodeSummary,
  recording: ReplayRecordingV1 | null,
): string {
  if (item.status === "live") return "Resume episode";
  if (signalReplayRecordingHasVideo(recording)) return "Watch episode";
  if (
    recording?.status === "rendering" &&
    recording.captureMode === "live"
  ) {
    return "Finishing recording";
  }
  if (
    recording?.status === "queued" ||
    recording?.status === "preparing_audio" ||
    recording?.status === "rendering"
  ) {
    return "Rebuilding episode video";
  }
  return "Render episode video";
}

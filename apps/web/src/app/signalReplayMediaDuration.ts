/**
 * Read the packet-accurate duration of a faithful Signal audio master.
 *
 * MediaRecorder WebM files can omit a finite container duration, so the
 * browser's HTMLMediaElement may report Infinity. Mediabunny reads the final
 * audio packet without decoding the episode and gives replay timing a stable
 * transport duration for archived as well as newly recorded sessions.
 */
export async function signalReplayMediaDurationMs(
  audioUrl: string,
): Promise<number | null> {
  const normalizedUrl = audioUrl.trim();
  if (!normalizedUrl) return null;

  let input: import("mediabunny").Input | null = null;
  try {
    const { ALL_FORMATS, Input, UrlSource } = await import("mediabunny");
    input = new Input({
      formats: ALL_FORMATS,
      source: new UrlSource(normalizedUrl, {
        requestInit: { credentials: "same-origin" },
      }),
    });
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    const durationSeconds = await track.computeDuration({ skipLiveWait: true });
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
    return Math.max(1, Math.round(durationSeconds * 1_000));
  } catch {
    return null;
  } finally {
    input?.dispose();
  }
}

export function signalReplayElementDurationMs(
  durationSeconds: number,
): number | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  return Math.max(1, Math.round(durationSeconds * 1_000));
}

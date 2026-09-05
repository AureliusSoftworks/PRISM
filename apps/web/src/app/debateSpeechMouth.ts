/**
 * Debate mouths should not freeze on the last open shape while the next
 * phrase is still being prepared. Short clause breaths can hold; a pause
 * longer than one second returns the face to its default closed mouth.
 */

export const DEBATE_MOUTH_PAUSE_CLOSE_MS = 1_000;

export function debateSpeechMouthShouldRest({
  lastVoiceProgressAtMs,
  nowMs,
}: {
  lastVoiceProgressAtMs: number | null;
  nowMs: number;
}): boolean {
  if (lastVoiceProgressAtMs == null) return false;
  if (!Number.isFinite(lastVoiceProgressAtMs) || !Number.isFinite(nowMs)) {
    return false;
  }
  return nowMs - lastVoiceProgressAtMs >= DEBATE_MOUTH_PAUSE_CLOSE_MS;
}

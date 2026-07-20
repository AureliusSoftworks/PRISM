export const SIGNAL_TRANSCRIPT_BOTTOM_THRESHOLD_PX = 48;

export type SignalTranscriptScrollMetrics = {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
};

/**
 * Signal follows the live line only while the producer is already at the
 * bottom. Scrolling upward transfers ownership to the producer; returning
 * within this small threshold arms follow mode again.
 */
export function signalTranscriptIsNearBottom(
  metrics: SignalTranscriptScrollMetrics,
  thresholdPx = SIGNAL_TRANSCRIPT_BOTTOM_THRESHOLD_PX,
): boolean {
  const distance =
    Math.max(0, metrics.scrollHeight) -
    Math.max(0, metrics.clientHeight) -
    Math.max(0, metrics.scrollTop);
  return distance <= Math.max(0, thresholdPx);
}

export function followSignalTranscriptToBottom(element: {
  scrollTop: number;
  scrollHeight: number;
}): void {
  element.scrollTop = Math.max(0, element.scrollHeight);
}

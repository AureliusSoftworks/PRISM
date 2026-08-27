export interface ResumableAudioContext {
  readonly state: AudioContextState;
  resume(): Promise<void>;
}

/**
 * WebKit can move an AudioContext into `interrupted` after an output-device,
 * sleep, or app-focus transition. Treat every live non-running context as
 * resumable; checking only `suspended` leaves the whole Web Audio mix silent.
 */
export function audioContextNeedsResume(
  context: Pick<ResumableAudioContext, "state">,
): boolean {
  return context.state !== "running" && context.state !== "closed";
}

export async function resumeAudioContextIfNeeded(
  context: ResumableAudioContext,
): Promise<boolean> {
  if (context.state === "running") return true;
  if (context.state === "closed") return false;
  try {
    await context.resume();
  } catch {
    return false;
  }
  // `resume()` mutates state asynchronously; re-read through the platform
  // union because TypeScript keeps the pre-await narrowing here.
  return (context.state as AudioContextState) === "running";
}

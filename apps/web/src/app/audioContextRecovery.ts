export interface ResumableAudioContext {
  readonly state: AudioContextState;
  resume(): Promise<void>;
}

type RecoveryEventTarget = Pick<
  EventTarget,
  "addEventListener" | "removeEventListener"
>;

type RecoveryDocument = RecoveryEventTarget & {
  readonly visibilityState?: DocumentVisibilityState;
};

export type AudioContextRecoveryLifecycle = {
  /** Must return an existing context only; recovery must never create audio. */
  getContext: () => ResumableAudioContext | null;
  documentTarget?: RecoveryDocument | null;
  windowTarget?: RecoveryEventTarget | null;
  deviceTarget?: RecoveryEventTarget | null;
};

function asRecoveryEventTarget(
  candidate: unknown,
): RecoveryEventTarget | null {
  if (
    !candidate ||
    typeof (candidate as RecoveryEventTarget).addEventListener !== "function" ||
    typeof (candidate as RecoveryEventTarget).removeEventListener !== "function"
  ) {
    return null;
  }
  return candidate as RecoveryEventTarget;
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

/**
 * Recover an already-created shared context after the app returns from sleep,
 * focus loss, or an output-device interruption. It deliberately neither
 * creates an AudioContext nor touches gains/media settings: the initiating
 * playback owner remains authoritative for mute, master volume, and tails.
 */
export function installAudioContextRecoveryLifecycle(
  lifecycle: AudioContextRecoveryLifecycle,
): () => void {
  const documentTarget = asRecoveryEventTarget(
    lifecycle.documentTarget ??
      (typeof document === "undefined" ? null : document),
  ) as RecoveryDocument | null;
  const windowTarget = asRecoveryEventTarget(
    lifecycle.windowTarget ?? (typeof window === "undefined" ? null : window),
  );
  const deviceTarget = asRecoveryEventTarget(
    lifecycle.deviceTarget ??
      (typeof navigator === "undefined" ? null : navigator.mediaDevices),
  );
  let pending: Promise<boolean> | null = null;

  const recover = (): void => {
    const context = lifecycle.getContext();
    if (!context || !audioContextNeedsResume(context) || pending) return;
    pending = resumeAudioContextIfNeeded(context).finally(() => {
      pending = null;
    });
  };
  const recoverWhenVisible = (): void => {
    if (documentTarget?.visibilityState === "hidden") return;
    recover();
  };

  documentTarget?.addEventListener("visibilitychange", recoverWhenVisible);
  // These are deliberately synchronous event handlers so a user gesture can
  // satisfy WebKit's resume policy after a device or sleep interruption.
  documentTarget?.addEventListener("pointerdown", recover);
  documentTarget?.addEventListener("keydown", recover);
  windowTarget?.addEventListener("focus", recoverWhenVisible);
  windowTarget?.addEventListener("pageshow", recoverWhenVisible);
  deviceTarget?.addEventListener("devicechange", recoverWhenVisible);

  return () => {
    documentTarget?.removeEventListener("visibilitychange", recoverWhenVisible);
    documentTarget?.removeEventListener("pointerdown", recover);
    documentTarget?.removeEventListener("keydown", recover);
    windowTarget?.removeEventListener("focus", recoverWhenVisible);
    windowTarget?.removeEventListener("pageshow", recoverWhenVisible);
    deviceTarget?.removeEventListener("devicechange", recoverWhenVisible);
  };
}

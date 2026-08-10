import type { BuiltinTtsChildResponse } from "./builtin-tts-worker-client.ts";

export interface BuiltinTtsChildIpcSender {
  connected: boolean;
  send?: (
    message: BuiltinTtsChildResponse,
    callback?: (error: Error | null) => void,
  ) => boolean;
}

export function isClosedBuiltinTtsIpcError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EPIPE" || code === "ERR_IPC_CHANNEL_CLOSED";
}

/**
 * Deliver a worker result without letting a parent shutdown race become an
 * uncaught child-process error. `process.connected` is only a snapshot: the
 * IPC channel can close between that check and `process.send`, so both the
 * synchronous throw and asynchronous callback must be handled.
 */
export function sendBuiltinTtsChildResponse(
  sender: BuiltinTtsChildIpcSender,
  response: BuiltinTtsChildResponse,
): Promise<boolean> {
  if (!sender.connected || typeof sender.send !== "function") {
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (delivered: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(delivered);
    };
    try {
      // `process.send` relies on its process receiver in Node 22. Calling an
      // extracted function loses that receiver and silently drops the IPC
      // response through this helper's synchronous-close guard.
      sender.send!(response, (error) => finish(!error));
    } catch {
      finish(false);
    }
  });
}

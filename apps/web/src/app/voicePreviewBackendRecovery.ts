import { isBackendUnavailablePayload } from "./backendUnavailable.ts";

export async function voicePreviewResponseNeedsBackendRecovery(
  response: Response,
): Promise<boolean> {
  if (response.status !== 503) return false;
  const payload = await response
    .clone()
    .json()
    .catch(() => null);
  return isBackendUnavailablePayload(payload);
}

export async function requestVoicePreviewWithBackendRecovery(args: {
  request: () => Promise<Response>;
  recoverBackend: () => Promise<void>;
}): Promise<Response> {
  const firstResponse = await args.request();
  if (!(await voicePreviewResponseNeedsBackendRecovery(firstResponse))) {
    return firstResponse;
  }

  try {
    await args.recoverBackend();
  } catch {
    // Preserve the original structured 503 so the pane can explain that the
    // local API is still unavailable. The global reconnect loop keeps trying.
    return firstResponse;
  }

  // A preview is user-initiated, so retry exactly once after the shared health
  // probe succeeds. Never turn this into an unbounded synthesis loop.
  return args.request();
}

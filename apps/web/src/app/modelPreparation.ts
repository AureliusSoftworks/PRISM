import type {
  ModelPreparationExperience,
  ModelPreparationRequest,
  ModelPreparationResponse,
} from "@localai/shared";

export type ModelPreparationRequestFn = <T>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = (): void => {
      globalThis.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function waitForModelPreparation(args: {
  request: ModelPreparationRequestFn;
  provider: ModelPreparationRequest["provider"];
  model?: string | null;
  experience: ModelPreparationExperience;
  signal?: AbortSignal;
  retry?: boolean;
  onStatus?: (status: ModelPreparationResponse) => void;
}): Promise<ModelPreparationResponse> {
  let retry = args.retry === true;
  while (true) {
    if (args.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const status = await args.request<ModelPreparationResponse>(
      "/api/models/prepare",
      {
        method: "POST",
        signal: args.signal,
        body: JSON.stringify({
          provider: args.provider,
          model: args.model ?? null,
          experience: args.experience,
          ...(retry ? { retry: true } : {}),
        } satisfies ModelPreparationRequest),
      },
    );
    retry = false;
    args.onStatus?.(status);
    if (status.state !== "warming") return status;
    await abortableDelay(status.retryAfterMs ?? 1_000, args.signal);
  }
}

export function modelPreparationFailureMessage(
  status: Pick<ModelPreparationResponse, "failure">,
): string {
  switch (status.failure) {
    case "model_unavailable":
      return "That local model is no longer available. Choose another model or try again after it is installed.";
    case "timed_out":
      return "The local model took too long to get ready. The session is still paused.";
    case "runtime_unavailable":
      return "PRISM could not reach the local model service. Check Ollama, then try again.";
    default:
      return "The local model could not get ready. The session is still paused.";
  }
}

import { isPrismBackendUnavailableError } from "./backendUnavailable.ts";

export async function requestBabbleWithProceduralFallback<T>(args: {
  request: () => Promise<T | null>;
  allowFallback?: boolean;
  isTransportFailure?: (error: unknown) => boolean;
}): Promise<T | null> {
  try {
    return await args.request();
  } catch (error) {
    const recoverProcedurally =
      args.allowFallback !== false &&
      (isPrismBackendUnavailableError(error) ||
        args.isTransportFailure?.(error) === true);
    if (recoverProcedurally) return null;
    throw error;
  }
}

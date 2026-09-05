import { replayFetch } from "./replayClient.ts";

export type ReplayCoordinatorSessionState =
  | "authenticated"
  | "signed-out"
  | "unavailable";

/**
 * The coordinator lives in the root shell, outside the page's auth state. A
 * quiet auth probe prevents it from hammering protected replay routes while
 * the login screen or a signed-out developer route is open.
 */
export async function replayCoordinatorSessionState(
  fetchReplay: typeof replayFetch = replayFetch,
): Promise<ReplayCoordinatorSessionState> {
  let response: Response;
  try {
    response = await fetchReplay("/api/auth/me");
  } catch {
    return "unavailable";
  }
  if (!response.ok) {
    return response.status >= 500 ? "unavailable" : "signed-out";
  }
  const payload = (await response.json().catch(() => null)) as
    | { user?: unknown }
    | null;
  return payload?.user && typeof payload.user === "object"
    ? "authenticated"
    : "signed-out";
}

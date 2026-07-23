const COFFEE_SIP_TALK_SETTLE_MS = 50;
const COFFEE_SIP_TALK_FALLBACK_MS = 3_200;

export type CoffeeSipAnimationSnapshot = {
  animationName?: string;
  currentTime?: Animation["currentTime"];
  playState?: Animation["playState"];
};

export type CoffeeSipElement = {
  dataset: DOMStringMap;
  getAnimations: () => readonly CoffeeSipAnimationSnapshot[];
  isConnected: boolean;
};

function coffeeSipAnimationIsRelevant(
  animation: CoffeeSipAnimationSnapshot,
): boolean {
  const name = animation.animationName?.toLowerCase() ?? "";
  return name.includes("coffeecupsip") || name.includes("coffeecuprestduringsip");
}

export function coffeeSipTalkDelayMs(args: {
  sipping: boolean;
  animationDurationMs?: number | null;
  animations?: readonly CoffeeSipAnimationSnapshot[];
}): number {
  if (!args.sipping) return 0;
  const durationMs =
    typeof args.animationDurationMs === "number" &&
    Number.isFinite(args.animationDurationMs) &&
    args.animationDurationMs > 0
      ? args.animationDurationMs
      : COFFEE_SIP_TALK_FALLBACK_MS;
  const relevantAnimations = (args.animations ?? []).filter(
    coffeeSipAnimationIsRelevant,
  );
  if (
    relevantAnimations.length > 0 &&
    relevantAnimations.every((animation) => animation.playState === "finished")
  ) {
    return 0;
  }
  const elapsedTimes = relevantAnimations
    .map((animation) => animation.currentTime)
    .filter(
      (currentTime): currentTime is number =>
        typeof currentTime === "number" &&
        Number.isFinite(currentTime) &&
        currentTime >= 0,
    );
  const elapsedMs =
    elapsedTimes.length > 0 ? Math.min(...elapsedTimes) : 0;
  const remainingMs = Math.max(0, durationMs - elapsedMs);
  return remainingMs > 0
    ? Math.ceil(remainingMs + COFFEE_SIP_TALK_SETTLE_MS)
    : 0;
}

export async function waitForActiveCoffeeSipBeforeTalk(
  element: CoffeeSipElement | null | undefined,
  sleep: (delayMs: number) => Promise<void> = (delayMs) =>
    new Promise((resolve) => window.setTimeout(resolve, delayMs)),
): Promise<number> {
  if (
    !element?.isConnected ||
    element.dataset.cupSipping !== "true"
  ) {
    return 0;
  }
  let animations: CoffeeSipAnimationSnapshot[] = [];
  try {
    animations = element.getAnimations().map((animation) => ({
      animationName: animation.animationName,
      currentTime: animation.currentTime,
      playState: animation.playState,
    }));
  } catch {
    // A duration fallback still preserves the no-snap contract in older WebViews.
  }
  const delayMs = coffeeSipTalkDelayMs({
    sipping: true,
    animationDurationMs: Number(element.dataset.cupSipDurationMs),
    animations,
  });
  if (delayMs > 0) await sleep(delayMs);
  return delayMs;
}

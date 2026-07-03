export const COFFEE_CENTER_SCROLL_BOTTOM_EPSILON_PX = 4;

export type CoffeeCenterScrollMetrics = {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
};

export function coffeeCenterScrollIsAtBottom(
  metrics: CoffeeCenterScrollMetrics,
  epsilonPx = COFFEE_CENTER_SCROLL_BOTTOM_EPSILON_PX
): boolean {
  const scrollTop = Number.isFinite(metrics.scrollTop) ? metrics.scrollTop : 0;
  const clientHeight = Number.isFinite(metrics.clientHeight) ? metrics.clientHeight : 0;
  const scrollHeight = Number.isFinite(metrics.scrollHeight) ? metrics.scrollHeight : 0;
  const epsilon = Number.isFinite(epsilonPx) ? Math.max(0, epsilonPx) : 0;
  return scrollTop + clientHeight >= scrollHeight - epsilon;
}

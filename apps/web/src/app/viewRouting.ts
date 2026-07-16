export type PrismSurfaceView =
  | "hub"
  | "chat"
  | "sandbox"
  | "coffee"
  | "botcast"
  | "slate"
  | "story";

/**
 * Product Chat now owns the immersive canvas. Deprecated Zen/Sandbox route
 * names are compatibility aliases only; the visible switcher emits Chat/Coffee.
 */
export function prismSurfaceViewForRouteParam(viewParam: string | null): PrismSurfaceView {
  if (viewParam === "chat" || viewParam === "zen" || viewParam === "sandbox") {
    return "chat";
  }
  if (viewParam === "coffee") return "coffee";
  if (viewParam === "botcast") return "botcast";
  if (viewParam === "slate") return "slate";
  if (viewParam === "story") return "story";
  return "chat";
}

export function prismHrefForSurfaceView(view: PrismSurfaceView): string {
  if (view === "hub" || view === "sandbox" || view === "chat") return "/?view=chat";
  return `/?view=${view}`;
}

import { PRISM_SURFACES } from "./prismSurfaceRegistry.ts";

export type PrismSurfaceView =
  | "hub"
  | "chat"
  | "sandbox"
  | "coffee"
  | "botcast"
  | "slate"
  | "story";

/**
 * The current `chat` route hosts All Bots, Prism Home, persona Zen Homes, and
 * group Homes while the living shell is introduced. Deprecated Zen/Sandbox
 * route names remain compatibility aliases only.
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
  if (view === "hub" || view === "sandbox" || view === "chat") {
    return PRISM_SURFACES.home.href;
  }
  if (view === "coffee") return PRISM_SURFACES.coffee.href;
  if (view === "botcast") return PRISM_SURFACES.signal.href;
  if (view === "slate") return PRISM_SURFACES.slate.href;
  return PRISM_SURFACES.story.href;
}

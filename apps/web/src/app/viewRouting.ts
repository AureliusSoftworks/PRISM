export type PrismSurfaceView = "hub" | "chat" | "sandbox" | "coffee" | "story";

/**
 * Legacy internal surface names are not product route names:
 * - internal "sandbox" is the current product Chat surface
 * - internal "chat" is the current product Zen surface
 */
export function prismSurfaceViewForRouteParam(viewParam: string | null): PrismSurfaceView {
  if (viewParam === "chat" || viewParam === "sandbox") return "sandbox";
  if (viewParam === "zen") return "chat";
  if (viewParam === "coffee") return "coffee";
  if (viewParam === "story") return "story";
  return "hub";
}

export function prismHrefForSurfaceView(view: PrismSurfaceView): string {
  if (view === "hub") return "/";
  if (view === "sandbox") return "/?view=chat";
  if (view === "chat") return "/?view=zen";
  return `/?view=${view}`;
}

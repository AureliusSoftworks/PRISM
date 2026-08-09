"use client";

export const PRISM_ORB_HANDOFF_DURATION_MS = 380;
export const PRISM_COMPANION_AVATAR_SELECTOR =
  '[data-prism-companion-avatar="true"]';
export const PRISM_LOADER_ORB_SLOT_SELECTOR =
  '[data-prism-blocking-orb-slot="true"]';
export const PRISM_CHAT_HOME_ORB_SLOT_SELECTOR =
  '[data-prism-chat-home-orb-slot="true"]';

export type PrismOrbHandoffRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readRect(element: Element | null): PrismOrbHandoffRect | null {
  if (!(element instanceof HTMLElement)) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function companionDockRectFromNormalizedPosition(
  position: { x: number; y: number },
  sizePx = 68,
): PrismOrbHandoffRect {
  const width =
    typeof window !== "undefined" ? window.innerWidth : sizePx;
  const height =
    typeof window !== "undefined" ? window.innerHeight : sizePx;
  return {
    left: position.x * width - sizePx / 2,
    top: position.y * height - sizePx / 2,
    width: sizePx,
    height: sizePx,
  };
}

function paintHandoffOrb(
  host: HTMLElement,
  from: PrismOrbHandoffRect,
  to: PrismOrbHandoffRect,
  durationMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    const orb = document.createElement("span");
    orb.setAttribute("data-prism-orb-handoff", "true");
    orb.setAttribute("aria-hidden", "true");
    Object.assign(orb.style, {
      position: "fixed",
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      zIndex: "5600",
      borderRadius: "50%",
      pointerEvents: "none",
      boxShadow:
        "0 0 18px 4px rgba(255,255,255,.35), 0 14px 32px rgba(0,0,0,.45)",
      background:
        "radial-gradient(circle at 35% 30%, #fff 0 18%, #f4f7ff 42%, #c9d7e4 78%, #9aafc0 100%)",
      transition: prefersReducedMotion()
        ? "none"
        : `left ${durationMs}ms cubic-bezier(.2,.82,.2,1), top ${durationMs}ms cubic-bezier(.2,.82,.2,1), width ${durationMs}ms cubic-bezier(.2,.82,.2,1), height ${durationMs}ms cubic-bezier(.2,.82,.2,1)`,
    });

    const glyph = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    glyph.setAttribute("viewBox", "0 0 32 32");
    glyph.setAttribute("focusable", "false");
    Object.assign(glyph.style, {
      position: "absolute",
      inset: "18%",
      width: "64%",
      height: "64%",
      fill: "#1a1b26",
    });
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M16 5.2 27 25H5Z");
    glyph.appendChild(path);
    orb.appendChild(glyph);
    host.appendChild(orb);

    const finish = (): void => {
      orb.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallback);
      orb.remove();
      resolve();
    };
    const onEnd = (event: TransitionEvent): void => {
      if (event.target !== orb) return;
      if (event.propertyName !== "left" && event.propertyName !== "top") return;
      finish();
    };
    const fallback = window.setTimeout(
      finish,
      prefersReducedMotion() ? 16 : durationMs + 80,
    );
    orb.addEventListener("transitionend", onEnd);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        orb.style.left = `${to.left}px`;
        orb.style.top = `${to.top}px`;
        orb.style.width = `${to.width}px`;
        orb.style.height = `${to.height}px`;
        if (prefersReducedMotion()) finish();
      });
    });
  });
}

export type AnimatePrismOrbHandoffOptions = {
  from?: Element | PrismOrbHandoffRect | null;
  to?: Element | PrismOrbHandoffRect | null;
  durationMs?: number;
};

/**
 * FLIP a temporary prism orb between two on-screen slots.
 * Resolves immediately when either endpoint is missing.
 */
export async function animatePrismOrbHandoff(
  options: AnimatePrismOrbHandoffOptions,
): Promise<void> {
  if (typeof document === "undefined") return;
  const from =
    options.from && "left" in options.from
      ? options.from
      : readRect((options.from as Element | null | undefined) ?? null);
  const to =
    options.to && "left" in options.to
      ? options.to
      : readRect((options.to as Element | null | undefined) ?? null);
  if (!from || !to) return;
  const durationMs = options.durationMs ?? PRISM_ORB_HANDOFF_DURATION_MS;
  await paintHandoffOrb(document.body, from, to, durationMs);
}

export function queryPrismCompanionAvatar(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const node = document.querySelector(PRISM_COMPANION_AVATAR_SELECTOR);
  return node instanceof HTMLElement ? node : null;
}

export function queryPrismLoaderOrbSlot(
  root?: ParentNode | null,
): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const scope = root ?? document;
  const node = scope.querySelector(PRISM_LOADER_ORB_SLOT_SELECTOR);
  return node instanceof HTMLElement ? node : null;
}

export function queryPrismChatHomeOrbSlot(
  root?: ParentNode | null,
): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const scope = root ?? document;
  const node = scope.querySelector(PRISM_CHAT_HOME_ORB_SLOT_SELECTOR);
  return node instanceof HTMLElement ? node : null;
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, Circle } from "lucide-react";
import {
  prismMenuTypeaheadMatch,
  resolvePrismMenuPosition,
  type PrismMenuPlacement,
  type PrismMenuRect,
} from "./prismMenuModel";
import styles from "./PrismMenu.module.css";

/** Broadcast before opening a top-navbar picker so every picker shares one owner. */
export const PRISM_NAVBAR_PICKER_OPEN_EVENT = "prism:navbar-picker-open";
const PRISM_NAVBAR_PICKER_SURFACE_SELECTOR =
  '[data-navbar-picker-surface="true"]';

export function announcePrismNavbarPickerOpen(source: string): void {
  window.dispatchEvent(
    new CustomEvent(PRISM_NAVBAR_PICKER_OPEN_EVENT, {
      detail: { source },
    }),
  );
}

export type PrismMenuTone = "default" | "danger";
export type PrismMenuTheme = "dark" | "light";
export type PrismMenuIconPresentation = "default" | "identity";

export interface PrismMenuBoundary {
  element?: HTMLElement | null;
  rect?: PrismMenuRect;
}

export type PrismMenuAnchor =
  | {
      kind: "pointer";
      x: number;
      y: number;
      preferredPlacement?: PrismMenuPlacement;
      boundary?: PrismMenuBoundary;
    }
  | {
      kind: "element";
      element: HTMLElement;
      preferredPlacement?: PrismMenuPlacement;
      boundary?: PrismMenuBoundary;
    };

interface PrismMenuEntryBase {
  id: string;
  icon?: ReactNode;
  iconPresentation?: PrismMenuIconPresentation;
  label: string;
  description?: string;
  shortcut?: string;
  tone?: PrismMenuTone;
  disabled?: boolean;
  disabledReason?: string;
}

export interface PrismMenuActionEntry extends PrismMenuEntryBase {
  kind?: "action";
  onSelect: () => void | Promise<void>;
  feedback?: string;
}

export interface PrismMenuToggleEntry extends PrismMenuEntryBase {
  kind: "toggle";
  checked: boolean;
  onSelect: (checked: boolean) => void | Promise<void>;
}

export interface PrismMenuRadioEntry extends PrismMenuEntryBase {
  kind: "radio";
  checked: boolean;
  group: string;
  onSelect: () => void | Promise<void>;
}

export interface PrismMenuLabelEntry {
  id: string;
  kind: "label";
  label: string;
  description?: string;
}

export interface PrismMenuSeparatorEntry {
  id: string;
  kind: "separator";
}

export interface PrismMenuSubmenuEntry extends PrismMenuEntryBase {
  kind: "submenu";
  entries: PrismMenuEntry[];
}

export type PrismMenuEntry =
  | PrismMenuActionEntry
  | PrismMenuToggleEntry
  | PrismMenuRadioEntry
  | PrismMenuLabelEntry
  | PrismMenuSeparatorEntry
  | PrismMenuSubmenuEntry;

type PrismMenuInteractiveEntry =
  | PrismMenuActionEntry
  | PrismMenuToggleEntry
  | PrismMenuRadioEntry
  | PrismMenuSubmenuEntry;

export interface PrismMenuRequest {
  id: string;
  label: string;
  anchor: PrismMenuAnchor;
  entries: PrismMenuEntry[];
  accent?: string;
  theme?: PrismMenuTheme;
  minWidth?: number;
  /** Optional content-height cap for a compact menu; the menu scrolls past it. */
  maxHeight?: number;
  focusRestoreTarget?: HTMLElement | RefObject<HTMLElement | null> | null;
  onClose?: () => void;
}

interface PrismMenuContextValue {
  activeMenu: PrismMenuRequest | null;
  openMenu: (request: PrismMenuRequest) => void;
  closeMenu: (options?: { restoreFocus?: boolean }) => void;
  claimSurface: (
    id: string,
    close: (options?: { restoreFocus?: boolean }) => void,
  ) => () => void;
}

const PrismMenuContext = createContext<PrismMenuContextValue | null>(null);

function viewportRect(): PrismMenuRect {
  return {
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    left: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function rectFromDomRect(rect: DOMRect): PrismMenuRect {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function anchorRect(anchor: PrismMenuAnchor): PrismMenuRect {
  if (anchor.kind === "element") {
    return rectFromDomRect(anchor.element.getBoundingClientRect());
  }
  return {
    top: anchor.y,
    right: anchor.x,
    bottom: anchor.y,
    left: anchor.x,
    width: 0,
    height: 0,
  };
}

function boundaryRect(anchor: PrismMenuAnchor): PrismMenuRect {
  if (anchor.boundary?.rect) return anchor.boundary.rect;
  if (anchor.boundary?.element) {
    return rectFromDomRect(anchor.boundary.element.getBoundingClientRect());
  }
  return viewportRect();
}

function focusRestoreElement(
  target: PrismMenuRequest["focusRestoreTarget"],
): HTMLElement | null {
  if (!target) return null;
  if (target instanceof HTMLElement) return target;
  return target.current;
}

function entryIsInteractive(entry: PrismMenuEntry): entry is PrismMenuInteractiveEntry {
  return entry.kind !== "label" && entry.kind !== "separator";
}

function entryIsEnabled(entry: PrismMenuEntry): entry is PrismMenuInteractiveEntry {
  return entryIsInteractive(entry) && !entry.disabled;
}

export function PrismMenuProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [activeMenu, setActiveMenu] = useState<PrismMenuRequest | null>(null);
  const standaloneSurfacesRef = useRef(
    new Map<string, (options?: { restoreFocus?: boolean }) => void>(),
  );

  const closeStandaloneMenus = useCallback((exceptId?: string) => {
    for (const [id, close] of standaloneSurfacesRef.current) {
      if (id === exceptId) continue;
      standaloneSurfacesRef.current.delete(id);
      close({ restoreFocus: false });
    }
  }, []);

  const closeMenu = useCallback((options?: { restoreFocus?: boolean }) => {
    setActiveMenu((current) => {
      if (!current) return null;
      current.onClose?.();
      if (options?.restoreFocus !== false) {
        const target = focusRestoreElement(current.focusRestoreTarget);
        window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
      }
      return null;
    });
  }, []);

  const openMenu = useCallback((request: PrismMenuRequest) => {
    closeStandaloneMenus();
    setActiveMenu((current) => {
      if (current && current.id !== request.id) current.onClose?.();
      return request;
    });
  }, [closeStandaloneMenus]);

  const claimSurface = useCallback((
    id: string,
    close: (options?: { restoreFocus?: boolean }) => void,
  ) => {
    closeStandaloneMenus(id);
    setActiveMenu((current) => {
      if (!current) return current;
      current.onClose?.();
      return null;
    });
    standaloneSurfacesRef.current.set(id, close);
    return () => {
      if (standaloneSurfacesRef.current.get(id) === close) {
        standaloneSurfacesRef.current.delete(id);
      }
    };
  }, [closeStandaloneMenus]);

  useEffect(() => {
    const closeForNavbarPicker = () => {
      closeStandaloneMenus();
      setActiveMenu((current) => {
        current?.onClose?.();
        return null;
      });
    };
    window.addEventListener(PRISM_NAVBAR_PICKER_OPEN_EVENT, closeForNavbarPicker);
    return () =>
      window.removeEventListener(
        PRISM_NAVBAR_PICKER_OPEN_EVENT,
        closeForNavbarPicker,
      );
  }, [closeStandaloneMenus]);

  useEffect(() => {
    const navbarPickerIsOpen = (): boolean =>
      Boolean(document.querySelector(PRISM_NAVBAR_PICKER_SURFACE_SELECTOR));
    const eventStartedInsideNavbarPicker = (event: Event): boolean => {
      const target = event.target;
      return (
        target instanceof Element &&
        Boolean(target.closest(PRISM_NAVBAR_PICKER_SURFACE_SELECTOR))
      );
    };
    const blockBackgroundScroll = (event: WheelEvent | TouchEvent): void => {
      if (!navbarPickerIsOpen() || eventStartedInsideNavbarPicker(event)) return;
      event.preventDefault();
    };
    const blockBackgroundKeyboardScroll = (event: KeyboardEvent): void => {
      if (
        !navbarPickerIsOpen() ||
        eventStartedInsideNavbarPicker(event) ||
        ![
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "End",
          "Home",
          "PageDown",
          "PageUp",
          " ",
        ].includes(event.key)
      ) {
        return;
      }
      event.preventDefault();
    };

    // PRISM's pages scroll inside applet-owned containers rather than the body.
    // Guard at the window capture boundary so every navbar picker freezes all
    // background scrollers while preserving native overflow inside the picker.
    window.addEventListener("wheel", blockBackgroundScroll, {
      capture: true,
      passive: false,
    });
    window.addEventListener("touchmove", blockBackgroundScroll, {
      capture: true,
      passive: false,
    });
    window.addEventListener("keydown", blockBackgroundKeyboardScroll, true);
    return () => {
      window.removeEventListener("wheel", blockBackgroundScroll, true);
      window.removeEventListener("touchmove", blockBackgroundScroll, true);
      window.removeEventListener("keydown", blockBackgroundKeyboardScroll, true);
    };
  }, []);

  const value = useMemo(
    () => ({ activeMenu, openMenu, closeMenu, claimSurface }),
    [activeMenu, claimSurface, closeMenu, openMenu],
  );

  return (
    <PrismMenuContext.Provider value={value}>
      {children}
      {activeMenu && typeof document !== "undefined"
        ? createPortal(
            <PrismMenuSurface request={activeMenu} onClose={closeMenu} />,
            document.body,
          )
        : null}
    </PrismMenuContext.Provider>
  );
}

export function usePrismMenu(): PrismMenuContextValue {
  const value = useContext(PrismMenuContext);
  if (!value) throw new Error("usePrismMenu must be used inside PrismMenuProvider");
  return value;
}

interface PrismMenuSurfaceProps {
  request: PrismMenuRequest;
  onClose: (options?: { restoreFocus?: boolean }) => void;
  className?: string;
  surfaceRef?: RefObject<HTMLDivElement | null>;
  ownerId?: string;
  onBack?: () => void;
  /** Gives top-navbar dropdowns the shared high-contrast ambient shadow. */
  navbarPicker?: boolean;
  /** Lets a hotkey-owned picker commit its pending value on an outside press. */
  onDismissOutside?: () => boolean | void;
  /** Runs before PrismMenu's built-in keyboard handling. */
  onKeyDownCapture?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Keeps pointer hover from replacing the hotkey-owned active choice. */
  cursorAgnostic?: boolean;
}

export function PrismMenuSurface({
  request,
  onClose,
  className = "",
  surfaceRef,
  ownerId,
  onBack,
  navbarPicker = false,
  onDismissOutside,
  onKeyDownCapture,
  cursorAgnostic = false,
}: PrismMenuSurfaceProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const typeaheadRef = useRef({ value: "", timer: 0 });
  const [requestedActiveId, setActiveId] = useState<string | null>(null);
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null);
  const [openSubmenuAnchor, setOpenSubmenuAnchor] =
    useState<HTMLButtonElement | null>(null);
  const [position, setPosition] = useState({
    left: -10000,
    top: -10000,
    maxHeight: 320,
    placement: request.anchor.preferredPlacement ?? "bottom-start" as PrismMenuPlacement,
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const rootOwnerId = ownerId ?? request.id;
  const coordinator = useContext(PrismMenuContext);

  const interactiveEntries = useMemo(
    () => request.entries.filter(entryIsEnabled),
    [request.entries],
  );
  const activeId = interactiveEntries.some(
    (entry) => entry.id === requestedActiveId,
  )
    ? requestedActiveId
    : interactiveEntries[0]?.id ?? null;

  const measure = useCallback(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    setPosition(resolvePrismMenuPosition({
      anchor: anchorRect(request.anchor),
      menuWidth: Math.ceil(rect.width),
      menuHeight: Math.ceil(rect.height),
      boundary: boundaryRect(request.anchor),
      placement: request.anchor.preferredPlacement ?? "bottom-start",
      gap: navbarPicker ? -2 : undefined,
    }));
  }, [navbarPicker, request.anchor]);

  useLayoutEffect(() => {
    measure();
  }, [measure, request.entries]);

  useEffect(() => {
    if (ownerId || coordinator?.activeMenu?.id === request.id) return;
    return coordinator?.claimSurface(request.id, onClose);
  }, [coordinator, onClose, ownerId, request.id]);

  useEffect(() => {
    if (!activeId) return;
    const frame = window.requestAnimationFrame(() => {
      itemRefs.current.get(activeId)?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeId]);

  useEffect(() => {
    const dismissForPointer = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      const owner =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-prism-menu-owner]")
          : null;
      if (owner?.dataset.prismMenuOwner === rootOwnerId) return;
      if (onDismissOutside?.() === true) return;
      onClose({ restoreFocus: false });
    };
    const dismissForViewport = () => onClose({ restoreFocus: false });
    // Listen at the first capture boundary so canvas gestures that stop
    // propagation cannot strand an open menu.
    window.addEventListener("pointerdown", dismissForPointer, true);
    window.addEventListener("blur", dismissForViewport);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("pointerdown", dismissForPointer, true);
      window.removeEventListener("blur", dismissForViewport);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure, onClose, onDismissOutside, rootOwnerId]);

  const focusIndex = useCallback((index: number) => {
    const entry = interactiveEntries[index];
    if (!entry) return;
    setActiveId(entry.id);
    window.requestAnimationFrame(() =>
      itemRefs.current.get(entry.id)?.focus({ preventScroll: true }),
    );
  }, [interactiveEntries]);

  const invoke = useCallback(async (entry: PrismMenuInteractiveEntry) => {
    if (!entryIsEnabled(entry)) return;
    if (entry.kind === "submenu") {
      if (openSubmenuId === entry.id) {
        setOpenSubmenuId(null);
        setOpenSubmenuAnchor(null);
      } else {
        setOpenSubmenuId(entry.id);
        setOpenSubmenuAnchor(itemRefs.current.get(entry.id) ?? null);
      }
      return;
    }
    try {
      if (entry.kind === "toggle") await entry.onSelect(!entry.checked);
      else await entry.onSelect();
    } catch {
      // Keep the menu open when an action fails so the player can retry.
      return;
    }
    if (entry.kind === "action" && entry.feedback) {
      setFeedback(entry.feedback);
      window.setTimeout(() => onClose(), 520);
      return;
    }
    onClose();
  }, [onClose, openSubmenuId]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = interactiveEntries.findIndex((entry) => entry.id === activeId);
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Tab") {
      onClose({ restoreFocus: false });
      return;
    }
    // Top-navbar menus are pointer/wheel driven. Keep Escape/Tab/Enter/Space,
    // but do not let arrows steal Control-root chords or roam the list.
    if (!navbarPicker) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        focusIndex(
          (currentIndex + direction + interactiveEntries.length) %
            interactiveEntries.length,
        );
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        focusIndex(event.key === "Home" ? 0 : interactiveEntries.length - 1);
        return;
      }
    }
    const activeEntry = interactiveEntries[currentIndex];
    if (
      !navbarPicker &&
      event.key === "ArrowRight" &&
      activeEntry?.kind === "submenu"
    ) {
      event.preventDefault();
      void invoke(activeEntry);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && activeEntry) {
      event.preventDefault();
      void invoke(activeEntry);
      return;
    }
    if (!navbarPicker && event.key === "ArrowLeft") {
      if (onBack) {
        event.preventDefault();
        onBack();
        return;
      }
      if (openSubmenuId) {
        event.preventDefault();
        const submenuId = openSubmenuId;
        setOpenSubmenuId(null);
        setOpenSubmenuAnchor(null);
        window.requestAnimationFrame(() =>
          itemRefs.current.get(submenuId)?.focus({ preventScroll: true }),
        );
        return;
      }
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      window.clearTimeout(typeaheadRef.current.timer);
      typeaheadRef.current.value += event.key;
      const index = prismMenuTypeaheadMatch(
        interactiveEntries.map((entry) => entry.label),
        typeaheadRef.current.value,
        currentIndex,
      );
      if (index >= 0) focusIndex(index);
      typeaheadRef.current.timer = window.setTimeout(() => {
        typeaheadRef.current.value = "";
      }, 520);
    }
  }, [
    activeId,
    focusIndex,
    interactiveEntries,
    invoke,
    navbarPicker,
    onBack,
    onClose,
    openSubmenuId,
  ]);

  const openSubmenu = request.entries.find(
    (entry): entry is PrismMenuSubmenuEntry =>
      entry.kind === "submenu" && entry.id === openSubmenuId,
  );
  const renderBoundary = typeof window === "undefined"
    ? null
    : boundaryRect(request.anchor);
  const rootZoom = typeof window === "undefined"
    ? 1
    : Number.parseFloat(window.getComputedStyle(document.documentElement).zoom) || 1;
  const availableWidth = renderBoundary
    ? Math.max(160, (renderBoundary.width - 16) / rootZoom)
    : 320;

  const style = {
    "--prism-menu-accent": request.accent ?? "#8fb7ff",
    left: position.left / rootZoom,
    top: position.top / rootZoom,
    maxHeight: Math.min(position.maxHeight, request.maxHeight ?? Infinity) / rootZoom,
    minWidth: Math.min(request.minWidth ?? 196, availableWidth),
    maxWidth: Math.min(320, availableWidth),
    visibility: position.left < -1000 ? "hidden" : "visible",
  } as CSSProperties;

  return (
    <div className={styles.themeScope}>
      <div
        ref={(node) => {
          menuRef.current = node;
          if (surfaceRef) surfaceRef.current = node;
        }}
        id={request.id}
        className={`${styles.menu} ${className}`.trim()}
        role="menu"
        aria-label={request.label}
        data-theme={request.theme}
        data-prism-menu-owner={rootOwnerId}
        data-navbar-picker-surface={navbarPicker ? "true" : undefined}
        data-placement={position.placement}
        style={style}
        onKeyDownCapture={onKeyDownCapture}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.filament} aria-hidden="true" />
        {request.entries.map((entry) => {
          if (entry.kind === "separator") {
            return <div key={entry.id} className={styles.separator} role="separator" />;
          }
          if (entry.kind === "label") {
            return (
              <div key={entry.id} className={styles.label} role="presentation">
                <span />
                <span className={styles.copy}>
                  <strong>{entry.label}</strong>
                  {entry.description ? <small>{entry.description}</small> : null}
                </span>
              </div>
            );
          }
          const disabled = Boolean(entry.disabled);
          const role = entry.kind === "radio"
            ? "menuitemradio"
            : entry.kind === "toggle"
              ? "menuitemcheckbox"
              : "menuitem";
          const checked = entry.kind === "radio" || entry.kind === "toggle" ? entry.checked : undefined;
          const preservesIdentityIcon =
            entry.iconPresentation === "identity" && Boolean(entry.icon);
          const leadingIcon = preservesIdentityIcon
            ? entry.icon
            : checked
              ? <Check aria-hidden="true" />
              : entry.kind === "radio"
                ? <Circle aria-hidden="true" />
                : entry.icon;
          return (
            <button
              key={entry.id}
              ref={(node) => {
                if (node) itemRefs.current.set(entry.id, node);
                else itemRefs.current.delete(entry.id);
              }}
              type="button"
              role={role}
              aria-checked={checked}
              aria-haspopup={entry.kind === "submenu" ? "menu" : undefined}
              aria-expanded={entry.kind === "submenu" ? openSubmenuId === entry.id : undefined}
              aria-description={entry.disabledReason}
              disabled={disabled}
              className={styles.item}
              data-icon-presentation={preservesIdentityIcon ? "identity" : undefined}
              data-tone={entry.tone ?? "default"}
              title={entry.disabledReason}
              onPointerDown={(event) => event.preventDefault()}
              onFocus={() => setActiveId(entry.id)}
              onMouseEnter={
                cursorAgnostic ? undefined : () => setActiveId(entry.id)
              }
              onClick={() => void invoke(entry)}
            >
              <span
                className={
                  preservesIdentityIcon
                    ? styles.identityIcon
                    : checked
                      ? styles.indicator
                      : styles.icon
                }
                aria-hidden="true"
              >
                {leadingIcon}
              </span>
              <span className={styles.copy}>
                <strong>{entry.label}</strong>
                {entry.description ? <small>{entry.description}</small> : null}
                {entry.disabledReason ? <small className={styles.disabledReason}>{entry.disabledReason}</small> : null}
              </span>
              {entry.kind === "submenu"
                ? <span className={styles.chevron} aria-hidden="true"><ChevronRight /></span>
                : preservesIdentityIcon && entry.kind === "radio" && checked
                  ? <span className={styles.selectionMark} aria-hidden="true"><Check /></span>
                : entry.shortcut
                  ? <span className={styles.shortcut}>{entry.shortcut}</span>
                  : null}
            </button>
          );
        })}
      </div>
      {openSubmenu && openSubmenuAnchor && typeof document !== "undefined"
        ? createPortal(
            <PrismMenuSurface
              request={{
                ...request,
                id: `${request.id}-${openSubmenu.id}`,
                label: openSubmenu.label,
                anchor: {
                  kind: "element",
                  element: openSubmenuAnchor,
                  preferredPlacement: "right-start",
                  boundary: request.anchor.boundary,
                },
                entries: openSubmenu.entries,
                focusRestoreTarget: openSubmenuAnchor,
              }}
              ownerId={rootOwnerId}
              navbarPicker={navbarPicker}
              onBack={() => {
                setOpenSubmenuId(null);
                setOpenSubmenuAnchor(null);
                window.requestAnimationFrame(() =>
                  openSubmenuAnchor.focus({ preventScroll: true }),
                );
              }}
              onClose={onClose}
            />,
            document.body,
          )
        : null}
      {feedback ? (
        <div
          className={styles.feedback}
          data-theme={request.theme}
          role="status"
          aria-live="polite"
          style={{
            "--prism-menu-accent": request.accent ?? "#8fb7ff",
            left: position.left / rootZoom,
            top: position.top / rootZoom,
          } as CSSProperties}
        >
          <Check size={14} aria-hidden="true" /> {feedback}
        </div>
      ) : null}
    </div>
  );
}

export const PRISM_MENU_BACK_ICON = <ChevronLeft aria-hidden="true" />;

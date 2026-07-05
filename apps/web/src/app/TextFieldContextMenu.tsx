"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import styles from "./TextFieldContextMenu.module.css";
import {
  TEXT_FIELD_CONTEXT_MENU_ACTIONS,
  TEXT_FIELD_CONTEXT_MENU_LABELS,
  clampTextContextMenuPosition,
  closestTextEditingTarget,
  deleteSelectedTextEditingTarget,
  dispatchTextPasteEvent,
  focusTextEditingTarget,
  insertTextIntoTextEditingTarget,
  resolveTextFieldCommandState,
  selectAllTextEditingTarget,
  selectedTextInTextEditingTarget,
  textEditingTargetSnapshot,
  type TextFieldCommandState,
  type TextFieldContextMenuAction,
} from "./editableTextContextMenuModel";

const MENU_ESTIMATED_WIDTH = 156;
const MENU_ESTIMATED_HEIGHT = 132;

type MenuThemeStyle = React.CSSProperties & {
  "--text-field-menu-bg"?: string;
  "--text-field-menu-border"?: string;
  "--text-field-menu-fg"?: string;
  "--text-field-menu-hover"?: string;
  "--text-field-menu-disabled"?: string;
};

interface TextFieldContextMenuState {
  target: HTMLElement;
  x: number;
  y: number;
  commands: TextFieldCommandState;
  theme: MenuThemeStyle;
}

function cssVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = style.getPropertyValue(name).trim();
  return value.length > 0 ? value : fallback;
}

function themeForTarget(target: HTMLElement): MenuThemeStyle {
  const style = window.getComputedStyle(target);
  const bg = cssVar(style, "--bg-surface", cssVar(style, "--bg", "#111520"));
  const border = cssVar(style, "--line-strong", cssVar(style, "--line", "rgba(255,255,255,0.16)"));
  const fg = cssVar(style, "--fg", "#f2f5fb");
  const hover = cssVar(style, "--bg-hover", "rgba(255,255,255,0.1)");
  const muted = cssVar(style, "--fg-subtle", "rgba(242,245,251,0.42)");

  return {
    "--text-field-menu-bg": bg,
    "--text-field-menu-border": border,
    "--text-field-menu-fg": fg,
    "--text-field-menu-hover": hover,
    "--text-field-menu-disabled": muted,
  };
}

async function readClipboardText(): Promise<string | null> {
  if (navigator.clipboard?.readText && window.isSecureContext) {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  }
  return null;
}

async function writeClipboardText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function TextFieldContextMenu(): React.JSX.Element | null {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<TextFieldContextMenuState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const closeMenu = useCallback(() => {
    setMenu(null);
  }, []);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent): void => {
      const target = closestTextEditingTarget(event.target);
      if (!target) return;

      event.preventDefault();
      event.stopPropagation();
      focusTextEditingTarget(target);

      const position = clampTextContextMenuPosition({
        x: event.clientX,
        y: event.clientY,
        menuWidth: MENU_ESTIMATED_WIDTH,
        menuHeight: MENU_ESTIMATED_HEIGHT,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });

      setMenu({
        target,
        x: position.x,
        y: position.y,
        commands: resolveTextFieldCommandState(textEditingTargetSnapshot(target)),
        theme: themeForTarget(target),
      });
      setActiveIndex(0);
    };

    document.addEventListener("contextmenu", handleContextMenu, { capture: true });
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu, { capture: true });
    };
  }, []);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const position = clampTextContextMenuPosition({
      x: menu.x,
      y: menu.y,
      menuWidth: rect.width,
      menuHeight: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    if (position.x !== menu.x || position.y !== menu.y) {
      setMenu({ ...menu, x: position.x, y: position.y });
    }
  }, [menu]);

  useEffect(() => {
    if (!menu) return;

    const closeForPointer = (event: PointerEvent): void => {
      if (menuRef.current?.contains(event.target as Node | null)) return;
      closeMenu();
    };
    const closeForWindowChange = (): void => closeMenu();

    document.addEventListener("pointerdown", closeForPointer, { capture: true });
    window.addEventListener("blur", closeForWindowChange);
    window.addEventListener("resize", closeForWindowChange);
    window.addEventListener("scroll", closeForWindowChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeForPointer, { capture: true });
      window.removeEventListener("blur", closeForWindowChange);
      window.removeEventListener("resize", closeForWindowChange);
      window.removeEventListener("scroll", closeForWindowChange, true);
    };
  }, [closeMenu, menu]);

  const itemActions = useMemo(() => [...TEXT_FIELD_CONTEXT_MENU_ACTIONS], []);

  const runAction = useCallback(
    async (action: TextFieldContextMenuAction): Promise<void> => {
      const target = menu?.target;
      if (!target || !target.isConnected || !menu.commands[action]) return;

      focusTextEditingTarget(target);

      if (action === "selectAll") {
        selectAllTextEditingTarget(target);
        closeMenu();
        return;
      }

      if (action === "copy") {
        let copied = false;
        try {
          copied = document.execCommand("copy");
        } catch {
          copied = false;
        }
        if (!copied) {
          await writeClipboardText(selectedTextInTextEditingTarget(target));
        }
        closeMenu();
        return;
      }

      if (action === "cut") {
        let cut = false;
        try {
          cut = document.execCommand("cut");
        } catch {
          cut = false;
        }
        if (!cut) {
          const selectedText = selectedTextInTextEditingTarget(target);
          const copied = selectedText.length > 0 && (await writeClipboardText(selectedText));
          cut = copied && deleteSelectedTextEditingTarget(target);
        }
        closeMenu();
        return;
      }

      const text = await readClipboardText();
      if (text !== null && dispatchTextPasteEvent(target, text)) {
        insertTextIntoTextEditingTarget(target, text);
      } else {
        try {
          document.execCommand("paste");
        } catch {
          // Browser clipboard policy can deny custom paste. Keyboard paste still works.
        }
      }
      closeMenu();
    },
    [closeMenu, menu]
  );

  useEffect(() => {
    if (!menu) return;

    const enabledIndexes = itemActions
      .map((action, index) => (menu.commands[action] ? index : -1))
      .filter((index) => index >= 0);

    const moveActive = (direction: -1 | 1): void => {
      if (enabledIndexes.length === 0) return;
      const currentEnabledIndex = enabledIndexes.indexOf(activeIndex);
      const current =
        currentEnabledIndex >= 0
          ? currentEnabledIndex
          : direction > 0
            ? -1
            : enabledIndexes.length;
      const next =
        (current + direction + enabledIndexes.length) % enabledIndexes.length;
      setActiveIndex(enabledIndexes[next]);
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveActive(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveActive(-1);
        return;
      }
      if (event.key === "Home" && enabledIndexes.length > 0) {
        event.preventDefault();
        setActiveIndex(enabledIndexes[0]);
        return;
      }
      if (event.key === "End" && enabledIndexes.length > 0) {
        event.preventDefault();
        setActiveIndex(enabledIndexes[enabledIndexes.length - 1]);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void runAction(itemActions[activeIndex]);
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [activeIndex, closeMenu, itemActions, menu, runAction]);

  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      role="menu"
      aria-label="Text editing actions"
      style={{
        ...menu.theme,
        left: menu.x,
        top: menu.y,
      }}
    >
      {itemActions.map((action, index) => (
        <button
          key={action}
          type="button"
          role="menuitem"
          className={styles.item}
          disabled={!menu.commands[action]}
          data-active={index === activeIndex ? "true" : undefined}
          onPointerDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => void runAction(action)}
        >
          {TEXT_FIELD_CONTEXT_MENU_LABELS[action]}
        </button>
      ))}
    </div>
  );
}

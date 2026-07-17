"use client";

import { useEffect } from "react";
import { ClipboardPaste, Copy, Scissors, TextSelect } from "lucide-react";
import { usePrismMenu, type PrismMenuEntry } from "./PrismMenu";
import {
  closestTextEditingTarget,
  deleteSelectedTextEditingTarget,
  dispatchTextPasteEvent,
  focusTextEditingTarget,
  insertTextIntoTextEditingTarget,
  resolveTextFieldCommandState,
  selectAllTextEditingTarget,
  selectedTextInTextEditingTarget,
  textEditingTargetSnapshot,
} from "./editableTextContextMenuModel";

function cssVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = style.getPropertyValue(name).trim();
  return value.length > 0 ? value : fallback;
}

function cssColorIsLight(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  const hex = normalized.match(/^#([0-9a-f]{6})$/);
  const rgb = normalized.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/,
  );
  const channels = hex
    ? [
        Number.parseInt(hex[1].slice(0, 2), 16),
        Number.parseInt(hex[1].slice(2, 4), 16),
        Number.parseInt(hex[1].slice(4, 6), 16),
      ]
    : rgb
      ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
      : null;
  if (!channels) return false;
  return (channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722) / 255 > 0.62;
}

function themeForTarget(target: HTMLElement): "light" | "dark" {
  const style = window.getComputedStyle(target);
  const bg = cssVar(style, "--bg-surface", cssVar(style, "--bg", "#111520"));
  return style.colorScheme.split(" ").includes("light") || cssColorIsLight(bg)
    ? "light"
    : "dark";
}

function shortcut(modifier: string): string {
  const mac = navigator.platform.toLowerCase().includes("mac");
  return `${mac ? "⌘" : "Ctrl+"}${modifier}`;
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

export function TextFieldContextMenu(): null {
  const { openMenu } = usePrismMenu();

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent): void => {
      const target = closestTextEditingTarget(event.target);
      if (!target) return;

      event.preventDefault();
      event.stopPropagation();
      focusTextEditingTarget(target);
      const commands = resolveTextFieldCommandState(textEditingTargetSnapshot(target));

      const cut = async (): Promise<void> => {
        focusTextEditingTarget(target);
        let cutSucceeded = false;
        try {
          cutSucceeded = document.execCommand("cut");
        } catch {
          cutSucceeded = false;
        }
        if (!cutSucceeded) {
          const selected = selectedTextInTextEditingTarget(target);
          const copied = selected.length > 0 && (await writeClipboardText(selected));
          if (copied) deleteSelectedTextEditingTarget(target);
        }
      };

      const copy = async (): Promise<void> => {
        focusTextEditingTarget(target);
        let copied = false;
        try {
          copied = document.execCommand("copy");
        } catch {
          copied = false;
        }
        if (!copied) await writeClipboardText(selectedTextInTextEditingTarget(target));
      };

      const paste = async (): Promise<void> => {
        focusTextEditingTarget(target);
        const text = await readClipboardText();
        if (text !== null && dispatchTextPasteEvent(target, text)) {
          insertTextIntoTextEditingTarget(target, text);
          return;
        }
        try {
          document.execCommand("paste");
        } catch {
          // Browser clipboard policy can deny custom paste; keyboard paste remains available.
        }
      };

      const entries: PrismMenuEntry[] = [
        {
          id: "cut",
          icon: <Scissors />,
          label: "Cut",
          shortcut: shortcut("X"),
          disabled: !commands.cut,
          onSelect: cut,
        },
        {
          id: "copy",
          icon: <Copy />,
          label: "Copy",
          shortcut: shortcut("C"),
          disabled: !commands.copy,
          feedback: "Copied",
          onSelect: copy,
        },
        {
          id: "paste",
          icon: <ClipboardPaste />,
          label: "Paste",
          shortcut: shortcut("V"),
          disabled: !commands.paste,
          onSelect: paste,
        },
        { id: "selection-separator", kind: "separator" },
        {
          id: "select-all",
          icon: <TextSelect />,
          label: "Select All",
          shortcut: shortcut("A"),
          disabled: !commands.selectAll,
          onSelect: () => {
            focusTextEditingTarget(target);
            selectAllTextEditingTarget(target);
          },
        },
      ];

      openMenu({
        id: "prism-text-editing-menu",
        label: "Text editing actions",
        anchor: {
          kind: "pointer",
          x: event.clientX,
          y: event.clientY,
        },
        theme: themeForTarget(target),
        accent: cssVar(window.getComputedStyle(target), "--accent-ink", "#8fb7ff"),
        entries,
        focusRestoreTarget: target,
      });
    };

    document.addEventListener("contextmenu", handleContextMenu, { capture: true });
    return () => document.removeEventListener("contextmenu", handleContextMenu, { capture: true });
  }, [openMenu]);

  return null;
}

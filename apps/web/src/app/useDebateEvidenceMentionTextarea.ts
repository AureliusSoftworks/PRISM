"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  type SyntheticEvent,
} from "react";
import type { DebateEvidencePacketV1 } from "@localai/shared";
import { findAtMentionTokenPlain } from "./botMention";
import {
  commitDebateEvidenceMentionAtCaret,
  composeEvidenceMentionTabPlainTextAction,
  debateEvidenceMentionPicks,
  filterEvidenceForMentionQuery,
  type DebateEvidenceMentionPick,
} from "./debateEvidenceMention";
import { getTextareaCaretClientRect } from "./textareaCaretRect";

export interface DebateEvidenceMentionMenuState {
  open: boolean;
  caretRect: DOMRect | null;
  filtered: DebateEvidenceMentionPick[];
  highlight: number;
}

const CLOSED_MENU: DebateEvidenceMentionMenuState = {
  open: false,
  caretRect: null,
  filtered: [],
  highlight: 0,
};

/**
 * Plain-textarea @ evidence mention controller for Debate Participant drafts.
 */
export function useDebateEvidenceMentionTextarea(args: {
  evidence: DebateEvidencePacketV1;
  value: string;
  onValueChange: (next: string) => void;
  enabled: boolean;
}): {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  menu: DebateEvidenceMentionMenuState;
  themeSourceRef: RefObject<HTMLElement | null>;
  dismissMenu: () => void;
  setHighlight: (next: number) => void;
  pickIndex: (index: number) => void;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  onSelect: (event: SyntheticEvent<HTMLTextAreaElement>) => void;
  onClick: (event: SyntheticEvent<HTMLTextAreaElement>) => void;
  onKeyUp: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
} {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const themeSourceRef = useRef<HTMLElement | null>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const menuRef = useRef<DebateEvidenceMentionMenuState>(CLOSED_MENU);
  const [menu, setMenu] = useState<DebateEvidenceMentionMenuState>(CLOSED_MENU);

  const picks = useMemo(
    () => debateEvidenceMentionPicks(args.evidence),
    [args.evidence],
  );

  const dismissMenu = useCallback(() => {
    setMenu((current) => (current.open ? CLOSED_MENU : current));
  }, []);

  const setHighlight = useCallback((next: number) => {
    setMenu((current) =>
      current.open ? { ...current, highlight: next } : current,
    );
  }, []);

  const syncFromTextarea = useCallback(
    (el: HTMLTextAreaElement) => {
      if (!args.enabled || picks.length === 0) {
        setMenu((current) => (current.open ? CLOSED_MENU : current));
        return;
      }
      const caret = el.selectionStart ?? 0;
      const token = findAtMentionTokenPlain(el.value, caret);
      if (!token) {
        setMenu((current) => (current.open ? CLOSED_MENU : current));
        return;
      }
      const filtered = filterEvidenceForMentionQuery(picks, token.query);
      const caretRect =
        getTextareaCaretClientRect(el) ?? el.getBoundingClientRect();
      setMenu((prev) => {
        const sameLength = prev.filtered.length === filtered.length;
        const sameIds =
          sameLength &&
          prev.filtered.every((pick, index) => pick.id === filtered[index]?.id);
        return {
          open: true,
          caretRect,
          filtered,
          highlight: sameIds
            ? Math.min(prev.highlight, Math.max(0, filtered.length - 1))
            : 0,
        };
      });
    },
    [args.enabled, picks],
  );

  const applyInsert = useCallback(
    (replacement: string, caret: number) => {
      pendingCaretRef.current = caret;
      args.onValueChange(replacement);
      setMenu(CLOSED_MENU);
    },
    [args],
  );

  const pickIndex = useCallback(
    (index: number) => {
      const el = textareaRef.current;
      if (!el) return;
      const pick = menuRef.current.filtered[index];
      if (!pick) return;
      const action = commitDebateEvidenceMentionAtCaret(
        el.value,
        el.selectionStart ?? 0,
        pick,
      );
      if (action.kind !== "insert") return;
      applyInsert(action.replacement, action.caret);
    },
    [applyInsert],
  );

  useLayoutEffect(() => {
    menuRef.current = menu;
  }, [menu]);

  useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    const el = textareaRef.current;
    if (caret === null || !el) return;
    pendingCaretRef.current = null;
    el.focus();
    el.setSelectionRange(caret, caret);
    syncFromTextarea(el);
  }, [args.value, syncFromTextarea]);

  const scheduleSync = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    requestAnimationFrame(() => syncFromTextarea(el));
  }, [syncFromTextarea]);

  const onChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      args.onValueChange(event.currentTarget.value);
      scheduleSync();
    },
    [args, scheduleSync],
  );

  const onSelect = useCallback(
    (event: SyntheticEvent<HTMLTextAreaElement>) => {
      syncFromTextarea(event.currentTarget);
    },
    [syncFromTextarea],
  );

  const onClick = onSelect;

  const onKeyUp = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "Home" ||
        event.key === "End"
      ) {
        syncFromTextarea(event.currentTarget);
      }
    },
    [syncFromTextarea],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      const open = menuRef.current.open;
      const filtered = menuRef.current.filtered;
      if (event.key === "Escape" && open) {
        event.preventDefault();
        dismissMenu();
        return;
      }
      if (
        open &&
        filtered.length > 0 &&
        (event.key === "ArrowDown" || event.key === "ArrowUp")
      ) {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setMenu((current) => {
          if (!current.open || current.filtered.length === 0) return current;
          const next =
            (current.highlight + delta + current.filtered.length) %
            current.filtered.length;
          return { ...current, highlight: next };
        });
        return;
      }
      if (
        open &&
        filtered.length > 0 &&
        (event.key === "Enter" || event.key === "Tab") &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault();
        const el = event.currentTarget;
        const action = composeEvidenceMentionTabPlainTextAction(
          el.value,
          el.selectionStart ?? 0,
          picks,
          menuRef.current.highlight,
        );
        if (action.kind === "insert") {
          applyInsert(action.replacement, action.caret);
        }
        return;
      }
    },
    [applyInsert, dismissMenu, picks],
  );

  return {
    textareaRef,
    menu,
    themeSourceRef,
    dismissMenu,
    setHighlight,
    pickIndex,
    onChange,
    onKeyDown,
    onSelect,
    onClick,
    onKeyUp,
  };
}

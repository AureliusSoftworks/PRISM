"use client";

import { useRef, useState } from "react";
import {
  BookMarked,
  Check,
  Copy,
  Download,
  FolderOpen,
  Image as ImageGlyph,
  MessageSquare,
  Mic,
  PencilLine,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
  Users,
  Volume2,
} from "lucide-react";
import {
  usePrismMenu,
  type PrismMenuEntry,
  type PrismMenuTheme,
} from "../PrismMenu";
import styles from "./ContextMenuFixtureGallery.module.css";

const FIXTURES = [
  "message-user",
  "message-assistant",
  "message-zen-read-only",
  "message-voice",
  "message-recovery",
  "bot-normal",
  "bot-selected",
  "bot-multiselect",
  "bot-protected",
  "bot-group-member",
  "bot-showcase",
  "bot-coffee-seat",
  "group-custom",
  "group-built-in",
  "group-protected",
  "group-full",
  "group-multiselect",
  "zen-avatar-minimum",
  "zen-avatar-default",
  "zen-avatar-maximum",
  "canvas-chat-zen",
  "canvas-sandbox",
  "canvas-coffee-setup",
  "canvas-coffee-live",
  "canvas-story-setup",
  "canvas-story-generating",
  "canvas-story-active",
  "text-editing",
  "conversation-group",
  "app-switcher",
  "responsive-chat",
  "coffee-interruption",
  "slate-project",
] as const;

type FixtureId = (typeof FIXTURES)[number];
type FixtureSystem = "before" | "after";

const action = (
  id: string,
  label: string,
  icon?: React.ReactNode,
  options: Partial<PrismMenuEntry> = {},
): PrismMenuEntry => ({
  id,
  label,
  icon,
  onSelect: () => undefined,
  ...options,
} as PrismMenuEntry);

function universalEntries(lockReason?: string): PrismMenuEntry[] {
  return [
    action("prompt", "Prompt Center", <MessageSquare />),
    action("refresh", "Refresh", <RotateCcw />),
    action("settings", "Settings", <Settings />),
    action("usage", "Usage", <Sparkles />),
    { id: "universal-separator", kind: "separator" },
    action("memories", "Memories", <BookMarked />),
    action("images", "Images", <ImageGlyph />),
    action("bots", "Bots", <Users />, {
      disabled: Boolean(lockReason),
      disabledReason: lockReason,
    }),
    action("theme", "Theme: Dark", <Sparkles />),
  ];
}

function fixtureEntries(id: FixtureId): PrismMenuEntry[] {
  if (id.startsWith("message")) {
    const entries: PrismMenuEntry[] = [action("copy", "Copy", <Copy />, { shortcut: "⌘C", feedback: "Copied" })];
    if (id === "message-user") entries.push(action("edit", "Edit", <PencilLine />), action("resend", "Resend", <RotateCcw />));
    if (id === "message-assistant" || id === "message-voice") entries.push(action("fork", "Fork", <MessageSquare />));
    if (id === "message-voice") entries.push(action("speak", "Speak", <Volume2 />));
    if (id === "message-recovery") entries.push(
      { id: "recovery-separator", kind: "separator" },
      { id: "recovery", kind: "label", label: "Recovered with llama3.2", description: "Local qwen: timed out · Local llama3.2: succeeded" },
    );
    if (id !== "message-zen-read-only") entries.push(
      { id: "delete-separator", kind: "separator" },
      action("delete", "Delete", <Trash2 />, { tone: "danger" }),
    );
    return entries;
  }
  if (id.startsWith("bot")) {
    if (id === "bot-multiselect") return [
      action("batch", "Batch edit selected", <PencilLine />, { description: "3 bots" }),
      action("export", "Export selected bots", <Download />),
      action("add", "Add selected to group", <Plus />),
      { id: "delete-separator", kind: "separator" },
      action("delete", "Delete selected bots", <Trash2 />, { tone: "danger" }),
    ];
    if (id === "bot-showcase") return [
      action("avatar", "Avatar Studio", <PencilLine />),
      action("memories", "Memories", <BookMarked />),
      action("images", "Images", <ImageGlyph />),
      { id: "settings-separator", kind: "separator" },
      action("settings", "Settings", <Settings />),
    ];
    const protectedBot = id === "bot-protected";
    const live = id === "bot-coffee-seat";
    const entries: PrismMenuEntry[] = [
      action("favorite", "Favorite", <Sparkles />, { kind: "toggle", checked: id === "bot-selected" }),
      { id: "identity-separator", kind: "separator" },
      action("avatar", "Avatar Studio", <PencilLine />, { disabled: live, disabledReason: live ? "Bot setup is locked while Coffee is live." : undefined }),
      action("memories", "Memories", <BookMarked />),
      action("images", "Images", <ImageGlyph />),
      action("export", "Export bot", <Download />),
    ];
    if (id === "bot-group-member") entries.push(action("remove", "Remove from group", <Users />));
    entries.push(
      { id: "delete-separator", kind: "separator" },
      action("delete", "Delete bot", <Trash2 />, {
        tone: "danger",
        disabled: protectedBot || live,
        disabledReason: protectedBot ? "This bot is protected. Allow deletion first." : live ? "Bot setup is locked while Coffee is live." : undefined,
      }),
    );
    return entries;
  }
  if (id.startsWith("group")) {
    if (id === "group-multiselect") return [
      action("batch", "Batch edit selected", <PencilLine />),
      action("export", "Export selected bots", <Download />),
      action("remove", "Remove selected from current group", <Users />),
      { id: "delete-separator", kind: "separator" },
      action("delete", "Delete selected bots", <Trash2 />, { tone: "danger" }),
    ];
    const builtIn = id === "group-built-in";
    return [
      action("protect", id === "group-protected" ? "Allow deletion" : "Protect group", <Check />, { kind: "toggle", checked: id === "group-protected" }),
      action("export", "Export group", <Download />, { disabled: id === "group-full", disabledReason: id === "group-full" ? "Finish the current transfer first." : undefined }),
      ...(builtIn ? [] : [
        action("edit", "Edit details", <PencilLine />),
        { id: "delete-separator", kind: "separator" } as PrismMenuEntry,
        action("delete", "Delete group", <Trash2 />, { tone: "danger" }),
      ]),
    ];
  }
  if (id.startsWith("zen-avatar")) return [
    action("grow", "Grow", <Plus />, { disabled: id === "zen-avatar-maximum", disabledReason: id === "zen-avatar-maximum" ? "Avatar is at its maximum size." : undefined }),
    action("shrink", "Shrink", <Trash2 />, { disabled: id === "zen-avatar-minimum", disabledReason: id === "zen-avatar-minimum" ? "Avatar is at its minimum size." : undefined }),
    ...(id === "zen-avatar-default" ? [] : [action("reset", "Reset size", <RotateCcw />, { description: "190px default" })]),
    { id: "avatar-separator", kind: "separator" },
    action("edit", "Edit avatar", <PencilLine />),
  ];
  if (id.startsWith("canvas")) {
    if (id === "canvas-chat-zen") return [
      action("settings", "Settings", <Settings />),
      action("atmosphere", "Atmosphere", <ImageGlyph />, { kind: "toggle", checked: false }),
      action("theme", "Theme: Dark", <Sparkles />),
    ];
    const lock = id === "canvas-coffee-live"
      ? "Coffee setup is locked while the session is live."
      : id === "canvas-story-generating"
        ? "Story controls are locked while generating."
        : undefined;
    return universalEntries(lock);
  }
  if (id === "text-editing") return [
    action("cut", "Cut", <PencilLine />, { shortcut: "⌘X" }),
    action("copy", "Copy", <Copy />, { shortcut: "⌘C" }),
    action("paste", "Paste", <Download />, { shortcut: "⌘V" }),
    { id: "selection-separator", kind: "separator" },
    action("all", "Select All", <Check />, { shortcut: "⌘A" }),
  ];
  if (id === "conversation-group") return [action("delete", "Delete Friends chats", <Trash2 />, { tone: "danger" })];
  if (id === "app-switcher") return [
    { id: "available", kind: "label", label: "Available applets" },
    action("chat", "Chat", <MessageSquare />, { kind: "radio", group: "app", checked: true }),
    action("coffee", "Coffee", <Users />, { kind: "radio", group: "app", checked: false }),
    action("slate", "Slate", <PencilLine />, { kind: "radio", group: "app", checked: false }),
    { id: "roadmap-separator", kind: "separator" },
    {
      id: "roadmap",
      kind: "submenu",
      label: "Roadmap",
      description: "Planned for future PRISM releases.",
      entries: [
        action("arena", "Arena", <Users />, { disabled: true, disabledReason: "Planned" }),
        action("games", "Games", <Sparkles />, { disabled: true, disabledReason: "Planned" }),
      ],
    },
  ];
  if (id === "responsive-chat") return [
    action("settings", "Settings", <Settings />),
    { id: "voice", kind: "label", label: "Voice" },
    action("mute", "Mute", <Mic />, { kind: "radio", group: "voice", checked: true }),
    action("listen", "Listen", <Volume2 />, { kind: "radio", group: "voice", checked: false }),
    ...universalEntries().filter((entry) => entry.id !== "settings"),
  ];
  if (id === "coffee-interruption") return [
    { id: "spoken", kind: "label", label: "Spoken interruptions" },
    action("hold", "Hold on."), action("enough", "Enough."),
    { id: "gestures", kind: "label", label: "Physical gestures" },
    action("finger", "Raises a finger"), action("table", "Taps the table"),
  ];
  return [
    action("open", "Open project", <FolderOpen />),
    { id: "delete-separator", kind: "separator" },
    action("delete", "Delete project", <Trash2 />, { tone: "danger" }),
  ];
}

function labelForFixture(id: FixtureId): string {
  return id.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" · ");
}

export function ContextMenuFixtureGallery(): React.JSX.Element {
  const { openMenu, closeMenu } = usePrismMenu();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const touchTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const [fixture, setFixture] = useState<FixtureId>(FIXTURES[0]);
  const [theme, setTheme] = useState<PrismMenuTheme>("dark");
  const [system, setSystem] = useState<FixtureSystem>("after");
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [legacyPosition, setLegacyPosition] = useState({ left: 0, top: 0 });
  const accent = fixture.includes("coffee")
    ? "#d99a65"
    : fixture.includes("story")
      ? "#b796ff"
      : fixture.includes("group")
        ? "#78c7b5"
        : "#8fb7ff";
  const entries = fixtureEntries(fixture);

  const openFixture = (pointer?: { x: number; y: number }): void => {
    if (!triggerRef.current) return;
    closeMenu({ restoreFocus: false });
    if (system === "before") {
      const rect = triggerRef.current.getBoundingClientRect();
      setLegacyPosition({ left: rect.left, top: rect.bottom + 6 });
      setLegacyOpen(true);
      return;
    }
    setLegacyOpen(false);
    openMenu({
      id: `fixture-${fixture}`,
      label: labelForFixture(fixture),
      anchor: pointer
        ? { kind: "pointer", x: pointer.x, y: pointer.y }
        : {
            kind: "element",
            element: triggerRef.current,
            preferredPlacement: "bottom-start",
          },
      accent,
      theme,
      minWidth: 236,
      entries,
      focusRestoreTarget: triggerRef.current,
    });
  };

  return (
    <main
      className={styles.gallery}
      data-theme={theme}
      style={{ "--fixture-accent": accent } as React.CSSProperties}
    >
      <section className={styles.controls}>
        <label>
          Fixture
          <select
            aria-label="Fixture"
            value={fixture}
            onChange={(event) => {
              closeMenu({ restoreFocus: false });
              setLegacyOpen(false);
              setFixture(event.target.value as FixtureId);
            }}
          >
            {FIXTURES.map((id) => <option key={id} value={id}>{labelForFixture(id)}</option>)}
          </select>
        </label>
        <label>
          Theme
          <select aria-label="Theme" value={theme} onChange={(event) => setTheme(event.target.value as PrismMenuTheme)}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label>
          System
          <select aria-label="System" value={system} onChange={(event) => {
            closeMenu({ restoreFocus: false });
            setLegacyOpen(false);
            setSystem(event.target.value as FixtureSystem);
          }}>
            <option value="before">Before</option>
            <option value="after">After</option>
          </select>
        </label>
        <button
          ref={triggerRef}
          type="button"
          className={styles.trigger}
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            openFixture();
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            openFixture({ x: event.clientX, y: event.clientY });
          }}
          onPointerDown={(event) => {
            if (event.pointerType !== "touch") return;
            if (touchTimerRef.current !== null) window.clearTimeout(touchTimerRef.current);
            const pointer = { x: event.clientX, y: event.clientY };
            touchTimerRef.current = window.setTimeout(() => {
              suppressClickRef.current = true;
              openFixture(pointer);
              touchTimerRef.current = null;
              window.setTimeout(() => {
                suppressClickRef.current = false;
              }, 800);
            }, 520);
          }}
          onPointerUp={() => {
            if (touchTimerRef.current !== null) window.clearTimeout(touchTimerRef.current);
            touchTimerRef.current = null;
          }}
          onPointerCancel={() => {
            if (touchTimerRef.current !== null) window.clearTimeout(touchTimerRef.current);
            touchTimerRef.current = null;
          }}
        >
          Open {labelForFixture(fixture)}
        </button>
        {system === "before" && legacyOpen ? (
          <div
            className={styles.legacyMenu}
            role="menu"
            aria-label={`${labelForFixture(fixture)} legacy fixture`}
            data-testid="legacy-menu"
            style={legacyPosition}
          >
            {entries.map((entry) => {
              if (entry.kind === "separator") return <div key={entry.id} className={styles.legacySeparator} role="separator" />;
              if (entry.kind === "label") return <div key={entry.id} className={styles.legacyLabel}><strong>{entry.label}</strong>{entry.description ? <small>{entry.description}</small> : null}</div>;
              return <button key={entry.id} type="button" role="menuitem" disabled={entry.disabled}>{entry.label}{entry.disabledReason ? ` · ${entry.disabledReason}` : ""}</button>;
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}

# PRISM context menu system

PRISM menus are one system across Chat, Zen, Sandbox, Coffee, Story, Slate, and future applets. Every custom web menu uses `PrismMenuProvider` or `PrismMenuSurface`; operating-system tray menus remain native.

## Primitive

`PrismMenuProvider` is mounted once in the root layout. Call `usePrismMenu().openMenu(request)` for click-open menus and new context menus. `PrismMenuSurface` is available for state that is already locally owned while it is migrated to provider-owned requests.

```tsx
openMenu({
  id: "project-actions",
  label: "Project actions",
  anchor: {
    kind: "element",
    element: trigger,
    preferredPlacement: "bottom-end",
  },
  accent: "#91b8ff",
  theme: "dark",
  focusRestoreTarget: trigger,
  entries: [
    { id: "open", label: "Open project", icon: <FolderOpen />, onSelect: open },
    { id: "split", kind: "separator" },
    { id: "delete", label: "Delete project", icon: <Trash2 />, tone: "danger", onSelect: confirmDelete },
  ],
});
```

### Anchors

- Pointer anchors use the invocation coordinates.
- Element anchors use the trigger bounds and restore focus to that trigger.
- `preferredPlacement` accepts bottom, top, left, and right start/end variants.
- An optional boundary element or rectangle keeps the menu above a composer or inside a local viewport.
- Positioning measures the rendered surface, flips to the lower-overflow side, shifts inside the boundary, and applies a scrollable maximum height. Submenus use the same resolver and flip at viewport edges.

### Entries

Use `action`, `toggle`, `radio`, `label`, `separator`, or `submenu`. Entries may include a Lucide icon, description, shortcut, tone, disabled state, and disabled reason. A disabled control that matters to the player must explain why. Use `feedback` only when the result would otherwise be invisible, such as Copy.

## Ordering

1. Context or selection controls.
2. Primary edit/open actions.
3. Related libraries such as Memories and Images.
4. Transfer actions such as import, clone, and export.
5. Appearance and navigation.
6. Destructive actions after a separator.

Keep the same action vocabulary everywhere: **Avatar Studio**, **Memories**, **Images**, **Favorite**, **Add to group**, **Export bot**, **Import bots**, and **Delete bot**.

## Accessibility and interaction

- Give every request a specific accessible label.
- Use menuitem, menuitemcheckbox, and menuitemradio semantics through the entry kind.
- Arrow Up/Down wraps; Home/End jump; printable keys use typeahead; Enter/Space select.
- Arrow Right opens a submenu; Arrow Left returns to its parent; Escape closes; Tab dismisses without trapping focus.
- Pointer-down outside, blur, resize, and scroll dismiss or reposition as appropriate.
- Provider ownership guarantees one request-driven menu at a time and restores focus after keyboard dismissal.
- Touch targets increase to 44px on coarse pointers; motion is removed under reduced-motion preferences.
- Destructive actions open an alert dialog when confirmation is required. Do not use `window.confirm`.

## Visual language

The shell is restrained instrument glass: 12px radius, compact Lucide icons, clear section rhythm, a two-pixel context rail, and a small spectrum filament. Mode and bot colors tint the rail and focus state without changing the structure. Light mode uses an opaque surface for reliable contrast. Dashed inner frames and full-menu action checkmarks are not part of the system.

## Future modes

Start with the shared universal action registry for Prompt Center, refresh, settings, usage, memories, images, bots, and theme. Add mode-specific actions before it and navigation after it. A live mode should keep relevant actions visible and attach the lock reason rather than silently hiding them.

```tsx
const entries = [
  ...modeActions,
  { id: "mode-break", kind: "separator" as const },
  ...universalActions({ botsDisabledReason: liveLockReason }),
  { id: "nav-break", kind: "separator" as const },
  navigationAction,
];
```

## QA contract

Any new menu state must add a deterministic fixture covering its entries, disabled reasons, theme, invocation method, and destructive confirmation. Representative visual snapshots cover pointer, keyboard, touch, viewport edge, composer boundary, 200% zoom, and reduced motion.

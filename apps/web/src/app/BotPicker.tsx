"use client";

import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  KeyboardEvent,
  ReactNode,
} from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TEXT_ENTRY_SEARCH_MAX_LENGTH } from "@localai/shared";
import { buildBotLibraryGroupVisualVariables } from "./botLibraryGroupVisual";
import { placeBotPickerGroupMenu } from "./botPickerGroupMenu";
import {
  botSearchSingletonHint,
  handleBotSearchSingletonKey,
} from "./botSearchKeyboard";
import {
  registerPrismRefractTarget,
  type PrismRefractBotDirectedSetupTarget,
} from "./prismRefract";
import sharedStyles from "./BotPicker.module.css";
import pickerStyles from "./page.module.css";

export {
  arrangeBotPickerItemsInColumnBands,
  botPickerRainbowHuePosition,
  compareBotPickerRainbowSortKeys,
  compareBotPickerItemsByName,
  filterBotPickerItems,
  sortBotPickerItems,
} from "./botPickerFilter";

export interface BotPickerItem {
  id: string;
  name: string;
  color: string | null;
  glyph: string | null;
}

/**
 * Adaptive bot-picker contract for new surfaces:
 * one available column uses a dropdown with horizontal rows; two columns use
 * side-by-side horizontal chips; three or more use the tile grid. Every
 * variant keeps name search and the hue lens.
 */
export interface BotPickerGroupOption {
  id: string;
  name: string;
  count?: number;
}

export interface BotPickerGroup extends BotPickerGroupOption {
  botIds: readonly string[];
}

type BotPickerGroupTheme = "light" | "dark";

export interface BotPickerTileGeometry {
  tileSize: number;
  glyphSize: number;
  glyphStroke: number;
  compactPixelGrid?: boolean;
  flattenTile?: boolean;
  namedFlatTile?: boolean;
  solidSwatch?: boolean;
  hideGlyphByDefault?: boolean;
  selectedDotGlyph?: boolean;
}

export interface BotPickerGlyphRenderOptions {
  size: number;
  strokeWidth: number;
  className?: string;
}

export type BotPickerGlyphRenderer = (
  glyph: string | null,
  options: BotPickerGlyphRenderOptions,
) => ReactNode;

interface BotPickerGridProps extends HTMLAttributes<HTMLElement> {
  ariaLabel: string;
  as?: "div" | "ul";
  children: ReactNode;
}

export function BotPickerGrid({
  ariaLabel,
  as = "div",
  children,
  className,
  role = "listbox",
  onKeyDown,
  ...props
}: BotPickerGridProps): React.JSX.Element {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (delta === 0) return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        'button[data-bot-id]:not(:disabled)',
      ),
    );
    if (buttons.length < 2) return;
    const activeIndex = buttons.findIndex(
      (button) => button === document.activeElement,
    );
    if (activeIndex < 0) return;
    event.preventDefault();
    buttons[(activeIndex + delta + buttons.length) % buttons.length]?.focus();
  };

  const Element = as;
  return (
    <Element
      {...props}
      className={[pickerStyles.chatBotPicker, className]
        .filter(Boolean)
        .join(" ")}
      role={role}
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {children}
    </Element>
  );
}

interface BotPickerTileProps {
  item: BotPickerItem;
  geometry: BotPickerTileGeometry;
  renderGlyph: BotPickerGlyphRenderer;
  selected?: boolean;
  marqueeSelected?: boolean;
  favorite?: boolean;
  protected?: boolean;
  forceName?: boolean;
  forceGlyph?: boolean;
  accentColor?: string | null;
  className?: string;
  style?: CSSProperties;
  badge?: ReactNode;
  directedSetupTarget?: PrismRefractBotDirectedSetupTarget;
  buttonProps?: Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "className" | "style"
  > & {
    [key: `data-${string}`]: string | undefined;
  };
}

export function BotPickerTile({
  item,
  geometry,
  renderGlyph,
  selected = false,
  marqueeSelected = false,
  favorite = false,
  protected: protectedBot = false,
  forceName,
  forceGlyph,
  accentColor,
  className,
  style,
  badge,
  directedSetupTarget,
  buttonProps,
}: BotPickerTileProps): React.JSX.Element {
  const directedSetupTargetRef = useRef(directedSetupTarget);
  const directedSetupElementRef = useRef<HTMLButtonElement | null>(null);
  const directedSetupTargetId = directedSetupTarget?.id;
  useEffect(() => {
    directedSetupTargetRef.current = directedSetupTarget;
  }, [directedSetupTarget]);
  useEffect(() => {
    if (!directedSetupTargetId) return;
    return registerPrismRefractTarget(directedSetupTargetId, {
      descriptor: () => directedSetupTargetRef.current!,
      element: () => directedSetupElementRef.current,
    });
  }, [directedSetupTargetId]);
  const showPixelGridGlyph = geometry.compactPixelGrid === true;
  const showSelectedDotGlyph =
    geometry.selectedDotGlyph === true && selected;
  const showTileGlyph =
    forceGlyph ?? (!geometry.hideGlyphByDefault || showPixelGridGlyph);
  const showFeaturedName =
    forceName ??
    (!geometry.compactPixelGrid && geometry.tileSize >= 64);
  const tileGlyphSize = geometry.glyphSize;
  const tileGlyphStroke = geometry.glyphStroke;
  const tooltip = showFeaturedName ? undefined : item.name;
  const tileClassName = [
    pickerStyles.chatBotTile,
    protectedBot ? pickerStyles.chatBotTileProtected : null,
    selected ? pickerStyles.chatBotTileSelected : null,
    marqueeSelected ? pickerStyles.chatBotTileMarqueeSelected : null,
    geometry.namedFlatTile || geometry.flattenTile
      ? pickerStyles.chatBotTileFlat
      : null,
    geometry.solidSwatch ? pickerStyles.chatBotTileSolidSwatch : null,
    !geometry.solidSwatch && geometry.hideGlyphByDefault
      ? pickerStyles.chatBotTileSwatchOnly
      : null,
    showFeaturedName ? pickerStyles.chatBotTileWithName : null,
    showFeaturedName &&
    (geometry.namedFlatTile ||
      geometry.flattenTile ||
      geometry.tileSize <= 92)
      ? pickerStyles.chatBotTileNamedFlat
      : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const tileStyle = {
    ...(accentColor
      ? ({ "--bot-color": accentColor } as CSSProperties)
      : undefined),
    ...style,
  };

  return (
    <button
      ref={directedSetupTarget ? directedSetupElementRef : undefined}
      {...buttonProps}
      data-prism-refract-id={directedSetupTarget?.id}
      type="button"
      className={tileClassName}
      data-bot-id={item.id}
      data-glyph-tooltip={tooltip}
      data-favorite={favorite ? "true" : undefined}
      data-delete-protected={protectedBot ? "true" : undefined}
      title={buttonProps?.title ?? tooltip}
      style={tileStyle}
    >
      {showTileGlyph ? (
        <span className={pickerStyles.chatBotTileBotGlyph} aria-hidden="true">
          {showSelectedDotGlyph ? (
            <>
              <span
                className={pickerStyles.chatBotTileSelectedDotGlyph}
                aria-hidden="true"
              />
              {renderGlyph(item.glyph, {
                size: tileGlyphSize,
                strokeWidth: tileGlyphStroke,
                className: pickerStyles.chatBotTileSelectedHoverGlyph,
              })}
            </>
          ) : (
            renderGlyph(item.glyph, {
              size: tileGlyphSize,
              strokeWidth: tileGlyphStroke,
            })
          )}
        </span>
      ) : null}
      {showFeaturedName ? (
        <span className={pickerStyles.chatBotTileFeaturedName}>
          {item.name}
        </span>
      ) : null}
      {badge}
    </button>
  );
}

interface BotPickerToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  searchAriaLabel: string;
  groups?: readonly BotPickerGroup[];
  /** Members supply the same spectrum thumbnail used by Library group controls. */
  groupItems?: readonly BotPickerItem[];
  groupValue?: string;
  onGroupChange?: (groupId: string) => void;
  groupTheme?: BotPickerGroupTheme;
  groupSelectionMode?: "dropdown" | "modal";
  resultLabel?: string;
  singleActionableResult?: Pick<BotPickerItem, "id" | "name"> | null;
  onSingleActionableResultSelect?: (botId: string) => void;
  compact?: boolean;
  className?: string;
}

export function BotPickerToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search bots…",
  searchAriaLabel,
  groups = [],
  groupItems = [],
  groupValue,
  onGroupChange,
  groupTheme = "dark",
  groupSelectionMode = "dropdown",
  resultLabel,
  singleActionableResult = null,
  onSingleActionableResultSelect,
  compact = false,
  className,
}: BotPickerToolbarProps): React.JSX.Element {
  const pickerId = useId();
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [groupMenuStyle, setGroupMenuStyle] = useState<CSSProperties | null>(
    null,
  );
  const groupTriggerRef = useRef<HTMLButtonElement>(null);
  const groupMenuRef = useRef<HTMLDivElement>(null);
  const groupOptionRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const selectedGroup =
    groups.find((group) => group.id === groupValue) ?? groups[0] ?? null;
  const groupMenuAvailable = groups.length > 1 && onGroupChange !== undefined;
  const groupMenuGroups = groups;
  const groupMenuId = `bot-picker-group-listbox-${pickerId.replace(/:/g, "")}`;
  const groupModalTitleId = `${groupMenuId}-title`;
  const groupSelectionIsModal = groupSelectionMode === "modal";
  const selectedGroupBots = selectedGroup
    ? groupItems.filter((item) =>
        selectedGroup.botIds.includes(item.id),
      )
    : [];
  const selectedGroupStyle = selectedGroup
    ? buildBotLibraryGroupVisualVariables(
        selectedGroup.id,
        selectedGroupBots,
        groupTheme,
      )
    : undefined;
  const singletonHint = singleActionableResult
    ? botSearchSingletonHint(searchValue, singleActionableResult.name)
    : null;

  useEffect(() => {
    if (!groupMenuOpen || groupSelectionIsModal) return;
    const dismiss = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (groupTriggerRef.current?.contains(target)) return;
      if (groupMenuRef.current?.contains(target)) return;
      setGroupMenuOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [groupMenuOpen, groupSelectionIsModal]);

  useEffect(() => {
    if (!groupMenuOpen || groupSelectionIsModal) return;
    const update = (): void => {
      const trigger = groupTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setGroupMenuStyle(
        placeBotPickerGroupMenu(rect, {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      );
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [groupMenuOpen, groupSelectionIsModal]);

  useEffect(() => {
    if (!groupMenuOpen) return;
    const dismiss = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setGroupMenuOpen(false);
      groupTriggerRef.current?.focus();
    };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [groupMenuOpen]);

  useEffect(() => {
    if (!groupMenuOpen) return;
    const focusedId = selectedGroup?.id ?? groupMenuGroups[0]?.id;
    if (!focusedId) return;
    queueMicrotask(() => groupOptionRefs.current.get(focusedId)?.focus());
  }, [groupMenuOpen, groupMenuGroups, groupMenuStyle, selectedGroup?.id]);

  const chooseGroup = (nextGroupId: string): void => {
    onGroupChange?.(nextGroupId);
    setGroupMenuOpen(false);
    groupTriggerRef.current?.focus();
  };

  const moveGroupFocus = (direction: number): void => {
    const currentIndex = groupMenuGroups.findIndex(
      (group) => groupOptionRefs.current.get(group.id) === document.activeElement,
    );
    const index =
      currentIndex < 0
        ? 0
        : (currentIndex + direction + groupMenuGroups.length) %
          groupMenuGroups.length;
    groupOptionRefs.current.get(groupMenuGroups[index]?.id ?? "")?.focus();
  };

  return (
    <div
      className={[sharedStyles.toolbar, className].filter(Boolean).join(" ")}
      data-compact={compact ? "true" : undefined}
    >
      <label className={sharedStyles.search}>
        <span className={sharedStyles.srOnly}>{searchAriaLabel}</span>
        <input
          type="search"
          maxLength={TEXT_ENTRY_SEARCH_MAX_LENGTH}
          value={searchValue}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (!singleActionableResult || !onSingleActionableResultSelect) {
              return;
            }
            handleBotSearchSingletonKey({
              event,
              query: searchValue,
              results: [singleActionableResult],
              getName: (result) => result.name,
              onSelect: (result) =>
                onSingleActionableResultSelect(result.id),
              onComplete: onSearchChange,
            });
          }}
          placeholder={searchPlaceholder}
          aria-label={searchAriaLabel}
        />
      </label>
      {groupMenuAvailable && selectedGroup ? (
        <div
          className={`${pickerStyles.botLibraryGroupControl} ${sharedStyles.group}`}
          data-open={groupMenuOpen ? "true" : undefined}
          data-default-option={selectedGroup.id === "all" ? "true" : undefined}
          style={selectedGroupStyle as CSSProperties | undefined}
        >
          <button
            ref={groupTriggerRef}
            type="button"
            className={pickerStyles.botLibraryGroupTrigger}
            aria-label={`Filter by bot group: ${selectedGroup.name}`}
            aria-haspopup={groupSelectionIsModal ? "dialog" : "listbox"}
            aria-expanded={groupMenuOpen}
            aria-controls={groupMenuOpen ? groupMenuId : undefined}
            onClick={() => setGroupMenuOpen((open) => !open)}
            onKeyDown={(event) => {
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                setGroupMenuOpen(true);
              }
            }}
          >
            <span
              className={pickerStyles.botLibraryGroupTriggerSwatch}
              aria-hidden="true"
            />
            <span className={pickerStyles.botLibraryGroupTriggerName}>
              {selectedGroup.name}
            </span>
            <span
              className={pickerStyles.composeBotTriggerChevron}
              aria-hidden="true"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 3.5 L5 6.5 L8 3.5" />
              </svg>
            </span>
          </button>
          {groupMenuOpen &&
          (groupSelectionIsModal || groupMenuStyle) &&
          typeof document !== "undefined"
            ? createPortal(
                <div
                  className={
                    groupSelectionIsModal
                      ? sharedStyles.groupModalBackdrop
                      : `${pickerStyles.composeBotMenu} ${pickerStyles.botLibraryGroupMenu} ${sharedStyles.groupMenuPortal}`
                  }
                  style={
                    groupSelectionIsModal ? undefined : groupMenuStyle ?? undefined
                  }
                  role={groupSelectionIsModal ? "presentation" : undefined}
                  onMouseDown={
                    groupSelectionIsModal
                      ? (event) => {
                          if (event.target === event.currentTarget) {
                            setGroupMenuOpen(false);
                          }
                        }
                      : undefined
                  }
                >
                  <div
                    ref={groupMenuRef}
                    className={
                      groupSelectionIsModal
                        ? sharedStyles.groupModal
                        : undefined
                    }
                    role={groupSelectionIsModal ? "dialog" : undefined}
                    aria-modal={groupSelectionIsModal ? true : undefined}
                    aria-labelledby={
                      groupSelectionIsModal ? groupModalTitleId : undefined
                    }
                  >
                    {groupSelectionIsModal ? (
                      <header className={sharedStyles.groupModalHeader}>
                        <div>
                          <span>Signal guests</span>
                          <h2 id={groupModalTitleId}>Choose a bot group</h2>
                          <p>Browse the full roster without losing your place in setup.</p>
                        </div>
                        <button
                          type="button"
                          className={sharedStyles.groupModalClose}
                          aria-label="Close bot group picker"
                          onClick={() => {
                            setGroupMenuOpen(false);
                            groupTriggerRef.current?.focus();
                          }}
                        >
                          ×
                        </button>
                      </header>
                    ) : null}
                    <div
                      id={groupMenuId}
                      className={
                        groupSelectionIsModal
                          ? sharedStyles.groupModalListbox
                          : pickerStyles.composeBotListbox
                      }
                      role="listbox"
                      aria-label="Filter by bot group"
                      onKeyDown={(event) => {
                        if (
                          event.key === "ArrowDown" ||
                          event.key === "ArrowUp"
                        ) {
                          event.preventDefault();
                          moveGroupFocus(event.key === "ArrowDown" ? 1 : -1);
                        } else if (event.key === "Home") {
                          event.preventDefault();
                          groupOptionRefs.current
                            .get(groupMenuGroups[0]?.id ?? "")
                            ?.focus();
                        } else if (event.key === "End") {
                          event.preventDefault();
                          groupOptionRefs.current
                            .get(groupMenuGroups.at(-1)?.id ?? "")
                            ?.focus();
                        }
                      }}
                    >
                      {groupMenuGroups.map((group) => {
                        const groupBots = groupItems.filter((item) =>
                          group.botIds.includes(item.id),
                        );
                        return (
                          <button
                            key={group.id}
                            ref={(node) => {
                              if (node) {
                                groupOptionRefs.current.set(group.id, node);
                              } else {
                                groupOptionRefs.current.delete(group.id);
                              }
                            }}
                            type="button"
                            className={pickerStyles.botLibraryGroupOption}
                            role="option"
                            aria-selected={group.id === selectedGroup.id}
                            tabIndex={group.id === selectedGroup.id ? 0 : -1}
                            data-default-option={
                              group.id === "all" ? "true" : undefined
                            }
                            style={
                              buildBotLibraryGroupVisualVariables(
                                group.id,
                                groupBots,
                                groupTheme,
                              ) as CSSProperties
                            }
                            onClick={() => chooseGroup(group.id)}
                          >
                            <span
                              className={
                                pickerStyles.botLibraryGroupOptionSwatch
                              }
                              aria-hidden="true"
                            />
                              <span
                                className={pickerStyles.botLibraryGroupOptionCopy}
                              >
                                <span
                                  className={
                                    pickerStyles.botLibraryGroupOptionName
                                  }
                                >
                                  {group.name}
                                </span>
                                {typeof group.count === "number" ? (
                                  <span
                                    className={
                                      pickerStyles.botLibraryGroupOptionCount
                                    }
                                  >
                                    {group.count === 1
                                      ? "1 bot"
                                      : `${group.count} bots`}
                                  </span>
                                ) : null}
                              </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>,
                document.body,
              )
            : null}
        </div>
      ) : null}
      {singletonHint || resultLabel ? (
        <small className={sharedStyles.result} role="status">
          {singletonHint ?? resultLabel}
        </small>
      ) : null}
    </div>
  );
}

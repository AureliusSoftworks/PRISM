"use client";

import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  KeyboardEvent,
  ReactNode,
} from "react";
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
  buttonProps,
}: BotPickerTileProps): React.JSX.Element {
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
      {...buttonProps}
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
  groups?: readonly BotPickerGroupOption[];
  groupValue?: string;
  onGroupChange?: (groupId: string) => void;
  resultLabel?: string;
  compact?: boolean;
  className?: string;
}

export function BotPickerToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search bots…",
  searchAriaLabel,
  groups = [],
  groupValue,
  onGroupChange,
  resultLabel,
  compact = false,
  className,
}: BotPickerToolbarProps): React.JSX.Element {
  return (
    <div
      className={[sharedStyles.toolbar, className].filter(Boolean).join(" ")}
      data-compact={compact ? "true" : undefined}
    >
      <label className={sharedStyles.search}>
        <span className={sharedStyles.srOnly}>{searchAriaLabel}</span>
        <input
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          placeholder={searchPlaceholder}
          aria-label={searchAriaLabel}
        />
      </label>
      {groups.length > 1 && onGroupChange ? (
        <label className={sharedStyles.group}>
          <span className={sharedStyles.srOnly}>Bot group</span>
          <select
            value={groupValue}
            onChange={(event) => onGroupChange(event.currentTarget.value)}
            aria-label="Filter by bot group"
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
                {typeof group.count === "number" ? ` · ${group.count}` : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {resultLabel ? (
        <small className={sharedStyles.result} role="status">
          {resultLabel}
        </small>
      ) : null}
    </div>
  );
}

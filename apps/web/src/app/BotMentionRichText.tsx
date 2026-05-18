"use client";

import type React from "react";
import { Fragment, isValidElement } from "react";
import {
  cleanBotMentionTextArtifacts,
  extractStageDirections,
  parsePrismBotMentionHref,
  splitTextByBotNames,
  tokenizeBotMentionSource,
  type BotMentionPick,
} from "./botMention";
import styles from "./page.module.css";

function markdownChildrenToPlainText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(markdownChildrenToPlainText).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return markdownChildrenToPlainText(props.children);
  }
  return "";
}

export interface BotMentionChipProps {
  botId: string;
  displayName: string;
  bot?: BotMentionPick | null;
  resolvedTheme: "light" | "dark";
  normalizeAccentForTheme: (hex: string, theme?: "light" | "dark") => string;
  className?: string;
}

export function BotMentionChip({
  botId,
  displayName,
  bot,
  resolvedTheme,
  normalizeAccentForTheme,
  className,
}: BotMentionChipProps): React.JSX.Element {
  const accent = bot?.color
    ? normalizeAccentForTheme(bot.color, resolvedTheme)
    : null;
  const style = accent
    ? ({ "--bot-color": accent } as React.CSSProperties)
    : undefined;
  return (
    <span
      className={`${styles.botMentionChip} ${className ?? ""}`}
      style={style}
      data-prism-bot-id={botId}
    >
      {displayName}
    </span>
  );
}

interface BotMentionInlineNameProps {
  text: string;
  bot: BotMentionPick | null;
  resolvedTheme: "light" | "dark";
  normalizeAccentForTheme: (hex: string, theme?: "light" | "dark") => string;
}

/**
 * Soft-styled name occurrence — only colored, no chip border/underline. Used
 * for plain-prose name mentions ("Squidward seems quiet today") so they read
 * as the speaker's identity color while still flowing as normal sentence
 * text.
 */
function BotMentionInlineName({
  text,
  bot,
  resolvedTheme,
  normalizeAccentForTheme,
}: BotMentionInlineNameProps): React.JSX.Element {
  const accent = bot?.color
    ? normalizeAccentForTheme(bot.color, resolvedTheme)
    : null;
  const style = accent
    ? ({ "--bot-color": accent } as React.CSSProperties)
    : undefined;
  return (
    <span
      className={styles.botMentionInlineColor}
      style={style}
      data-prism-bot-name={bot?.id ?? undefined}
    >
      {text}
    </span>
  );
}

export function renderPrismBotMarkdownAnchor(
  args: {
    href?: string | null;
    children?: React.ReactNode;
    botsById: ReadonlyMap<string, BotMentionPick>;
    resolvedTheme: "light" | "dark";
    normalizeAccentForTheme: (hex: string, theme?: "light" | "dark") => string;
  }
): React.ReactElement | null {
  const { href, children, botsById, resolvedTheme, normalizeAccentForTheme } = args;
  const id = parsePrismBotMentionHref(href ?? undefined);
  if (!id) return null;
  const textLabel = markdownChildrenToPlainText(children).trim();
  const bot = botsById.get(id);
  const displayName = (textLabel || bot?.name || id).trim();
  return (
    <BotMentionChip
      botId={id}
      displayName={displayName}
      bot={bot ?? null}
      resolvedTheme={resolvedTheme}
      normalizeAccentForTheme={normalizeAccentForTheme}
    />
  );
}

/**
 * Atomic display unit walked by both the static and reveal-aware renderers.
 *
 * - `chip` — explicit `[Name](prism-bot://id)` markdown, rendered with full
 *   chip styling (colored + dotted underline) on the table.
 * - `name` — plain-prose name occurrence detected by
 *   {@link splitTextByBotNames}, rendered with soft inline coloring (no
 *   underline) so prose stays readable.
 * - `text` — unstyled run of prose between the above.
 *
 * `displayLen` is the character count this unit contributes to the
 * typewriter display cursor. The chip's `displayLen` is its display name
 * length (not the raw markdown length); name units contribute the matched
 * label's length.
 */
interface RenderUnit {
  kind: "chip" | "name" | "text";
  displayLen: number;
  text: string;
  bot: BotMentionPick | null;
  botId?: string;
}

interface BuildRenderUnitsArgs {
  botsById: ReadonlyMap<string, BotMentionPick>;
  speakerBotId?: string | null;
  /** Strip `*action*` blocks from the rendered text (used on the table center). */
  stripStageDirections?: boolean;
}

function buildRenderUnits(text: string, args: BuildRenderUnitsArgs): RenderUnit[] {
  const { botsById, speakerBotId, stripStageDirections = true } = args;
  const source = stripStageDirections ? extractStageDirections(text).mainText : text;
  if (!source) return [];
  const segments = tokenizeBotMentionSource(source);
  const inlineRoster = Array.from(botsById.values());
  const units: RenderUnit[] = [];
  for (const seg of segments) {
    if (seg.kind === "mention") {
      units.push({
        kind: "chip",
        displayLen: seg.displayName.length,
        text: seg.displayName,
        bot: botsById.get(seg.botId) ?? null,
        botId: seg.botId,
      });
      continue;
    }
    const cleanedText = cleanBotMentionTextArtifacts(seg.text, inlineRoster);
    const subSegments = splitTextByBotNames(cleanedText, inlineRoster, speakerBotId ?? null);
    for (const sub of subSegments) {
      if (sub.kind === "name" && sub.bot) {
        units.push({
          kind: "name",
          displayLen: sub.text.length,
          text: sub.text,
          bot: sub.bot,
          botId: sub.bot.id,
        });
      } else {
        units.push({
          kind: "text",
          displayLen: sub.text.length,
          text: sub.text,
          bot: null,
        });
      }
    }
  }
  return units;
}

interface RenderUnitArgs {
  resolvedTheme: "light" | "dark";
  normalizeAccentForTheme: (hex: string, theme?: "light" | "dark") => string;
  keyPrefix: string;
}

function renderUnit(
  unit: RenderUnit,
  visibleText: string,
  args: RenderUnitArgs,
  index: number
): React.ReactNode {
  if (unit.kind === "chip") {
    return (
      <BotMentionChip
        key={`${args.keyPrefix}-chip-${index}`}
        botId={unit.botId ?? ""}
        displayName={visibleText}
        bot={unit.bot}
        resolvedTheme={args.resolvedTheme}
        normalizeAccentForTheme={args.normalizeAccentForTheme}
      />
    );
  }
  if (unit.kind === "name") {
    return (
      <BotMentionInlineName
        key={`${args.keyPrefix}-name-${index}`}
        text={visibleText}
        bot={unit.bot}
        resolvedTheme={args.resolvedTheme}
        normalizeAccentForTheme={args.normalizeAccentForTheme}
      />
    );
  }
  return <Fragment key={`${args.keyPrefix}-text-${index}`}>{visibleText}</Fragment>;
}

export interface RenderPlainTextOptions {
  botsById: ReadonlyMap<string, BotMentionPick>;
  resolvedTheme: "light" | "dark";
  normalizeAccentForTheme: (hex: string, theme?: "light" | "dark") => string;
  keyPrefix?: string;
  /** When set, occurrences of this bot's name aren't auto-colored (no self-references). */
  speakerBotId?: string | null;
  /** When true (default for table-bound surfaces), `*action*` blocks are removed. */
  stripStageDirections?: boolean;
}

/**
 * Coffee / plain surfaces: render `prism-bot://` markdown links as chips,
 * auto-color any other bot-name occurrence in the speaker's identity color,
 * and (by default) drop `*action*` stage-direction blocks from the visible
 * line so they can be surfaced separately above the speaker's avatar.
 */
export function renderPlainTextWithBotMentions(
  text: string,
  args: RenderPlainTextOptions
): React.ReactNode {
  const { keyPrefix = "m", resolvedTheme, normalizeAccentForTheme } = args;
  const units = buildRenderUnits(text, args);
  if (units.length === 0) return null;
  return units.map((unit, idx) =>
    renderUnit(unit, unit.text, { resolvedTheme, normalizeAccentForTheme, keyPrefix }, idx)
  );
}

/**
 * Reveal-aware renderer for typewriter animations.
 *
 * `revealedDisplayLength` is a character count into the *displayed* text —
 * mention tokens contribute their display-name length (not the raw markdown
 * length), name auto-colors contribute the matched label length, and
 * `*action*` blocks are stripped before counting (they live above the
 * speaker's seat, not on the table line). This keeps the typewriter cursor
 * aligned with what the player actually sees.
 */
export function revealPlainTextWithBotMentions(
  text: string,
  revealedDisplayLength: number,
  args: RenderPlainTextOptions
): React.ReactNode {
  const { keyPrefix = "r", resolvedTheme, normalizeAccentForTheme } = args;
  if (revealedDisplayLength <= 0) return null;
  const units = buildRenderUnits(text, args);
  if (units.length === 0) return null;
  const nodes: React.ReactNode[] = [];
  let displayCursor = 0;
  units.forEach((unit, idx) => {
    if (revealedDisplayLength <= displayCursor) return;
    const visibleChars = Math.min(unit.displayLen, revealedDisplayLength - displayCursor);
    if (visibleChars > 0) {
      const visibleText = unit.text.slice(0, visibleChars);
      nodes.push(
        renderUnit(
          unit,
          visibleText,
          { resolvedTheme, normalizeAccentForTheme, keyPrefix },
          idx
        )
      );
    }
    displayCursor += unit.displayLen;
  });
  return nodes;
}

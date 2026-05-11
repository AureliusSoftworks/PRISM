"use client";

import type React from "react";
import { Fragment, isValidElement } from "react";
import {
  PRISM_BOT_MARKDOWN_LINK_RE,
  parsePrismBotMentionHref,
  unescapeMarkdownLinkLabel,
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
 * Coffee / plain surfaces: render `prism-bot://` markdown links as chips,
 * leave other text unchanged (no full GFM).
 */
export function renderPlainTextWithBotMentions(
  text: string,
  args: Omit<Parameters<typeof renderPrismBotMarkdownAnchor>[0], "href" | "children"> & {
    keyPrefix?: string;
  }
): React.ReactNode {
  const { keyPrefix = "m", ...anchorArgs } = args;
  const re = new RegExp(PRISM_BOT_MARKDOWN_LINK_RE.source, "gi");
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    if (start > last) {
      nodes.push(<Fragment key={`${keyPrefix}-t-${k++}`}>{text.slice(last, start)}</Fragment>);
    }
    const rawName = match[1] ?? "";
    const idEnc = match[2] ?? "";
    let id = idEnc;
    try {
      id = decodeURIComponent(idEnc);
    } catch {
      id = idEnc;
    }
    const displayName = unescapeMarkdownLinkLabel(rawName);
    nodes.push(
      <BotMentionChip
        key={`${keyPrefix}-b-${k++}`}
        botId={id}
        displayName={displayName}
        bot={anchorArgs.botsById.get(id) ?? null}
        resolvedTheme={anchorArgs.resolvedTheme}
        normalizeAccentForTheme={anchorArgs.normalizeAccentForTheme}
      />
    );
    last = start + match[0].length;
  }
  if (last < text.length) {
    nodes.push(<Fragment key={`${keyPrefix}-t-${k++}`}>{text.slice(last)}</Fragment>);
  }
  return nodes.length === 0 ? text : nodes;
}

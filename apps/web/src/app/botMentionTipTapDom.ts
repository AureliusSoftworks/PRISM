import { parsePrismBotMentionHref, type BotMentionPick } from "./botMention";

export interface SyncPrismBotMentionDomOptions {
  normalizeAccentForTheme: (hex: string, theme?: "light" | "dark") => string;
  resolvedTheme: "light" | "dark";
}

/**
 * Applies bot color on TipTap prism-bot mark DOM (`--bot-mention-color`).
 * Re-run after transactions — ProseMirror may recreate nodes.
 */
export function syncPrismBotMentionMarksInEditorDom(
  root: ParentNode,
  botsById: ReadonlyMap<string, BotMentionPick>,
  opts: SyncPrismBotMentionDomOptions
): void {
  const nodes = root.querySelectorAll<HTMLElement>("span.tiptapPrismBotMention");
  for (const el of nodes) {
    const href = el.getAttribute("data-prism-bot-href") ?? "";
    const idAttr = el.getAttribute("data-prism-bot-id");
    const id = parsePrismBotMentionHref(href) ?? (idAttr && idAttr.length > 0 ? idAttr : null);
    const bot = id ? botsById.get(id) : undefined;
    const hex = bot?.color?.trim();
    if (hex) {
      el.style.setProperty(
        "--bot-mention-color",
        opts.normalizeAccentForTheme(hex, opts.resolvedTheme)
      );
    } else {
      el.style.removeProperty("--bot-mention-color");
    }
  }
}

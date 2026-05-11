import { mergeAttributes } from "@tiptap/core";
import TiptapLink, { type LinkOptions } from "@tiptap/extension-link";
import { parsePrismBotMentionHref } from "./botMention";

/**
 * Link mark that allows `prism-bot://` URIs and renders them as inline
 * `<span>` chips in the editor (no navigation) while round-tripping through
 * markdown as normal `[text](prism-bot://id)` links.
 */
export const PrismBotLink = TiptapLink.extend({
  inclusive: () => false,

  addOptions(): LinkOptions {
    const parent = this.parent?.() as LinkOptions | undefined;
    return {
      ...parent,
      protocols: [
        ...(parent?.protocols ?? []),
        { scheme: "prism-bot", optionalSlashes: true },
      ],
      openOnClick: false,
    } as LinkOptions;
  },

  renderHTML({ HTMLAttributes }) {
    const href = HTMLAttributes.href;
    if (typeof href === "string" && href.toLowerCase().startsWith("prism-bot:")) {
      const botId = parsePrismBotMentionHref(href);
      return [
        "span",
        mergeAttributes(this.options.HTMLAttributes, {
          ...HTMLAttributes,
          href: undefined,
          "data-prism-bot-href": href,
          ...(botId ? { "data-prism-bot-id": botId } : {}),
          class: "tiptapPrismBotMention",
        }),
        0,
      ];
    }
    return ["a", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  parseHTML() {
    return [
      {
        tag: "span[data-prism-bot-href]",
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const href = element.getAttribute("data-prism-bot-href");
          if (!href || !href.toLowerCase().startsWith("prism-bot:")) return false;
          return { href, title: null };
        },
      },
      ...(this.parent?.() ?? []),
    ];
  },
});

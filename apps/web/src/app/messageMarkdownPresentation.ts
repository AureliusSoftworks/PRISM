const BLOCK_MARKDOWN_PATTERN =
  /(^|\n)[ \t]{0,3}(?:#{1,6}[ \t]+|>[ \t]?|(?:[-+*]|\d+[.)])[ \t]+|(?:```|~~~)|(?:\*\s*){3,}$|(?:-\s*){3,}$|(?:_\s*){3,}$)/mu;
const INLINE_MARKDOWN_PATTERN =
  /(?:!?)\[[^\]\n]+\]\([^\n)]+\)|(?:\*\*|__|~~)[^\n]+?(?:\*\*|__|~~)|(?:^|[^\\])(?:\*|_)[^\n*_]+?(?:\*|_)|`[^`\n]+`|(?:https?:\/\/|www\.)\S+/mu;
const TABLE_MARKDOWN_PATTERN =
  /(^|\n)[^\n|]+\|[^\n]+\n[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?/mu;

/**
 * Zen keeps its expressive per-character renderer for ordinary dialogue.
 * Messages containing Markdown syntax use the shared GFM renderer instead.
 */
export function messageUsesFullMarkdownPresentation(source: string): boolean {
  return (
    BLOCK_MARKDOWN_PATTERN.test(source) ||
    INLINE_MARKDOWN_PATTERN.test(source) ||
    TABLE_MARKDOWN_PATTERN.test(source)
  );
}

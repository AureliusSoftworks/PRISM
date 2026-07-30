export const SLATE_IMPORTED_MANUSCRIPT_TITLE = "Imported manuscript";
export const SLATE_UNSCOPED_IMPORTED_MANUSCRIPT_MAX_WORDS = 8_000;

export interface SlateImportedManuscriptSection {
  title: string;
  prose: string;
  start: number;
  end: number;
}

const SLATE_IMPORTED_HEADING_RE =
  /^(?:\uFEFF)?(?:[ \t]{0,3}#{1,6}[ \t]+)?(?<title>(?:(?:chapter|part|book)[ \t]+(?:\d{1,4}|[ivxlcdm]{1,16}|[a-z]+)(?:[ \t]*(?::|—|–|-)[ \t]*.{1,180})?|prologue(?:[ \t]*(?::|—|–|-)[ \t]*.{1,180})?|epilogue(?:[ \t]*(?::|—|–|-)[ \t]*.{1,180})?|interlude(?:[ \t]*(?::|—|–|-)[ \t]*.{1,180})?))[ \t]*\r?$/gimu;

function hasBlankBoundaryBefore(value: string, start: number): boolean {
  if (start === 0) return true;
  if (start === 1 && value.startsWith("\uFEFF")) return true;
  return /(?:\r?\n)[ \t]*(?:\r?\n)$/u.test(value.slice(0, start));
}

function hasBlankBoundaryAfter(
  value: string,
  end: number,
  markdownHeading: boolean,
): boolean {
  if (end === value.length) return true;
  const suffix = value.slice(end);
  if (markdownHeading) return /^\r?\n/u.test(suffix);
  return /^\r?\n[ \t]*(?:\r?\n|$)/u.test(suffix);
}

function importedHeadingMatches(
  manuscript: string,
): Array<{ start: number; title: string }> {
  const matches: Array<{ start: number; title: string }> = [];
  for (const match of manuscript.matchAll(SLATE_IMPORTED_HEADING_RE)) {
    const start = match.index;
    const rawHeading = match[0];
    const rawTitle = match.groups?.title?.trim() ?? "";
    if (
      !rawTitle ||
      !hasBlankBoundaryBefore(manuscript, start) ||
      !hasBlankBoundaryAfter(
        manuscript,
        start + rawHeading.length,
        /^[ \t]{0,3}#/u.test(rawHeading),
      )
    ) {
      continue;
    }
    matches.push({
      start,
      title: rawTitle.slice(0, 240),
    });
  }
  return matches;
}

/**
 * Splits only when at least two explicit chapter-like headings are present.
 * Every source byte belongs to exactly one returned section.
 */
export function splitSlateImportedManuscript(
  manuscript: string,
): SlateImportedManuscriptSection[] {
  const headings = importedHeadingMatches(manuscript);
  if (headings.length < 2) {
    return [
      {
        title: SLATE_IMPORTED_MANUSCRIPT_TITLE,
        prose: manuscript,
        start: 0,
        end: manuscript.length,
      },
    ];
  }

  const sections: SlateImportedManuscriptSection[] = [];
  const prefix = manuscript.slice(0, headings[0]!.start);
  const prefixHasMaterial = prefix.replace(/^\uFEFF/u, "").trim().length > 0;
  if (prefixHasMaterial) {
    sections.push({
      title: "Front matter",
      prose: prefix,
      start: 0,
      end: headings[0]!.start,
    });
  }

  headings.forEach((heading, index) => {
    const start =
      index === 0 && !prefixHasMaterial ? 0 : heading.start;
    const end = headings[index + 1]?.start ?? manuscript.length;
    sections.push({
      title: heading.title,
      prose: manuscript.slice(start, end),
      start,
      end,
    });
  });
  return sections;
}

function slateWordCount(value: string): number {
  const normalized = value.trim();
  return normalized ? normalized.split(/\s+/u).length : 0;
}

export function slateImportedSectionRequiresPassageScope(input: {
  kind: string;
  title: string;
  prose: string;
  hasSelection: boolean;
}): boolean {
  if (
    input.kind !== "imported" ||
    input.title !== SLATE_IMPORTED_MANUSCRIPT_TITLE ||
    input.hasSelection
  ) {
    return false;
  }
  return (
    splitSlateImportedManuscript(input.prose).length > 1 ||
    slateWordCount(input.prose) >
      SLATE_UNSCOPED_IMPORTED_MANUSCRIPT_MAX_WORDS
  );
}

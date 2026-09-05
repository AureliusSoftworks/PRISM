export function botLibraryGroupMonogram(groupName: string): string {
  const words = groupName
    .trim()
    .split(/\s+/u)
    .map((word) =>
      Array.from(word).filter((character) =>
        /[\p{L}\p{N}]/u.test(character),
      ),
    )
    .filter((word) => word.length > 0);
  if (words.length === 0) return "•";
  const letters =
    words.length === 1
      ? words[0]!.slice(0, 2)
      : [words[0]![0]!, words[words.length - 1]![0]!];
  return letters.join("").toLocaleUpperCase();
}

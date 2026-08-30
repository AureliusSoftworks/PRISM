export type BotSearchSingletonKeyAction = "select" | "complete";

export interface BotSearchKeyboardEventLike {
  key: string;
  defaultPrevented?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
  nativeEvent?: { isComposing?: boolean };
  preventDefault(): void;
  stopPropagation?(): void;
}

export function soleActionableBotSearchResult<T>(
  results: readonly T[],
  isActionable: (result: T) => boolean = () => true,
): T | null {
  let soleResult: T | null = null;
  for (const result of results) {
    if (!isActionable(result)) continue;
    if (soleResult !== null) return null;
    soleResult = result;
  }
  return soleResult;
}

export function resolveBotSearchSingletonKeyAction(args: {
  key: string;
  query: string;
  resultName: string | null | undefined;
  defaultPrevented?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
}): BotSearchSingletonKeyAction | null {
  const query = args.query.trim();
  const resultName = args.resultName?.trim() ?? "";
  if (
    args.defaultPrevented ||
    args.isComposing ||
    args.altKey ||
    args.ctrlKey ||
    args.metaKey ||
    !query ||
    !resultName
  ) {
    return null;
  }
  if (args.key === "Enter") return "select";
  if (args.key === "Tab" && !args.shiftKey && args.query !== resultName) {
    return "complete";
  }
  return null;
}

export function handleBotSearchSingletonKey<T>(args: {
  event: BotSearchKeyboardEventLike;
  query: string;
  results: readonly T[];
  isActionable?: (result: T) => boolean;
  getName: (result: T) => string;
  onSelect: (result: T) => void;
  onComplete: (name: string) => void;
}): boolean {
  const result = soleActionableBotSearchResult(
    args.results,
    args.isActionable,
  );
  const action = resolveBotSearchSingletonKeyAction({
    key: args.event.key,
    query: args.query,
    resultName: result ? args.getName(result) : null,
    defaultPrevented: args.event.defaultPrevented,
    shiftKey: args.event.shiftKey,
    altKey: args.event.altKey,
    ctrlKey: args.event.ctrlKey,
    metaKey: args.event.metaKey,
    isComposing:
      args.event.isComposing || args.event.nativeEvent?.isComposing === true,
  });
  if (!result || !action) return false;
  args.event.preventDefault();
  args.event.stopPropagation?.();
  if (action === "complete") {
    args.onComplete(args.getName(result));
  } else {
    args.onSelect(result);
  }
  return true;
}

export function botSearchSingletonHint(
  query: string,
  resultName: string | null | undefined,
): string | null {
  const normalizedQuery = query.trim();
  const normalizedName = resultName?.trim() ?? "";
  if (!normalizedQuery || !normalizedName) return null;
  return query === normalizedName
    ? "1 bot · Enter to choose"
    : "1 bot · Enter to choose · Tab to complete";
}

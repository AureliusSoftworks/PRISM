export interface PrismReloadTarget {
  reload(): void;
}

/** Performs the navbar refresh contract without coupling the behavior to React. */
export function reloadPrismPage(target: PrismReloadTarget | null): boolean {
  if (!target) return false;
  target.reload();
  return true;
}

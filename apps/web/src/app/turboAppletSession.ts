/**
 * Returns true when Turbo must be disabled because the authenticated owner or
 * active applet changed. This context is deliberately process-memory-only:
 * persisting it would leave account identity and model behavior in plaintext
 * browser storage after sign-out.
 */
export function syncTurboAppletSessionContext(
  previousRuntimeContext: string | null,
  nextContext: string,
  ownerId: string,
): boolean {
  const normalizedOwnerId = ownerId.trim();
  if (
    !normalizedOwnerId ||
    !nextContext.startsWith(`${normalizedOwnerId}:`)
  ) {
    return true;
  }
  return previousRuntimeContext !== nextContext;
}

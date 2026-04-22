export const INACTIVE_ACCOUNT_RETENTION_DAYS = 60;
export const INACTIVE_ACCOUNT_CLEANUP_INTERVAL_MS = 12 * 60 * 60 * 1000;

export function getInactiveAccountCutoff(now = new Date()): Date {
  return new Date(
    now.getTime() - INACTIVE_ACCOUNT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
}

export function isInactiveAccount(
  lastActiveAt: string,
  now = new Date()
): boolean {
  return new Date(lastActiveAt).getTime() < getInactiveAccountCutoff(now).getTime();
}

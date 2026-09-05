export interface AccountOwnerGenerationTicket {
  readonly ownerId: string;
  readonly generation: number;
}

export type AccountOwnerWorkResult<T> =
  | { status: "current"; value: T }
  | { status: "stale" };

function normalizeOwnerId(ownerId: string | null | undefined): string | null {
  const normalized = ownerId?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

/**
 * Synchronous client boundary for work whose authority comes from the active
 * authenticated account. A ticket remains valid only while both its owner and
 * auth generation are current.
 */
export class AccountOwnerGenerationBoundary {
  private ownerId: string | null = null;
  private generation = 0;

  setOwner(ownerId: string | null | undefined): boolean {
    const nextOwnerId = normalizeOwnerId(ownerId);
    if (nextOwnerId === this.ownerId) return false;
    this.ownerId = nextOwnerId;
    this.generation += 1;
    return true;
  }

  clear(): void {
    this.ownerId = null;
    this.generation += 1;
  }

  capture(): AccountOwnerGenerationTicket | null {
    if (!this.ownerId) return null;
    return Object.freeze({
      ownerId: this.ownerId,
      generation: this.generation,
    });
  }

  isCurrent(ticket: AccountOwnerGenerationTicket | null | undefined): boolean {
    return Boolean(
      ticket &&
        ticket.ownerId === this.ownerId &&
        ticket.generation === this.generation,
    );
  }
}

/**
 * Checks authority before starting delayed/queued work and again before its
 * completion can be applied. Errors from a superseded owner are intentionally
 * reduced to a stale result so they cannot render in the next account.
 */
export async function runAccountOwnerWork<T>(
  boundary: AccountOwnerGenerationBoundary,
  ticket: AccountOwnerGenerationTicket,
  work: () => Promise<T>,
): Promise<AccountOwnerWorkResult<T>> {
  if (!boundary.isCurrent(ticket)) return { status: "stale" };
  try {
    const value = await work();
    return boundary.isCurrent(ticket)
      ? { status: "current", value }
      : { status: "stale" };
  } catch (error) {
    if (!boundary.isCurrent(ticket)) return { status: "stale" };
    throw error;
  }
}

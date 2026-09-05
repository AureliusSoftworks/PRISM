interface CoffeeDepartureMessageLike {
  id: string;
  role: string;
}

/**
 * Finds assistant turns created by the private player-departure epilogue.
 * The returned indexes preserve server order so the live table can present
 * every goodbye before the completed-session Review replaces it.
 */
export function coffeeDepartureRevealMessageIndexes(args: {
  before: readonly CoffeeDepartureMessageLike[];
  after: readonly CoffeeDepartureMessageLike[];
}): number[] {
  const existingMessageIds = new Set(args.before.map((message) => message.id));
  const indexes: number[] = [];
  for (let index = 0; index < args.after.length; index += 1) {
    const message = args.after[index];
    if (
      message?.role === "assistant" &&
      !existingMessageIds.has(message.id)
    ) {
      indexes.push(index);
    }
  }
  return indexes;
}

export interface CoffeePollTurnResponseLike<TPoll> {
  poll?: TPoll | null;
}

export interface CoffeePollTurnUpdate<TPoll> {
  hasPollUpdate: boolean;
  poll: TPoll | null;
  shouldOpenResults: boolean;
}

export function coffeePollTurnUpdateFromResponse<TPoll>(
  response: CoffeePollTurnResponseLike<TPoll>
): CoffeePollTurnUpdate<TPoll> {
  if (!Object.prototype.hasOwnProperty.call(response, "poll")) {
    return {
      hasPollUpdate: false,
      poll: null,
      shouldOpenResults: false,
    };
  }
  const poll = response.poll ?? null;
  return {
    hasPollUpdate: true,
    poll,
    shouldOpenResults: poll !== null,
  };
}

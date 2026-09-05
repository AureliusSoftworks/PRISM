import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveBotHubResources,
  type BotHubResourceProvider,
} from "./botHubResources.ts";

test("resource registry omits unavailable providers and sorts stable IDs", () => {
  const providers: BotHubResourceProvider<{ ready: boolean }>[] = [
    {
      id: "assets-future",
      order: 40,
      resolve: () => ({ status: "unavailable" }),
    },
    {
      id: " signal ",
      order: 10,
      resolve: ({ ready }) =>
        ready
          ? {
              status: "available",
              label: "Signal",
              description: "Open show",
              activate: () => undefined,
            }
          : { status: "loading", label: "Signal", message: "Loading" },
    },
    {
      id: "signal",
      order: 1,
      resolve: () => ({ status: "unavailable" }),
    },
  ];

  assert.deepEqual(
    resolveBotHubResources(providers, { ready: true }).map(({ id }) => id),
    ["signal"],
  );
});

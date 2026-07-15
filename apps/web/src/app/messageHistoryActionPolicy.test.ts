import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { messageHistoryMutationActionsAvailable } from "./messageHistoryActionPolicy.ts";

describe("message history action policy", () => {
  it("keeps edit, fork, resend, and message deletion out of Zen", () => {
    assert.equal(
      messageHistoryMutationActionsAvailable({ productChatSurface: true }),
      false,
    );
  });

  it("retains history mutation tools on utility-first surfaces", () => {
    assert.equal(
      messageHistoryMutationActionsAvailable({ productChatSurface: false }),
      true,
    );
  });
});

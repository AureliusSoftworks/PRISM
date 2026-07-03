import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  botProfileDetailsUnlocked,
  botProfileReferenceName,
} from "./botProfileEditorGate.ts";

describe("bot profile editor name gate", () => {
  it("keeps create-mode profile details locked until the draft has a name", () => {
    assert.equal(botProfileDetailsUnlocked({ draftName: "" }), false);
    assert.equal(botProfileReferenceName({ draftName: "" }), "");
  });

  it("keeps existing bot profile details unlocked while the name draft is empty", () => {
    assert.equal(
      botProfileDetailsUnlocked({
        draftName: "",
        editingBotId: "bot-iris",
        editingOriginalName: "Iris",
      }),
      true
    );
    assert.equal(
      botProfileReferenceName({
        draftName: "",
        editingBotId: "bot-iris",
        editingOriginalName: "Iris",
      }),
      "Iris"
    );
  });

  it("prefers a typed draft name once the user starts renaming", () => {
    assert.equal(
      botProfileReferenceName({
        draftName: "  Nova  ",
        editingBotId: "bot-iris",
        editingOriginalName: "Iris",
      }),
      "Nova"
    );
  });
});

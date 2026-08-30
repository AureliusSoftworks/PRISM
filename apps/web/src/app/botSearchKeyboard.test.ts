import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  botSearchSingletonHint,
  handleBotSearchSingletonKey,
  resolveBotSearchSingletonKeyAction,
  soleActionableBotSearchResult,
} from "./botSearchKeyboard.ts";

describe("singleton-result bot search keyboard behavior", () => {
  it("selects the only actionable result with Enter", () => {
    const events: string[] = [];
    const selected: string[] = [];
    const handled = handleBotSearchSingletonKey({
      event: {
        key: "Enter",
        preventDefault: () => events.push("prevented"),
        stopPropagation: () => events.push("stopped"),
      },
      query: "abraham linc",
      results: [
        { name: "Disabled bot", disabled: true },
        { name: "Abraham Lincoln", disabled: false },
      ],
      isActionable: (result) => !result.disabled,
      getName: (result) => result.name,
      onSelect: (result) => selected.push(result.name),
      onComplete: () => assert.fail("Enter must not autocomplete"),
    });

    assert.equal(handled, true);
    assert.deepEqual(events, ["prevented", "stopped"]);
    assert.deepEqual(selected, ["Abraham Lincoln"]);
  });

  it("completes the only actionable result with Tab without selecting it", () => {
    let completed = "";
    const handled = handleBotSearchSingletonKey({
      event: { key: "Tab", preventDefault() {} },
      query: "Abraham Linc",
      results: [{ name: "Abraham Lincoln" }],
      getName: (result) => result.name,
      onSelect: () => assert.fail("Tab must not select"),
      onComplete: (name) => {
        completed = name;
      },
    });

    assert.equal(handled, true);
    assert.equal(completed, "Abraham Lincoln");
    assert.equal(
      botSearchSingletonHint("Abraham Linc", "Abraham Lincoln"),
      "1 bot · Enter to choose · Tab to complete",
    );
  });

  it("preserves normal Tab navigation once the exact name is complete", () => {
    assert.equal(
      resolveBotSearchSingletonKeyAction({
        key: "Tab",
        query: "Abraham Lincoln",
        resultName: "Abraham Lincoln",
      }),
      null,
    );
    assert.equal(
      botSearchSingletonHint("Abraham Lincoln", "Abraham Lincoln"),
      "1 bot · Enter to choose",
    );
  });

  it("does not capture empty, ambiguous, modified, reverse-Tab, or IME input", () => {
    assert.equal(soleActionableBotSearchResult(["one", "two"]), null);
    assert.equal(
      resolveBotSearchSingletonKeyAction({
        key: "Enter",
        query: "",
        resultName: "Abraham Lincoln",
      }),
      null,
    );
    for (const override of [
      { shiftKey: true, key: "Tab" },
      { metaKey: true, key: "Enter" },
      { ctrlKey: true, key: "Enter" },
      { altKey: true, key: "Enter" },
      { isComposing: true, key: "Enter" },
      { defaultPrevented: true, key: "Enter" },
    ]) {
      assert.equal(
        resolveBotSearchSingletonKeyAction({
          query: "abe",
          resultName: "Abraham Lincoln",
          ...override,
        }),
        null,
      );
    }
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildManualAskQuestionPayload,
  ensureManualAskQuestionOptionRows,
  parseManualAskQuestionDraft,
  splitManualAskQuestionOptionText,
} from "./manualAskQuestionTool.ts";

describe("manual AskQuestion tool helpers", () => {
  it("prefills choices from a question followed by pipe-separated choices", () => {
    const draft = parseManualAskQuestionDraft(
      "Would you rather eat:\n\nPotatoes|lemons|chicken|broccoli"
    );

    assert.deepEqual(draft, {
      question: "Would you rather eat:",
      options: ["Potatoes", "lemons", "chicken", "broccoli"],
    });
  });

  it("keeps a plain question open-ended", () => {
    const draft = parseManualAskQuestionDraft("What surprised you most today?");

    assert.deepEqual(draft, {
      question: "What surprised you most today?",
      options: [],
    });
  });

  it("prefills choices from newline-separated answer rows", () => {
    const draft = parseManualAskQuestionDraft("Pick a route:\nLeft\nRight\nWait");

    assert.deepEqual(draft, {
      question: "Pick a route:",
      options: ["Left", "Right", "Wait"],
    });
  });

  it("deduplicates and caps parsed options", () => {
    const draft = parseManualAskQuestionDraft("Choose:\nA|B|a|C|D|E");

    assert.deepEqual(draft, {
      question: "Choose:",
      options: ["A", "B", "C", "D"],
    });
  });

  it("splits pasted modal option text on pipes or new lines", () => {
    assert.deepEqual(splitManualAskQuestionOptionText("Tea | Coffee\nWater"), [
      "Tea",
      "Coffee",
      "Water",
    ]);
  });

  it("keeps two modal choice rows available when no choices are parsed", () => {
    assert.deepEqual(ensureManualAskQuestionOptionRows([]), ["", ""]);
    assert.deepEqual(ensureManualAskQuestionOptionRows(["Yes"]), ["Yes", ""]);
  });

  it("omits choices from payload until at least two unique choices are filled", () => {
    assert.deepEqual(buildManualAskQuestionPayload("Pick?", ["Yes", ""]), {
      question: "Pick?",
    });
    assert.deepEqual(buildManualAskQuestionPayload("Pick?", ["Yes", "No"]), {
      question: "Pick?",
      options: ["Yes", "No"],
    });
  });
});

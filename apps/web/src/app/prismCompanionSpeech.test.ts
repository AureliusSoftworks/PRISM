import assert from "node:assert/strict";
import test from "node:test";
import {
  finishPrismCompanionSpeechReveal,
  preparePrismCompanionSpeechReveal,
  prismCompanionSpeechVisibleContent,
  progressPrismCompanionSpeechReveal,
  startPrismCompanionSpeechReveal,
} from "./prismCompanionSpeech.ts";

test("holds companion text until its voice playback starts", () => {
  const reveal = preparePrismCompanionSpeechReveal(
    "message-1",
    "Light becomes color.",
  );

  assert.equal(
    prismCompanionSpeechVisibleContent(
      reveal,
      "message-1",
      "Light becomes color.",
    ),
    "",
  );
});

test("reveals companion text from the same audio clock used by Zen", () => {
  const content = "Light becomes color through the glass.";
  const prepared = preparePrismCompanionSpeechReveal("message-1", content);
  const started = startPrismCompanionSpeechReveal(prepared, 2_400);
  const midway = progressPrismCompanionSpeechReveal(started, 1_050);
  const visible = prismCompanionSpeechVisibleContent(
    midway,
    "message-1",
    content,
  );

  assert.ok(visible.length > 0);
  assert.ok(visible.length < content.length);
  assert.equal(
    prismCompanionSpeechVisibleContent(
      finishPrismCompanionSpeechReveal(midway),
      "message-1",
      content,
    ),
    content,
  );
});

test("keeps unrelated and muted companion messages fully visible", () => {
  const reveal = preparePrismCompanionSpeechReveal(
    "message-1",
    "Light becomes color.",
  );

  assert.equal(
    prismCompanionSpeechVisibleContent(
      reveal,
      "message-2",
      "This answer is already visible.",
    ),
    "This answer is already visible.",
  );
  assert.equal(
    prismCompanionSpeechVisibleContent(
      null,
      "message-1",
      "Muted answers appear immediately.",
    ),
    "Muted answers appear immediately.",
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { shouldResetPreviousSessionContext } from "./naturalContextReset.ts";

test("recognizes natural context reset phrases", () => {
  for (const text of [
    "Nevermind that.",
    "never mind",
    "don't worry about that",
    "Forget that, I was just thinking about the layout.",
    "Ignore this - can we talk about the footer?",
    "Let's talk about something else.",
    "Let's switch topics to model routing.",
    "New topic: local mode guarantees",
  ]) {
    assert.equal(shouldResetPreviousSessionContext(text), true, text);
  }
});

test("does not treat memory edits as whole-session resets", () => {
  for (const text of [
    "Don't forget that I like cheese.",
    "Nevermind what I said about pistachios.",
    "Forget what I said about coffee.",
    "Forget that I prefer matcha.",
    "I don't worry about that.",
    "Let's not talk about something else.",
  ]) {
    assert.equal(shouldResetPreviousSessionContext(text), false, text);
  }
});

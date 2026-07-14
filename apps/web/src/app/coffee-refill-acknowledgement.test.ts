import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  COFFEE_REFILL_ACKNOWLEDGEMENT_VISIBLE_MS,
  coffeeRefillAcknowledgement,
} from "./coffee-refill-acknowledgement.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

describe("Coffee refill acknowledgement", () => {
  it("occasionally returns a short stable ambient thank-you", () => {
    const results = Array.from({ length: 100 }, (_, index) =>
      coffeeRefillAcknowledgement({
        conversationId: "coffee-session",
        botId: `bot-${index}`,
        toppedOffAt: "2026-07-14T20:00:00.000Z",
      }),
    );
    const selected = results.filter((result) => result !== null);

    assert.ok(selected.length > 0);
    assert.ok(selected.length < results.length / 2);
    assert.ok(selected.every((result) => result.text.length <= 24));
    assert.ok(
      selected.every(
        (result) => result.visibleMs === COFFEE_REFILL_ACKNOWLEDGEMENT_VISIBLE_MS,
      ),
    );

    const firstSelectedIndex = results.findIndex((result) => result !== null);
    assert.ok(firstSelectedIndex >= 0);
    assert.deepEqual(
      coffeeRefillAcknowledgement({
        conversationId: "coffee-session",
        botId: `bot-${firstSelectedIndex}`,
        toppedOffAt: "2026-07-14T20:00:00.000Z",
      }),
      results[firstSelectedIndex],
    );
  });

  it("uses a later top-off as a fresh acknowledgement opportunity", () => {
    const outcomes = new Set(
      Array.from({ length: 20 }, (_, minute) =>
        JSON.stringify(
          coffeeRefillAcknowledgement({
            conversationId: "coffee-session",
            botId: "bot-one",
            toppedOffAt: `2026-07-14T20:${String(minute).padStart(2, "0")}:00.000Z`,
          }),
        ),
      ),
    );
    assert.ok(outcomes.size > 1);
  });

  it("rejects incomplete or invalid top-off identity", () => {
    assert.equal(
      coffeeRefillAcknowledgement({
        conversationId: "",
        botId: "bot-one",
        toppedOffAt: "2026-07-14T20:00:00.000Z",
      }),
      null,
    );
    assert.equal(
      coffeeRefillAcknowledgement({
        conversationId: "coffee-session",
        botId: "bot-one",
        toppedOffAt: "not-a-date",
      }),
      null,
    );
  });

  it("renders the thank-you as ephemeral seat UI after a successful top-off", () => {
    assert.match(
      pageSource,
      /const storedTopOff =\s*response\.conversation\.coffeeCupTopOffsByBotId\?\.\[botId\][\s\S]*coffeeRefillAcknowledgement\(\{[\s\S]*toppedOffAt: storedTopOff\.toppedOffAt,[\s\S]*showCoffeeRefillAcknowledgement\(botId, acknowledgement\)/,
    );
    assert.match(
      pageSource,
      /coffeeRefillAcknowledgementState\?\.botId === bot\.id[\s\S]*className=\{styles\.coffeeRefillAcknowledgement\}[\s\S]*role="status"[\s\S]*aria-live="polite"/,
    );
    assert.match(
      css,
      /\.coffeeRefillAcknowledgement\s*\{[\s\S]*animation:\s*coffeeRefillAcknowledgement 3600ms ease both/,
    );
    assert.match(
      css,
      /\[data-seat-count="5"\]\[data-layout-seat="0"\][\s\S]*\.coffeeRefillAcknowledgement\s*\{[\s\S]*left:\s*calc\(100% \+ 8px\)/,
    );
  });
});

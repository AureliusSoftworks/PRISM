import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { recordedMessageGenerationLabel } from "./messageGenerationProvenance.ts";

test("formats only recorded message provenance", () => {
  assert.equal(
    recordedMessageGenerationLabel({
      model: "gpt-5.4",
      effort: "high",
      turbo: true,
    }),
    "gpt-5.4 · High · Turbo",
  );
  assert.equal(
    recordedMessageGenerationLabel({ model: "llama3.2" }),
    "llama3.2 · Effort unavailable",
  );
  assert.equal(recordedMessageGenerationLabel({ model: "  " }), null);
  assert.equal(recordedMessageGenerationLabel(null), null);
});

test("uses recorded provenance for Signal and Coffee output bubbles", () => {
  const signal = readFileSync(
    new URL("./BotcastExperience.tsx", import.meta.url),
    "utf8",
  );
  const coffee = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  assert.match(signal, /signalMessageGenerationLabel\(episode, message\.id\)/u);
  assert.match(
    signal,
    /title=\{message\.generationLabel \?\? undefined\}/u,
  );
  assert.match(coffee, /generationLabel:\s*message\.role === "assistant"/u);
  assert.match(coffee, /title=\{line\.generationLabel \?\? undefined\}/u);
  assert.match(
    coffee,
    /className=\{styles\.coffeeMessage\}[\s\S]{0,640}title=\{generationLabel \?\? undefined\}/u,
  );
});

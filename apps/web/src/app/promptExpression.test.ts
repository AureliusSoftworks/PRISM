import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  flattenPromptExpressionTraces,
  resolvePromptExpression,
  seededPromptExpressionRandom,
  splitLegacyPromptChoices,
} from "./promptExpression.ts";

const prompts = [
  { id: "echo", name: "echo", template: "Echo only this:\n\n{VAR}" },
  { id: "case", name: "case", template: "The !places v. {NAME}." },
  { id: "a", name: "a", template: "/b" },
  { id: "b", name: "b", template: "/a" },
];

const decks = [
  { id: "places", name: "places", values: ["Commonwealth", "State"] },
  { id: "fruit", name: "fruit", values: ["!citrus", "pear"] },
  { id: "citrus", name: "citrus", values: ["lemon", "lime"] },
  { id: "cases", name: "cases", values: ["/case"] },
];

describe("prompt expressions", () => {
  it("resolves prompt arguments right-to-left before inserting VAR", () => {
    const result = resolvePromptExpression("/echo /case", {
      prompts,
      decks,
      random: () => 0,
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, "Echo only this:\n\nThe Commonwealth v. {NAME}.");
    assert.deepEqual(
      flattenPromptExpressionTraces(result.traces).map((trace) => trace.kind),
      ["prompt", "prompt", "deck", "wildcard"],
    );
  });

  it("resolves decks, prompts, and wildcards recursively in either direction", () => {
    const pending = resolvePromptExpression("!cases", {
      prompts,
      decks,
      random: () => 0,
    });
    const wildcard = pending.pendingWildcards[0];
    assert.ok(wildcard);
    const result = resolvePromptExpression("!cases", {
      prompts,
      decks,
      random: () => 0,
      wildcardValues: { [wildcard.path]: "Ada" },
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, "The Commonwealth v. Ada.");
    assert.deepEqual(
      flattenPromptExpressionTraces(result.traces).map((trace) => trace.kind),
      ["deck", "prompt", "deck", "wildcard"],
    );
  });

  it("recursively resolves a selected deck value", () => {
    const result = resolvePromptExpression("Choose !fruit.", {
      decks,
      random: () => 0,
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, "Choose lemon.");
    assert.deepEqual(
      flattenPromptExpressionTraces(result.traces).map((trace) => trace.kind),
      ["deck", "deck"],
    );
  });

  it("fully resolves the reported Debate random-name composition without changing adjacency", () => {
    const source = "The murder of /random-name.";
    const options = {
      prompts: [
        { id: "random-name", name: "random-name", template: "!name" },
      ],
      decks: [
        {
          id: "name",
          name: "name",
          values: ["!name-prefix{NAME}!name-suffix"],
        },
        { id: "prefix", name: "name-prefix", values: ["Mc"] },
        { id: "suffix", name: "name-suffix", values: ["son"] },
      ],
      random: () => 0,
    };
    const pending = resolvePromptExpression(source, options);
    assert.equal(pending.pendingWildcards.length, 1);
    const nameSlot = pending.pendingWildcards[0]!;
    const resolved = resolvePromptExpression(source, {
      ...options,
      wildcardValues: { [nameSlot.path]: "Ada" },
    });
    assert.equal(resolved.text, "The murder of McAdason.");
    assert.doesNotMatch(resolved.text, /[/!{}]/u);
  });

  it("resolves only the selected legacy branch at runtime", () => {
    const result = resolvePromptExpression("Pick {plain|!fruit}.", {
      decks: [{ id: "fruit", name: "fruit", values: ["pear"] }],
      random: () => 0,
    });
    assert.equal(result.text, "Pick plain.");
  });

  it("keeps unknown references, escapes, and generated wildcard values terminal", () => {
    const escaped = resolvePromptExpression(
      String.raw`/unknown !unknown \/echo \!fruit \{a\|b\}`,
      { prompts, decks },
    );
    assert.equal(escaped.text, "/unknown !unknown /echo !fruit {a|b}");

    const pending = resolvePromptExpression("{NAME}", { prompts, decks });
    const wildcard = pending.pendingWildcards[0];
    assert.ok(wildcard);
    const terminal = resolvePromptExpression("{NAME}", {
      prompts,
      decks,
      wildcardValues: { [wildcard.path]: "/case !fruit {NOUN}" },
    });
    assert.equal(terminal.text, "/case !fruit {NOUN}");
    assert.equal(terminal.pendingWildcards.length, 0);
  });

  it("does not partially consume longer unknown references", () => {
    const result = resolvePromptExpression("!fruitcake /casebook", {
      prompts,
      decks,
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, "!fruitcake /casebook");
  });

  it("detects direct and indirect runtime cycles along the active path", () => {
    const result = resolvePromptExpression("/a", { prompts, decks });
    assert.equal(result.ok, false);
    assert.equal(result.text, "/a");
    assert.equal(result.error?.code, "cycle");
    assert.deepEqual(result.error?.path, ["/a", "/b", "/a"]);

    const mixed = resolvePromptExpression("/outer", {
      prompts: [{ id: "outer", name: "outer", template: "!loop" }],
      decks: [{ id: "loop", name: "loop", values: ["/outer"] }],
      random: () => 0,
    });
    assert.equal(mixed.error?.code, "cycle");
    assert.deepEqual(mixed.error?.path, ["/outer", "!loop", "/outer"]);
  });

  it("allows repeated acyclic references and rolls them independently", () => {
    const result = resolvePromptExpression("!places !places", {
      decks,
      seed: 42,
    });
    assert.equal(result.ok, true);
    assert.equal(
      flattenPromptExpressionTraces(result.traces).filter(
        (trace) => trace.kind === "deck",
      ).length,
      2,
    );
  });

  it("rerolls one stable path without changing sibling paths", () => {
    const first = resolvePromptExpression("!places !places", {
      decks,
      seed: 77,
    });
    const traces = flattenPromptExpressionTraces(first.traces).filter(
      (trace) => trace.kind === "deck",
    );
    assert.equal(traces.length, 2);
    const rerolled = resolvePromptExpression("!places !places", {
      decks,
      seed: 77,
      rollCounters: { [traces[0]!.path]: 1 },
    });
    const rerolledTraces = flattenPromptExpressionTraces(
      rerolled.traces,
    ).filter((trace) => trace.kind === "deck");
    assert.equal(rerolledTraces[1]?.value, traces[1]?.value);
  });

  it("rerolling a parent recomposes descendants without changing outside siblings", () => {
    const nestedPrompts = [
      ...prompts,
      { id: "chooser", name: "chooser", template: "!places" },
    ];
    let verified = false;
    for (let seed = 1; seed <= 50 && !verified; seed += 1) {
      const first = resolvePromptExpression("/chooser !places", {
        prompts: nestedPrompts,
        decks,
        seed,
      });
      const traces = flattenPromptExpressionTraces(first.traces);
      const parent = traces.find((trace) => trace.name === "chooser")!;
      const nested = traces.find(
        (trace) => trace.kind === "deck" && trace.path.startsWith(`${parent.path}.`),
      )!;
      const sibling = traces.find(
        (trace) => trace.kind === "deck" && !trace.path.startsWith(`${parent.path}.`),
      )!;
      const rerolled = resolvePromptExpression("/chooser !places", {
        prompts: nestedPrompts,
        decks,
        seed,
        rollCounters: { [parent.path]: 1 },
      });
      const rerolledTraces = flattenPromptExpressionTraces(rerolled.traces);
      const rerolledNested = rerolledTraces.find(
        (trace) => trace.kind === "deck" && trace.path === nested.path,
      )!;
      const rerolledSibling = rerolledTraces.find(
        (trace) => trace.kind === "deck" && trace.path === sibling.path,
      )!;
      assert.equal(rerolledSibling.value, sibling.value);
      verified = rerolledNested.value !== nested.value;
    }
    assert.equal(verified, true);
  });

  it("uses deterministic seeded rolls", () => {
    const first = resolvePromptExpression("!places !places", {
      decks,
      random: seededPromptExpressionRandom(42),
    });
    const second = resolvePromptExpression("!places !places", {
      decks,
      random: seededPromptExpressionRandom(42),
    });
    assert.equal(first.text, second.text);
  });

  it("returns one immutable execution snapshot with operative aliases", () => {
    const result = resolvePromptExpression("!places", {
      decks,
      random: () => 0,
    });
    assert.equal(result.authoredSource, "!places");
    assert.equal(result.finalText, "Commonwealth");
    assert.equal(result.recipeNodes, result.traces);
    assert.equal(result.pendingSlots, result.pendingWildcards);
    assert.equal(result.replacements[0]?.value, "Commonwealth");
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.traces), true);
    assert.equal(Object.isFrozen(result.traces[0]), true);
  });

  it("preserves source when depth, node, or output budgets are exceeded", () => {
    let nestedChoices = "done";
    for (let index = 0; index < 18; index += 1) {
      nestedChoices = `{skip|${nestedChoices}}`;
    }
    const depth = resolvePromptExpression(nestedChoices, { random: () => 0.99 });
    assert.equal(depth.ok, false);
    assert.equal(depth.text, nestedChoices);
    assert.equal(depth.error?.code, "depth_limit");

    const manyNodesSource = Array.from({ length: 129 }, () => "!places").join(
      " ",
    );
    const nodes = resolvePromptExpression(manyNodesSource, {
      decks,
      random: () => 0,
    });
    assert.equal(nodes.ok, false);
    assert.equal(nodes.text, manyNodesSource);
    assert.equal(nodes.error?.code, "node_limit");

    const output = resolvePromptExpression("!large", {
      decks: [{ id: "large", name: "large", values: ["x".repeat(20_001)] }],
    });
    assert.equal(output.ok, false);
    assert.equal(output.text, "!large");
    assert.equal(output.error?.code, "output_limit");
  });

  it("splits legacy choices without losing escaped or nested delimiters", () => {
    assert.deepEqual(
      splitLegacyPromptChoices(String.raw`lemon\|lime|{red|green}|pear`),
      [String.raw`lemon\|lime`, "{red|green}", "pear"],
    );
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  findPromptDefinitionIssue,
  findPromptDependencyCycle,
  promptDependencyIdsReachableFrom,
  promptDependencyPathsTo,
} from "./promptDependencies.ts";

test("permits full multiplex definitions and detects an all-branch cycle", () => {
  const definitions = [
    { id: "p:a", kind: "prompt" as const, name: "a", sources: ["/b"] },
    {
      id: "d:fruit",
      kind: "deck" as const,
      name: "fruit",
      sources: ["apple", "!citrus"],
    },
    { id: "p:b", kind: "prompt" as const, name: "b", sources: ["!fruit"] },
    { id: "d:citrus", kind: "deck" as const, name: "citrus", sources: ["/a"] },
  ];
  assert.equal(findPromptDefinitionIssue(definitions), null);
  assert.deepEqual(findPromptDependencyCycle(definitions)?.labels, [
    "/a",
    "/b",
    "!fruit",
    "!citrus",
    "/a",
  ]);
});

test("normalizes aliases to canonical ids while finding cycles", () => {
  const definitions = [
    {
      id: "p:a",
      kind: "prompt" as const,
      name: "alpha",
      aliases: ["a"],
      sources: ["!b"],
    },
    {
      id: "d:b",
      kind: "deck" as const,
      name: "beta",
      aliases: ["b"],
      sources: ["/a"],
    },
  ];
  assert.deepEqual(findPromptDependencyCycle(definitions)?.ids, [
    "p:a",
    "d:b",
    "p:a",
  ]);
});

test("uses runtime-equivalent boundaries and underscore names", () => {
  const definitions = [
    {
      id: "p:snake",
      kind: "prompt" as const,
      name: "snake_case",
      sources: ["!fruit_box"],
    },
    {
      id: "d:fruit",
      kind: "deck" as const,
      name: "fruit_box",
      sources: ["/snake_case"],
    },
    {
      id: "p:url",
      kind: "prompt" as const,
      name: "url",
      sources: ["https://example.test/snake_case"],
    },
  ];
  assert.deepEqual(findPromptDependencyCycle(definitions)?.labels, [
    "/snake_case",
    "!fruit_box",
    "/snake_case",
  ]);
  assert.equal(findPromptDependencyCycle(definitions, "p:url"), null);
});

test("scopes cycle diagnostics and reachability to the selected definition", () => {
  const definitions = [
    { id: "p:good", kind: "prompt" as const, name: "good", sources: ["!safe"] },
    { id: "d:safe", kind: "deck" as const, name: "safe", sources: ["pear"] },
    { id: "p:a", kind: "prompt" as const, name: "a", sources: ["/b"] },
    { id: "p:b", kind: "prompt" as const, name: "b", sources: ["/a"] },
  ];
  assert.equal(findPromptDependencyCycle(definitions, "p:good"), null);
  assert.deepEqual([...promptDependencyIdsReachableFrom(definitions, "p:good")], [
    "p:good",
    "d:safe",
  ]);
  assert.deepEqual(findPromptDependencyCycle(definitions, "p:a")?.labels, [
    "/a",
    "/b",
    "/a",
  ]);
});

test("reports transitive dependency paths for protected deletion", () => {
  const definitions = [
    { id: "p:a", kind: "prompt" as const, name: "a", sources: ["/b"] },
    { id: "p:b", kind: "prompt" as const, name: "b", sources: ["!fruit"] },
    { id: "d:fruit", kind: "deck" as const, name: "fruit", sources: ["pear"] },
  ];
  assert.deepEqual(promptDependencyPathsTo(definitions, "d:fruit")[0]?.labels, [
    "/a",
    "/b",
    "!fruit",
  ]);
});

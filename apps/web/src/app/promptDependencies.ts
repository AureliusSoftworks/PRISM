export type PromptDefinitionKind = "prompt" | "deck";

export interface PromptDependencyDefinition {
  id: string;
  kind: PromptDefinitionKind;
  name: string;
  aliases?: readonly string[];
  sources: readonly string[];
}

export interface PromptDependencyPath {
  ids: string[];
  labels: string[];
}

/** Retained for browser-state compatibility with the earlier directional grammar. */
export type PromptDefinitionIssueCode = "invalid_definition";

export interface PromptDefinitionIssue extends PromptDependencyPath {
  code: PromptDefinitionIssueCode;
  message: string;
}

function normalizeName(value: string): string {
  return value.trim().replace(/^[!/$]+/u, "").toLowerCase();
}

function invocationMap(
  definitions: readonly PromptDependencyDefinition[],
  kind: PromptDefinitionKind,
): Map<string, string> {
  const result = new Map<string, string>();
  definitions
    .filter((definition) => definition.kind === kind)
    .forEach((definition) => {
      for (const value of [definition.name, ...(definition.aliases ?? [])]) {
        const name = normalizeName(value);
        if (name && !result.has(name)) result.set(name, definition.id);
      }
    });
  return result;
}

function referencedDefinitions(
  source: string,
  promptIds: ReadonlyMap<string, string>,
  deckIds: ReadonlyMap<string, string>,
): Array<{ prefix: "/" | "!"; id: string; invocation: string }> {
  const result: Array<{
    prefix: "/" | "!";
    id: string;
    invocation: string;
  }> = [];
  const promptEntries = [...promptIds.entries()].sort(
    ([first], [second]) => second.length - first.length,
  );
  const deckEntries = [...deckIds.entries()].sort(
    ([first], [second]) => second.length - first.length,
  );
  const nameChar = /[a-z0-9_-]/iu;
  for (let index = 0; index < source.length; index += 1) {
    const prefix = source[index];
    if (prefix === "\\") {
      index += 1;
      continue;
    }
    if (prefix !== "/" && prefix !== "!") continue;
    if (prefix === "/") {
      const previous = source[index - 1] ?? "";
      if (
        previous &&
        !/\s/u.test(previous) &&
        !/[([{,:;"']/u.test(previous)
      ) {
        continue;
      }
    }
    const tail = source.slice(index + 1).toLowerCase();
    const entries = prefix === "/" ? promptEntries : deckEntries;
    const match = entries.find(([invocation]) => {
      if (!tail.startsWith(invocation)) return false;
      const next = source[index + 1 + invocation.length] ?? "";
      return !next || !nameChar.test(next);
    });
    if (!match) continue;
    const [invocation, id] = match;
    result.push({ prefix, id, invocation });
    index += invocation.length;
  }
  return result;
}

export function buildPromptDependencyGraph(
  definitions: readonly PromptDependencyDefinition[],
): Map<string, Set<string>> {
  const promptIds = invocationMap(definitions, "prompt");
  const deckIds = invocationMap(definitions, "deck");
  const graph = new Map<string, Set<string>>();
  for (const definition of definitions) {
    const edges = new Set<string>();
    definition.sources.forEach((source) => {
      referencedDefinitions(source, promptIds, deckIds).forEach(({ id }) =>
        edges.add(id),
      );
    });
    graph.set(definition.id, edges);
  }
  return graph;
}

export function findPromptDefinitionIssue(
  definitions: readonly PromptDependencyDefinition[],
): PromptDefinitionIssue | null {
  // Full multiplex grammar intentionally permits every authored expression
  // kind in prompt bodies and deck values. Structural validity is therefore
  // represented by dependency cycles rather than directional grammar errors.
  void definitions;
  return null;
}

export function findPromptDependencyCycle(
  definitions: readonly PromptDependencyDefinition[],
  rootId?: string,
): PromptDependencyPath | null {
  const graph = buildPromptDependencyGraph(definitions);
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    if (active.has(id)) {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    if (visited.has(id)) return null;
    visited.add(id);
    active.add(id);
    stack.push(id);
    for (const child of graph.get(id) ?? []) {
      const cycle = visit(child);
      if (cycle) return cycle;
    }
    stack.pop();
    active.delete(id);
    return null;
  };
  const roots = rootId
    ? definitions.filter((definition) => definition.id === rootId)
    : definitions;
  for (const definition of roots) {
    const ids = visit(definition.id);
    if (ids) {
      return {
        ids,
        labels: ids.map((id) => {
          const item = byId.get(id);
          return item ? `${item.kind === "prompt" ? "/" : "!"}${item.name}` : id;
        }),
      };
    }
  }
  return null;
}

export function promptDependencyIdsReachableFrom(
  definitions: readonly PromptDependencyDefinition[],
  rootId: string,
): Set<string> {
  const graph = buildPromptDependencyGraph(definitions);
  const reachable = new Set<string>();
  const visit = (id: string): void => {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const child of graph.get(id) ?? []) visit(child);
  };
  visit(rootId);
  return reachable;
}

export function promptDependencyPathsTo(
  definitions: readonly PromptDependencyDefinition[],
  targetId: string,
): PromptDependencyPath[] {
  const graph = buildPromptDependencyGraph(definitions);
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const paths: PromptDependencyPath[] = [];
  const walk = (id: string, path: string[]): void => {
    if (path.includes(id)) return;
    const nextPath = [...path, id];
    if (id === targetId && path.length > 0) {
      paths.push({
        ids: nextPath,
        labels: nextPath.map((pathId) => {
          const item = byId.get(pathId);
          return item ? `${item.kind === "prompt" ? "/" : "!"}${item.name}` : pathId;
        }),
      });
      return;
    }
    for (const child of graph.get(id) ?? []) walk(child, nextPath);
  };
  definitions.forEach((definition) => {
    if (definition.id !== targetId) walk(definition.id, []);
  });
  return paths;
}

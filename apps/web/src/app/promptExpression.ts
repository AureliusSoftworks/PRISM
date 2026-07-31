export const PROMPT_EXPRESSION_MAX_DEPTH = 16;
export const PROMPT_EXPRESSION_MAX_NODES = 128;
export const PROMPT_EXPRESSION_MAX_OUTPUT = 20_000;

export interface PromptExpressionPrompt {
  id: string;
  name: string;
  aliases?: readonly string[];
  template: string;
  colorTag?: string;
}

export interface PromptExpressionDeck {
  id: string;
  name: string;
  aliases?: readonly string[];
  values: readonly string[];
  colorTag?: string;
}

export type PromptExpressionTraceKind =
  | "prompt"
  | "deck"
  | "wildcard"
  | "choice";

export interface PromptExpressionTrace {
  /** Stable occurrence identity within the authored expression tree. */
  id: string;
  path: string;
  parentId?: string;
  definitionId?: string;
  kind: PromptExpressionTraceKind;
  name: string;
  invocation: string;
  source: string;
  value: string;
  depth: number;
  selectedIndex?: number;
  sourceStart?: number;
  sourceEnd?: number;
  colorTag?: string;
  children: PromptExpressionTrace[];
}

export interface PromptExpressionPendingWildcard {
  path: string;
  key: string;
  token: string;
  depth: number;
}

export interface PromptExpressionReplacement {
  path: string;
  kind: PromptExpressionTraceKind;
  source: string;
  value: string;
  sourceStart?: number;
  sourceEnd?: number;
}

export type PromptExpressionErrorCode =
  | "cycle"
  | "invalid_definition"
  | "depth_limit"
  | "node_limit"
  | "output_limit"
  | "empty_definition";

export interface PromptExpressionError {
  code: PromptExpressionErrorCode;
  message: string;
  path: string[];
}

/**
 * Canonical, immutable result consumed by Preview and live composer surfaces.
 * `text` is the operative text after every locally available resolution step.
 */
export interface PromptExecutionResult {
  ok: boolean;
  /** Authored source retained verbatim for editing and failure recovery. */
  authoredSource: string;
  /** Exact operative text produced by this local execution snapshot. */
  finalText: string;
  source: string;
  text: string;
  traces: PromptExpressionTrace[];
  recipeNodes: PromptExpressionTrace[];
  replacements: PromptExpressionReplacement[];
  pendingModelSlots: string[];
  pendingWildcards: PromptExpressionPendingWildcard[];
  pendingSlots: PromptExpressionPendingWildcard[];
  diagnostics: PromptExpressionError[];
  error?: PromptExpressionError;
}

export type PromptExpressionResolution = PromptExecutionResult;

interface ExpressionRegistryEntry<T> {
  entry: T;
  invocation: string;
}

interface ResolveState {
  prompts: Array<ExpressionRegistryEntry<PromptExpressionPrompt>>;
  decks: Array<ExpressionRegistryEntry<PromptExpressionDeck>>;
  random?: () => number;
  seed: number;
  rollCounters: Readonly<Record<string, number>>;
  wildcardValues: Readonly<Record<string, string>>;
  sampleInput: string;
  nodeCount: number;
  pendingWildcards: PromptExpressionPendingWildcard[];
}

interface ResolveContext {
  depth: number;
  ancestryKeys: string[];
  ancestryLabels: string[];
  path: string;
  parentId?: string;
}

interface ResolvePart {
  text: string;
  traces: PromptExpressionTrace[];
}

class PromptExpressionFailure extends Error {
  readonly detail: PromptExpressionError;

  constructor(detail: PromptExpressionError) {
    super(detail.message);
    this.detail = detail;
  }
}

const MODEL_SLOT_RE = /\{([A-Z][A-Z0-9_ ]{1,63})\}/gu;
const NAME_CHAR_RE = /[a-z0-9_-]/iu;

function normalizedName(value: string): string {
  return value.trim().replace(/^[!/$]+/u, "").toLowerCase();
}

function expressionNames(name: string, aliases?: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of [name, ...(aliases ?? [])]) {
    const normalized = normalizedName(candidate);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function fail(
  code: PromptExpressionErrorCode,
  message: string,
  path: readonly string[],
): never {
  throw new PromptExpressionFailure({ code, message, path: [...path] });
}

function assertBudget(state: ResolveState, context: ResolveContext): void {
  if (context.depth > PROMPT_EXPRESSION_MAX_DEPTH) {
    fail(
      "depth_limit",
      `Expression nesting exceeds ${PROMPT_EXPRESSION_MAX_DEPTH} levels.`,
      context.ancestryLabels,
    );
  }
  state.nodeCount += 1;
  if (state.nodeCount > PROMPT_EXPRESSION_MAX_NODES) {
    fail(
      "node_limit",
      `Expression expansion exceeds ${PROMPT_EXPRESSION_MAX_NODES} nodes.`,
      context.ancestryLabels,
    );
  }
}

function assertOutput(value: string, context: ResolveContext): void {
  if (value.length > PROMPT_EXPRESSION_MAX_OUTPUT) {
    fail(
      "output_limit",
      `Expression output exceeds ${PROMPT_EXPRESSION_MAX_OUTPUT.toLocaleString()} characters.`,
      context.ancestryLabels,
    );
  }
}

function promptBoundaryBefore(source: string, index: number): boolean {
  if (index === 0) return true;
  const previous = source[index - 1] ?? "";
  if (previous === "\\") return false;
  if (/\s/u.test(previous)) return true;
  return /[([{,:;"']/u.test(previous);
}

function invocationBoundaryAfter(source: string, index: number): boolean {
  const next = source[index] ?? "";
  return !next || !NAME_CHAR_RE.test(next);
}

function matchingPromptAt(
  source: string,
  index: number,
  state: ResolveState,
): ExpressionRegistryEntry<PromptExpressionPrompt> | null {
  if (source[index] !== "/" || !promptBoundaryBefore(source, index)) return null;
  const tail = source.slice(index + 1).toLowerCase();
  return (
    state.prompts.find(({ invocation }) => {
      if (!tail.startsWith(invocation)) return false;
      return invocationBoundaryAfter(source, index + 1 + invocation.length);
    }) ?? null
  );
}

function matchingDeckAt(
  source: string,
  index: number,
  state: ResolveState,
): ExpressionRegistryEntry<PromptExpressionDeck> | null {
  if (source[index] !== "!") return null;
  const tail = source.slice(index + 1).toLowerCase();
  return (
    state.decks.find(({ invocation }) => {
      if (!tail.startsWith(invocation)) return false;
      return invocationBoundaryAfter(source, index + 1 + invocation.length);
    }) ?? null
  );
}

function matchingBraceEnd(source: string, start: number): number {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index] ?? "";
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

export function splitLegacyPromptChoices(source: string): string[] {
  const values: string[] = [];
  let current = "";
  let depth = 0;
  let escaped = false;
  for (const char of source) {
    if (escaped) {
      current += `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth = Math.max(0, depth - 1);
    if (char === "|" && depth === 0) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (escaped) current += "\\";
  values.push(current.trim());
  return values;
}

export interface LegacyPromptChoiceOccurrence {
  start: number;
  end: number;
  source: string;
  values: string[];
}

export function findLegacyPromptChoiceOccurrences(
  source: string,
): LegacyPromptChoiceOccurrence[] {
  const occurrences: LegacyPromptChoiceOccurrence[] = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source[index] !== "{") continue;
    const end = matchingBraceEnd(source, index);
    if (end < 0) continue;
    const token = source.slice(index, end + 1);
    const values = splitLegacyPromptChoices(token.slice(1, -1));
    if (values.length > 1) {
      occurrences.push({ start: index, end: end + 1, source: token, values });
    }
    index = end;
  }
  return occurrences;
}

function isPromptVarBody(value: string): boolean {
  return /^VAR\d*$/iu.test(value.trim());
}

function hasPromptVar(source: string): boolean {
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source[index] !== "{") continue;
    const end = matchingBraceEnd(source, index);
    if (end < 0) continue;
    if (isPromptVarBody(source.slice(index + 1, end))) return true;
    index = end;
  }
  return false;
}

function nextContext(
  context: ResolveContext,
  key: string,
  label: string,
  path: string,
): ResolveContext {
  const cycleStart = context.ancestryKeys.indexOf(key);
  if (cycleStart >= 0) {
    const cycle = [...context.ancestryLabels.slice(cycleStart), label];
    fail("cycle", `Recursive expression cycle: ${cycle.join(" → ")}.`, cycle);
  }
  return {
    depth: context.depth + 1,
    ancestryKeys: [...context.ancestryKeys, key],
    ancestryLabels: [...context.ancestryLabels, label],
    path,
    parentId: context.parentId,
  };
}

function hashSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function randomForPath(state: ResolveState, path: string): number {
  if (state.random) return state.random();
  const roll = Object.entries(state.rollCounters).reduce(
    (total, [rolledPath, count]) =>
      path === rolledPath || path.startsWith(`${rolledPath}.`)
        ? total + count
        : total,
    0,
  );
  return seededPromptExpressionRandom(
    hashSeed(`${state.seed}:${path}:${roll}`),
  )();
}

function appendPart(
  output: string,
  traces: PromptExpressionTrace[],
  part: ResolvePart,
  context: ResolveContext,
): string {
  const next = output + part.text;
  traces.push(...part.traces);
  assertOutput(next, context);
  return next;
}

function resolvePromptTemplate(
  template: string,
  captured: ResolvePart,
  state: ResolveState,
  context: ResolveContext,
): ResolvePart {
  let output = "";
  const traces: PromptExpressionTrace[] = [];
  let cursor = 0;
  let segmentIndex = 0;
  for (let index = 0; index < template.length; index += 1) {
    if (template[index] === "\\") {
      index += 1;
      continue;
    }
    if (template[index] !== "{") continue;
    const end = matchingBraceEnd(template, index);
    if (end < 0) continue;
    if (!isPromptVarBody(template.slice(index + 1, end))) {
      index = end;
      continue;
    }
    const before = resolveText(template.slice(cursor, index), state, {
      ...context,
      path: `${context.path}.body.${segmentIndex}`,
    });
    output = appendPart(output, traces, before, context);
    output = appendPart(output, traces, captured, context);
    cursor = end + 1;
    segmentIndex += 1;
    index = end;
  }
  const tail = resolveText(template.slice(cursor), state, {
    ...context,
    path: `${context.path}.body.${segmentIndex}`,
  });
  output = appendPart(output, traces, tail, context);
  return { text: output, traces };
}

function resolvePrompt(
  source: string,
  start: number,
  path: string,
  match: ExpressionRegistryEntry<PromptExpressionPrompt>,
  state: ResolveState,
  context: ResolveContext,
): ResolvePart & { consumedTo: number } {
  const prompt = match.entry;
  const invocation = `/${match.invocation}`;
  const end = start + invocation.length;
  const childContext = nextContext(
    context,
    `prompt:${prompt.id}`,
    invocation,
    path,
  );
  childContext.parentId = path;
  assertBudget(state, childContext);
  if (!prompt.template.trim()) {
    fail(
      "empty_definition",
      `${invocation} has no prompt text configured.`,
      childContext.ancestryLabels,
    );
  }

  let captured: ResolvePart = { text: "", traces: [] };
  let consumedTo = end;
  if (hasPromptVar(prompt.template)) {
    const tail = source.slice(end).replace(/^\s+/u, "");
    const authoredInput = tail || state.sampleInput;
    captured = resolveText(authoredInput, state, {
      ...childContext,
      path: `${path}.arg`,
      parentId: path,
    });
    consumedTo = source.length;
  }
  const resolvedBody = resolvePromptTemplate(
    prompt.template,
    captured,
    state,
    childContext,
  );
  assertOutput(resolvedBody.text, childContext);
  return {
    text: resolvedBody.text,
    consumedTo,
    traces: [
      {
        id: path,
        path,
        ...(context.parentId ? { parentId: context.parentId } : {}),
        definitionId: prompt.id,
        kind: "prompt",
        name: prompt.name,
        invocation,
        source: prompt.template,
        value: resolvedBody.text,
        depth: context.depth,
        sourceStart: start,
        sourceEnd: end,
        ...(prompt.colorTag ? { colorTag: prompt.colorTag } : {}),
        children: resolvedBody.traces,
      },
    ],
  };
}

function resolveDeck(
  start: number,
  path: string,
  match: ExpressionRegistryEntry<PromptExpressionDeck>,
  state: ResolveState,
  context: ResolveContext,
): ResolvePart & { consumedTo: number } {
  const deck = match.entry;
  const invocation = `!${match.invocation}`;
  const end = start + invocation.length;
  const childContext = nextContext(
    context,
    `deck:${deck.id}`,
    invocation,
    path,
  );
  childContext.parentId = path;
  assertBudget(state, childContext);
  const values = deck.values.filter((value) => value.trim().length > 0);
  if (values.length === 0) {
    fail(
      "empty_definition",
      `${invocation} has no values configured.`,
      childContext.ancestryLabels,
    );
  }
  const selectedIndex = Math.min(
    values.length - 1,
    Math.max(0, Math.floor(randomForPath(state, path) * values.length)),
  );
  const selected = values[selectedIndex] ?? values[0] ?? "";
  const resolved = resolveText(selected, state, {
    ...childContext,
    path: `${path}.value`,
    parentId: path,
  });
  assertOutput(resolved.text, childContext);
  return {
    text: resolved.text,
    consumedTo: end,
    traces: [
      {
        id: path,
        path,
        ...(context.parentId ? { parentId: context.parentId } : {}),
        definitionId: deck.id,
        kind: "deck",
        name: deck.name,
        invocation,
        source: selected,
        value: resolved.text,
        depth: context.depth,
        selectedIndex,
        sourceStart: start,
        sourceEnd: end,
        ...(deck.colorTag ? { colorTag: deck.colorTag } : {}),
        children: resolved.traces,
      },
    ],
  };
}

function normalizedWildcardKey(body: string): string | null {
  const match = /^([A-Z][A-Z0-9_ ]{1,63})$/u.exec(body.trim());
  if (!match) return null;
  const key = (match[1] ?? "").trim().replace(/\s+/gu, "_").toUpperCase();
  return key && key !== "VAR" ? key : null;
}

function resolveWildcard(
  token: string,
  key: string,
  start: number,
  end: number,
  path: string,
  state: ResolveState,
  context: ResolveContext,
): ResolvePart {
  const childContext: ResolveContext = {
    ...context,
    depth: context.depth + 1,
    path,
    parentId: path,
  };
  assertBudget(state, childContext);
  const resolved = state.wildcardValues[path];
  const value = resolved ?? token;
  if (resolved === undefined) {
    state.pendingWildcards.push({
      path,
      key,
      token,
      depth: context.depth,
    });
  }
  return {
    text: value,
    traces: [
      {
        id: path,
        path,
        ...(context.parentId ? { parentId: context.parentId } : {}),
        kind: "wildcard",
        name: key,
        invocation: token,
        source: token,
        value,
        depth: context.depth,
        sourceStart: start,
        sourceEnd: end + 1,
        children: [],
      },
    ],
  };
}

function resolveLegacyChoice(
  source: string,
  start: number,
  end: number,
  path: string,
  state: ResolveState,
  context: ResolveContext,
): ResolvePart {
  const body = source.slice(start + 1, end);
  const choices = splitLegacyPromptChoices(body);
  if (choices.length < 2) {
    const key = normalizedWildcardKey(body);
    return key
      ? resolveWildcard(
          source.slice(start, end + 1),
          key,
          start,
          end,
          path,
          state,
          context,
        )
      : { text: source.slice(start, end + 1), traces: [] };
  }
  const childContext: ResolveContext = {
    ...context,
    depth: context.depth + 1,
    path,
    parentId: path,
  };
  assertBudget(state, childContext);
  const selectedIndex = Math.min(
    choices.length - 1,
    Math.max(0, Math.floor(randomForPath(state, path) * choices.length)),
  );
  const selected = choices[selectedIndex] ?? choices[0] ?? "";
  const resolved = resolveText(selected, state, {
    ...childContext,
    path: `${path}.value`,
    parentId: path,
  });
  return {
    text: resolved.text,
    traces: [
      {
        id: path,
        path,
        ...(context.parentId ? { parentId: context.parentId } : {}),
        kind: "choice",
        name: "Legacy choice",
        invocation: source.slice(start, end + 1),
        source: selected,
        value: resolved.text,
        depth: context.depth,
        selectedIndex,
        sourceStart: start,
        sourceEnd: end + 1,
        children: resolved.traces,
      },
    ],
  };
}

function resolveText(
  source: string,
  state: ResolveState,
  context: ResolveContext,
): ResolvePart {
  assertOutput(source, context);
  let output = "";
  const traces: PromptExpressionTrace[] = [];
  let index = 0;
  let expressionIndex = 0;
  while (index < source.length) {
    const char = source[index] ?? "";
    if (char === "\\" && index + 1 < source.length) {
      const escaped = source[index + 1] ?? "";
      if ("/!{}|\\".includes(escaped)) {
        output += escaped;
        index += 2;
        assertOutput(output, context);
        continue;
      }
    }
    const path = `${context.path}.${expressionIndex}`;
    const promptMatch = char === "/" ? matchingPromptAt(source, index, state) : null;
    if (promptMatch) {
      const resolved = resolvePrompt(
        source,
        index,
        path,
        promptMatch,
        state,
        context,
      );
      output = appendPart(output, traces, resolved, context);
      expressionIndex += 1;
      index = resolved.consumedTo;
      continue;
    }
    const deckMatch = char === "!" ? matchingDeckAt(source, index, state) : null;
    if (deckMatch) {
      const resolved = resolveDeck(
        index,
        path,
        deckMatch,
        state,
        context,
      );
      output = appendPart(output, traces, resolved, context);
      expressionIndex += 1;
      index = resolved.consumedTo;
      continue;
    }
    if (char === "{") {
      const end = matchingBraceEnd(source, index);
      if (end >= 0) {
        const resolved = resolveLegacyChoice(
          source,
          index,
          end,
          path,
          state,
          context,
        );
        output = appendPart(output, traces, resolved, context);
        if (resolved.traces.length > 0) expressionIndex += 1;
        index = end + 1;
        continue;
      }
    }
    output += char;
    index += 1;
    assertOutput(output, context);
  }
  return { text: output, traces };
}

function pendingModelSlotsFromSource(source: string): string[] {
  const slots: string[] = [];
  const seen = new Set<string>();
  for (const match of source.matchAll(MODEL_SLOT_RE)) {
    const name = (match[1] ?? "").trim().replace(/\s+/gu, "_").toUpperCase();
    if (!name || name === "VAR" || seen.has(name)) continue;
    seen.add(name);
    slots.push(name);
  }
  return slots;
}

export function seededPromptExpressionRandom(seed: number): () => number {
  let value = Number.isFinite(seed) ? seed >>> 0 : 1;
  if (value === 0) value = 0x9e3779b9;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 0x1_0000_0000;
  };
}

export function resolvePromptExpression(
  source: string,
  options: {
    prompts?: readonly PromptExpressionPrompt[];
    decks?: readonly PromptExpressionDeck[];
    random?: () => number;
    seed?: number;
    sampleInput?: string;
    rollCounters?: Readonly<Record<string, number>>;
    wildcardValues?: Readonly<Record<string, string>>;
  } = {},
): PromptExpressionResolution {
  const prompts: Array<ExpressionRegistryEntry<PromptExpressionPrompt>> = [];
  const promptNames = new Set<string>();
  for (const prompt of options.prompts ?? []) {
    for (const invocation of expressionNames(prompt.name, prompt.aliases)) {
      if (promptNames.has(invocation)) continue;
      promptNames.add(invocation);
      prompts.push({ entry: prompt, invocation });
    }
  }
  prompts.sort((a, b) => b.invocation.length - a.invocation.length);

  const decks: Array<ExpressionRegistryEntry<PromptExpressionDeck>> = [];
  const deckNames = new Set<string>();
  for (const deck of options.decks ?? []) {
    for (const invocation of expressionNames(deck.name, deck.aliases)) {
      if (deckNames.has(invocation)) continue;
      deckNames.add(invocation);
      decks.push({ entry: deck, invocation });
    }
  }
  decks.sort((a, b) => b.invocation.length - a.invocation.length);

  const state: ResolveState = {
    prompts,
    decks,
    random: options.random,
    seed: options.seed ?? Date.now(),
    rollCounters: options.rollCounters ?? {},
    wildcardValues: options.wildcardValues ?? {},
    sampleInput: options.sampleInput ?? "",
    nodeCount: 0,
    pendingWildcards: [],
  };
  try {
    const resolved = resolveText(source, state, {
      depth: 0,
      ancestryKeys: [],
      ancestryLabels: [],
      path: "root",
    });
    const pendingModelSlots = [...new Set(state.pendingWildcards.map(({ key }) => key))];
    return freezePromptExecutionResult({
      ok: true,
      authoredSource: source,
      finalText: resolved.text,
      source,
      text: resolved.text,
      traces: resolved.traces,
      recipeNodes: resolved.traces,
      replacements: flattenPromptExpressionTraces(resolved.traces)
        .filter((trace) => trace.value !== trace.invocation)
        .map((trace) => ({
          path: trace.path,
          kind: trace.kind,
          source: trace.invocation,
          value: trace.value,
          ...(trace.sourceStart !== undefined
            ? { sourceStart: trace.sourceStart }
            : {}),
          ...(trace.sourceEnd !== undefined
            ? { sourceEnd: trace.sourceEnd }
            : {}),
        })),
      pendingModelSlots,
      pendingWildcards: state.pendingWildcards,
      pendingSlots: state.pendingWildcards,
      diagnostics: [],
    });
  } catch (error) {
    if (error instanceof PromptExpressionFailure) {
      return freezePromptExecutionResult({
        ok: false,
        authoredSource: source,
        finalText: source,
        source,
        text: source,
        traces: [],
        recipeNodes: [],
        replacements: [],
        pendingModelSlots: pendingModelSlotsFromSource(source),
        pendingWildcards: [],
        pendingSlots: [],
        diagnostics: [error.detail],
        error: error.detail,
      });
    }
    throw error;
  }
}

function freezePromptExecutionResult(
  result: PromptExecutionResult,
): PromptExecutionResult {
  const freezeTrace = (trace: PromptExpressionTrace): void => {
    trace.children.forEach(freezeTrace);
    Object.freeze(trace.children);
    Object.freeze(trace);
  };
  result.traces.forEach(freezeTrace);
  Object.freeze(result.traces);
  if (result.recipeNodes !== result.traces) Object.freeze(result.recipeNodes);
  Object.freeze(result.replacements);
  Object.freeze(result.pendingModelSlots);
  Object.freeze(result.pendingWildcards);
  if (result.pendingSlots !== result.pendingWildcards) {
    Object.freeze(result.pendingSlots);
  }
  Object.freeze(result.diagnostics);
  return Object.freeze(result) as PromptExecutionResult;
}

export function promptExpressionContainsVar(source: string): boolean {
  return hasPromptVar(source);
}

export function flattenPromptExpressionTraces(
  traces: readonly PromptExpressionTrace[],
): PromptExpressionTrace[] {
  const result: PromptExpressionTrace[] = [];
  const visit = (trace: PromptExpressionTrace): void => {
    result.push(trace);
    trace.children.forEach(visit);
  };
  traces.forEach(visit);
  return result;
}

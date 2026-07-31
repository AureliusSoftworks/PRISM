import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUILT_IN_PROMPT_WILDCARD_SLOTS,
  applyPromptShortcutVarPassthrough,
  formatBuiltInPromptWildcardToday,
  getBuiltInPromptWildcardSlot,
  isDisabledPromptWildcardToken,
  isPassthroughBuiltInPromptWildcardKey,
  normalizeBuiltInPromptWildcardSlotKey,
  parseBuiltInPromptWildcardReference,
  parseStoredManualAskQuestionPayload,
  parseStoredPromptShortcutPayload,
  parseStoredPromptWildcardPayload,
  parseStoredPsychicThoughtPayload,
  normalizePromptShortcutMetadata,
  promptContainsPassthroughBuiltInPromptWildcards,
  resolveContextualBuiltInPromptWildcards,
  serializePromptShortcutPayload,
  serializePromptToolPayload,
  withPromptShortcutResolvedPrompt,
  withPromptWildcardResolvedPrompt,
} from "./promptShortcut.ts";

describe("built-in prompt wildcard slots", () => {
  it("normalizes labels, aliases, and brace tokens to canonical keys", () => {
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("ADJECTIVE"), "ADJECTIVE");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("adj"), "ADJECTIVE");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("{PLURAL NOUN}"), "PLURAL_NOUN");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("plural-noun"), "PLURAL_NOUN");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("{CONTAINER}"), "CONTAINER");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("receptacle"), "CONTAINER");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("hidden-truth"), "SECRET");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("{#}"), "NUM");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("#"), "NUM");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("{NUM}"), "NUM");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("{number}"), "NUM");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("number"), "NUM");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("{BOT}"), "BOT");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("{TODAY}"), "TODAY");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("current-date"), "TODAY");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("date"), "TODAY");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("{VAR}"), "VAR");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("var"), "VAR");
  });

  it("rejects unsupported built-in wildcard keys", () => {
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("MOOD RING"), null);
    assert.equal(getBuiltInPromptWildcardSlot("MOOD RING"), null);
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("CHARACTER"), null);
    assert.equal(getBuiltInPromptWildcardSlot("{CHARACTER}"), null);
    assert.equal(isDisabledPromptWildcardToken("CHARACTER"), true);
    assert.equal(isDisabledPromptWildcardToken("{CHARACTER1}"), true);
  });

  it("parses numbered references for known built-in wildcard slots", () => {
    assert.deepEqual(parseBuiltInPromptWildcardReference("PERSON1"), {
      slot: getBuiltInPromptWildcardSlot("PERSON"),
      key: "PERSON",
      reference: "1",
    });
    assert.deepEqual(parseBuiltInPromptWildcardReference("{ADJECTIVE2}"), {
      slot: getBuiltInPromptWildcardSlot("ADJECTIVE"),
      key: "ADJECTIVE",
      reference: "2",
    });
    assert.deepEqual(parseBuiltInPromptWildcardReference("{#1}"), {
      slot: getBuiltInPromptWildcardSlot("NUM"),
      key: "NUM",
      reference: "1",
    });
    assert.deepEqual(parseBuiltInPromptWildcardReference("{number1}"), {
      slot: getBuiltInPromptWildcardSlot("NUM"),
      key: "NUM",
      reference: "1",
    });
    assert.deepEqual(parseBuiltInPromptWildcardReference("plural-noun02"), {
      slot: getBuiltInPromptWildcardSlot("PLURAL_NOUN"),
      key: "PLURAL_NOUN",
      reference: "2",
    });
    assert.equal(parseBuiltInPromptWildcardReference("MOOD1"), null);
  });

  it("keeps built-in wildcard keys unique", () => {
    const keys = new Set(BUILT_IN_PROMPT_WILDCARD_SLOTS.map((slot) => slot.key));
    assert.equal(keys.size, BUILT_IN_PROMPT_WILDCARD_SLOTS.length);
  });

  it("marks only the starter built-ins as primary picker entries", () => {
    const primaryKeys = BUILT_IN_PROMPT_WILDCARD_SLOTS
      .filter((slot) => slot.pickerVisibility === "primary")
      .map((slot) => slot.key);
    assert.deepEqual(primaryKeys, [
      "NUM",
      "NAME",
      "PERSON",
      "PLACE",
      "OBJECT",
      "NOUN",
      "ADJECTIVE",
      "VERB",
      "ACTION",
      "STYLE",
      "GENRE",
      "COLOR",
      "TIME",
      "TODAY",
      "VAR",
      "PROBLEM",
    ]);
    assert.equal(getBuiltInPromptWildcardSlot("CONTAINER")?.pickerVisibility, "searchable");
    assert.equal(getBuiltInPromptWildcardSlot("TREASURE")?.pickerVisibility, "searchable");
    assert.equal(getBuiltInPromptWildcardSlot("SUFFIX")?.pickerVisibility, "searchable");
    assert.equal(getBuiltInPromptWildcardSlot("BOT")?.pickerVisibility, "hidden");
  });

  it("keeps noun generation rules free of sticky concrete examples", () => {
    const noun = getBuiltInPromptWildcardSlot("NOUN");
    const pluralNoun = getBuiltInPromptWildcardSlot("PLURAL_NOUN");
    assert.ok(noun);
    assert.ok(pluralNoun);
    assert.match(noun.generationHint, /Do not copy or reuse words from these instructions/iu);
    assert.match(pluralNoun.generationHint, /Do not copy or reuse words from these instructions/iu);
    for (const sticky of ["lantern", "subway", "rumor", "chessboard"]) {
      assert.doesNotMatch(noun.generationHint, new RegExp(sticky, "iu"));
      assert.doesNotMatch(pluralNoun.generationHint, new RegExp(sticky, "iu"));
    }
  });

  it("keeps NAME limited to first names and PERSON available for roles", () => {
    const name = getBuiltInPromptWildcardSlot("NAME");
    const person = getBuiltInPromptWildcardSlot("PERSON");
    assert.ok(name);
    assert.ok(person);
    assert.match(name.title, /first name/iu);
    assert.match(name.generationHint, /first name/iu);
    assert.match(person.title, /person, role, or character type/iu);
    assert.match(person.generationHint, /person, role, job, or character type/iu);
  });

  it("resolves {TODAY} to the local calendar date", () => {
    const now = new Date(2026, 6, 25, 12, 0, 0);
    const expected = formatBuiltInPromptWildcardToday(now, "en-US");
    assert.equal(expected, "Saturday, July 25, 2026");

    const result = resolveContextualBuiltInPromptWildcards(
      "Meet on {TODAY} and again on {today}.",
      { now, locales: "en-US" }
    );
    assert.equal(result.prompt, `Meet on ${expected} and again on ${expected}.`);
    assert.deepEqual(
      result.replacements.map(({ key, value, source }) => ({ key, value, source })),
      [
        { key: "TODAY", value: expected, source: "wildcard" },
        { key: "TODAY", value: expected, source: "wildcard" },
      ]
    );
    assert.equal(getBuiltInPromptWildcardSlot("TODAY")?.pickerVisibility, "primary");
  });

  it("keeps the STYLE generation rule focused on tone or genre labels", () => {
    const slot = getBuiltInPromptWildcardSlot("STYLE");
    assert.ok(slot);
    assert.match(slot.title, /writing tone or genre/iu);
    assert.match(slot.generationHint, /tone or style label/iu);
  });

  it("keeps the NUM generation rule limited to a small integer", () => {
    const slot = getBuiltInPromptWildcardSlot("NUM");
    assert.ok(slot);
    assert.equal(slot.label, "#");
    assert.match(slot.title, /digit from 1 to 10/iu);
    assert.match(slot.generationHint, /integer from 1 to 10/iu);
    assert.match(slot.generationHint, /digits only/iu);
  });

  it("fills {VAR} from prompt passthrough text without inventing values", () => {
    assert.equal(isPassthroughBuiltInPromptWildcardKey("VAR"), true);
    assert.equal(isPassthroughBuiltInPromptWildcardKey("TODAY"), false);
    assert.equal(getBuiltInPromptWildcardSlot("VAR")?.pickerVisibility, "primary");
    assert.match(
      getBuiltInPromptWildcardSlot("VAR")?.title ?? "",
      /typed after the \/prompt/iu,
    );
    assert.match(
      getBuiltInPromptWildcardSlot("VAR")?.title ?? "",
      /no A\/B\/C letter links/iu,
    );

    const template =
      'Say nothing other than the text following this prompt:\n\n"{VAR}"';
    assert.equal(promptContainsPassthroughBuiltInPromptWildcards(template), true);

    const filled = applyPromptShortcutVarPassthrough(template, "hello world!");
    assert.equal(
      filled.prompt,
      'Say nothing other than the text following this prompt:\n\n"hello world!"',
    );
    assert.equal(filled.replaced, true);
    assert.deepEqual(
      filled.replacements.map(({ key, value, source }) => ({ key, value, source })),
      [{ key: "VAR", value: "hello world!", source: "wildcard" }],
    );

    const repeated = applyPromptShortcutVarPassthrough(
      'Echo: "{var}" and again "{VAR}"',
      "same blob",
    );
    assert.equal(repeated.prompt, 'Echo: "same blob" and again "same blob"');
    assert.equal(repeated.replaced, true);

    // Numbered forms collapse to the same shared capture (no A/B/C links).
    assert.deepEqual(parseBuiltInPromptWildcardReference("VAR1"), {
      slot: getBuiltInPromptWildcardSlot("VAR"),
      key: "VAR",
      reference: null,
    });
    assert.deepEqual(parseBuiltInPromptWildcardReference("{VAR2}"), {
      slot: getBuiltInPromptWildcardSlot("VAR"),
      key: "VAR",
      reference: null,
    });
    const legacyNumbered = applyPromptShortcutVarPassthrough(
      'Echo: "{VAR1}" and "{VAR2}"',
      "shared",
    );
    assert.equal(legacyNumbered.prompt, 'Echo: "shared" and "shared"');

    const empty = applyPromptShortcutVarPassthrough('Echo: "{var}"', "");
    assert.equal(empty.prompt, 'Echo: ""');
    assert.equal(empty.replaced, true);

    const untouched = applyPromptShortcutVarPassthrough("No slots here.", "ignored");
    assert.equal(untouched.replaced, false);
    assert.equal(untouched.prompt, "No slots here.");
  });
});

describe("prompt shortcut payloads", () => {
  it("preserves trailing newlines in resolved prompt bodies", () => {
    const normalized = normalizePromptShortcutMetadata({
      v: 1,
      commandId: "cmd-echo",
      name: "echo",
      invocation: "/echo",
      template: "/echo",
      flags: [],
      resolvedPrompt:
        "Say nothing other than the text following this prompt:\n\n",
    });
    assert.equal(
      normalized?.resolvedPrompt,
      "Say nothing other than the text following this prompt:\n\n",
    );
  });

  it("round-trips persisted prompt shortcut metadata", () => {
    const serialized = serializePromptShortcutPayload({
      v: 1,
      commandId: "builtin:/help",
      name: "help",
      invocation: "/help -v explain this",
      template: "/help -v explain this",
      flags: [{ key: "v", value: "Please be verbose" }],
      passthrough: "explain this",
      resolvedPrompt: "Choose luminous garden.",
      wildcardReplacements: [
        { key: "ADJECTIVE", value: "luminous", start: 7, end: 15 },
        { key: "PLACE", value: "garden", start: 16, end: 22 },
      ],
      promptRuns: [
        {
          commandId: "builtin:/help",
          name: "help",
          invocation: "/help",
          sourceStart: 0,
          sourceEnd: 5,
          resolvedPrompt: "Choose luminous garden.",
          wildcardReplacements: [
            { key: "ADJECTIVE", value: "luminous", start: 7, end: 15 },
            { key: "PLACE", value: "garden", start: 16, end: 22 },
          ],
        },
      ],
    });

    assert.equal(typeof serialized, "string");
    assert.deepEqual(parseStoredPromptShortcutPayload(serialized), {
      v: 1,
      commandId: "builtin:/help",
      name: "help",
      invocation: "/help -v explain this",
      template: "/help -v explain this",
      flags: [{ key: "v", value: "Please be verbose" }],
      passthrough: "explain this",
      resolvedPrompt: "Choose luminous garden.",
      wildcardReplacements: [
        { key: "ADJECTIVE", value: "luminous", start: 7, end: 15 },
        { key: "PLACE", value: "garden", start: 16, end: 22 },
      ],
      promptRuns: [
        {
          commandId: "builtin:/help",
          name: "help",
          invocation: "/help",
          sourceStart: 0,
          sourceEnd: 5,
          resolvedPrompt: "Choose luminous garden.",
          wildcardReplacements: [
            { key: "ADJECTIVE", value: "luminous", start: 7, end: 15 },
            { key: "PLACE", value: "garden", start: 16, end: 22 },
          ],
        },
      ],
    });
  });

  it("ignores invalid or unrelated payloads", () => {
    assert.equal(parseStoredPromptShortcutPayload(null), undefined);
    assert.equal(parseStoredPromptShortcutPayload("not json"), undefined);
    assert.equal(
      parseStoredPromptShortcutPayload(JSON.stringify({ v: 1, mood: { key: "warm" } })),
      undefined
    );
  });

  it("adds the concrete prompt sent to the model", () => {
    assert.deepEqual(
      withPromptShortcutResolvedPrompt(
        {
          v: 1,
          commandId: "custom:/blah",
          name: "blah",
          invocation: "/blah",
          flags: [],
          wildcardReplacements: [
            { key: "ADJECTIVE", value: "luminous", start: 36, end: 44 },
          ],
        },
        "Tell me a 5-paragraph story about a luminous garden."
      ),
      {
        v: 1,
        commandId: "custom:/blah",
        name: "blah",
        invocation: "/blah",
        flags: [],
        resolvedPrompt: "Tell me a 5-paragraph story about a luminous garden.",
        wildcardReplacements: [
          { key: "ADJECTIVE", value: "luminous", start: 36, end: 44 },
        ],
      }
    );
  });

  it("round-trips general wildcard run metadata alongside prompt shortcuts", () => {
    const serialized = serializePromptToolPayload({
      promptShortcut: {
        v: 1,
        commandId: "custom:/story",
        name: "story",
        invocation: "/story",
        flags: [],
      },
      promptWildcards: {
        v: 1,
        template: "Tell me about !randomShit with {ADJECTIVE}.",
        resolvedPrompt: "Tell me about lemon with luminous.",
        wildcardReplacements: [
          { key: "randomShit", value: "lemon", start: 14, end: 19, source: "deck" },
          { key: "ADJECTIVE", value: "luminous", start: 25, end: 33, source: "wildcard" },
          { key: "BOT", value: "[Mira](prism-bot://mira)", botId: "mira", source: "wildcard" },
        ],
      },
      psychicThought: {
        v: 1,
        summary: "I checked the moving parts before answering.",
        effort: "medium",
        provider: "local",
        model: "llama3.2",
        createdAt: "2026-06-22T12:00:00.000Z",
      },
      manualAskQuestion: {
        v: 1,
        name: "AskQuestion",
        question: "Pick one:",
        options: [
          { id: "a", label: "Tea" },
          { id: "b", label: "Coffee" },
        ],
        selectedOptionId: "b",
      },
    });

    assert.equal(typeof serialized, "string");
    assert.deepEqual(parseStoredPromptShortcutPayload(serialized), {
      v: 1,
      commandId: "custom:/story",
      name: "story",
      invocation: "/story",
      flags: [],
    });
    assert.deepEqual(parseStoredPromptWildcardPayload(serialized), {
      v: 1,
      template: "Tell me about !randomShit with {ADJECTIVE}.",
      resolvedPrompt: "Tell me about lemon with luminous.",
      wildcardReplacements: [
        { key: "RANDOMSHIT", value: "lemon", start: 14, end: 19, source: "deck" },
        { key: "ADJECTIVE", value: "luminous", start: 25, end: 33, source: "wildcard" },
        { key: "BOT", value: "[Mira](prism-bot://mira)", botId: "mira", source: "wildcard" },
      ],
    });
    assert.deepEqual(parseStoredPsychicThoughtPayload(serialized), {
      v: 1,
      summary: "I checked the moving parts before answering.",
      effort: "medium",
      provider: "local",
      model: "llama3.2",
      createdAt: "2026-06-22T12:00:00.000Z",
    });
    assert.deepEqual(parseStoredManualAskQuestionPayload(serialized), {
      v: 1,
      name: "AskQuestion",
      question: "Pick one:",
      options: [
        { id: "a", label: "Tea" },
        { id: "b", label: "Coffee" },
      ],
      selectedOptionId: "b",
      selectedOptionIndex: 1,
      selectedOptionLabel: "Coffee",
    });
  });

  it("adds the concrete prompt sent to wildcard metadata", () => {
    assert.deepEqual(
      withPromptWildcardResolvedPrompt(
        {
          v: 1,
          template: "Tell me about !randomShit.",
          wildcardReplacements: [{ key: "RANDOMSHIT", value: "potato", start: 14, end: 20 }],
        },
        "Tell me about potato."
      ),
      {
        v: 1,
        template: "Tell me about !randomShit.",
        resolvedPrompt: "Tell me about potato.",
        wildcardReplacements: [{ key: "RANDOMSHIT", value: "potato", start: 14, end: 20 }],
      }
    );
  });
});

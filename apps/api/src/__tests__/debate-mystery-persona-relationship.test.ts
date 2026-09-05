import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_BOT_PROFILE_FIELDS,
  serializeStoredBotPrompt,
  type BotProfileFields,
} from "@localai/shared";
import {
  buildMysteryPersonaPairContextMapV1,
  mysteryPersonaDirectedPairContextV1,
  mysteryPersonaLineSelfIntroducesV1,
  remapMysteryPersonaPairContextBotIdsV1,
  validateMysteryPersonaPairContextMapV1,
  type MysteryPersonaPairContextBotV1,
} from "../debate-mystery-persona-relationship.ts";

function structuredBot(
  botId: string,
  displayName: string,
  edit: (profile: BotProfileFields) => void,
): MysteryPersonaPairContextBotV1 {
  const profile = structuredClone(DEFAULT_BOT_PROFILE_FIELDS);
  edit(profile);
  return {
    botId,
    displayName,
    systemPrompt: serializeStoredBotPrompt(profile, displayName),
  };
}

function explicitPairMap(
  bots: readonly MysteryPersonaPairContextBotV1[],
  leftBotId = "peter",
  rightBotId = "lois",
) {
  return buildMysteryPersonaPairContextMapV1({
    bots,
    eligiblePairs: [[leftBotId, rightBotId]],
  });
}

describe("Whodunnit persona pair context", () => {
  it("makes one explicit spouse fact available in both conversational directions", () => {
    const map = explicitPairMap([
      structuredBot("peter", "Peter Griffin", () => {}),
      structuredBot("lois", "Lois Griffin", (profile) => {
        profile.facts.customFacts = [{
          label: "Spouse",
          value: "Married to Peter Griffin.",
        }];
      }),
    ]);

    const peterToLois = mysteryPersonaDirectedPairContextV1(
      map,
      "peter",
      "lois",
    );
    const loisToPeter = mysteryPersonaDirectedPairContextV1(
      map,
      "lois",
      "peter",
    );
    assert.equal(peterToLois?.familiarity, "explicit_profile_canon");
    assert.equal(loisToPeter?.familiarity, "explicit_profile_canon");
    assert.deepEqual(peterToLois?.sources, loisToPeter?.sources);
    assert.equal(peterToLois?.sources[0]?.sourceOwnerBotId, "lois");
    assert.equal(peterToLois?.sources[0]?.sourceTargetBotId, "peter");
    assert.equal(peterToLois?.sources[0]?.matchKind, "full_name");
    assert.match(peterToLois?.sources[0]?.text ?? "", /Married to Peter Griffin/u);
  });

  it("preserves reciprocal source ownership in stable field order", () => {
    const bots = [
      structuredBot("peter", "Peter Griffin", (profile) => {
        profile.identity.background = "Peter built a life with Lois Griffin.";
      }),
      structuredBot("lois", "Lois Griffin", (profile) => {
        profile.purpose.statement = "Lois cares deeply for Peter Griffin.";
      }),
    ];

    const first = explicitPairMap(bots);
    const second = explicitPairMap([...bots].reverse());
    assert.deepEqual(second, first);
    const context = mysteryPersonaDirectedPairContextV1(first, "peter", "lois");
    assert.deepEqual(
      context?.sources.map((source) => source.sourceOwnerBotId),
      ["lois", "peter"],
    );
    assert.deepEqual(
      context?.sources.map((source) => source.field),
      ["purpose.statement", "identity.background"],
    );
  });

  it("accepts a first name only when it identifies one frozen cast member", () => {
    const unique = explicitPairMap([
      structuredBot("peter", "Peter Griffin", () => {}),
      structuredBot("lois", "Lois Griffin", (profile) => {
        profile.identity.role = "Peter's wife and trusted counterpart.";
      }),
      structuredBot("brian", "Brian Griffin", () => {}),
    ]);
    assert.equal(
      mysteryPersonaDirectedPairContextV1(unique, "lois", "peter")
        ?.sources[0]?.matchKind,
      "unique_first_name",
    );

    const ambiguous = explicitPairMap([
      structuredBot("peter", "Peter Griffin", () => {}),
      structuredBot("lois", "Lois Griffin", (profile) => {
        profile.identity.role = "Peter's wife and trusted counterpart.";
      }),
      structuredBot("other-peter", "Peter Parker", () => {}),
    ]);
    assert.equal(
      mysteryPersonaDirectedPairContextV1(ambiguous, "lois", "peter"),
      null,
    );
  });

  it("does not treat a shared surname or an unapproved profile field as canon", () => {
    const map = explicitPairMap([
      structuredBot("peter", "Peter Griffin", () => {}),
      structuredBot("lois", "Lois Griffin", (profile) => {
        profile.core.traits =
          "Lois is married to Peter Griffin and knows him intimately.";
        profile.identity.background =
          "A central member of the Griffin household.";
      }),
    ]);

    assert.equal(
      mysteryPersonaDirectedPairContextV1(map, "peter", "lois"),
      null,
    );
    assert.deepEqual(map.pairsByKey, {});
  });

  it("detects exact full-name and first-name self-introductions", () => {
    assert.equal(
      mysteryPersonaLineSelfIntroducesV1(
        "I am Lois Griffin. Ask what you need.",
        "Lois Griffin",
      ),
      true,
    );
    assert.equal(
      mysteryPersonaLineSelfIntroducesV1(
        "You already know me. I'm Lois, and I will answer carefully.",
        "Lois Griffin",
      ),
      true,
    );
    assert.equal(
      mysteryPersonaLineSelfIntroducesV1(
        "I am careful about what I claim, Peter.",
        "Lois Griffin",
      ),
      false,
    );
  });

  it("supports legacy plain prompts while remaining bounded and fact-source exact", () => {
    const longPrefix = "A".repeat(400);
    const map = explicitPairMap([
      {
        botId: "peter",
        displayName: "Peter Griffin",
        systemPrompt: "Peter is blunt but loyal.",
      },
      {
        botId: "lois",
        displayName: "Lois Griffin",
        systemPrompt:
          `${longPrefix} Lois has been married to Peter Griffin for years and recognizes him immediately.`,
      },
    ]);

    const source = mysteryPersonaDirectedPairContextV1(
      map,
      "lois",
      "peter",
    )?.sources[0];
    assert.equal(source?.field, "purpose.legacyNotes");
    assert.ok((source?.text.length ?? 0) <= 240);
    assert.match(source?.text ?? "", /Peter Griffin/u);
    assert.doesNotThrow(() => validateMysteryPersonaPairContextMapV1(map));
  });

  it("rejects malformed private maps rather than repairing profile canon", () => {
    const map = explicitPairMap([
      structuredBot("peter", "Peter Griffin", () => {}),
      structuredBot("lois", "Lois Griffin", (profile) => {
        profile.identity.background = "Lois is married to Peter Griffin.";
      }),
    ]);
    const tampered = structuredClone(map);
    const pair = mysteryPersonaDirectedPairContextV1(
      tampered,
      "peter",
      "lois",
    );
    assert.ok(pair);
    pair.sources[0]!.text = "Invented replacement.";

    assert.throws(
      () => validateMysteryPersonaPairContextMapV1(tampered),
      /source hash does not match/u,
    );
  });

  it("remaps package bot ids without changing source ownership or prose", () => {
    const map = explicitPairMap([
      structuredBot("peter", "Peter Griffin", () => {}),
      structuredBot("lois", "Lois Griffin", (profile) => {
        profile.identity.background = "Lois is married to Peter Griffin.";
      }),
    ]);
    const remapped = remapMysteryPersonaPairContextBotIdsV1(
      map,
      new Map([
        ["peter", "imported-prosecutor"],
        ["lois", "imported-suspect"],
      ]),
    );
    const context = mysteryPersonaDirectedPairContextV1(
      remapped,
      "imported-prosecutor",
      "imported-suspect",
    );

    assert.equal(context?.speakerBotId, "imported-prosecutor");
    assert.equal(context?.recipientBotId, "imported-suspect");
    assert.equal(context?.sources[0]?.sourceOwnerBotId, "imported-suspect");
    assert.match(context?.sources[0]?.text ?? "", /Peter Griffin/u);
    assert.notEqual(remapped.sourceHash, map.sourceHash);
  });

  it("re-sorts reciprocal canon after portable bot ids are remapped", () => {
    const map = explicitPairMap([
      structuredBot("peter", "Peter Griffin", (profile) => {
        profile.identity.background = "Peter built a life with Lois Griffin.";
      }),
      structuredBot("lois", "Lois Griffin", (profile) => {
        profile.purpose.statement = "Lois is married to Peter Griffin.";
      }),
    ]);
    const remapped = remapMysteryPersonaPairContextBotIdsV1(
      map,
      new Map([
        ["peter", "portable-a"],
        ["lois", "portable-z"],
      ]),
    );

    assert.deepEqual(
      mysteryPersonaDirectedPairContextV1(
        remapped,
        "portable-a",
        "portable-z",
      )?.sources.map((source) => source.sourceOwnerBotId),
      ["portable-a", "portable-z"],
    );
    assert.doesNotThrow(() => validateMysteryPersonaPairContextMapV1(remapped));
  });

  it("rejects a source borrowed from a third cast member", () => {
    const map = buildMysteryPersonaPairContextMapV1({
      bots: [
        structuredBot("peter", "Peter Griffin", () => {}),
        structuredBot("lois", "Lois Griffin", (profile) => {
          profile.identity.background = "Lois is married to Peter Griffin.";
        }),
        structuredBot("brian", "Brian Griffin", () => {}),
      ],
      eligiblePairs: [["peter", "lois"]],
    });
    const tampered = structuredClone(map);
    const source = mysteryPersonaDirectedPairContextV1(
      tampered,
      "peter",
      "lois",
    )?.sources[0];
    assert.ok(source);
    source.sourceTargetBotId = "brian";
    source.sourceTargetName = "Brian Griffin";

    assert.throws(
      () => remapMysteryPersonaPairContextBotIdsV1(tampered, new Map()),
      /invalid source/u,
    );
  });
});

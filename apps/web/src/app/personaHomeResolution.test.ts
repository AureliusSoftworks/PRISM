import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveExistingPersonaHome,
  type PersonaHomeResolutionSummary,
} from "./personaHomeResolution.ts";

const CREATED_AT = "2026-07-01T12:00:00.000Z";

function home(
  id: string,
  ownerBotId: string,
  options: {
    archived?: boolean;
    continuationConversationId?: string | null;
    contextKey?: string;
    contextKind?: string;
    conversationId?: string;
    updatedAt?: string;
  } = {},
): PersonaHomeResolutionSummary {
  const updatedAt = options.updatedAt ?? "2026-07-02T12:00:00.000Z";
  return {
    id,
    createdAt: CREATED_AT,
    updatedAt,
    history: {
      contextKey: options.contextKey ?? `bot:${ownerBotId}`,
      contextKind: options.contextKind ?? "persona_home",
      conversationId: options.conversationId ?? id,
      ownerBotId,
      createdAt: CREATED_AT,
      updatedAt,
      archived: options.archived ?? false,
      continuationConversationId:
        options.continuationConversationId === undefined
          ? id
          : options.continuationConversationId,
    },
  };
}

function prismHome(id: string): PersonaHomeResolutionSummary {
  return {
    ...home(id, "unused", { contextKey: "prism" }),
    history: {
      ...home(id, "unused", { contextKey: "prism" }).history!,
      contextKind: "prism_home",
      ownerBotId: null,
    },
  };
}

describe("resolveExistingPersonaHome", () => {
  it("follows History continuation metadata to the latest exact Home episode", () => {
    const first = home("a-episode-1", "bot-a", {
      continuationConversationId: "a-episode-2",
      updatedAt: "2026-07-02T12:00:00.000Z",
    });
    const latest = home("a-episode-2", "bot-a", {
      updatedAt: "2026-07-03T12:00:00.000Z",
    });

    const result = resolveExistingPersonaHome("bot-a", [first, latest]);

    assert.equal(result?.contextKey, "bot:bot-a");
    assert.equal(result?.ownerBotId, "bot-a");
    assert.equal(result?.conversationId, "a-episode-2");
    assert.equal(result?.summary, latest);
  });

  it("never substitutes Prism or another persona for the requested Home", () => {
    const prism = prismHome("prism-home");
    const other = home("b-home", "bot-b");
    const poisonedPrismPointer = home("a-stale-prism", "bot-a", {
      continuationConversationId: prism.id,
    });
    const poisonedOtherPointer = home("a-stale-b", "bot-a", {
      continuationConversationId: other.id,
    });

    assert.equal(
      resolveExistingPersonaHome("bot-a", [
        prism,
        other,
        poisonedPrismPointer,
        poisonedOtherPointer,
      ]),
      null,
    );
  });

  it("ignores presentation, deleted-owner, and legacy ambiguity", () => {
    const presentationOnly = {
      id: "presentation-only",
      updatedAt: "2026-07-10T12:00:00.000Z",
      botId: "bot-a",
      lastBotId: "bot-a",
    };
    const deletedOwner = home("deleted-home", "deleted-bot-a", {
      updatedAt: "2026-07-09T12:00:00.000Z",
    });
    const legacy = home("legacy-row", "bot-a", {
      contextKind: "legacy",
      updatedAt: "2026-07-08T12:00:00.000Z",
    });

    assert.equal(
      resolveExistingPersonaHome("bot-a", [
        presentationOnly,
        deletedOwner,
        legacy,
      ]),
      null,
    );
  });

  it("fails closed for missing, archived, inconsistent, or ambiguous continuations", () => {
    const cases: PersonaHomeResolutionSummary[][] = [
      [home("missing-target", "bot-a", { continuationConversationId: "gone" })],
      [home("archived-target", "bot-a", { archived: true })],
      [
        home("bad-conversation-id", "bot-a", {
          conversationId: "different-row",
        }),
      ],
      [
        home("duplicate-target", "bot-a"),
        home("duplicate-target", "bot-a"),
      ],
      [
        home("cycle-a", "bot-a", {
          continuationConversationId: "cycle-b",
        }),
        home("cycle-b", "bot-a", {
          continuationConversationId: "cycle-a",
        }),
      ],
      [home("null-target", "bot-a", { continuationConversationId: null })],
    ];

    for (const summaries of cases) {
      assert.equal(resolveExistingPersonaHome("bot-a", summaries), null);
    }
  });

  it("selects the newest eligible continuation independent of input order", () => {
    const older = home("older-home", "bot-a", {
      updatedAt: "2026-07-04T12:00:00.000Z",
    });
    const newer = home("newer-home", "bot-a", {
      updatedAt: "2026-07-05T12:00:00.000Z",
    });

    assert.equal(
      resolveExistingPersonaHome("bot-a", [older, newer])?.conversationId,
      newer.id,
    );
    assert.equal(
      resolveExistingPersonaHome("bot-a", [newer, older])?.conversationId,
      newer.id,
    );
  });

  it("uses a stable id tie-break and rejects an absent requested identity", () => {
    const z = home("z-home", "bot-a", {
      updatedAt: "not-a-timestamp",
    });
    const a = home("a-home", "bot-a", {
      updatedAt: "also-not-a-timestamp",
    });

    assert.equal(
      resolveExistingPersonaHome("bot-a", [z, a])?.conversationId,
      a.id,
    );
    assert.equal(resolveExistingPersonaHome("", [a]), null);
    assert.equal(resolveExistingPersonaHome(null, [a]), null);
  });

  it("does not use native route hints to choose a continuation", () => {
    const exact = {
      ...home("a-home", "bot-a"),
      history: {
        ...home("a-home", "bot-a").history!,
        nativeRoute: {
          view: "chat",
          conversationId: "prism-home",
          botId: null,
        },
      },
    };

    assert.equal(
      resolveExistingPersonaHome("bot-a", [exact, prismHome("prism-home")])
        ?.conversationId,
      exact.id,
    );
  });
});

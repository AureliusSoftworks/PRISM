import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:http";
import { after, describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";

import { getAppConfig } from "@localai/config";
import { createMysteryVenueProposalV1 } from "@localai/shared";
import { createDebateMysteryVenueBundleV1 } from "../debate-mystery-mansion-bundles.ts";
import { initializeDatabase } from "../db.ts";
import {
  createDeterministicProvider,
  createFetchRecorder,
  createTestDatabase,
  withTestRegistrationAcceptance,
} from "../test-support.ts";

process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.ENCRYPTION_MASTER_KEY = "mystery-venue-api-test-master-key";

const now = "2026-08-31T00:00:00.000Z";

function addUser(db: DatabaseSync, id: string): void {
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt,
        wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
        preferred_provider, created_at, last_active_at)
     VALUES (?, ?, 'Player', 'hash', 'salt', 'cipher', 'iv', 'tag', 'local', ?, ?)`,
  ).run(id, `${id}@example.com`, now, now);
}

describe("Mystery Venue acceptance", () => {
  it("persists only on acceptance and retries idempotently inside one tenant", () => {
    const db = initializeDatabase(new DatabaseSync(":memory:"));
    addUser(db, "creator");
    addUser(db, "other");
    const proposal = createMysteryVenueProposalV1({
      id: "56aa8317-e3da-4de4-90c4-e3b6df474b2e",
      description: "A midnight cruise aboard a vintage yacht",
      length: { id: "quick", rooms: 5, suspects: 4 },
      nonce: "test",
    });
    const before = db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_mansion_bundles",
    ).get() as { count: number };
    assert.equal(before.count, 0);

    const first = createDebateMysteryVenueBundleV1(db, "creator", proposal);
    const retry = createDebateMysteryVenueBundleV1(db, "creator", proposal);
    assert.equal(first.id, retry.id);
    assert.equal(first.layoutV2?.venueProfile?.kind, "vessel");
    assert.equal(first.layoutV2?.venueProfile?.entryRoomId, "room:venue-1");
    assert.equal(first.floors, 1);
    const after = db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_mansion_bundles",
    ).get() as { count: number };
    assert.equal(after.count, 1);
    assert.throws(
      () => createDebateMysteryVenueBundleV1(db, "other", proposal),
      /no longer available/u,
    );
  });

  it("preserves model-authored public identity while rebuilding server geometry", () => {
    const db = initializeDatabase(new DatabaseSync(":memory:"));
    addUser(db, "creator");
    const proposal = createMysteryVenueProposalV1({
      id: "061c91f5-d0fb-4a80-aa15-9fa74e0ef15e",
      description: "A clockwork museum",
      length: { id: "quick", rooms: 5, suspects: 4 },
      nonce: "model-test",
      creativeDraft: {
        title: "The Glass Menagerie",
        kind: "other",
        kindLabel: "Clockwork Museum",
        placeNoun: "museum",
        topology: "radial",
        tierNoun: "Gallery",
        exteriorMode: "contained",
        environmentSummary: "A mechanical museum arranged around a sealed central atrium.",
        atmosphere: "Ticking exhibits fall in and out of sync.",
        connectorLabel: "gallery stair",
        rooms: Array.from({ length: 5 }, (_, index) => ({
          templateId: `venue:gallery-${index + 1}`,
          name: index === 0 ? "Ticket Vestibule" : `Gallery ${index}`,
          emoji: "⚙️",
          role: index === 0 ? "entry" as const : "observation" as const,
          anchors: ["display plinth", "winding mechanism"],
        })),
      },
    });

    const accepted = createDebateMysteryVenueBundleV1(db, "creator", proposal);
    assert.equal(accepted.name, "The Glass Menagerie");
    assert.equal(accepted.layoutV2?.entities.find((entity) => entity.kind === "room")?.name, "Ticket Vestibule");
    assert.equal(accepted.layoutV2?.placementAnchors[0]?.name, "display plinth");
  });
});

const { createPrismRequestHandler } = await import("../server.ts");
const routeDb = createTestDatabase();
const localProvider = createDeterministicProvider(["not valid venue json"]);
const fetchRecorder = createFetchRecorder();
const routeServer = createServer(createPrismRequestHandler({
  db: routeDb,
  config: {
    ...getAppConfig(),
    apiPort: 0,
    sessionCookieName: "prism_mystery_venue_test_session",
    lanAccessEnabled: false,
    discoveryEnabled: false,
    openAiApiKey: "",
    anthropicApiKey: "",
    elevenLabsApiKey: "",
  },
  fetchImpl: fetchRecorder,
  providerFactory: () => localProvider,
  auxiliaryProviderFactory: () => localProvider,
}));
await new Promise<void>((resolve, reject) => {
  routeServer.once("error", reject);
  routeServer.listen(0, "127.0.0.1", resolve);
});
const routeAddress = routeServer.address() as AddressInfo;
const routeBaseUrl = `http://127.0.0.1:${routeAddress.port}`;
after(() => new Promise<void>((resolve, reject) => routeServer.close((error) => error ? reject(error) : resolve())));

describe("Mystery Venue proposal route", () => {
  it("falls back locally without persistence, images, or remote traffic", async () => {
    let cookie = "";
    const request = async (path: string, value: Record<string, unknown>): Promise<Response> => {
      const headers = new Headers({ "content-type": "application/json" });
      if (cookie) headers.set("cookie", cookie);
      const init = withTestRegistrationAcceptance(path, {
        method: "POST",
        headers,
        body: JSON.stringify(value),
      });
      const response = await fetch(`${routeBaseUrl}${path}`, init);
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";", 1)[0] ?? "";
      return response;
    };
    assert.equal((await request("/api/auth/register", {
      username: "venue-route-owner@example.com",
      password: "venue-route-owner-password",
    })).status, 201);
    const rowsBefore = Number((routeDb.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_mansion_bundles",
    ).get() as { count: number }).count);
    const imagesBefore = Number((routeDb.prepare(
      "SELECT COUNT(*) AS count FROM images",
    ).get() as { count: number }).count);
    const fetchCallsBefore = fetchRecorder.calls.length;

    const proposedResponse = await request("/api/debates/mystery-mansions/propose", {
      description: "A modern full-size passenger cruise ship, not a yacht, manor, or estate",
      length: { id: "standard", rooms: 10, suspects: 6, tiers: 2 },
      nonce: "local-route",
      responseMode: "local",
    });
    assert.equal(proposedResponse.status, 200);
    const proposed = (await proposedResponse.json()) as Record<string, any>;
    assert.equal(proposed.proposal.profile.kind, "vessel");
    assert.equal(proposed.proposal.profile.intent.archetype, "passenger_cruise_ship");
    assert.equal(proposed.proposal.profile.kindLabel, "Passenger Cruise Ship");
    assert.equal(proposed.proposal.profile.physicalScaleClass, "grand");
    assert.equal(proposed.proposal.profile.presentation.entryAction, "Board the ship");
    assert.equal(proposed.proposal.length.id, "standard");
    assert.equal(proposed.proposal.length.suspects, 6);
    assert.equal(proposed.proposal.source, "catalog");
    assert.match(proposed.proposal.editableDraftNotice, /editable structured draft/u);
    assert.equal(Number((routeDb.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_mansion_bundles",
    ).get() as { count: number }).count), rowsBefore);
    assert.equal(Number((routeDb.prepare(
      "SELECT COUNT(*) AS count FROM images",
    ).get() as { count: number }).count), imagesBefore);
    assert.equal(
      fetchRecorder.calls.slice(fetchCallsBefore).every((call) => {
        const host = new URL(call.input).hostname;
        return host === "127.0.0.1" || host === "localhost" || host === "::1";
      }),
      true,
      "LOCAL proposal generation may use the configured local model but must not contact a remote host",
    );

    const acceptedResponse = await request("/api/debates/mystery-mansions", {
      proposal: proposed.proposal,
      idempotencyKey: proposed.proposal.id,
    });
    assert.equal(acceptedResponse.status, 201);
    const accepted = (await acceptedResponse.json()) as Record<string, any>;
    assert.equal(accepted.mansion.layoutV2.venueProfile.intent.archetype, "passenger_cruise_ship");
    assert.equal(accepted.mansion.houseStyle.acousticThemePaletteId, "maritime-passenger-v1");
    assert.equal(Number((routeDb.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_mansion_bundles",
    ).get() as { count: number }).count), rowsBefore + 1);
  });
});

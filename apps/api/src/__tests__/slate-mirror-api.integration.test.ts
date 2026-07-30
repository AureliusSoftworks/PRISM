import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:http";
import { after, describe, it } from "node:test";
import { getAppConfig } from "@localai/config";
import {
  createDeterministicProvider,
  createFetchRecorder,
  createTestDatabase,
  withTestRegistrationAcceptance,
} from "../test-support.ts";

process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.ENCRYPTION_MASTER_KEY = "slate-mirror-api-test-key";

const { createPrismRequestHandler } = await import("../server.ts");
const db = createTestDatabase();
const voiceCard = (distance: string) =>
  JSON.stringify({
    narrativeDistance: distance,
    diction: ["Concrete verbs", "Plain nouns"],
    rhythm: ["Short pressure, then release"],
    imagery: ["Water and machinery"],
    dialogueHabits: ["Subtext before explanation"],
    exposition: ["Embedded in action"],
    humor: ["Dry and rare"],
    density: ["Tactile but restrained"],
    preferences: ["Physical action earns the emotional turn"],
    avoidances: ["Ornamental throat-clearing"],
    exemplars: ["The rope remembered the lake."],
    wordTarget: 900,
  });
const provider = createDeterministicProvider([
  voiceCard("Close third behind the viewpoint character's senses."),
  voiceCard("First person with controlled retrospection."),
]);
const providerSelections: string[] = [];
const server = createServer(
  createPrismRequestHandler({
    db,
    config: {
      ...getAppConfig(),
      apiPort: 0,
      sessionCookieName: "prism_slate_mirror_session",
      lanAccessEnabled: false,
      discoveryEnabled: false,
      openAiApiKey: "",
      anthropicApiKey: "",
      elevenLabsApiKey: "",
    },
    fetchImpl: createFetchRecorder(),
    providerFactory: (name) => {
      providerSelections.push(name);
      return provider;
    },
    auxiliaryProviderFactory: () => provider,
  }),
);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${address.port}`;

function createClient() {
  let cookie = "";
  return {
    async request(path: string, init: RequestInit = {}) {
      init = withTestRegistrationAcceptance(path, init);
      const headers = new Headers(init.headers);
      if (cookie) headers.set("cookie", cookie);
      const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";", 1)[0] ?? "";
      return response;
    },
  };
}

function jsonInit(
  value: Record<string, unknown>,
  method = "POST",
): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  };
}

async function jsonBody<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.ENCRYPTION_MASTER_KEY;
});

describe("Slate Mirror API", () => {
  it("synthesizes from eligible prose, pins exact versions, and requires explicit repins", async () => {
    const owner = createClient();
    assert.equal(
      (
        await owner.request(
          "/api/auth/register",
          jsonInit({
            username: "mirror-api@example.test",
            password: "mirror-api-password",
          }),
        )
      ).status,
      201,
    );
    const projectResponse = await owner.request(
      "/api/slate/projects",
      jsonInit({
        title: "The Salt Bell",
        spark: "A drought reveals a bell beneath the reservoir.",
      }),
    );
    assert.equal(projectResponse.status, 201);
    const project = await jsonBody<{ project: { id: string } }>(projectResponse);
    assert.equal(
      (
        await owner.request(
          `/api/slate/projects/${project.project.id}`,
          jsonInit(
            {
              proseMode: "offline",
              proseProvider: "local",
              proseModel: "mirror-test-local",
            },
            "PATCH",
          ),
        )
      ).status,
      200,
    );

    const profileResponse = await owner.request(
      "/api/slate/mirror/profiles",
      jsonInit({ name: "Reservoir voice", penName: "M. Vale" }),
    );
    assert.equal(profileResponse.status, 201);
    const profile = await jsonBody<{
      profile: { id: string; currentVersionId: null };
    }>(profileResponse);
    assert.equal(profile.profile.currentVersionId, null);

    const eligibleText = "The rope remembered the lake better than Mara did.";
    const forbiddenText = "A research note that must never reach synthesis.";
    const firstVersionResponse = await owner.request(
      `/api/slate/mirror/profiles/${profile.profile.id}/versions`,
      jsonInit({
        projectId: project.project.id,
        samples: [
          {
            sourceKind: "writer_owned_sample",
            text: eligibleText,
            explicitlyIncluded: true,
            writerOwnsRights: true,
          },
          {
            sourceKind: "research",
            text: forbiddenText,
            explicitlyIncluded: true,
            writerOwnsRights: true,
          },
        ],
      }),
    );
    assert.equal(
      firstVersionResponse.status,
      201,
      await firstVersionResponse.clone().text(),
    );
    const first = await jsonBody<{
      version: {
        id: string;
        version: number;
        sampleIds: string[];
        voiceCard: Record<string, unknown>;
      };
      samples: Array<{ eligibilityReason: string }>;
    }>(firstVersionResponse);
    assert.equal(first.version.version, 1);
    assert.equal(first.version.sampleIds.length, 1);
    assert.deepEqual(
      first.samples.map((sample) => sample.eligibilityReason),
      ["eligible", "forbidden_source_kind"],
    );
    assert.equal(Object.hasOwn(first.version.voiceCard, "wordTarget"), false);
    assert.equal(providerSelections[0], "local");
    const synthesisPrompt = provider.calls[0]!
      .map((message) => message.content)
      .join("\n");
    assert.match(synthesisPrompt, new RegExp(eligibleText.replace(".", "\\.")));
    assert.doesNotMatch(synthesisPrompt, new RegExp(forbiddenText));
    assert.match(synthesisPrompt, /Do not prescribe word count/);

    const pinnedResponse = await owner.request(
      `/api/slate/projects/${project.project.id}/mirror`,
      jsonInit(
        {
          profileVersionId: first.version.id,
          projectOverlay: {
            label: "The Salt Bell",
            direction: "Favor mechanical water images.",
          },
          povOverlays: [
            {
              label: "Mara",
              povCharacterId: "mara-vale",
              direction: "She notices pressure and weight first.",
            },
          ],
        },
        "PATCH",
      ),
    );
    assert.equal(pinnedResponse.status, 200);
    const pinned = await jsonBody<{
      binding: {
        profileVersionId: string;
        projectOverlay: { direction: string };
        povOverlays: Array<{ povCharacterId: string }>;
      };
    }>(pinnedResponse);
    assert.equal(pinned.binding.profileVersionId, first.version.id);
    assert.equal(
      pinned.binding.projectOverlay.direction,
      "Favor mechanical water images.",
    );
    assert.equal(pinned.binding.povOverlays[0]?.povCharacterId, "mara-vale");

    const secondVersionResponse = await owner.request(
      `/api/slate/mirror/profiles/${profile.profile.id}/versions`,
      jsonInit({
        projectId: project.project.id,
        samples: [
          {
            sourceKind: "dialogue_exercise",
            text: '"You heard it." Mara kept both hands on the dry rope.',
            explicitlyIncluded: true,
            writerOwnsRights: true,
          },
        ],
      }),
    );
    assert.equal(secondVersionResponse.status, 201);
    const second = await jsonBody<{
      version: { id: string; version: number; parentVersionId: string };
    }>(secondVersionResponse);
    assert.equal(second.version.version, 2);
    assert.equal(second.version.parentVersionId, first.version.id);

    const stillPinned = await jsonBody<{
      binding: { profileVersionId: string };
    }>(
      await owner.request(`/api/slate/projects/${project.project.id}/mirror`),
    );
    assert.equal(stillPinned.binding.profileVersionId, first.version.id);
    const implicitRepin = await owner.request(
      `/api/slate/projects/${project.project.id}/mirror`,
      jsonInit(
        { profileVersionId: second.version.id },
        "PATCH",
      ),
    );
    assert.equal(implicitRepin.status, 409);
    assert.equal(
      (
        await jsonBody<{ code: string }>(implicitRepin)
      ).code,
      "slate_mirror_repin_confirmation_required",
    );
    const explicitRepin = await owner.request(
      `/api/slate/projects/${project.project.id}/mirror`,
      jsonInit(
        {
          profileVersionId: second.version.id,
          repin: true,
          expectedCurrentVersionId: first.version.id,
        },
        "PATCH",
      ),
    );
    assert.equal(explicitRepin.status, 200);

    const frozen = await owner.request(
      `/api/slate/mirror/profiles/${profile.profile.id}`,
      jsonInit({ frozen: true }, "PATCH"),
    );
    assert.equal(frozen.status, 200);
    assert.equal(
      (
        await jsonBody<{ profile: { frozen: boolean } }>(frozen)
      ).profile.frozen,
      true,
    );
  });

  it("does not expose profiles or project bindings across tenants", async () => {
    const owner = createClient();
    const other = createClient();
    await owner.request(
      "/api/auth/register",
      jsonInit({
        username: "mirror-owner-2@example.test",
        password: "mirror-owner-password",
      }),
    );
    await other.request(
      "/api/auth/register",
      jsonInit({
        username: "mirror-other@example.test",
        password: "mirror-other-password",
      }),
    );
    const created = await jsonBody<{ profile: { id: string } }>(
      await owner.request(
        "/api/slate/mirror/profiles",
        jsonInit({ name: "Private pen voice" }),
      ),
    );
    assert.equal(
      (
        await other.request(
          `/api/slate/mirror/profiles/${created.profile.id}`,
        )
      ).status,
      404,
    );
    const profiles = await jsonBody<{ profiles: unknown[] }>(
      await other.request("/api/slate/mirror/profiles"),
    );
    assert.deepEqual(profiles.profiles, []);
  });
});

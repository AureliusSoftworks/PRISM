import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type AddressInfo } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { getAppConfig } from "@localai/config";
import { currentContinuityProducerVersions } from "@localai/shared";
import {
  createDeterministicProvider,
  createFetchRecorder,
  createTestDatabase,
} from "../test-support.ts";
import { writeSlateRecoveryGeneration } from "../slate-author-safety.ts";

process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.ENCRYPTION_MASTER_KEY = "slate-api-test-master-key";

const { createPrismRequestHandler } = await import("../server.ts");
const db = createTestDatabase();
const provider = createDeterministicProvider(["unused"]);
const server = createServer(
  createPrismRequestHandler({
    db,
    config: {
      ...getAppConfig(),
      apiPort: 0,
      sessionCookieName: "prism_slate_test_session",
      lanAccessEnabled: false,
      discoveryEnabled: false,
      openAiApiKey: "",
      anthropicApiKey: "",
      elevenLabsApiKey: "",
    },
    fetchImpl: createFetchRecorder(),
    providerFactory: () => provider,
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
      const headers = new Headers(init.headers);
      if (cookie) headers.set("cookie", cookie);
      const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";", 1)[0] ?? "";
      return response;
    },
  };
}

function jsonInit(body: Record<string, unknown>, method = "POST"): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.ENCRYPTION_MASTER_KEY;
});

describe("Slate API", () => {
  it("creates, saves, reopens, and isolates a Slate project by authenticated tenant", async () => {
    const owner = createClient();
    const registered = await owner.request(
      "/api/auth/register",
      jsonInit({ username: "slate-owner@example.com", password: "slate-owner-password" }),
    );
    assert.equal(registered.status, 201);

    const createdResponse = await owner.request(
      "/api/slate/projects",
      jsonInit({ title: "The Glass City", spark: "A city calls its architect home." }),
    );
    assert.equal(createdResponse.status, 201);
    const created = (await body(createdResponse)).project as { id: string };

    const savedResponse = await owner.request(
      `/api/slate/projects/${created.id}`,
      jsonInit(
        {
          premise: "An architect returns to the city that learned her name.",
          manuscript: "The city called at midnight.",
          structure: [
            {
              id: "scene-1",
              kind: "scene",
              title: "The Call",
              summary: "The city reaches Mara through an abandoned switchboard.",
              direction: "Keep it intimate.",
              status: "planned",
              locked: true,
            },
          ],
        },
        "PATCH",
      ),
    );
    assert.equal(savedResponse.status, 200);

    const reopenedResponse = await owner.request(`/api/slate/projects/${created.id}`);
    assert.equal(reopenedResponse.status, 200);
    const reopened = (await body(reopenedResponse)).project as {
      manuscript: string;
      structure: Array<{ locked: boolean }>;
    };
    assert.equal(reopened.manuscript, "The city called at midnight.");
    assert.equal(reopened.structure[0]?.locked, true);

    const lockedShape = await owner.request(
      `/api/slate/projects/${created.id}/shape`,
      jsonInit({}),
    );
    assert.equal(lockedShape.status, 409);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(await body(lockedShape)).filter(([key]) =>
          ["ok", "code", "reason", "projectId"].includes(key),
        ),
      ),
      {
        ok: false,
        code: "slate_shape_write_conflict",
        reason: "locked",
        projectId: created.id,
      },
    );

    const stranger = createClient();
    const strangerRegistered = await stranger.request(
      "/api/auth/register",
      jsonInit({ username: "slate-stranger@example.com", password: "slate-stranger-password" }),
    );
    assert.equal(strangerRegistered.status, 201);
    const strangerList = await stranger.request("/api/slate/projects");
    assert.equal(strangerList.status, 200);
    assert.deepEqual((await body(strangerList)).projects, []);
    const strangerRead = await stranger.request(`/api/slate/projects/${created.id}`);
    assert.notEqual(strangerRead.status, 200);
  });

  it("purges tenant recovery generations on project deletion and factory reset", async () => {
    const directory = mkdtempSync(join(tmpdir(), "prism-slate-lifecycle-"));
    const localRoot = join(directory, "local");
    const mirrorRoot = join(directory, "mirror");
    const previousLocalRoot = process.env.SLATE_RECOVERY_DIR;
    const previousMirrorRoot = process.env.SLATE_RECOVERY_MIRROR_DIR;
    process.env.SLATE_RECOVERY_DIR = localRoot;
    process.env.SLATE_RECOVERY_MIRROR_DIR = mirrorRoot;

    try {
      const owner = createClient();
      const stranger = createClient();
      assert.equal(
        (
          await owner.request(
            "/api/auth/register",
            jsonInit({
              username: "slate-lifecycle-owner@example.com",
              password: "slate-lifecycle-owner-password",
            }),
          )
        ).status,
        201,
      );
      assert.equal(
        (
          await stranger.request(
            "/api/auth/register",
            jsonInit({
              username: "slate-lifecycle-stranger@example.com",
              password: "slate-lifecycle-stranger-password",
            }),
          )
        ).status,
        201,
      );

      const deletedProject = (
        await body(
          await owner.request(
            "/api/slate/projects",
            jsonInit({ title: "Delete Me", spark: "A draft reaches its ending." }),
          ),
        )
      ).project as { id: string };
      const resetProject = (
        await body(
          await owner.request(
            "/api/slate/projects",
            jsonInit({ title: "Reset Me", spark: "A second draft waits." }),
          ),
        )
      ).project as { id: string };
      const preservedProject = (
        await body(
          await stranger.request(
            "/api/slate/projects",
            jsonInit({ title: "Keep Me", spark: "Another writer keeps working." }),
          ),
        )
      ).project as { id: string };

      const ownerId = (
        db.prepare("SELECT id FROM users WHERE email = ?").get(
          "slate-lifecycle-owner@example.com",
        ) as { id: string }
      ).id;
      const strangerId = (
        db.prepare("SELECT id FROM users WHERE email = ?").get(
          "slate-lifecycle-stranger@example.com",
        ) as { id: string }
      ).id;
      for (const [userId, projectId] of [
        [ownerId, deletedProject.id],
        [ownerId, resetProject.id],
        [strangerId, preservedProject.id],
      ] as const) {
        writeSlateRecoveryGeneration(db, userId, projectId, localRoot, {
          mirrorDirectory: mirrorRoot,
        });
      }

      assert.notEqual(
        (
          await stranger.request(`/api/slate/projects/${deletedProject.id}`, {
            method: "DELETE",
          })
        ).status,
        200,
      );
      assert.equal(existsSync(join(localRoot, deletedProject.id)), true);
      assert.equal(existsSync(join(mirrorRoot, deletedProject.id)), true);
      assert.equal(
        (await owner.request(`/api/slate/projects/${deletedProject.id}`, { method: "DELETE" }))
          .status,
        200,
      );
      assert.equal(existsSync(join(localRoot, deletedProject.id)), false);
      assert.equal(existsSync(join(mirrorRoot, deletedProject.id)), false);
      assert.equal(existsSync(join(localRoot, resetProject.id)), true);
      assert.equal(existsSync(join(mirrorRoot, resetProject.id)), true);
      assert.equal(existsSync(join(localRoot, preservedProject.id)), true);
      assert.equal(existsSync(join(mirrorRoot, preservedProject.id)), true);

      assert.equal((await owner.request("/api/account/factory-reset", { method: "POST" })).status, 200);
      assert.equal(existsSync(join(localRoot, resetProject.id)), false);
      assert.equal(existsSync(join(mirrorRoot, resetProject.id)), false);
      assert.equal(existsSync(join(localRoot, preservedProject.id)), true);
      assert.equal(existsSync(join(mirrorRoot, preservedProject.id)), true);
      assert.equal(
        (await stranger.request(`/api/slate/projects/${preservedProject.id}`)).status,
        200,
      );
      assert.equal((await stranger.request("/api/account", { method: "DELETE" })).status, 200);
      assert.equal(existsSync(join(localRoot, preservedProject.id)), false);
      assert.equal(existsSync(join(mirrorRoot, preservedProject.id)), false);
    } finally {
      if (previousLocalRoot === undefined) delete process.env.SLATE_RECOVERY_DIR;
      else process.env.SLATE_RECOVERY_DIR = previousLocalRoot;
      if (previousMirrorRoot === undefined) delete process.env.SLATE_RECOVERY_MIRROR_DIR;
      else process.env.SLATE_RECOVERY_MIRROR_DIR = previousMirrorRoot;
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("resolves a LOCAL built-in wildcard and reopens its project provenance", async () => {
    const owner = createClient();
    const registered = await owner.request(
      "/api/auth/register",
      jsonInit({ username: "slate-wildcards@example.com", password: "slate-wildcards-password" }),
    );
    assert.equal(registered.status, 201);

    const providerCallsBefore = provider.calls.length;
    const resolutionResponse = await owner.request(
      "/api/slate/wildcards/resolve",
      jsonInit({ template: "A cartographer finds a door beneath {PLACE}." }),
    );
    assert.equal(resolutionResponse.status, 200);
    const resolution = await body(resolutionResponse) as {
      spark: string;
      sparkWildcards: Record<string, unknown>;
    };
    assert.doesNotMatch(resolution.spark, /\{PLACE\}/u);
    assert.equal(provider.calls.length, providerCallsBefore);

    const createdResponse = await owner.request(
      "/api/slate/projects",
      jsonInit({
        title: "The Buried Door",
        spark: resolution.spark,
        sparkWildcards: resolution.sparkWildcards,
      }),
    );
    assert.equal(createdResponse.status, 201);
    const created = (await body(createdResponse)).project as {
      id: string;
      sparkWildcards: { template?: string } | null;
    };
    assert.equal(
      created.sparkWildcards?.template,
      "A cartographer finds a door beneath {PLACE}.",
    );

    const reopenedResponse = await owner.request(`/api/slate/projects/${created.id}`);
    const reopened = (await body(reopenedResponse)).project as {
      spark: string;
      sparkWildcards: { resolvedPrompt?: string } | null;
    };
    assert.equal(reopened.sparkWildcards?.resolvedPrompt, reopened.spark);
  });

  it("autosaves focused sections with idempotent CAS conflicts and tenant isolation", async () => {
    const owner = createClient();
    assert.equal(
      (
        await owner.request(
          "/api/auth/register",
          jsonInit({
            username: "slate-sections@example.com",
            password: "slate-sections-password",
          }),
        )
      ).status,
      201,
    );
    const createdResponse = await owner.request(
      "/api/slate/projects",
      jsonInit({ title: "Sectioned Book", spark: "A promise survives its witness." }),
    );
    const project = (await body(createdResponse)).project as { id: string };
    await owner.request(
      `/api/slate/projects/${project.id}`,
      jsonInit(
        {
          structure: [
            {
              id: "scene-cas",
              kind: "scene",
              title: "The Promise",
              summary: "A witness remembers.",
              direction: "Keep the memory exact.",
              status: "planned",
              locked: false,
            },
          ],
        },
        "PATCH",
      ),
    );
    const sectionsResponse = await owner.request(
      `/api/slate/projects/${project.id}/sections`,
    );
    assert.equal(sectionsResponse.status, 200);
    const section = ((await body(sectionsResponse)).sections as Array<{
      id: string;
      revision: number;
    }>)[0]!;
    const savePayload = {
      expectedRevision: section.revision,
      mutationId: "browser-save-1",
      prose: "The witness repeated the promise word for word.",
      lockedRanges: [],
    };
    const saved = await owner.request(
      `/api/slate/projects/${project.id}/sections/${section.id}`,
      jsonInit(savePayload, "PATCH"),
    );
    assert.equal(saved.status, 200);
    const retried = await owner.request(
      `/api/slate/projects/${project.id}/sections/${section.id}`,
      jsonInit(savePayload, "PATCH"),
    );
    assert.equal(retried.status, 200);
    assert.equal(
      ((await body(retried)).section as { revision: number }).revision,
      1,
    );

    const stale = await owner.request(
      `/api/slate/projects/${project.id}/sections/${section.id}`,
      jsonInit(
        {
          expectedRevision: 0,
          mutationId: "browser-stale-save",
          prose: "A stale tab must not win.",
        },
        "PATCH",
      ),
    );
    assert.equal(stale.status, 409);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(await body(stale)).filter(([key]) =>
          ["ok", "code", "currentRevision"].includes(key),
        ),
      ),
      {
        ok: false,
        code: "slate_section_revision_conflict",
        currentRevision: 1,
      },
    );

    const stranger = createClient();
    await stranger.request(
      "/api/auth/register",
      jsonInit({
        username: "slate-sections-stranger@example.com",
        password: "slate-sections-stranger-password",
      }),
    );
    assert.notEqual(
      (
        await stranger.request(
          `/api/slate/projects/${project.id}/sections/${section.id}`,
        )
      ).status,
      200,
    );
  });

  it("returns a recoverable conflict instead of drafting over writer prose", async () => {
    const owner = createClient();
    assert.equal(
      (
        await owner.request(
          "/api/auth/register",
          jsonInit({
            username: "slate-draft-authority@example.com",
            password: "slate-draft-authority-password",
          }),
        )
      ).status,
      201,
    );
    const createdResponse = await owner.request(
      "/api/slate/projects",
      jsonInit({ title: "Writer Authority", spark: "A letter changes its reader." }),
    );
    const project = (await body(createdResponse)).project as { id: string };
    await owner.request(
      `/api/slate/projects/${project.id}`,
      jsonInit(
        {
          structure: [
            {
              id: "scene-authority",
              kind: "scene",
              title: "The Letter",
              summary: "The reader breaks the seal.",
              direction: "Stay close to the reader.",
              status: "planned",
              locked: false,
            },
          ],
        },
        "PATCH",
      ),
    );
    const sectionResponse = await owner.request(
      `/api/slate/projects/${project.id}/sections`,
    );
    const section = ((await body(sectionResponse)).sections as Array<{
      id: string;
      revision: number;
    }>)[0]!;
    await owner.request(
      `/api/slate/projects/${project.id}/sections/${section.id}`,
      jsonInit(
        {
          expectedRevision: section.revision,
          mutationId: "writer-authority-before-draft",
          prose: "The writer had already chosen how the seal broke.",
        },
        "PATCH",
      ),
    );
    const callsBefore = provider.calls.length;

    const drafted = await owner.request(
      `/api/slate/projects/${project.id}/draft`,
      jsonInit({ structureItemId: "scene-authority", direction: "Draft it." }),
    );
    assert.equal(drafted.status, 409);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(await body(drafted)).filter(([key]) =>
          ["ok", "code", "reason", "sectionId"].includes(key),
        ),
      ),
      {
        ok: false,
        code: "slate_section_ai_write_conflict",
        reason: "contains_prose",
        sectionId: section.id,
      },
    );
    assert.equal(provider.calls.length, callsBefore);

    const reopened = await owner.request(
      `/api/slate/projects/${project.id}/sections/${section.id}`,
    );
    assert.equal(
      ((await body(reopened)).section as { prose: string }).prose,
      "The writer had already chosen how the seal broke.",
    );
  });

  it("downloads a clean manuscript export and keeps tenant-scoped checksum history", async () => {
    const owner = createClient();
    await owner.request(
      "/api/auth/register",
      jsonInit({
        username: "slate-export@example.com",
        password: "slate-export-password",
      }),
    );
    const created = await owner.request(
      "/api/slate/projects",
      jsonInit({ title: "Sævar's Lantern", spark: "A lantern remembers." }),
    );
    const project = (await body(created)).project as { id: string };
    await owner.request(
      `/api/slate/projects/${project.id}`,
      jsonInit(
        {
          structure: [
            {
              id: "scene-export",
              kind: "scene",
              title: "The Flame",
              summary: "The lantern wakes.",
              direction: "Private direction must not be exported.",
              status: "planned",
              locked: false,
            },
          ],
        },
        "PATCH",
      ),
    );
    const sectionResponse = await owner.request(
      `/api/slate/projects/${project.id}/sections`,
    );
    const section = ((await body(sectionResponse)).sections as Array<{
      id: string;
      revision: number;
    }>)[0]!;
    await owner.request(
      `/api/slate/projects/${project.id}/sections/${section.id}`,
      jsonInit(
        {
          expectedRevision: section.revision,
          mutationId: "export-prose",
          prose: "Ljós crossed the winter harbor.",
        },
        "PATCH",
      ),
    );

    const exported = await owner.request(
      `/api/slate/projects/${project.id}/exports`,
      jsonInit({ format: "markdown", scope: { kind: "book" } }),
    );
    assert.equal(exported.status, 200);
    assert.equal(exported.headers.get("content-type"), "text/markdown; charset=utf-8");
    assert.match(exported.headers.get("content-disposition") ?? "", /\.md"$/u);
    assert.match(exported.headers.get("x-prism-export-sha256") ?? "", /^[a-f0-9]{64}$/u);
    const manuscript = await exported.text();
    assert.match(manuscript, /Sævar's Lantern/u);
    assert.match(manuscript, /Ljós crossed the winter harbor/u);
    assert.doesNotMatch(manuscript, /Private direction/u);

    const historyResponse = await owner.request(
      `/api/slate/projects/${project.id}/exports`,
    );
    assert.equal(historyResponse.status, 200);
    const history = (await body(historyResponse)).exports as Array<{
      manifest: { payloadSha256: string };
    }>;
    assert.equal(history.length, 1);
    assert.equal(
      history[0]?.manifest.payloadSha256,
      exported.headers.get("x-prism-export-sha256"),
    );

    const stranger = createClient();
    await stranger.request(
      "/api/auth/register",
      jsonInit({
        username: "slate-export-stranger@example.com",
        password: "slate-export-stranger-password",
      }),
    );
    assert.equal(
      (
        await stranger.request(
          `/api/slate/projects/${project.id}/exports`,
          jsonInit({ format: "text", scope: { kind: "book" } }),
        )
      ).status,
      404,
    );
  });

  it("opens a grounded return session and resolves exactly one tenant-scoped concern without LOCAL egress", async () => {
    const owner = createClient();
    await owner.request(
      "/api/auth/register",
      jsonInit({
        username: "slate-continuity@example.com",
        password: "slate-continuity-password",
      }),
    );
    const createdResponse = await owner.request(
      "/api/slate/projects",
      jsonInit({ title: "The North Gate", spark: "A city turns around at dusk." }),
    );
    const project = (await body(createdResponse)).project as { id: string };
    await owner.request(
      `/api/slate/projects/${project.id}`,
      jsonInit(
        {
          structure: [
            {
              id: "north-gate-scene",
              kind: "scene",
              title: "The North Gate",
              summary: "Mara reaches the disputed gate.",
              direction: "Keep geography exact.",
              status: "planned",
              locked: false,
            },
          ],
        },
        "PATCH",
      ),
    );
    const sectionList = await owner.request(`/api/slate/projects/${project.id}/sections`);
    const section = ((await body(sectionList)).sections as Array<{
      id: string;
      revision: number;
    }>)[0]!;
    const prose = "Mara entered through the northern gate.";
    const savedResponse = await owner.request(
      `/api/slate/projects/${project.id}/sections/${section.id}`,
      jsonInit(
        {
          expectedRevision: section.revision,
          mutationId: "continuity-http-save",
          prose,
        },
        "PATCH",
      ),
    );
    const saved = (await body(savedResponse)).section as { revision: number };
    const user = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get("slate-continuity@example.com") as { id: string };
    const projectRow = db
      .prepare("SELECT series_id FROM slate_projects WHERE id = ? AND user_id = ?")
      .get(project.id, user.id) as { series_id: string };
    const source = db
      .prepare(
        `SELECT id FROM slate_continuity_sources
          WHERE project_id = ? AND section_id = ? AND user_id = ?
          ORDER BY source_revision DESC LIMIT 1`,
      )
      .get(project.id, section.id, user.id) as { id: string };
    const quoteHash = createHash("sha256").update(prose, "utf8").digest("hex");
    db.prepare(
      `INSERT INTO slate_continuity_concerns
        (id, user_id, series_id, project_id, section_id, scope_kind, kind,
         severity, status, summary, explanation, claim_ids_json, anchors_json,
         recommended_resolution, producer_versions_json, created_at)
       VALUES ('http-canon-concern', ?, ?, ?, ?, 'section',
               'factual_contradiction', 'important', 'open', ?, ?, '[]', ?,
               'update_canon', ?, ?)`,
    ).run(
      user.id,
      projectRow.series_id,
      project.id,
      section.id,
      "The gate direction conflicts with canon.",
      "Continuity found two settled directions and will not choose for the writer.",
      JSON.stringify([
        {
          sourceId: source.id,
          sectionId: section.id,
          sectionRevision: saved.revision,
          start: 0,
          end: prose.length,
          quoteHash,
        },
      ]),
      JSON.stringify(currentContinuityProducerVersions()),
      "2026-07-16T22:00:00.000Z",
    );

    const providerCallsBefore = provider.calls.length;
    const returnResponse = await owner.request(
      `/api/slate/projects/${project.id}/return-sessions`,
      jsonInit({}),
    );
    assert.equal(returnResponse.status, 201);
    const returnSession = (await body(returnResponse)).session as {
      id: string;
      synopsis: { nextCard: { kind: string }; title: string };
    };
    assert.equal(returnSession.synopsis.title, "The North Gate");
    assert.equal(returnSession.synopsis.nextCard.kind, "canon_risk");
    const sameVisit = await owner.request(
      `/api/slate/projects/${project.id}/return-sessions`,
      jsonInit({}),
    );
    assert.equal(((await body(sameVisit)).session as { id: string }).id, returnSession.id);

    const nextResponse = await owner.request(
      `/api/slate/projects/${project.id}/continuity/concerns/next`,
    );
    assert.equal(nextResponse.status, 200);
    const next = (await body(nextResponse)).concern as {
      id: string;
      passages: Array<{ quote: string }>;
    };
    assert.equal(next.id, "http-canon-concern");
    assert.equal(next.passages[0]?.quote, prose);
    const resolvedResponse = await owner.request(
      `/api/slate/projects/${project.id}/continuity/concerns/${next.id}/resolve`,
      jsonInit({ direction: "Actually, the northern gate is canon; preserve that geography." }),
    );
    assert.equal(resolvedResponse.status, 200);
    const resolved = await body(resolvedResponse) as {
      appliedResolution: string;
      revisionId: string | null;
      nextConcern: unknown;
    };
    assert.equal(resolved.appliedResolution, "update_canon");
    assert.equal(resolved.revisionId, null);
    assert.equal(resolved.nextConcern, null);
    assert.equal(provider.calls.length, providerCallsBefore);
    assert.equal(
      (
        db
          .prepare("SELECT status FROM slate_continuity_concerns WHERE id = ?")
          .get("http-canon-concern") as { status: string }
      ).status,
      "resolved",
    );

    const stranger = createClient();
    await stranger.request(
      "/api/auth/register",
      jsonInit({
        username: "slate-continuity-stranger@example.com",
        password: "slate-continuity-stranger-password",
      }),
    );
    assert.equal(
      (
        await stranger.request(
          `/api/slate/projects/${project.id}/continuity/concerns/next`,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await stranger.request(
          `/api/slate/projects/${project.id}/return-sessions`,
          jsonInit({}),
        )
      ).status,
      404,
    );
  });

  it("downloads, previews, and restores a .slate archive as a tenant-owned copy", async () => {
    const owner = createClient();
    await owner.request(
      "/api/auth/register",
      jsonInit({
        username: "slate-archive@example.com",
        password: "slate-archive-password",
      }),
    );
    const createdResponse = await owner.request(
      "/api/slate/projects",
      jsonInit({ title: "The Safe Chronicle", spark: "A city keeps its promises in stone." }),
    );
    const project = (await body(createdResponse)).project as { id: string };
    await owner.request(
      `/api/slate/projects/${project.id}`,
      jsonInit(
        {
          structure: [
            {
              id: "archive-scene",
              kind: "scene",
              title: "The Promise Wall",
              summary: "The city reveals its oldest promise.",
              direction: "Keep the inscription exact.",
              status: "planned",
              locked: false,
            },
          ],
        },
        "PATCH",
      ),
    );
    const sectionList = await owner.request(`/api/slate/projects/${project.id}/sections`);
    const section = ((await body(sectionList)).sections as Array<{
      id: string;
      revision: number;
    }>)[0]!;
    await owner.request(
      `/api/slate/projects/${project.id}/sections/${section.id}`,
      jsonInit(
        {
          expectedRevision: section.revision,
          mutationId: "archive-http-save",
          prose: "Every promise had a name carved beneath it.",
        },
        "PATCH",
      ),
    );
    const providerCallsBefore = provider.calls.length;

    const downloaded = await owner.request(`/api/slate/projects/${project.id}/archive`);
    assert.equal(downloaded.status, 200);
    assert.equal(
      downloaded.headers.get("content-type"),
      "application/vnd.prism.slate+zip",
    );
    assert.match(downloaded.headers.get("content-disposition") ?? "", /\.slate"$/u);
    assert.equal(downloaded.headers.get("x-prism-slate-version"), "1");
    const archive = new Uint8Array(await downloaded.arrayBuffer());
    assert.equal(Buffer.from(archive.subarray(0, 4)).toString("hex"), "504b0304");
    const projectsBeforePreview = db.prepare("SELECT COUNT(*) AS count FROM slate_projects")
      .get() as { count: number };

    const previewed = await owner.request("/api/slate/archives/preview", {
      method: "POST",
      headers: { "content-type": "application/vnd.prism.slate+zip" },
      body: archive,
    });
    assert.equal(previewed.status, 200);
    const preview = (await body(previewed)).preview as {
      title: string;
      willCreateCopy: boolean;
      sourceProjectExistsForCurrentUser: boolean;
      counts: { sections: number };
    };
    assert.equal(preview.title, "The Safe Chronicle");
    assert.equal(preview.willCreateCopy, true);
    assert.equal(preview.sourceProjectExistsForCurrentUser, true);
    assert.equal(preview.counts.sections, 1);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM slate_projects").get() as { count: number }).count,
      projectsBeforePreview.count,
    );

    const stranger = createClient();
    await stranger.request(
      "/api/auth/register",
      jsonInit({
        username: "slate-archive-stranger@example.com",
        password: "slate-archive-stranger-password",
      }),
    );
    assert.equal(
      (await stranger.request(`/api/slate/projects/${project.id}/archive`)).status,
      404,
    );
    const importedResponse = await stranger.request("/api/slate/archives/import", {
      method: "POST",
      headers: { "content-type": "application/vnd.prism.slate+zip" },
      body: archive,
    });
    assert.equal(importedResponse.status, 201);
    const imported = (await body(importedResponse)).import as {
      projectId: string;
      title: string;
    };
    assert.notEqual(imported.projectId, project.id);
    assert.equal(imported.title, "The Safe Chronicle (Recovered copy)");
    const reopened = await stranger.request(`/api/slate/projects/${imported.projectId}`);
    assert.equal(reopened.status, 200);
    assert.equal(
      ((await body(reopened)).project as { manuscript: string }).manuscript,
      "The Promise Wall\n\nEvery promise had a name carved beneath it.",
    );
    const secondImport = await stranger.request("/api/slate/archives/import", {
      method: "POST",
      headers: { "content-type": "application/vnd.prism.slate+zip" },
      body: archive,
    });
    assert.equal(secondImport.status, 201);
    assert.notEqual(
      ((await body(secondImport)).import as { projectId: string }).projectId,
      imported.projectId,
    );
    assert.equal(provider.calls.length, providerCallsBefore);

    const tampered = Uint8Array.from(archive);
    tampered[60] ^= 0x01;
    const rejected = await stranger.request("/api/slate/archives/import", {
      method: "POST",
      headers: { "content-type": "application/vnd.prism.slate+zip" },
      body: tampered,
    });
    assert.equal(rejected.status, 400);
  });
});

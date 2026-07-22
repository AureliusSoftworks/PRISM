import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { getAppConfig } from "@localai/config";
import {
  COFFEE_TOPIC_MAX_LENGTH,
  MODEL_VISIBILITY_DEFAULTS_VERSION,
  botPowerSourceHashV1,
  normalizeBotAudioVoiceProfileV1,
} from "@localai/shared";
import {
  createDeterministicProvider,
  createFetchRecorder,
  createTestDatabase,
  withTestRegistrationAcceptance,
} from "../test-support.ts";

const tempDir = mkdtempSync(join(tmpdir(), "prism-api-integration-"));
process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.DB_PATH = join(tempDir, "module.db");
process.env.ENCRYPTION_MASTER_KEY = "integration-test-master-key";

const { createPrismRequestHandler } = await import("../server.ts");
const db = createTestDatabase();
const fetchRecorder = createFetchRecorder();
const deterministicReply = "Deterministic API reply with enough detail to stay visible.";
const deterministicProvider = createDeterministicProvider([deterministicReply]);
deterministicProvider.diagnosticModel = "deterministic-test-model";
const providerFactoryCalls: string[] = [];
const builtinVoiceTexts: string[] = [];
const builtinVoiceCalls: Array<{
  text: string;
  systemVoiceName: string | null;
  allowOperatingSystemVoices: boolean;
}> = [];
const auxiliaryProviderFactoryCalls: Array<{
  prismDefaultLlmModel: string | null | undefined;
  secondaryOllamaHost: string | null | undefined;
  experimentalDualOllama: boolean | undefined;
}> = [];
function deterministicVoiceWave(): Buffer {
  const sampleRate = 24_000;
  const sampleCount = 240;
  const dataLength = sampleCount * 2;
  const wave = Buffer.alloc(44 + dataLength);
  wave.write("RIFF", 0, "ascii");
  wave.writeUInt32LE(36 + dataLength, 4);
  wave.write("WAVE", 8, "ascii");
  wave.write("fmt ", 12, "ascii");
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36, "ascii");
  wave.writeUInt32LE(dataLength, 40);
  return wave;
}
const config = {
  ...getAppConfig(),
  apiPort: 0,
  sessionCookieName: "prism_test_session",
  lanAccessEnabled: false,
  discoveryEnabled: false,
  openAiApiKey: "",
  anthropicApiKey: "",
  elevenLabsApiKey: "",
  braveSearchApiKey: "",
};
const server = createServer(
  createPrismRequestHandler({
    db,
    config,
    fetchImpl: fetchRecorder,
    providerFactory: (provider) => {
      providerFactoryCalls.push(provider);
      return deterministicProvider;
    },
    auxiliaryProviderFactory: (prismDefaultLlmModel, options) => {
      auxiliaryProviderFactoryCalls.push({
        prismDefaultLlmModel,
        secondaryOllamaHost: options.secondaryOllamaHost,
        experimentalDualOllama: options.experimentalDualOllama,
      });
      return deterministicProvider;
    },
    builtinVoiceWaveGenerator: async ({
      profile,
      text,
      allowOperatingSystemVoices,
    }) => {
      builtinVoiceTexts.push(text);
      const normalizedProfile = normalizeBotAudioVoiceProfileV1(profile);
      builtinVoiceCalls.push({
        text,
        systemVoiceName: normalizedProfile.systemVoiceName ?? null,
        allowOperatingSystemVoices: allowOperatingSystemVoices === true,
      });
      if (normalizedProfile.systemVoiceName === "Unavailable Test") {
        throw new Error("System voice is still loading.");
      }
      return deterministicVoiceWave();
    },
  })
);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve());
});
const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${address.port}`;

interface Client {
  request(path: string, init?: RequestInit): Promise<Response>;
}

function createClient(): Client {
  let cookie = "";
  return {
    async request(path, init = {}) {
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

async function json(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

function jsonInit(body: Record<string, unknown>): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

after(() => {
  server.close();
  db.close();
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.DB_PATH;
  delete process.env.ENCRYPTION_MASTER_KEY;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("API request integration", () => {
  it("authenticates model preparation and never warms an online route", async () => {
    const anonymous = createClient();
    const denied = await anonymous.request(
      "/api/models/prepare",
      jsonInit({ provider: "openai", experience: "coffee" }),
    );
    assert.equal(denied.status, 400);

    const client = createClient();
    const registered = await client.request(
      "/api/auth/register",
      jsonInit({
        username: "model-preparation@example.com",
        password: "model-preparation-password",
      }),
    );
    assert.equal(registered.status, 201);
    const response = await client.request(
      "/api/models/prepare",
      jsonInit({
        provider: "openai",
        model: "gpt-test",
        experience: "signal",
      }),
    );
    const payload = await json(response);
    assert.equal(response.status, 200);
    assert.equal(payload.state, "not_applicable");
    assert.equal(payload.model, "gpt-test");
    assert.equal(JSON.stringify(payload).includes(config.ollamaHost), false);
  });

  it("migrates GPT-5.6 tier models out of stale default-hidden settings", async () => {
    const client = createClient();
    const registered = await client.request(
      "/api/auth/register",
      jsonInit({
        username: "model-visibility@example.com",
        password: "model-visibility-password",
      }),
    );
    assert.equal(registered.status, 201);
    const userId = String((await json(registered)).user.id);
    db.prepare(
      "UPDATE users SET hidden_bot_model_ids = ?, model_visibility_defaults_version = ? WHERE id = ?",
    ).run(
      JSON.stringify([
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna",
        "gpt-5.5-pro",
      ]),
      MODEL_VISIBILITY_DEFAULTS_VERSION - 1,
      userId,
    );
    const previousOpenAiKey = config.openAiApiKey;
    config.openAiApiKey = "sk-model-visibility-test";
    try {
      const response = await client.request("/api/models");
      assert.equal(response.status, 200);
      const payload = await json(response);
      const onlineIds = payload.catalog.online.map(
        (model: { id: string }) => model.id,
      );
      assert.ok(onlineIds.includes("gpt-5.6-sol"));
      assert.ok(onlineIds.includes("gpt-5.6-terra"));
      assert.ok(onlineIds.includes("gpt-5.6-luna"));
      assert.equal(payload.hiddenBotModelIds.includes("gpt-5.6-sol"), false);
      assert.equal(payload.hiddenBotModelIds.includes("gpt-5.6-terra"), false);
      assert.equal(payload.hiddenBotModelIds.includes("gpt-5.6-luna"), false);
      assert.equal(payload.hiddenBotModelIds.includes("gpt-5.5-pro"), true);
      const stored = db
        .prepare(
          "SELECT model_visibility_defaults_version FROM users WHERE id = ?",
        )
        .get(userId) as { model_visibility_defaults_version: number };
      assert.equal(
        stored.model_visibility_defaults_version,
        MODEL_VISIBILITY_DEFAULTS_VERSION,
      );
    } finally {
      config.openAiApiKey = previousOpenAiKey;
    }
  });

  it("preserves normal exports and produces a redacted developer transcript on request", async () => {
    const client = createClient();
    const email = "developer-export@example.com";
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: email, password: "developer-export-password" })
    );
    assert.equal(register.status, 201);
    const user = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email) as { id: string };
    const conversationId = "developer-export-conversation";
    const createdAt = "2026-07-14T19:00:00.000Z";
    db.prepare(
      `INSERT INTO conversations
         (id, user_id, title, conversation_mode, coffee_topic, created_at, updated_at)
       VALUES (?, ?, ?, 'coffee', ?, ?, ?)`
    ).run(
      conversationId,
      user.id,
      "Export fixture",
      "A useful disagreement",
      createdAt,
      createdAt
    );
    db.prepare(
      `INSERT INTO messages
         (id, conversation_id, user_id, role, content, provider, model,
          coffee_audience_bot_ids, tool_payload, created_at)
       VALUES (?, ?, ?, 'assistant', ?, 'openai', 'gpt-test', ?, ?, ?)`
    ).run(
      "developer-export-message",
      conversationId,
      user.id,
      "Visible answer",
      '["bot-2"]',
      JSON.stringify({
        webSearch: { query: "today's news" },
        coffeeAmbientAction: { action: "*sips*" },
      }),
      "2026-07-14T19:00:01.000Z"
    );
    const secret = "integration-secret-value-123";
    process.env.PRISM_TEST_EXPORT_API_KEY = secret;
    try {
      db.prepare(
        `INSERT INTO developer_transcript_events
           (id, user_id, conversation_id, message_id, request_id, request_sequence,
            event_kind, purpose, provider, model, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, 1, 'llm', 'coffee_turn', 'openai', 'gpt-test', ?, ?)`
      ).run(
        "developer-export-event",
        user.id,
        conversationId,
        "developer-export-message",
        "developer-export-request",
        JSON.stringify({
          request: {
            messages: [
              { role: "system", content: `Never reveal ${secret}` },
              { role: "user", content: "Answer" },
            ],
          },
          rawOutput: { choices: [{ message: { content: "Visible answer" } }] },
          parsedOutput: "Visible answer",
          stopReason: "stop",
          streaming: false,
          durationMs: 42,
          usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        }),
        "2026-07-14T19:00:01.000Z"
      );

      const standard = await client.request(
        `/api/conversations/${conversationId}/export`,
        jsonInit({})
      );
      assert.equal(standard.status, 200);
      const standardPayload = await json(standard);
      assert.equal(standardPayload.format, "standard");
      assert.match(standardPayload.markdown, /^# Export fixture/u);
      assert.doesNotMatch(standardPayload.markdown, /PRISM Developer Transcript/u);

      const developer = await client.request(
        `/api/conversations/${conversationId}/export`,
        jsonInit({ format: "developer" })
      );
      assert.equal(developer.status, 200);
      const developerPayload = await json(developer);
      assert.equal(developerPayload.format, "developer");
      assert.match(developerPayload.markdown, /^# PRISM Developer Transcript/u);
      assert.match(developerPayload.markdown, /Selected topic: A useful disagreement/u);
      assert.match(developerPayload.markdown, /Purpose \/ routing decision: coffee_turn/u);
      assert.match(developerPayload.markdown, /Input tokens: 5/u);
      assert.match(developerPayload.markdown, /Mention resolution \/ audience bot IDs/u);
      assert.match(developerPayload.markdown, /Ambient Events \(not LLM calls\)/u);
      assert.doesNotMatch(developerPayload.markdown, new RegExp(secret, "u"));
      assert.match(developerPayload.markdown, /\[REDACTED_ENV_VALUE\]/u);
    } finally {
      delete process.env.PRISM_TEST_EXPORT_API_KEY;
    }
  });

  it("records ranked Coffee topic selection metadata in the developer transcript", async () => {
    const client = createClient();
    const email = "coffee-topic-trace@example.com";
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: email, password: "coffee-topic-trace-password" })
    );
    assert.equal(register.status, 201);
    const user = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email) as { id: string };
    const createdAt = "2026-07-14T20:00:00.000Z";
    const botIds = ["coffee-topic-trace-bot-1", "coffee-topic-trace-bot-2"];
    const insertBot = db.prepare(
      `INSERT INTO bots
         (id, user_id, name, system_prompt, online_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`
    );
    insertBot.run(
      botIds[0],
      user.id,
      "Mediator",
      "You value trust, careful compromise, and shared duty.",
      createdAt,
      createdAt
    );
    insertBot.run(
      botIds[1],
      user.id,
      "Skeptic",
      "You test certainty through dissent and practical consequences.",
      createdAt,
      createdAt
    );
    const created = await client.request(
      "/api/coffee/sessions",
      jsonInit({ groupBotIds: botIds })
    );
    const createdPayload = await json(created);
    assert.equal(created.status, 200, JSON.stringify(createdPayload));
    const conversationId = createdPayload.conversation.id as string;
    const candidates = createdPayload.coffeeStarterTopics as string[];
    assert.equal(candidates.length, 4);

    const selected = await client.request(
      `/api/coffee/sessions/${conversationId}/topic`,
      jsonInit({
        topic: candidates[1],
        selectionSource: "suggestion",
        candidates,
      })
    );
    const selectedPayload = await json(selected);
    assert.equal(selected.status, 200, JSON.stringify(selectedPayload));

    const event = db
      .prepare(
        `SELECT event_kind, purpose, provider, payload_json
           FROM developer_transcript_events
          WHERE user_id = ? AND conversation_id = ? AND purpose = 'coffee_topic_selection'
          ORDER BY request_sequence DESC
          LIMIT 1`
      )
      .get(user.id, conversationId) as {
      event_kind: string;
      purpose: string;
      provider: string | null;
      payload_json: string;
    };
    const payload = JSON.parse(event.payload_json) as {
      request: {
        candidates: string[];
        selectionMode: string;
        source: string;
        generationMetadata: {
          strategy: string;
          sourceCoffeeGroupId: string | null;
          candidateCount: number;
          selectedCandidateIndex: number;
          selectedRank: number;
          candidateScores: Array<{
            label: string;
            scores: Record<string, number>;
          }>;
        };
      };
      parsedOutput: { selectedTopic: string };
    };
    assert.equal(event.event_kind, "tool");
    assert.equal(event.purpose, "coffee_topic_selection");
    assert.equal(event.provider, "system");
    assert.deepEqual(payload.request.candidates, candidates);
    assert.equal(payload.request.selectionMode, "suggestion");
    assert.equal(payload.request.source, "coffee_topic_picker");
    assert.equal(
      payload.request.generationMetadata.strategy,
      "ranked_participant_topic_pool_v1"
    );
    assert.equal(payload.request.generationMetadata.sourceCoffeeGroupId, null);
    assert.equal(payload.request.generationMetadata.candidateCount, 4);
    assert.equal(payload.request.generationMetadata.selectedCandidateIndex, 1);
    assert.equal(payload.request.generationMetadata.selectedRank, 2);
    assert.deepEqual(
      payload.request.generationMetadata.candidateScores.map((candidate) => candidate.label),
      candidates
    );
    assert.ok(
      payload.request.generationMetadata.candidateScores.every(
        (candidate) =>
          Object.keys(candidate.scores).sort().join(",") ===
          "balance,depth,fit,novelty,relevance"
      )
    );
    assert.equal(payload.parsedOutput.selectedTopic, candidates[1]);

    const generationEvent = db
      .prepare(
        `SELECT event_kind, purpose, provider, model, payload_json
           FROM developer_transcript_events
          WHERE user_id = ? AND conversation_id = ? AND purpose = 'coffee_topic_candidate_ranking'
          ORDER BY request_sequence ASC
          LIMIT 1`
      )
      .get(user.id, conversationId) as {
      event_kind: string;
      purpose: string;
      provider: string | null;
      model: string | null;
      payload_json: string;
    };
    const generationPayload = JSON.parse(generationEvent.payload_json) as {
      request: {
        participantBotIds: string[];
        requestedCandidateCount: number;
        rankingDimensions: string[];
      };
      rawOutput: string;
      parsedOutput: {
        rankedTopics: string[];
        usedFallback: boolean;
      };
    };
    assert.equal(generationEvent.event_kind, "tool");
    assert.equal(generationEvent.provider, "local");
    assert.equal(generationEvent.model, "deterministic-test-model");
    assert.deepEqual(generationPayload.request.participantBotIds, botIds);
    assert.equal(generationPayload.request.requestedCandidateCount, 8);
    assert.deepEqual(generationPayload.request.rankingDimensions, [
      "relevance",
      "depth",
      "novelty",
      "balance",
      "fit",
    ]);
    assert.equal(
      generationPayload.rawOutput,
      deterministicReply,
      JSON.stringify(generationPayload)
    );
    assert.deepEqual(generationPayload.parsedOutput.rankedTopics, candidates);
    assert.equal(generationPayload.parsedOutput.usedFallback, true);
    fetchRecorder.calls.length = 0;
  });

  it("forwards bounded initial topics through direct and saved-group Coffee routes", async () => {
    const client = createClient();
    const email = "coffee-initial-topic@example.com";
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: email, password: "coffee-initial-topic-password" })
    );
    assert.equal(register.status, 201);
    const user = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email) as { id: string };
    const createdAt = "2026-07-14T20:30:00.000Z";
    const botIds = ["coffee-initial-topic-bot-1", "coffee-initial-topic-bot-2"];
    const insertBot = db.prepare(
      `INSERT INTO bots
         (id, user_id, name, system_prompt, online_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`
    );
    insertBot.run(
      botIds[0],
      user.id,
      "Listener",
      "You listen closely and answer the question at hand.",
      createdAt,
      createdAt
    );
    insertBot.run(
      botIds[1],
      user.id,
      "Builder",
      "You turn a prompt into a practical next step.",
      createdAt,
      createdAt
    );
    const exactTopic = `Listen up: ${"x".repeat(COFFEE_TOPIC_MAX_LENGTH - 11)}`;

    const direct = await client.request(
      "/api/coffee/sessions",
      jsonInit({ groupBotIds: botIds, initialTopic: `  ${exactTopic}  ` })
    );
    const directPayload = await json(direct);
    assert.equal(direct.status, 200, JSON.stringify(directPayload));
    assert.equal(directPayload.conversation.coffeeTopic, exactTopic);
    assert.equal("coffeeStarterTopics" in directPayload, false);

    const genericDirect = await client.request(
      "/api/coffee/sessions",
      jsonInit({ groupBotIds: botIds })
    );
    const genericDirectPayload = await json(genericDirect);
    assert.equal(genericDirect.status, 200, JSON.stringify(genericDirectPayload));
    assert.equal(genericDirectPayload.conversation.coffeeTopic ?? null, null);
    assert.ok(genericDirectPayload.coffeeStarterTopics.length > 0);

    const oversizedDirect = await client.request(
      "/api/coffee/sessions",
      jsonInit({
        groupBotIds: botIds,
        initialTopic: "x".repeat(COFFEE_TOPIC_MAX_LENGTH + 1),
      })
    );
    const oversizedDirectPayload = await json(oversizedDirect);
    assert.equal(oversizedDirect.status, 400, JSON.stringify(oversizedDirectPayload));
    assert.equal(oversizedDirectPayload.error, "Coffee topic is too long.");

    const createdGroup = await client.request(
      "/api/coffee/groups",
      jsonInit({ name: "Prompted Table", groupBotIds: botIds })
    );
    const createdGroupPayload = await json(createdGroup);
    assert.equal(createdGroup.status, 201, JSON.stringify(createdGroupPayload));
    const groupId = createdGroupPayload.group.id as string;

    const savedGroupSession = await client.request(
      `/api/coffee/groups/${encodeURIComponent(groupId)}/sessions`,
      jsonInit({ initialTopic: "  What should this room build next?  " })
    );
    const savedGroupPayload = await json(savedGroupSession);
    assert.equal(savedGroupSession.status, 201, JSON.stringify(savedGroupPayload));
    assert.equal(
      savedGroupPayload.conversation.coffeeTopic,
      "What should this room build next?"
    );
    assert.equal(savedGroupPayload.conversation.coffeeGroupId, groupId);
    assert.equal("coffeeStarterTopics" in savedGroupPayload, false);

    const genericSavedGroupSession = await client.request(
      `/api/coffee/groups/${encodeURIComponent(groupId)}/sessions`,
      jsonInit({})
    );
    const genericSavedGroupPayload = await json(genericSavedGroupSession);
    assert.equal(
      genericSavedGroupSession.status,
      201,
      JSON.stringify(genericSavedGroupPayload)
    );
    assert.equal(genericSavedGroupPayload.conversation.coffeeTopic ?? null, null);
    assert.ok(genericSavedGroupPayload.coffeeStarterTopics.length > 0);

    const oversizedSavedGroupSession = await client.request(
      `/api/coffee/groups/${encodeURIComponent(groupId)}/sessions`,
      jsonInit({ initialTopic: "x".repeat(COFFEE_TOPIC_MAX_LENGTH + 1) })
    );
    const oversizedSavedGroupPayload = await json(oversizedSavedGroupSession);
    assert.equal(
      oversizedSavedGroupSession.status,
      400,
      JSON.stringify(oversizedSavedGroupPayload)
    );
    assert.equal(oversizedSavedGroupPayload.error, "Coffee topic is too long.");
    fetchRecorder.calls.length = 0;
  });

  it("runs the Coffee bar ritual and blocks special drinks in LOCAL mode without egress", async () => {
    const client = createClient();
    const email = "coffee-bar-local@example.com";
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: email, password: "coffee-bar-local-password" }),
    );
    assert.equal(register.status, 201);
    const userId = String((await json(register)).user.id);
    const now = "2026-07-21T18:00:00.000Z";
    const botIds = ["bar-table-a", "bar-table-b", "barista-cameo"];
    const insertBot = db.prepare(
      `INSERT INTO bots
         (id, user_id, name, system_prompt, online_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    );
    insertBot.run(botIds[0], userId, "Avery", "Practical and warm.", now, now);
    insertBot.run(botIds[1], userId, "Blake", "Curious and concise.", now, now);
    insertBot.run(botIds[2], userId, "Casey", "A calm host.", now, now);

    const created = await client.request(
      "/api/coffee/sessions",
      jsonInit({ groupBotIds: botIds.slice(0, 2), initialTopic: "A small ritual" }),
    );
    const createdPayload = await json(created);
    assert.equal(created.status, 200, JSON.stringify(createdPayload));
    const conversationId = String(createdPayload.conversation.id);
    assert.equal(
      createdPayload.conversation.coffeeSettings.barRitual.serviceBot.id,
      botIds[2],
    );

    const fetchCount = fetchRecorder.calls.length;
    const blocked = await client.request(
      `/api/coffee/sessions/${conversationId}/bar/special`,
      jsonInit({
        orderText: "a lavender moon cappuccino",
        idempotencyKey: "local-attempt",
        preferredProvider: "local",
      }),
    );
    const blockedPayload = await json(blocked);
    assert.equal(blocked.status, 409, JSON.stringify(blockedPayload));
    assert.match(blockedPayload.error, /house coffee or make the rounds/i);
    assert.equal(fetchRecorder.calls.length, fetchCount);
    assert.equal(
      (db.prepare(
        "SELECT COUNT(*) AS count FROM images WHERE user_id = ? AND conversation_id = ?",
      ).get(userId, conversationId) as { count: number }).count,
      0,
    );

    const house = await client.request(
      `/api/coffee/sessions/${conversationId}/bar/house`,
      { method: "POST" },
    );
    const housePayload = await json(house);
    assert.equal(house.status, 200, JSON.stringify(housePayload));
    assert.equal(housePayload.conversation.coffeeSettings.barRitual.role, "cup");
    assert.equal(housePayload.conversation.coffeeSettings.barRitual.drink, "house");
    assert.ok(housePayload.conversation.coffeeSettings.barRitual.playerCup);

    const second = await client.request(
      "/api/coffee/sessions",
      jsonInit({ groupBotIds: botIds.slice(0, 2), initialTopic: "Another round" }),
    );
    const secondPayload = await json(second);
    const pot = await client.request(
      `/api/coffee/sessions/${String(secondPayload.conversation.id)}/bar/role`,
      jsonInit({ role: "pot" }),
    );
    const potPayload = await json(pot);
    assert.equal(pot.status, 200, JSON.stringify(potPayload));
    assert.equal(potPayload.conversation.coffeeSettings.barRitual.role, "pot");
    assert.equal(potPayload.conversation.coffeeSettings.barRitual.playerCup, null);
  });

  it("forwards exact attendance through saved-group Coffee routes", async () => {
    const client = createClient();
    const email = "coffee-force-attendance@example.com";
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: email, password: "coffee-force-attendance-password" })
    );
    assert.equal(register.status, 201);
    const user = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email) as { id: string };
    const createdAt = "2026-07-14T20:45:00.000Z";
    const botIds = [
      "coffee-force-attendance-bot-1",
      "coffee-force-attendance-bot-2",
      "coffee-force-attendance-bot-3",
    ];
    const insertBot = db.prepare(
      `INSERT INTO bots
         (id, user_id, name, system_prompt, online_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`
    );
    for (const [index, botId] of botIds.entries()) {
      insertBot.run(
        botId,
        user.id,
        `Invitee ${index + 1}`,
        "Join the table and respond directly to its topic.",
        createdAt,
        createdAt
      );
    }
    const createdGroup = await client.request(
      "/api/coffee/groups",
      jsonInit({ name: "Exact Attendance Table", groupBotIds: botIds })
    );
    const createdGroupPayload = await json(createdGroup);
    assert.equal(createdGroup.status, 201, JSON.stringify(createdGroupPayload));
    const groupId = createdGroupPayload.group.id as string;
    const baseline = await client.request(
      `/api/coffee/groups/${encodeURIComponent(groupId)}/sessions`,
      jsonInit({})
    );
    const baselinePayload = await json(baseline);
    assert.equal(baseline.status, 201, JSON.stringify(baselinePayload));
    db.prepare(
      `UPDATE coffee_bot_social_state
          SET disposition = ?, values_friction = ?, restraint = ?, engagement = ?, leave_pressure = ?
        WHERE conversation_id = ? AND bot_id = ?`
    ).run(
      0.04,
      0.96,
      0.82,
      0.08,
      0.94,
      baselinePayload.conversation.id,
      botIds[1]
    );

    const originalRandom = Math.random;
    Math.random = () => 0;
    let forcedSession: Awaited<ReturnType<typeof client.request>>;
    try {
      forcedSession = await client.request(
        `/api/coffee/groups/${encodeURIComponent(groupId)}/sessions`,
        jsonInit({ forceAttendance: true })
      );
    } finally {
      Math.random = originalRandom;
    }
    const forcedPayload = await json(forcedSession);

    assert.equal(forcedSession.status, 201, JSON.stringify(forcedPayload));
    assert.deepEqual(
      [...forcedPayload.conversation.botGroupIds].sort(),
      [...botIds].sort()
    );
    assert.deepEqual(forcedPayload.conversation.coffeeAbsentBotIds ?? [], []);
    fetchRecorder.calls.length = 0;
  });

  it("stores Brave Search credentials encrypted and returns only connection state", async () => {
    const client = createClient();
    const email = "brave-settings@example.com";
    const plaintext = "brave-test-secret-value";
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: email, password: "brave-settings-password" })
    );
    assert.equal(register.status, 201);

    const saved = await client.request("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ braveSearchApiKey: plaintext }),
    });
    assert.equal(saved.status, 200);
    const savedText = await saved.text();
    assert.equal(savedText.includes(plaintext), false);
    const savedPayload = JSON.parse(savedText);
    assert.equal(savedPayload.settings.hasBraveSearchApiKey, true);
    assert.equal(savedPayload.settings.braveSearchApiKeySource, "saved");
    assert.equal("braveSearchApiKey" in savedPayload.settings, false);

    const user = db
      .prepare(
        `SELECT brave_search_key_ciphertext, brave_search_key_iv, brave_search_key_tag
           FROM users WHERE email = ?`
      )
      .get(email) as {
      brave_search_key_ciphertext: string | null;
      brave_search_key_iv: string | null;
      brave_search_key_tag: string | null;
    };
    assert.ok(user.brave_search_key_ciphertext);
    assert.notEqual(user.brave_search_key_ciphertext, plaintext);
    assert.ok(user.brave_search_key_iv);
    assert.ok(user.brave_search_key_tag);

    const loaded = await client.request("/api/settings");
    const loadedText = await loaded.text();
    assert.equal(loadedText.includes(plaintext), false);
    const loadedPayload = JSON.parse(loadedText);
    assert.equal(loadedPayload.settings.hasBraveSearchApiKey, true);
    assert.equal(loadedPayload.settings.braveSearchApiKeySource, "saved");
    assert.equal("braveSearchApiKey" in loadedPayload.settings, false);

    const cleared = await client.request("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ braveSearchApiKey: null }),
    });
    assert.equal(cleared.status, 200);
    const clearedPayload = await json(cleared);
    assert.equal(clearedPayload.settings.hasBraveSearchApiKey, false);
    assert.equal(clearedPayload.settings.braveSearchApiKeySource, "none");
  });

  it("shows ElevenLabs credits only for the signed-in user's saved key while online", async () => {
    const client = createClient();
    const registered = await client.request(
      "/api/auth/register",
      jsonInit({
        username: "elevenlabs-credits@example.com",
        password: "elevenlabs-credits-password",
      }),
    );
    assert.equal(registered.status, 201);

    const saved = await client.request("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        preferredProvider: "openai",
        elevenLabsApiKey: "account-elevenlabs-credit-key",
      }),
    });
    assert.equal(saved.status, 200);

    fetchRecorder.calls.length = 0;
    fetchRecorder.setResponse(
      new Response(
        JSON.stringify({
          tier: "creator",
          status: "active",
          character_count: 6_856,
          character_limit: 600_005,
          next_character_count_reset_unix: 1_800_000_000,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    try {
      const credits = await client.request(
        "/api/settings/elevenlabs-credits",
      );
      const creditsPayload = await json(credits);
      assert.equal(credits.status, 200, JSON.stringify(creditsPayload));
      assert.equal(creditsPayload.balance.totalCredits, 600_005);
      assert.equal(creditsPayload.balance.remainingCredits, 593_149);
      assert.equal(fetchRecorder.calls.length, 1);
      assert.equal(
        fetchRecorder.calls[0]?.input,
        "https://api.elevenlabs.io/v1/user/subscription",
      );
      assert.equal(
        new Headers(fetchRecorder.calls[0]?.init?.headers).get("xi-api-key"),
        "account-elevenlabs-credit-key",
      );

      fetchRecorder.setResponse(new Response("{}", { status: 403 }));
      const restrictedCredits = await client.request(
        "/api/settings/elevenlabs-credits",
      );
      assert.equal(restrictedCredits.status, 424);
      assert.match(
        String((await json(restrictedCredits)).error),
        /cannot access subscription details/i,
      );

      const localSettings = await client.request("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferredProvider: "local" }),
      });
      assert.equal(localSettings.status, 200);
      const callsBeforeLocalCheck = fetchRecorder.calls.length;
      const localCredits = await client.request(
        "/api/settings/elevenlabs-credits",
      );
      assert.equal(localCredits.status, 409);
      assert.match(String((await json(localCredits)).error), /online/i);
      assert.equal(fetchRecorder.calls.length, callsBeforeLocalCheck);

      const cleared = await client.request("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          preferredProvider: "openai",
          elevenLabsApiKey: null,
        }),
      });
      assert.equal(cleared.status, 200);
      config.elevenLabsApiKey = "shared-server-elevenlabs-key";
      const callsBeforeServerKeyCheck = fetchRecorder.calls.length;
      const serverKeyCredits = await client.request(
        "/api/settings/elevenlabs-credits",
      );
      assert.equal(serverKeyCredits.status, 409);
      assert.match(
        String((await json(serverKeyCredits)).error),
        /save an elevenlabs api key to this account/i,
      );
      assert.equal(fetchRecorder.calls.length, callsBeforeServerKeyCheck);
    } finally {
      config.elevenLabsApiKey = "";
      fetchRecorder.setResponse(new Response("{}", { status: 200 }));
      fetchRecorder.calls.length = 0;
    }
  });

  it("initializes stable Premium defaults only after a successful catalog load", async () => {
    const client = createClient();
    const registered = await client.request(
      "/api/auth/register",
      jsonInit({
        username: "premium-defaults@example.com",
        password: "premium-defaults-password",
      }),
    );
    assert.equal(registered.status, 201);
    const userId = String((await json(registered)).user.id);
    const created = await client.request(
      "/api/bots",
      jsonInit({ name: "Catalog Bot", systemPrompt: "A catalog test bot." }),
    );
    assert.equal(created.status, 201);
    const botId = String((await json(created)).bot.id);

    config.elevenLabsApiKey = "shared-premium-defaults-key";
    fetchRecorder.calls.length = 0;
    fetchRecorder.setResponse(
      new Response(
        JSON.stringify({
          voices: [
            { voice_id: "voice-z", name: "Zed" },
            { voice_id: "voice-a", name: "Ada" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    try {
      const catalog = await client.request("/api/voices/elevenlabs");
      const catalogPayload = await json(catalog);
      assert.equal(catalog.status, 200, JSON.stringify(catalogPayload));
      assert.deepEqual(catalogPayload.initialization.assignedBotIds, [botId]);
      assert.equal(
        catalogPayload.initialization.assignedDefaultPrism,
        true,
      );
      const firstOverride = JSON.parse(
        String(
          (
            db.prepare(
              "SELECT audio_voice_profile_override FROM bots WHERE id = ? AND user_id = ?",
            ).get(botId, userId) as {
              audio_voice_profile_override: string;
            }
          ).audio_voice_profile_override,
        ),
      ) as Record<string, unknown>;
      assert.equal(firstOverride.elevenLabsVoiceInitialized, true);
      assert.ok(["voice-a", "voice-z"].includes(String(firstOverride.elevenLabsVoiceId)));
      const defaultProfile = JSON.parse(
        String(
          (
            db.prepare(
              "SELECT prism_default_bot_audio_voice_profile FROM users WHERE id = ?",
            ).get(userId) as {
              prism_default_bot_audio_voice_profile: string;
            }
          ).prism_default_bot_audio_voice_profile,
        ),
      ) as Record<string, unknown>;
      assert.equal(defaultProfile.elevenLabsVoiceInitialized, true);

      await client.request("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ elevenLabsVoiceCollectionId: "cast-main" }),
      });
      fetchRecorder.setResponse(
        new Response(
          JSON.stringify({
            voices: [{ voice_id: "voice-new", name: "New Voice" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
      const repeated = await client.request(
        "/api/voices/elevenlabs/defaults",
        jsonInit({}),
      );
      assert.equal(repeated.status, 200);
      assert.deepEqual((await json(repeated)).initialization.assignedBotIds, []);
      const repeatedOverride = JSON.parse(
        String(
          (
            db.prepare(
              "SELECT audio_voice_profile_override FROM bots WHERE id = ? AND user_id = ?",
            ).get(botId, userId) as {
              audio_voice_profile_override: string;
            }
          ).audio_voice_profile_override,
        ),
      ) as Record<string, unknown>;
      assert.equal(
        repeatedOverride.elevenLabsVoiceId,
        firstOverride.elevenLabsVoiceId,
      );
      assert.equal(
        new URL(fetchRecorder.calls.at(-1)?.input ?? "https://invalid.test").searchParams.get(
          "collection_id",
        ),
        "cast-main",
      );

      const retryBot = await client.request(
        "/api/bots",
        jsonInit({ name: "Retry Bot", systemPrompt: "Retry after failure." }),
      );
      assert.equal(retryBot.status, 201);
      const retryBotId = String((await json(retryBot)).bot.id);
      fetchRecorder.setResponse(new Response("catalog unavailable", { status: 503 }));
      const failed = await client.request(
        "/api/voices/elevenlabs/defaults",
        jsonInit({}),
      );
      assert.equal(failed.status, 502);
      const unchanged = db.prepare(
        "SELECT audio_voice_profile_override FROM bots WHERE id = ? AND user_id = ?",
      ).get(retryBotId, userId) as { audio_voice_profile_override: string | null };
      assert.equal(unchanged.audio_voice_profile_override, null);

      fetchRecorder.setResponse(
        new Response(
          JSON.stringify({
            voices: [{ voice_id: "voice-retry", name: "Retry Voice" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
      const retried = await client.request(
        "/api/voices/elevenlabs/defaults",
        jsonInit({}),
      );
      assert.equal(retried.status, 200);
      assert.deepEqual((await json(retried)).initialization.assignedBotIds, [
        retryBotId,
      ]);
    } finally {
      config.elevenLabsApiKey = "";
      fetchRecorder.setResponse(new Response("{}", { status: 200 }));
      fetchRecorder.calls.length = 0;
    }
  });

  it("routes bot power compilation through the configured paired auxiliary host", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({
        username: "paired-power-compiler@example.com",
        password: "paired-power-compiler-password",
      })
    );
    assert.equal(register.status, 201);

    db.prepare(
      `UPDATE users
          SET prism_default_llm_model = ?,
              secondary_ollama_host = ?,
              experimental_dual_ollama_enabled = 0
        WHERE email = ?`
    ).run(
      "ollama-secondary:gemma3:latest",
      "http://127.0.0.1:11434",
      "paired-power-compiler@example.com"
    );

    const callStart = auxiliaryProviderFactoryCalls.length;
    const response = await client.request(
      "/api/bot-powers/compile",
      jsonInit({
        botName: "Darth Vader",
        systemPrompt: "A commanding machine-assisted presence.",
        powers: [
          {
            version: 1,
            id: "mechanical-cadence",
            name: "Mechanical cadence",
            intent: "Speaks with a clipped mechanical rhythm.",
            enabled: true,
            compileStatus: "draft",
            compiled: null,
          },
        ],
      })
    );
    assert.equal(response.status, 200);
    assert.equal((await json(response)).ok, true);
    assert.deepEqual(auxiliaryProviderFactoryCalls.slice(callStart), [
      {
        prismDefaultLlmModel: "ollama-secondary:gemma3:latest",
        secondaryOllamaHost: "http://127.0.0.1:11434",
        experimentalDualOllama: false,
      },
    ]);
  });

  it("ignores retired account-wide voice defaults and Coffee player voice fields", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "player-voice@example.com", password: "player-voice-password", displayName: "Jared" })
    );
    assert.equal(register.status, 201);
    const saved = await client.request("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playerAudioVoiceProfile: {
          ...normalizeBotAudioVoiceProfileV1(undefined),
          baseVoiceId: "voice-3",
        },
        playerNamePronunciation: "Jair-id",
        defaultSystemVoiceName: "Alex",
        defaultElevenLabsVoiceId: "eleven-global",
        autoModeEnabled: true,
        autoFallbackChain: {
          v: 1,
          fallbacks: [
            { provider: "local", model: "qwen3:8b" },
            { provider: "openai", model: "gpt-5-mini" },
          ],
        },
      }),
    });
    assert.equal(saved.status, 200);
    const loaded = await client.request("/api/settings");
    assert.equal(loaded.status, 200);
    const settings = (await json(loaded)).settings;
    assert.equal("playerAudioVoiceProfile" in settings, false);
    assert.equal("playerNamePronunciation" in settings, false);
    assert.equal("defaultSystemVoiceName" in settings, false);
    assert.equal("defaultElevenLabsVoiceId" in settings, false);
    assert.equal(settings.autoModeEnabled, true);
    assert.deepEqual(settings.autoFallbackChain, {
      v: 1,
      fallbacks: [
        { provider: "local", model: "qwen3:8b" },
        { provider: "openai", model: "gpt-5-mini" },
      ],
    });
    assert.equal("fallbackModelMessageStripe" in settings, false);
    assert.equal("lenientLocalFallbackModel" in settings, false);

    const preview = await client.request(
      "/api/voices/preview-line",
      jsonInit({ botName: "Plankton", systemPrompt: "A theatrical tiny villain." })
    );
    assert.equal(preview.status, 200);
    assert.equal((await json(preview)).line, deterministicReply);
  });

  it("records Coffee departure idempotently and completes one bounded local epilogue", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({
        username: "coffee-departure@example.com",
        password: "coffee-departure-password",
        displayName: "Player",
      })
    );
    assert.equal(register.status, 201);
    const userId = String((await json(register)).user.id);
    const botIds = ["departure-bot-1", "departure-bot-2"];
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO bots (id, user_id, name, system_prompt, online_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)"
    ).run(botIds[0], userId, "First Bot", "You are First Bot.", now, now);
    db.prepare(
      "INSERT INTO bots (id, user_id, name, system_prompt, online_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)"
    ).run(botIds[1], userId, "Second Bot", "You are Second Bot.", now, now);
    const sessionId = "departure-session";
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, conversation_mode, bot_group_ids, coffee_topic, created_at, updated_at) VALUES (?, ?, ?, 'coffee', ?, ?, ?, ?)"
    ).run(
      sessionId,
      userId,
      "Coffee departure",
      JSON.stringify(botIds),
      "What makes a good goodbye?",
      now,
      now
    );
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, created_at) VALUES (?, ?, ?, 'user', ?, NULL, ?)"
    ).run("departure-user-line", sessionId, userId, "I have to head out early.", now);

    const first = await client.request(
      `/api/coffee/sessions/${encodeURIComponent(sessionId)}/depart`,
      jsonInit({ preferredProvider: "local" })
    );
    assert.equal(first.status, 202);
    const firstPayload = await json(first);
    assert.equal(firstPayload.departureRecorded, true);
    assert.equal(firstPayload.epilogueStarted, true);
    assert.ok(firstPayload.epilogueTurnTarget >= 2 && firstPayload.epilogueTurnTarget <= 4);

    const duplicate = await client.request(
      `/api/coffee/sessions/${encodeURIComponent(sessionId)}/depart`,
      jsonInit({ preferredProvider: "openai" })
    );
    assert.equal(duplicate.status, 202);
    const duplicatePayload = await json(duplicate);
    assert.equal(duplicatePayload.departureRecorded, false);
    assert.equal(duplicatePayload.epilogueStarted, false);
    assert.equal(duplicatePayload.epilogueTurnTarget, firstPayload.epilogueTurnTarget);

    const resumeAttempt = await client.request(
      `/api/coffee/sessions/${encodeURIComponent(sessionId)}/continue`,
      jsonInit({ preferredProvider: "local" })
    );
    assert.equal(resumeAttempt.status, 400);
    assert.match(String((await json(resumeAttempt)).error), /ended when the player left/i);

    const deadline = Date.now() + 5_000;
    let assistantCount = 0;
    while (Date.now() < deadline) {
      assistantCount = Number(
        (db.prepare(
          "SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ? AND user_id = ? AND role = 'assistant' AND content <> ''"
        ).get(sessionId, userId) as { count: number }).count
      );
      if (assistantCount >= firstPayload.epilogueTurnTarget) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(assistantCount, firstPayload.epilogueTurnTarget);
    const markerCount = Number(
      (db.prepare(
        "SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ? AND user_id = ? AND role = 'system' AND tool_payload LIKE '%playerDeparture%'"
      ).get(sessionId, userId) as { count: number }).count
    );
    assert.equal(markerCount, 1);
    const epilogueProviders = db.prepare(
      "SELECT DISTINCT provider FROM messages WHERE conversation_id = ? AND user_id = ? AND role = 'assistant'"
    ).all(sessionId, userId) as Array<{ provider: string | null }>;
    assert.deepEqual(epilogueProviders.map((row) => row.provider), ["local"]);

    const synopsis = await client.request(
      `/api/coffee/sessions/${encodeURIComponent(sessionId)}/synopsis`,
      jsonInit({ preferredProvider: "local" })
    );
    assert.equal(synopsis.status, 200);
    const synopsisPayload = await json(synopsis);
    const synopsisMessages = synopsisPayload.conversation.messages.filter(
      (message: { role?: unknown; content?: unknown }) =>
        message.role === "system" &&
        typeof message.content === "string" &&
        message.content.startsWith("Session synopsis:")
    );
    assert.equal(synopsisMessages.length, 1);
    const finalAssistant = [...synopsisPayload.conversation.messages]
      .reverse()
      .find((message: { role?: unknown }) => message.role === "assistant");
    assert.equal(
      finalAssistant?.coffeeReplayEvents?.some(
        (event: { kind?: unknown }) => event.kind === "botDeparture"
      ),
      true,
      JSON.stringify(finalAssistant)
    );
  });

  it("routes CORS preflight, root landing, and unknown paths without external services", async () => {
    const preflight = await createClient().request("/api/health", { method: "OPTIONS" });
    assert.equal(preflight.status, 204);

    const root = await createClient().request("/");
    assert.equal(root.status, 200);
    assert.match(await root.text(), /Prism API/);

    const missing = await createClient().request("/api/does-not-exist");
    assert.equal(missing.status, 404);
  });

  it("dispatches authenticated Signal name regeneration through the real route table", async () => {
    const client = createClient();
    const registration = await client.request(
      "/api/auth/register",
      jsonInit({
        username: "signal-name-route@example.com",
        password: "signal-name-route-password",
      }),
    );
    assert.equal(registration.status, 201);
    const userId = String((await json(registration)).user.id);
    const hostId = "signal-name-route-host";
    const createdAt = "2026-07-15T00:00:00.000Z";
    db.prepare(
      `INSERT INTO bots
         (id, user_id, name, system_prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      hostId,
      userId,
      "Signal Name Route Host",
      "A precise host with a taste for unexpected titles.",
      createdAt,
      createdAt,
    );

    const showResponse = await client.request(
      "/api/botcast/shows",
      jsonInit({ hostBotId: hostId }),
    );
    const showPayload = await json(showResponse);
    assert.equal(showResponse.status, 201, JSON.stringify(showPayload));
    const showId = String(showPayload.show.id);
    const providerCallsBefore = deterministicProvider.calls.length;

    const nameResponse = await client.request(
      `/api/botcast/shows/${encodeURIComponent(showId)}/name`,
      jsonInit({ preferredProvider: "local" }),
    );
    const namePayload = await json(nameResponse);
    assert.notEqual(nameResponse.status, 404, JSON.stringify(namePayload));
    assert.equal(nameResponse.status, 200, JSON.stringify(namePayload));
    assert.equal(namePayload.ok, true);
    assert.equal(namePayload.show.id, showId);
    assert.equal(typeof namePayload.generated, "boolean");
    const providerCallCount = deterministicProvider.calls.length - providerCallsBefore;
    assert.ok(
      providerCallCount >= 1 && providerCallCount <= 3,
      `expected one initial Signal name request plus at most two deliberate retries, received ${providerCallCount}`,
    );
  });

  it("locks Signal episodes to the selected online provider without weakening LOCAL mode", async () => {
    const client = createClient();
    const registration = await client.request(
      "/api/auth/register",
      jsonInit({
        username: "signal-model-routing@example.com",
        password: "signal-model-routing",
      }),
    );
    assert.equal(registration.status, 201);
    const userId = String((await json(registration)).user.id);
    const createdAt = "2026-07-15T00:00:00.000Z";
    const insertBot = db.prepare(
      `INSERT INTO bots
         (id, user_id, name, system_prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insertBot.run(
      "signal-model-host",
      userId,
      "Signal Model Host",
      "A provider-aware host.",
      createdAt,
      createdAt,
    );
    insertBot.run(
      "signal-model-guest",
      userId,
      "Signal Model Guest",
      "A provider-aware guest.",
      createdAt,
      createdAt,
    );
    const showResponse = await client.request(
      "/api/botcast/shows",
      jsonInit({ hostBotId: "signal-model-host" }),
    );
    assert.equal(showResponse.status, 201);
    const showId = String((await json(showResponse)).show.id);

    db.prepare(
      `UPDATE users
       SET preferred_provider = 'openai',
           preferred_online_model = 'gpt-account-default',
           preferred_local_model = 'gemma-account-default'
       WHERE id = ?`,
    ).run(userId);
    const onlineResponse = await client.request(
      `/api/botcast/shows/${encodeURIComponent(showId)}/episodes`,
      jsonInit({
        guestBotId: "signal-model-guest",
        topic: "Route this online recording",
        preferredProvider: "anthropic",
        modelOverride: "claude-signal",
      }),
    );
    const onlinePayload = await json(onlineResponse);
    assert.equal(onlineResponse.status, 201, JSON.stringify(onlinePayload));
    assert.equal(onlinePayload.episode.provider, "anthropic");
    assert.equal(onlinePayload.episode.model, "claude-signal");
    assert.equal(onlinePayload.episode.responseMode, "online");

    db.prepare("UPDATE users SET preferred_provider = 'local' WHERE id = ?").run(
      userId,
    );
    const localResponse = await client.request(
      `/api/botcast/shows/${encodeURIComponent(showId)}/episodes`,
      jsonInit({
        guestBotId: "signal-model-guest",
        topic: "Keep this recording local",
        preferredProvider: "anthropic",
        modelOverride: "claude-stale-selection",
      }),
    );
    const localPayload = await json(localResponse);
    assert.equal(localResponse.status, 201, JSON.stringify(localPayload));
    assert.equal(localPayload.episode.provider, "local");
    assert.equal(localPayload.episode.model, "gemma-account-default");
    assert.equal(localPayload.episode.responseMode, "local");

    db.prepare(
      "UPDATE users SET auto_switch_model = 1, auto_fallback_chain = ? WHERE id = ?",
    ).run(
      JSON.stringify({
        v: 1,
        fallbacks: [
          { provider: "openai", model: "gpt-signal-fallback" },
          { provider: "anthropic", model: "claude-signal-fallback" },
        ],
      }),
      userId,
    );
    const autoResponse = await client.request(
      `/api/botcast/shows/${encodeURIComponent(showId)}/episodes`,
      jsonInit({
        guestBotId: "signal-model-guest",
        topic: "Recover this recording automatically",
        preferredProvider: "local",
        modelOverride: "gemma-account-default",
        responseMode: "auto",
      }),
    );
    const autoPayload = await json(autoResponse);
    assert.equal(autoResponse.status, 201, JSON.stringify(autoPayload));
    assert.equal(autoPayload.episode.provider, "local");
    assert.equal(autoPayload.episode.model, "gemma-account-default");
    assert.equal(autoPayload.episode.responseMode, "auto");
  });

  it("keeps Signal booking suggestions on LOCAL when the account is local", async () => {
    const client = createClient();
    const registration = await client.request(
      "/api/auth/register",
      jsonInit({
        username: "signal-booking-suggestion@example.com",
        password: "signal-booking-suggestion",
      }),
    );
    assert.equal(registration.status, 201);
    const userId = String((await json(registration)).user.id);
    const createdAt = "2026-07-17T00:00:00.000Z";
    const insertBot = db.prepare(
      `INSERT INTO bots
         (id, user_id, name, system_prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insertBot.run(
      "signal-suggestion-host",
      userId,
      "Suggestion Host",
      "A careful host who finds useful tensions.",
      createdAt,
      createdAt,
    );
    insertBot.run(
      "signal-suggestion-guest",
      userId,
      "Suggestion Guest",
      "A guarded guest with practical experience.",
      createdAt,
      createdAt,
    );
    const showResponse = await client.request(
      "/api/botcast/shows",
      jsonInit({ hostBotId: "signal-suggestion-host" }),
    );
    assert.equal(showResponse.status, 201);
    const showId = String((await json(showResponse)).show.id);
    db.prepare(
      `UPDATE users
          SET preferred_provider = 'local', preferred_local_model = 'gemma-suggestion'
        WHERE id = ?`,
    ).run(userId);
    const providerCallsBefore = providerFactoryCalls.length;
    const response = await client.request(
      `/api/botcast/shows/${encodeURIComponent(showId)}/booking-suggestion`,
      jsonInit({
        guestBotId: "signal-suggestion-guest",
        field: "producerBrief",
        currentTopic: "A first idea",
        currentProducerBrief: "A first production angle.",
        preferredProvider: "anthropic",
        modelOverride: "claude-must-not-run",
      }),
    );
    const payload = await json(response);
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.ok, true);
    assert.equal(payload.generated, true);
    assert.equal(typeof payload.value, "string");
    assert.deepEqual(providerFactoryCalls.slice(providerCallsBefore), ["local"]);

    const bookingResponse = await client.request(
      `/api/botcast/shows/${encodeURIComponent(showId)}/booking-suggestion`,
      jsonInit({
        guestBotId: "signal-suggestion-guest",
        field: "booking",
        preferredProvider: "anthropic",
        modelOverride: "claude-must-not-run",
      }),
    );
    const bookingPayload = await json(bookingResponse);
    assert.equal(bookingResponse.status, 200, JSON.stringify(bookingPayload));
    assert.equal(bookingPayload.ok, true);
    assert.equal(bookingPayload.generated, true);
    assert.equal(typeof bookingPayload.topic, "string");
    assert.ok(bookingPayload.topic.length > 0);
    assert.equal(typeof bookingPayload.producerBrief, "string");
    assert.ok(bookingPayload.producerBrief.length > 0);

    const invalidTopicResponse = await client.request(
      `/api/botcast/shows/${encodeURIComponent(showId)}/booking-suggestion`,
      jsonInit({
        guestBotId: "signal-suggestion-guest",
        field: "topic",
        preferredProvider: "anthropic",
        modelOverride: "claude-must-not-run",
      }),
    );
    const invalidTopicPayload = await json(invalidTopicResponse);
    assert.equal(invalidTopicResponse.status, 502, JSON.stringify(invalidTopicPayload));
    assert.match(
      String(invalidTopicPayload.error),
      /selected model did not return a usable episode title/u,
    );
  });

  it("uploads Signal assets and deletes episodes and shows through tenant-safe HTTP routes", async () => {
    const owner = createClient();
    const stranger = createClient();
    const ownerRegistration = await owner.request(
      "/api/auth/register",
      jsonInit({ username: "signal-delete-owner@example.com", password: "signal-delete-owner" })
    );
    const strangerRegistration = await stranger.request(
      "/api/auth/register",
      jsonInit({ username: "signal-delete-stranger@example.com", password: "signal-delete-stranger" })
    );
    assert.equal(ownerRegistration.status, 201);
    assert.equal(strangerRegistration.status, 201);
    const ownerId = String((await json(ownerRegistration)).user.id);

    const hostId = "signal-route-host";
    const guestId = "signal-route-guest";
    const createdAt = "2026-07-15T00:00:00.000Z";
    const insertSignalBot = db.prepare(
      `INSERT INTO bots
         (id, user_id, name, system_prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    insertSignalBot.run(
      hostId,
      ownerId,
      "Signal Route Host",
      "A precise and curious interviewer.",
      createdAt,
      createdAt
    );
    insertSignalBot.run(
      guestId,
      ownerId,
      "Signal Route Guest",
      "A thoughtful and candid guest.",
      createdAt,
      createdAt
    );

    const showResponse = await owner.request(
      "/api/botcast/shows",
      jsonInit({ hostBotId: hostId })
    );
    assert.equal(showResponse.status, 201);
    const showId = String((await json(showResponse)).show.id);
    const uploadedAssetBytes = await sharp({
      create: {
        width: 8,
        height: 6,
        channels: 4,
        background: { r: 38, g: 96, b: 164, alpha: 1 },
      },
    }).png().toBuffer();
    const uploadedAssetDataUrl =
      `data:image/png;base64,${uploadedAssetBytes.toString("base64")}`;
    const uploadedLogoBytes = await sharp({
      create: {
        width: 80,
        height: 60,
        channels: 4,
        background: { r: 250, g: 248, b: 242, alpha: 1 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="14" fill="#265fa8"/></svg>',
          ),
          gravity: "center",
        },
      ])
      .png()
      .toBuffer();
    const uploadedLogoDataUrl =
      `data:image/png;base64,${uploadedLogoBytes.toString("base64")}`;
    const uploadedImageIds: string[] = [];
    for (const slot of ["day-studio", "night-studio", "logo"] as const) {
      const uploadResponse = await owner.request(
        `/api/botcast/shows/${encodeURIComponent(showId)}/assets/${slot}/upload`,
        jsonInit({
          dataUrl:
            slot === "logo" ? uploadedLogoDataUrl : uploadedAssetDataUrl,
        }),
      );
      const uploadPayload = await json(uploadResponse);
      assert.equal(uploadResponse.status, 201, JSON.stringify(uploadPayload));
      assert.equal(uploadPayload.image.origin, "botcast");
      assert.equal(uploadPayload.image.provider, "upload");
      assert.equal(uploadPayload.image.botId, hostId);
      uploadedImageIds.push(String(uploadPayload.image.id));
      const assignedImageId = slot === "day-studio"
        ? uploadPayload.show.dayAtmosphere.imageId
        : slot === "night-studio"
          ? uploadPayload.show.nightAtmosphere.imageId
          : uploadPayload.show.logo.imageId;
      assert.equal(assignedImageId, uploadPayload.image.id);
    }
    assert.equal(
      (db.prepare(
        "SELECT COUNT(*) AS count FROM images WHERE user_id = ? AND origin = 'botcast' AND provider = 'upload'",
      ).get(ownerId) as { count: number }).count,
      3,
    );
    const foreignAssetUpload = await stranger.request(
      `/api/botcast/shows/${encodeURIComponent(showId)}/assets/logo/upload`,
      jsonInit({ dataUrl: uploadedAssetDataUrl }),
    );
    assert.equal(foreignAssetUpload.status, 400);
    const episodeResponse = await owner.request(
      `/api/botcast/shows/${encodeURIComponent(showId)}/episodes`,
      jsonInit({ guestBotId: guestId, topic: "Why routes deserve tests" })
    );
    assert.equal(episodeResponse.status, 201);
    const episodeId = String((await json(episodeResponse)).episode.id);

    const foreignEpisodeDelete = await stranger.request(
      `/api/botcast/episodes/${encodeURIComponent(episodeId)}`,
      { method: "DELETE" }
    );
    const foreignShowDelete = await stranger.request(
      `/api/botcast/shows/${encodeURIComponent(showId)}`,
      { method: "DELETE" }
    );
    assert.equal(foreignEpisodeDelete.status, 404);
    assert.equal(foreignShowDelete.status, 404);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM botcast_episodes WHERE id = ? AND user_id = ?")
        .get(episodeId, ownerId) as { count: number }).count,
      1
    );

    const episodeDelete = await owner.request(
      `/api/botcast/episodes/${encodeURIComponent(episodeId)}`,
      { method: "DELETE" }
    );
    assert.equal(episodeDelete.status, 200);
    assert.deepEqual(await json(episodeDelete), { ok: true });
    assert.equal(
      (await owner.request(`/api/botcast/episodes/${encodeURIComponent(episodeId)}`, {
        method: "DELETE",
      })).status,
      404
    );

    const replacementEpisode = await owner.request(
      `/api/botcast/shows/${encodeURIComponent(showId)}/episodes`,
      jsonInit({ guestBotId: guestId, topic: "The show cascade" })
    );
    assert.equal(replacementEpisode.status, 201);
    const showDelete = await owner.request(
      `/api/botcast/shows/${encodeURIComponent(showId)}`,
      { method: "DELETE" }
    );
    assert.equal(showDelete.status, 200);
    assert.deepEqual(await json(showDelete), { ok: true });
    assert.equal(
      (await owner.request(`/api/botcast/shows/${encodeURIComponent(showId)}`, {
        method: "DELETE",
      })).status,
      404
    );
    const listedShows = await owner.request("/api/botcast/shows");
    assert.equal(listedShows.status, 200);
    assert.deepEqual((await json(listedShows)).shows, []);
    assert.equal(
      (db.prepare(
        `SELECT COUNT(*) AS count FROM images
          WHERE user_id = ? AND id IN (${uploadedImageIds.map(() => "?").join(", ")})`,
      ).get(ownerId, ...uploadedImageIds) as { count: number }).count,
      3,
      "replacing or deleting a show keeps prior uploaded artwork available in Images",
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM botcast_episodes WHERE user_id = ?")
        .get(ownerId) as { count: number }).count,
      0
    );
  });

  it("registers, authenticates, scopes conversations, gates local image generation, and logs out", async () => {
    const first = createClient();
    const register = await first.request(
      "/api/auth/register",
      jsonInit({ username: "first@example.com", password: "first-password", displayName: "First" })
    );
    assert.equal(register.status, 201);
    const registered = await json(register);
    const firstUserId = String(registered.user.id);

    const me = await first.request("/api/auth/me");
    assert.equal(me.status, 200);
    assert.equal((await json(me)).user.email, "first@example.com");

    db.prepare(
      "INSERT INTO conversations (id, user_id, title, conversation_mode, created_at, updated_at) VALUES (?, ?, ?, 'chat', ?, ?)"
    ).run(
      "first-conversation",
      firstUserId,
      "First conversation",
      "2026-07-10T00:00:00.000Z",
      "2026-07-10T00:00:00.000Z"
    );

    const firstConversations = await first.request("/api/conversations");
    assert.equal(firstConversations.status, 200);
    assert.equal((await json(firstConversations)).conversations.length, 1);

    const localImage = await first.request(
      "/api/images/generate",
      jsonInit({ prompt: "test image", preferredProvider: "local", model: "disabled" })
    );
    assert.equal(localImage.status, 400);
    assert.match((await json(localImage)).error, /Local image generation is disabled/i);

    const second = createClient();
    const secondRegister = await second.request(
      "/api/auth/register",
      jsonInit({ username: "second@example.com", password: "second-password" })
    );
    assert.equal(secondRegister.status, 201);
    const secondConversations = await second.request("/api/conversations");
    assert.equal(secondConversations.status, 200);
    assert.deepEqual((await json(secondConversations)).conversations, []);

    const logout = await first.request("/api/auth/logout", { method: "POST" });
    assert.equal(logout.status, 200);
    const afterLogout = await first.request("/api/conversations");
    assert.notEqual(afterLogout.status, 200);
    assert.deepEqual(fetchRecorder.calls, []);
  });

  it("persists face motion, rotation, and custom blink geometry", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "blink-default@example.com", password: "blink-password" })
    );
    assert.equal(register.status, 201);

    const created = await client.request(
      "/api/bots",
      jsonInit({
        name: "Marketplace update target",
        faceEyeCharacter: "8",
        faceEyeAnimation: "spin",
        faceEyeRotationDeg: -25,
        faceEyeCount: 2,
        faceMouthCharacter: "△",
        faceMouthAnimation: "wobble",
        faceBlinkScale: 1.2,
        faceBlinkOffsetX: -0.08,
        faceBlinkOffsetY: 0.06,
      })
    );
    assert.equal(created.status, 201);
    const createdPayload = await json(created);
    const botId = String(createdPayload.bot.id);
    assert.equal(createdPayload.bot.face_eye_animation, undefined);
    assert.equal(createdPayload.bot.face_eye_rotation_deg, -25);
    assert.equal(createdPayload.bot.face_eye_count, 2);
    assert.equal(createdPayload.bot.face_mouth_animation, "wobble");
    assert.equal(createdPayload.bot.face_mouth_coffee_pucker, 1);
    assert.equal(createdPayload.bot.face_blink_scale, 1.2);
    assert.equal(createdPayload.bot.face_blink_offset_x, -0.08);
    assert.equal(createdPayload.bot.face_blink_offset_y, 0.06);

    const updated = await client.request(`/api/bots/${encodeURIComponent(botId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        faceBlinkBar: " ",
        faceEyeAnimation: "flicker",
        faceEyeRotationDeg: 35,
        faceEyeCount: 1,
        faceMouthAnimation: "pulsate",
        faceMouthCoffeePucker: false,
        faceBlinkScale: 0.85,
        faceBlinkOffsetX: 0.1,
        faceBlinkOffsetY: -0.12,
      }),
    });
    assert.equal(updated.status, 200);
    const updatedPayload = await json(updated);
    assert.equal(updatedPayload.bot.face_blink_bar, " ");
    assert.equal(updatedPayload.bot.face_eye_animation, "none");
    assert.equal(updatedPayload.bot.face_eye_rotation_deg, 35);
    assert.equal(updatedPayload.bot.face_eye_count, 1);
    assert.equal(updatedPayload.bot.face_mouth_animation, "pulsate");
    assert.equal(updatedPayload.bot.face_mouth_coffee_pucker, 0);
    assert.equal(updatedPayload.bot.face_blink_scale, 0.85);
    assert.equal(updatedPayload.bot.face_blink_offset_x, 0.1);
    assert.equal(updatedPayload.bot.face_blink_offset_y, -0.12);

    const invalidEyeCount = await client.request(
      `/api/bots/${encodeURIComponent(botId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ faceEyeCount: 3 }),
      },
    );
    assert.equal(invalidEyeCount.status, 400);
    assert.match((await json(invalidEyeCount)).error, /eye count/i);

    const updatedDefault = await client.request("/api/default-bot", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        faceEyeCharacter: "8",
        faceEyeAnimation: "spin",
        faceEyeRotationDeg: -45,
        faceEyeCount: 2,
        faceMouthCharacter: "△",
        faceMouthAnimation: "wobble",
        faceBlinkScale: 1.25,
        faceBlinkOffsetX: -0.06,
        faceBlinkOffsetY: 0.08,
      }),
    });
    assert.equal(updatedDefault.status, 200);
    const defaultPayload = await json(updatedDefault);
    assert.equal(defaultPayload.defaultBot.prismDefaultBotFaceEyeAnimation, undefined);
    assert.equal(defaultPayload.defaultBot.prismDefaultBotFaceEyeRotationDeg, -45);
    assert.equal(defaultPayload.defaultBot.prismDefaultBotFaceEyeCount, 2);
    assert.equal(defaultPayload.defaultBot.prismDefaultBotFaceMouthAnimation, "wobble");
    assert.equal(
      defaultPayload.defaultBot.prismDefaultBotFaceMouthCoffeePucker,
      true
    );
    assert.equal(defaultPayload.defaultBot.prismDefaultBotFaceBlinkScale, 1.25);
    assert.equal(defaultPayload.defaultBot.prismDefaultBotFaceBlinkOffsetX, -0.06);
    assert.equal(defaultPayload.defaultBot.prismDefaultBotFaceBlinkOffsetY, 0.08);
  });

  it("runs a Zen chat through a deterministic provider without external egress", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "chat@example.com", password: "chat-password" })
    );
    assert.equal(register.status, 201);
    const userId = String((await json(register)).user.id);
    db.prepare("UPDATE users SET preferred_provider = 'openai' WHERE id = ?").run(
      userId,
    );

    const beforeCalls = fetchRecorder.calls.length;
    const response = await client.request(
      "/api/chat",
      jsonInit({
        message: "A deterministic integration turn",
        mode: "zen",
        preferredProvider: "local",
        incognito: true,
        ephemeralMessages: [],
      })
    );
    assert.equal(response.status, 200);
    const payload = await json(response);
    assert.equal(payload.ok, true);
    assert.equal(payload.conversation.messages.at(-1)?.content, deterministicReply);
    assert.ok(deterministicProvider.calls.length > 0);

    const chatFetches = fetchRecorder.calls.slice(beforeCalls);
    assert.ok(
      chatFetches.every(
        ({ input }) =>
          !/api\.openai\.com|api\.anthropic\.com|api\.elevenlabs\.io|qdrant/i.test(input)
      )
    );
  });

  it("sends ready bot Powers through the real Chat and Zen route", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "powered-chat@example.com", password: "powered-chat-password" })
    );
    assert.equal(register.status, 201);
    const name = "Respirator";
    const intent = "Mechanical breathing punctuates each answer.";
    const created = await client.request(
      "/api/bots",
      jsonInit({
        name: "Powered Vader",
        powers: [{
          version: 1,
          id: "respirator",
          name,
          intent,
          enabled: true,
          compileStatus: "ready",
          compiled: {
            version: 1,
            sourceHash: botPowerSourceHashV1(name, intent),
            selfCue: "Breathe mechanically during each answer.",
            observerCue: "Others hear a mechanical breath.",
            effects: [],
            ruleLabels: ["Mechanical breathing"],
          },
        }],
      })
    );
    assert.equal(created.status, 201);
    const botId = String((await json(created)).bot.id);
    const callStart = deterministicProvider.calls.length;

    const response = await client.request(
      "/api/chat",
      jsonInit({
        message: "Show me that this Power is active.",
        mode: "zen",
        facetBotId: botId,
        preferredProvider: "local",
        incognito: true,
        ephemeralMessages: [],
      })
    );

    assert.equal(response.status, 200);
    const prompt = deterministicProvider.calls
      .slice(callStart)
      .flat()
      .map((message) => message.content)
      .join("\n");
    assert.match(prompt, /Active Powers:/u);
    assert.match(prompt, /Respirator: Breathe mechanically during each answer/u);
  });

  it("forces an offline-only Zen bot out of Auto before any online provider is selected", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "zen-private@example.com", password: "zen-private-password" })
    );
    assert.equal(register.status, 201);
    const settings = await client.request("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        autoModeEnabled: true,
        autoFallbackChain: {
          v: 1,
          fallbacks: [
            { provider: "openai", model: "gpt-5-mini" },
            { provider: "anthropic", model: "claude-haiku-4-5" },
          ],
        },
      }),
    });
    assert.equal(settings.status, 200);
    const created = await client.request(
      "/api/bots",
      jsonInit({ name: "Private Zen", onlineEnabled: false })
    );
    assert.equal(created.status, 201);
    const botId = String((await json(created)).bot.id);
    const callStart = providerFactoryCalls.length;

    const response = await client.request(
      "/api/chat",
      jsonInit({
        message: "Keep this on my machine.",
        mode: "zen",
        facetBotId: botId,
        preferredProvider: "openai",
        responseMode: "auto",
        incognito: true,
        ephemeralMessages: [],
      })
    );
    assert.equal(response.status, 200);
    const payload = await json(response);
    assert.equal(payload.conversation.messages.at(-1)?.provider, "local");
    assert.equal(payload.autoRecovery, undefined);
    assert.equal(
      providerFactoryCalls
        .slice(callStart)
        .some((provider) => provider === "openai" || provider === "anthropic"),
      false
    );
  });

  it("gates Coffee action foley on a saved ONLINE turn and trusted sound kind", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "coffee-action-sfx@example.com", password: "coffee-sfx-password" })
    );
    assert.equal(register.status, 201);
    const userId = String((await json(register)).user.id);
    db.prepare(
      `UPDATE users
          SET voice_mode = 'english',
              english_voice_engine = 'elevenlabs',
              voice_effects_enabled = 1,
              voice_volume = 1
        WHERE id = ?`
    ).run(userId);
    const now = "2026-07-18T22:00:00.000Z";
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, conversation_mode, created_at, updated_at) VALUES (?, ?, ?, 'coffee', ?, ?)"
    ).run("coffee-action-sfx-conversation", userId, "Foley fixture", now, now);
    const insertMessage = db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, provider, created_at) VALUES (?, 'coffee-action-sfx-conversation', ?, 'assistant', ?, ?, ?)"
    );
    insertMessage.run(
      "coffee-action-sfx-local",
      userId,
      "*pours coffee into a mug*",
      "local",
      now
    );
    insertMessage.run(
      "coffee-action-sfx-online",
      userId,
      "*pours coffee into a mug*",
      "openai",
      now
    );

    const beforeCalls = fetchRecorder.calls.length;
    const localResponse = await client.request(
      "/api/coffee/action-sfx",
      jsonInit({ kind: "coffee_pour", messageId: "coffee-action-sfx-local" })
    );
    assert.equal(localResponse.status, 409);
    assert.equal(fetchRecorder.calls.length, beforeCalls);

    const unsupportedResponse = await client.request(
      "/api/coffee/action-sfx",
      jsonInit({ kind: "spoken_whisper", messageId: "coffee-action-sfx-online" })
    );
    assert.equal(unsupportedResponse.status, 400);
    assert.equal(fetchRecorder.calls.length, beforeCalls);

    const previousKey = config.elevenLabsApiKey;
    config.elevenLabsApiKey = "coffee-action-test-key";
    try {
      const onlineResponse = await client.request(
        "/api/coffee/action-sfx",
        jsonInit({ kind: "coffee_pour", messageId: "coffee-action-sfx-online" })
      );
      // The shared fetch recorder returns JSON, so the provider response is
      // intentionally rejected after proving that this authorized path made egress.
      assert.equal(onlineResponse.status, 502);
      assert.equal(fetchRecorder.calls.length, beforeCalls + 1);
      const providerCall = fetchRecorder.calls.at(-1);
      assert.match(providerCall?.input ?? "", /elevenlabs\.io\/v1\/sound-generation/u);
      const providerBody = JSON.parse(String(providerCall?.init?.body)) as Record<string, unknown>;
      assert.equal(providerBody.loop, false);
      assert.equal(providerBody.model_id, "eleven_text_to_sound_v2");
      assert.match(String(providerBody.text), /coffee into a ceramic mug/iu);
    } finally {
      config.elevenLabsApiKey = previousKey;
    }
  });

  it("keeps avatar SFX generation offline in LOCAL and requests a loop in ONLINE", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "avatar-sfx@example.com", password: "avatar-sfx-password" })
    );
    assert.equal(register.status, 201);
    const userId = String((await json(register)).user.id);
    db.prepare("UPDATE users SET preferred_provider = 'local' WHERE id = ?").run(userId);
    const beforeCalls = fetchRecorder.calls.length;
    const localResponse = await client.request(
      "/api/avatar/sfx/generate",
      jsonInit({ prompt: "A quiet clockwork breathing loop" })
    );
    assert.equal(localResponse.status, 409);
    assert.equal(fetchRecorder.calls.length, beforeCalls);

    db.prepare("UPDATE users SET preferred_provider = 'openai' WHERE id = ?").run(userId);
    const previousKey = config.elevenLabsApiKey;
    config.elevenLabsApiKey = "avatar-sfx-test-key";
    try {
      const onlineResponse = await client.request(
        "/api/avatar/sfx/generate",
        jsonInit({ prompt: "A quiet clockwork breathing loop" })
      );
      // The shared recorder returns JSON; reaching 502 proves the authorized
      // route attempted the provider call without accepting non-audio output.
      assert.equal(onlineResponse.status, 502);
      assert.equal(fetchRecorder.calls.length, beforeCalls + 1);
      const providerCall = fetchRecorder.calls.at(-1);
      assert.match(providerCall?.input ?? "", /elevenlabs\.io\/v1\/sound-generation/u);
      const providerBody = JSON.parse(String(providerCall?.init?.body)) as Record<string, unknown>;
      assert.equal(providerBody.loop, true);
      assert.equal(providerBody.duration_seconds, 4);
      assert.equal(providerBody.model_id, "eleven_text_to_sound_v2");
      assert.match(String(providerBody.text), /clockwork breathing loop/iu);
    } finally {
      config.elevenLabsApiKey = previousKey;
    }
  });

  it("synthesizes persisted LOCAL replies offline even when ElevenLabs is requested", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "voice-local@example.com", password: "voice-password" })
    );
    assert.equal(register.status, 201);
    const userId = String((await json(register)).user.id);
    db.prepare("UPDATE users SET voice_mode = 'english', english_voice_engine = 'elevenlabs' WHERE id = ?").run(
      userId
    );
    const now = "2026-07-11T18:00:00.000Z";
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, conversation_mode, created_at, updated_at) VALUES (?, ?, ?, 'chat', ?, ?)"
    ).run("voice-local-conversation", userId, "Voice privacy", now, now);
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, provider, created_at) VALUES (?, ?, ?, 'assistant', ?, 'local', ?)"
    ).run(
      "voice-local-message",
      "voice-local-conversation",
      userId,
      "*straightens the napkin edge* This local reply must stay on the device.",
      now
    );
    const spokenText = "This local reply must stay on the device.";

    const beforeCalls = fetchRecorder.calls.length;
    const response = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        messageId: "voice-local-message",
        spokenText,
        mode: "english",
        engine: "elevenlabs",
        explicitOnlineContext: true,
        profile: {
          v: 1,
          baseVoiceId: "voice-3",
          elevenLabsVoiceId: "configured-provider-voice",
          pitch: 0.1,
          warmth: 0.2,
          pace: 0,
          lilt: 0,
        },
      })
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-prism-voice-engine"), "builtin-local-fallback");
    assert.equal(response.headers.get("x-prism-voice-characters"), String(spokenText.length));
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(), "RIFF");

    const alignedResponse = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        messageId: "voice-local-message",
        spokenText,
        mode: "english",
        engine: "elevenlabs",
        explicitOnlineContext: true,
        includeAlignment: true,
        profile: {
          v: 1,
          baseVoiceId: "voice-3",
          elevenLabsVoiceId: "configured-provider-voice",
          pitch: 0.1,
          warmth: 0.2,
          pace: 0,
          lilt: 0,
        },
      })
    );
    assert.equal(alignedResponse.status, 200);
    assert.equal(alignedResponse.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(alignedResponse.headers.get("x-prism-voice-engine"), "builtin-local-fallback");
    assert.equal(alignedResponse.headers.get("x-prism-voice-alignment"), "none");
    const alignedPayload = await json(alignedResponse);
    assert.equal(alignedPayload.audioContentType, "audio/wav");
    assert.equal(alignedPayload.alignment, null);
    assert.equal(Buffer.from(alignedPayload.audioBase64, "base64").subarray(0, 4).toString(), "RIFF");
    const localFoley = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        messageId: "voice-local-message",
        listenerReactionFoley: "clears throat",
        mode: "english",
        engine: "elevenlabs",
        profile: {
          ...normalizeBotAudioVoiceProfileV1(undefined),
          elevenLabsVoiceId: "configured-provider-voice",
        },
      }),
    );
    assert.equal(localFoley.status, 409);
    assert.deepEqual(fetchRecorder.calls.slice(beforeCalls), []);
  });

  it("synthesizes listener vocal Foley only through an online ElevenLabs voice", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({
        username: "listener-foley@example.com",
        password: "voice-password",
      }),
    );
    assert.equal(register.status, 201);
    const userId = String((await json(register)).user.id);
    db.prepare(
      "UPDATE users SET voice_mode = 'english', english_voice_engine = 'elevenlabs' WHERE id = ?",
    ).run(userId);
    const now = "2026-07-19T18:00:00.000Z";
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, conversation_mode, created_at, updated_at) VALUES (?, ?, ?, 'chat', ?, ?)",
    ).run("listener-foley-conversation", userId, "Vocal Foley", now, now);
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, provider, created_at) VALUES (?, ?, ?, 'assistant', ?, 'openai', ?)",
    ).run(
      "listener-foley-message",
      "listener-foley-conversation",
      userId,
      "The other bot is speaking.",
      now,
    );

    config.elevenLabsApiKey = "test-elevenlabs-key";
    try {
      const beforeCalls = fetchRecorder.calls.length;
      const response = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          messageId: "listener-foley-message",
          listenerReactionFoley: "clears throat",
          mode: "english",
          engine: "elevenlabs",
          profile: {
            ...normalizeBotAudioVoiceProfileV1(undefined),
            elevenLabsVoiceId: "listener-provider-voice",
          },
        }),
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-prism-voice-engine"), "elevenlabs");
      const calls = fetchRecorder.calls.slice(beforeCalls);
      assert.equal(calls.length, 1);
      const providerBody = JSON.parse(String(calls[0]?.init?.body));
      assert.equal(providerBody.model_id, "eleven_v3");
      assert.equal(providerBody.text, "[clears throat] ...");

      const builtin = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          messageId: "listener-foley-message",
          listenerReactionFoley: "coughs",
          mode: "english",
          engine: "builtin",
        }),
      );
      assert.equal(builtin.status, 409);
      const invalid = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          messageId: "listener-foley-message",
          listenerReactionFoley: "sneezes",
          mode: "english",
          engine: "elevenlabs",
        }),
      );
      assert.equal(invalid.status, 400);
      assert.equal(fetchRecorder.calls.length, beforeCalls + 1);
    } finally {
      config.elevenLabsApiKey = "";
    }
  });

  it("authorizes Signal ElevenLabs tags from the saved episode mode", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({
        username: "signal-voice-context@example.com",
        password: "voice-password",
      }),
    );
    assert.equal(register.status, 201);
    const userId = String((await json(register)).user.id);
    const now = "2026-07-17T18:00:00.000Z";
    const insertBot = db.prepare(
      `INSERT INTO bots
         (id, user_id, name, system_prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insertBot.run(
      "signal-voice-host",
      userId,
      "Signal Voice Host",
      "An expressive interviewer.",
      now,
      now,
    );
    insertBot.run(
      "signal-voice-guest",
      userId,
      "Signal Voice Guest",
      "An expressive guest.",
      now,
      now,
    );
    const showResponse = await client.request(
      "/api/botcast/shows",
      jsonInit({ hostBotId: "signal-voice-host" }),
    );
    assert.equal(showResponse.status, 201);
    const showPayload = await json(showResponse);
    const showId = String(showPayload.show.id);
    const interruptionBridgeLine = String(
      showPayload.show.hostInterruptionLines[0],
    );

    db.prepare(
      "UPDATE users SET preferred_provider = 'openai', voice_mode = 'english', english_voice_engine = 'elevenlabs' WHERE id = ?",
    ).run(userId);
    const onlineEpisodeResponse = await client.request(
      `/api/botcast/shows/${encodeURIComponent(showId)}/episodes`,
      jsonInit({
        guestBotId: "signal-voice-guest",
        topic: "An online voice performance",
        preferredProvider: "openai",
      }),
    );
    assert.equal(onlineEpisodeResponse.status, 201);
    const onlineEpisodeId = String(
      (await json(onlineEpisodeResponse)).episode.id,
    );
    db.prepare(
      `INSERT INTO botcast_messages
         (id, user_id, episode_id, speaker_role, bot_id, content, voice_performance_text, created_at)
       VALUES (?, ?, ?, 'host', ?, ?, ?, ?)`,
    ).run(
      "signal-online-voice-message",
      userId,
      onlineEpisodeId,
      "signal-voice-host",
      "Welcome to the difficult part.",
      "[sighs] Welcome to the difficult part.",
      now,
    );
    db.prepare(
      `INSERT INTO botcast_messages
         (id, user_id, episode_id, speaker_role, bot_id, content, voice_performance_text, created_at)
       VALUES (?, ?, ?, 'host', ?, ?, NULL, ?)`,
    ).run(
      "signal-starred-voice-message",
      userId,
      onlineEpisodeId,
      "signal-voice-host",
      "That part surprised me. *burp* Excuse me.",
      now,
    );
    db.prepare(
      `INSERT INTO botcast_messages
         (id, user_id, episode_id, speaker_role, bot_id, content, voice_performance_text, created_at)
       VALUES (?, ?, ?, 'host', ?, ?, NULL, ?)`,
    ).run(
      "signal-online-mood-voice-message",
      userId,
      onlineEpisodeId,
      "signal-voice-host",
      "The room needs a little more care.",
      now,
    );
    const interruptedPrimaryText =
      "I was explaining—... okay, never mind, I guess.";
    db.prepare(
      `INSERT INTO botcast_messages
         (id, user_id, episode_id, speaker_role, bot_id, content, voice_performance_text, created_at)
       VALUES (?, ?, ?, 'host', ?, ?, NULL, ?)`,
    ).run(
      "signal-interrupted-voice-message",
      userId,
      onlineEpisodeId,
      "signal-voice-host",
      interruptedPrimaryText,
      now,
    );
    db.prepare(
      `INSERT INTO botcast_events
         (id, user_id, episode_id, sequence, kind, payload_json, occurred_at)
       VALUES (?, ?, ?,
         (SELECT COALESCE(MAX(sequence), 0) + 1 FROM botcast_events
           WHERE user_id = ? AND episode_id = ?),
         'listener_reaction', ?, ?)`,
    ).run(
      "signal-interrupted-voice-event",
      userId,
      onlineEpisodeId,
      userId,
      onlineEpisodeId,
      JSON.stringify({
        plan: {
          v: 1,
          name: "listenerReaction",
          speakerBotId: "signal-voice-host",
          listenerBotId: "signal-voice-guest",
          messageId: "signal-interrupted-voice-message",
          targetSource: "role",
          visualAction: "lean_in",
          spokenCue: "Hold on.",
          interjectionAttempt: true,
          interruptedSpeakerCue: "... okay, never mind, I guess.",
          interruptedSpeakerCuePlayback: "crosstalk",
          targetProgress: 0.6,
          seed: "signal-interrupted-voice",
          cameraCutEligible: true,
        },
      }),
      now,
    );

    // Replaying an ONLINE episode must stay authorized by the saved episode,
    // even after the account's current provider has returned to LOCAL.
    db.prepare("UPDATE users SET preferred_provider = 'local' WHERE id = ?").run(
      userId,
    );
    config.elevenLabsApiKey = "integration-elevenlabs-key";
    try {
      const beforeBridgeCalls = fetchRecorder.calls.length;
      const interruptionBridgeVoice = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          text: interruptionBridgeLine,
          signalEpisodeId: onlineEpisodeId,
          signalInterruptionBridge: true,
          mode: "english",
          engine: "elevenlabs",
          profile: {
            ...normalizeBotAudioVoiceProfileV1(undefined),
            elevenLabsVoiceId: "signal-provider-voice",
          },
        }),
      );
      assert.equal(interruptionBridgeVoice.status, 200);
      assert.equal(
        interruptionBridgeVoice.headers.get("x-prism-voice-engine"),
        "elevenlabs",
      );
      assert.equal(
        JSON.parse(
          String(fetchRecorder.calls[beforeBridgeCalls]?.init?.body),
        ).text,
        interruptionBridgeLine,
      );
      const invalidBridgeVoice = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          text: "A client-authored interruption.",
          signalEpisodeId: onlineEpisodeId,
          signalInterruptionBridge: true,
          mode: "english",
          engine: "elevenlabs",
        }),
      );
      assert.equal(invalidBridgeVoice.status, 400);
      const beforeOnlineCalls = fetchRecorder.calls.length;
      const onlineVoice = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          text: "Welcome to the difficult part.",
          signalMessageId: "signal-online-voice-message",
          elevenLabsText: "[growls] A client must not replace saved text.",
          mode: "english",
          engine: "elevenlabs",
          profile: {
            ...normalizeBotAudioVoiceProfileV1(undefined),
            elevenLabsVoiceId: "signal-provider-voice",
          },
        }),
      );
      assert.equal(onlineVoice.status, 200);
      assert.equal(
        onlineVoice.headers.get("x-prism-voice-engine"),
        "elevenlabs",
      );
      const onlineCalls = fetchRecorder.calls.slice(beforeOnlineCalls);
      assert.equal(onlineCalls.length, 1);
      const providerBody = JSON.parse(String(onlineCalls[0]?.init?.body));
      assert.equal(providerBody.model_id, "eleven_v3");
      assert.equal(
        providerBody.text,
        "[sighs] Welcome to the difficult part.",
      );
      const beforeStarredCalls = fetchRecorder.calls.length;
      const starredVoice = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          signalMessageId: "signal-starred-voice-message",
          elevenLabsText: "client presence flag",
          mode: "english",
          engine: "elevenlabs",
          profile: {
            ...normalizeBotAudioVoiceProfileV1(undefined),
            elevenLabsVoiceId: "signal-provider-voice",
          },
        }),
      );
      assert.equal(starredVoice.status, 200);
      assert.equal(
        JSON.parse(
          String(fetchRecorder.calls[beforeStarredCalls]?.init?.body),
        ).text,
        "That part surprised me. [burps] Excuse me.",
      );
      const beforeInterruptedPrimaryCalls = fetchRecorder.calls.length;
      const interruptedPrimaryVoice = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          signalMessageId: "signal-interrupted-voice-message",
          mode: "english",
          engine: "elevenlabs",
          profile: {
            ...normalizeBotAudioVoiceProfileV1(undefined),
            elevenLabsVoiceId: "signal-provider-voice",
          },
        }),
      );
      assert.equal(interruptedPrimaryVoice.status, 200);
      const interruptedPrimaryCalls = fetchRecorder.calls.slice(
        beforeInterruptedPrimaryCalls,
      );
      assert.equal(interruptedPrimaryCalls.length, 1);
      assert.equal(
        JSON.parse(String(interruptedPrimaryCalls[0]?.init?.body)).text,
        "I was explaining—",
      );
      const beforeMoodCalls = fetchRecorder.calls.length;
      const onlineMoodVoice = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          signalMessageId: "signal-online-mood-voice-message",
          mode: "english",
          engine: "elevenlabs",
          moodKey: "guarded",
          profile: {
            ...normalizeBotAudioVoiceProfileV1(undefined),
            elevenLabsVoiceId: "signal-provider-voice",
          },
        }),
      );
      assert.equal(onlineMoodVoice.status, 200);
      const moodCalls = fetchRecorder.calls.slice(beforeMoodCalls);
      assert.equal(moodCalls.length, 1);
      const moodProviderBody = JSON.parse(String(moodCalls[0]?.init?.body));
      assert.equal(moodProviderBody.model_id, "eleven_v3");
      assert.equal(
        moodProviderBody.text,
        "[reserved] The room needs a little more care.",
      );
      const beforeOnlineReactionCalls = fetchRecorder.calls.length;
      const onlineReactionVoice = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          signalMessageId: "signal-online-voice-message",
          listenerReactionText: "mm-hm",
          mode: "english",
          engine: "elevenlabs",
          profile: {
            ...normalizeBotAudioVoiceProfileV1(undefined),
            elevenLabsVoiceId: "signal-provider-voice",
          },
        }),
      );
      assert.equal(onlineReactionVoice.status, 200);
      assert.equal(
        onlineReactionVoice.headers.get("x-prism-voice-engine"),
        "elevenlabs",
      );
      const reactionCalls = fetchRecorder.calls.slice(
        beforeOnlineReactionCalls,
      );
      assert.equal(reactionCalls.length, 1);
      assert.equal(
        JSON.parse(String(reactionCalls[0]?.init?.body)).text,
        "mm-hm",
      );
      const beforeInterruptedSpeakerCalls = fetchRecorder.calls.length;
      const interruptedSpeakerVoice = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          signalMessageId: "signal-online-voice-message",
          interruptedSpeakerReactionText: "... okay, never mind, I guess.",
          mode: "english",
          engine: "elevenlabs",
          profile: {
            ...normalizeBotAudioVoiceProfileV1(undefined),
            elevenLabsVoiceId: "signal-provider-voice",
          },
        }),
      );
      assert.equal(interruptedSpeakerVoice.status, 200);
      const interruptedSpeakerCalls = fetchRecorder.calls.slice(
        beforeInterruptedSpeakerCalls,
      );
      assert.equal(interruptedSpeakerCalls.length, 1);
      assert.equal(
        JSON.parse(String(interruptedSpeakerCalls[0]?.init?.body)).text,
        "... okay, never mind, I guess.",
      );
      const conversationalReaction = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          signalMessageId: "signal-online-voice-message",
          listenerReactionText: "go on",
          mode: "english",
          engine: "builtin",
        }),
      );
      assert.equal(conversationalReaction.status, 200);
      const invalidReaction = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          signalMessageId: "signal-online-voice-message",
          listenerReactionText: "Absolutely",
          mode: "english",
          engine: "elevenlabs",
        }),
      );
      assert.equal(invalidReaction.status, 400);

      const muteName = "Mute";
      const muteIntent = "Never talks. Ever.";
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = ? AND user_id = ?").run(
        JSON.stringify([{
          version: 1,
          id: "legacy-signal-mute",
          name: muteName,
          intent: muteIntent,
          enabled: true,
          compileStatus: "ready",
          compiled: {
            version: 1,
            sourceHash: botPowerSourceHashV1(muteName, muteIntent),
            selfCue: "Silence is golden.",
            observerCue: "He rarely speaks.",
            effects: [],
            ruleLabels: ["Absolute Silence"],
          },
        }]),
        "signal-voice-host",
        userId,
      );
      const mutedEpisodeResponse = await client.request(
        `/api/botcast/shows/${encodeURIComponent(showId)}/episodes`,
        jsonInit({
          guestBotId: "signal-voice-guest",
          topic: "A completely silent host",
          preferredProvider: "openai",
        }),
      );
      assert.equal(mutedEpisodeResponse.status, 201);
      const mutedEpisodeId = String(
        (await json(mutedEpisodeResponse)).episode.id,
      );
      db.prepare("UPDATE bots SET powers_json = '[]' WHERE id = ? AND user_id = ?").run(
        "signal-voice-host",
        userId,
      );
      db.prepare(
        `INSERT INTO botcast_messages
           (id, user_id, episode_id, speaker_role, bot_id, content, voice_performance_text, created_at)
         VALUES (?, ?, ?, 'host', ?, ?, NULL, ?)`,
      ).run(
        "signal-muted-host-message",
        userId,
        mutedEpisodeId,
        "signal-voice-host",
        "A client must never make this audible.",
        now,
      );
      db.prepare(
        `INSERT INTO botcast_messages
           (id, user_id, episode_id, speaker_role, bot_id, content, voice_performance_text, created_at)
         VALUES (?, ?, ?, 'guest', ?, ?, NULL, ?)`,
      ).run(
        "signal-muted-host-listening",
        userId,
        mutedEpisodeId,
        "signal-voice-guest",
        "Can the host react to this?",
        now,
      );
      const callsBeforeMutedRequests = fetchRecorder.calls.length;
      const mutedHostVoice = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          signalMessageId: "signal-muted-host-message",
          mode: "english",
          engine: "elevenlabs",
        }),
      );
      assert.equal(mutedHostVoice.status, 409);
      const mutedHostReaction = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          signalMessageId: "signal-muted-host-listening",
          listenerReactionText: "mm-hm",
          mode: "english",
          engine: "elevenlabs",
        }),
      );
      assert.equal(mutedHostReaction.status, 409);
      const mutedHostInterruption = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          text: interruptionBridgeLine,
          signalEpisodeId: mutedEpisodeId,
          signalInterruptionBridge: true,
          mode: "english",
          engine: "elevenlabs",
        }),
      );
      const mutedHostInterruptionPayload = await json(mutedHostInterruption);
      assert.equal(
        mutedHostInterruption.status,
        409,
        JSON.stringify(mutedHostInterruptionPayload),
      );
      assert.equal(fetchRecorder.calls.length, callsBeforeMutedRequests);

      const restoredHostLines = await client.request(
        `/api/botcast/shows/${encodeURIComponent(showId)}`,
        {
          ...jsonInit({ hostInterruptionLines: [interruptionBridgeLine] }),
          method: "PATCH",
        },
      );
      assert.equal(restoredHostLines.status, 200);

      const localEpisodeResponse = await client.request(
        `/api/botcast/shows/${encodeURIComponent(showId)}/episodes`,
        jsonInit({
          guestBotId: "signal-voice-guest",
          topic: "A private local voice performance",
          preferredProvider: "local",
        }),
      );
      assert.equal(localEpisodeResponse.status, 201);
      const localEpisodeId = String(
        (await json(localEpisodeResponse)).episode.id,
      );
      const beforeLocalBridgeCalls = fetchRecorder.calls.length;
      const localInterruptionBridgeVoice = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          text: interruptionBridgeLine,
          signalEpisodeId: localEpisodeId,
          signalInterruptionBridge: true,
          mode: "english",
          engine: "elevenlabs",
          profile: {
            ...normalizeBotAudioVoiceProfileV1(undefined),
            elevenLabsVoiceId: "signal-provider-voice",
          },
        }),
      );
      assert.equal(localInterruptionBridgeVoice.status, 200);
      assert.equal(
        localInterruptionBridgeVoice.headers.get("x-prism-voice-engine"),
        "builtin-local-fallback",
      );
      assert.equal(fetchRecorder.calls.length, beforeLocalBridgeCalls);
      db.prepare(
        `INSERT INTO botcast_messages
           (id, user_id, episode_id, speaker_role, bot_id, content, voice_performance_text, created_at)
         VALUES (?, ?, ?, 'host', ?, ?, ?, ?)`,
      ).run(
        "signal-local-voice-message",
        userId,
        localEpisodeId,
        "signal-voice-host",
        "Keep this reaction on the device.",
        "[exhales] Keep this reaction on the device.",
        now,
      );
      const beforeLocalCalls = fetchRecorder.calls.length;
      const localVoice = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          text: "Keep this reaction on the device.",
          signalMessageId: "signal-local-voice-message",
          elevenLabsText: "[exhales] Keep this reaction on the device.",
          mode: "english",
          engine: "elevenlabs",
          profile: {
            ...normalizeBotAudioVoiceProfileV1(undefined),
            elevenLabsVoiceId: "signal-provider-voice",
          },
        }),
      );
      assert.equal(localVoice.status, 200);
      assert.equal(
        localVoice.headers.get("x-prism-voice-engine"),
        "builtin-local-fallback",
      );
      assert.equal(fetchRecorder.calls.length, beforeLocalCalls);
      const localReactionVoice = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          signalMessageId: "signal-local-voice-message",
          listenerReactionText: "hmm",
          mode: "english",
          engine: "elevenlabs",
          profile: {
            ...normalizeBotAudioVoiceProfileV1(undefined),
            elevenLabsVoiceId: "signal-provider-voice",
          },
        }),
      );
      assert.equal(localReactionVoice.status, 200);
      assert.equal(
        localReactionVoice.headers.get("x-prism-voice-engine"),
        "builtin-local-fallback",
      );
      assert.equal(fetchRecorder.calls.length, beforeLocalCalls);
    } finally {
      config.elevenLabsApiKey = "";
    }

  });

  it("keeps English local and lets only saved Premium use ElevenLabs", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({
        username: "voice-online-fallback@example.com",
        password: "voice-password",
      })
    );
    assert.equal(register.status, 201);
    const userId = String((await json(register)).user.id);
    const initialSettings = await client.request("/api/settings");
    assert.equal(initialSettings.status, 200);
    const initialVoiceSettings = (await json(initialSettings)).settings;
    assert.equal(initialVoiceSettings.englishVoiceEngine, "builtin");
    assert.equal(initialVoiceSettings.operatingSystemVoicesEnabled, false);
    const capabilities = await client.request("/api/voices/capabilities");
    assert.equal(capabilities.status, 200);
    const builtinEnglish = (await json(capabilities)).capabilities.builtinEnglish;
    assert.equal(builtinEnglish.model, "kokoro-82m-q8");
    assert.deepEqual(
      builtinEnglish.pack.map((voice: { name: string }) => voice.name),
      [
        "Heart",
        "Bella",
        "Michael",
        "Emma",
        "George",
        "Aoede",
        "Kore",
        "Nicole",
        "Sarah",
        "Fenrir",
        "Puck",
        "Fable",
      ],
    );
    const enableSystemVoices = await client.request(
      "/api/settings",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operatingSystemVoicesEnabled: true }),
      },
    );
    assert.equal(enableSystemVoices.status, 200);
    assert.equal(
      (await json(enableSystemVoices)).settings.operatingSystemVoicesEnabled,
      true,
    );
    db.prepare("UPDATE users SET preferred_provider = 'openai' WHERE id = ?").run(
      userId
    );

    const beforeCalls = fetchRecorder.calls.length;
    config.elevenLabsApiKey = "integration-elevenlabs-key";
    try {
      const response = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          text: "Keep using the PRISM voice pack without an online voice override.",
          mode: "english",
          engine: "elevenlabs",
          explicitOnlineContext: true,
          profile: {
            ...normalizeBotAudioVoiceProfileV1(undefined),
            elevenLabsVoiceId: "premium-provider-voice",
          },
        })
      );

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-prism-voice-engine"), "builtin");
      assert.equal(
        Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(),
        "RIFF"
      );
      assert.deepEqual(fetchRecorder.calls.slice(beforeCalls), []);

      db.prepare(
        "UPDATE users SET voice_mode = 'english', english_voice_engine = 'elevenlabs' WHERE id = ?",
      ).run(userId);
      const premiumResponse = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          text: "Use Premium only after the saved choice allows it.",
          mode: "english",
          engine: "elevenlabs",
          explicitOnlineContext: true,
          profile: {
            ...normalizeBotAudioVoiceProfileV1(undefined),
            elevenLabsVoiceId: "premium-provider-voice",
          },
        }),
      );
      assert.equal(premiumResponse.status, 200);
      assert.equal(
        premiumResponse.headers.get("x-prism-voice-engine"),
        "elevenlabs",
      );
      assert.equal(fetchRecorder.calls.length, beforeCalls + 1);
      assert.match(
        fetchRecorder.calls.at(-1)?.input ?? "",
        /text-to-speech\/premium-provider-voice\/stream/,
      );
    } finally {
      config.elevenLabsApiKey = "";
    }
  });

  it("falls back locally for Premium provider failures but keeps previews strict", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({
        username: "voice-premium-fallback@example.com",
        password: "voice-password",
      }),
    );
    assert.equal(register.status, 201);
    const userId = String((await json(register)).user.id);
    db.prepare(
      "UPDATE users SET preferred_provider = 'openai', voice_mode = 'english', english_voice_engine = 'elevenlabs' WHERE id = ?",
    ).run(userId);
    const profile = {
      ...normalizeBotAudioVoiceProfileV1(undefined),
      elevenLabsVoiceId: "quota-provider-voice",
      systemVoiceName: "Fred",
    };
    const quotaFailure = () =>
      new Response(
        JSON.stringify({
          detail: {
            code: "quota_exceeded",
            message: "This request exceeds the available voice credits.",
          },
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    config.elevenLabsApiKey = "integration-elevenlabs-key";
    fetchRecorder.setResponse(quotaFailure());
    try {
      const beforeBuiltinCalls = builtinVoiceCalls.length;
      const conversation = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          text: "Keep this ordinary Premium line audible.",
          mode: "english",
          engine: "elevenlabs",
          explicitOnlineContext: true,
          profile,
        }),
      );
      assert.equal(conversation.status, 200);
      assert.equal(
        conversation.headers.get("x-prism-voice-engine"),
        "builtin-provider-fallback",
      );
      assert.equal(builtinVoiceCalls.length, beforeBuiltinCalls + 1);
      assert.equal(builtinVoiceCalls.at(-1)?.systemVoiceName, "Fred");

      fetchRecorder.setResponse(quotaFailure());
      const preview = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          text: "Report the Premium preview failure honestly.",
          mode: "english",
          engine: "elevenlabs",
          explicitOnlineContext: true,
          explicitVoicePreview: true,
          profile,
        }),
      );
      assert.equal(preview.status, 429);
      assert.match(String((await json(preview)).error), /voice credits/i);
      assert.equal(builtinVoiceCalls.length, beforeBuiltinCalls + 1);
    } finally {
      config.elevenLabsApiKey = "";
      fetchRecorder.setResponse(new Response("{}", { status: 200 }));
    }
  });

  it("uses the selected ElevenLabs voice for an explicit Avatar Studio preview", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({
        username: "voice-avatar-preview@example.com",
        password: "voice-password",
      }),
    );
    assert.equal(register.status, 201);
    const userId = String((await json(register)).user.id);
    db.prepare(
      "UPDATE users SET preferred_provider = 'openai', voice_mode = 'english', english_voice_engine = 'elevenlabs' WHERE id = ?",
    ).run(userId);

    const beforeCalls = fetchRecorder.calls.length;
    config.elevenLabsApiKey = "integration-elevenlabs-key";
    try {
      const response = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          text: "Use the active Avatar Studio provider voice.",
          mode: "english",
          engine: "elevenlabs",
          explicitOnlineContext: true,
          explicitVoicePreview: true,
          profile: {
            ...normalizeBotAudioVoiceProfileV1(undefined),
            elevenLabsVoiceId: "avatar-preview-provider-voice",
          },
        }),
      );

      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get("x-prism-voice-engine"),
        "elevenlabs",
      );
      const providerCalls = fetchRecorder.calls.slice(beforeCalls);
      assert.equal(providerCalls.length, 1);
      assert.match(
        providerCalls[0]?.input ?? "",
        /text-to-speech\/avatar-preview-provider-voice\/stream/,
      );
    } finally {
      config.elevenLabsApiKey = "";
    }

    const beforeFallbackCalls = builtinVoiceCalls.length;
    const conversationFallback = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        text: "Keep ordinary playback audible when the provider is unavailable.",
        mode: "english",
        engine: "elevenlabs",
        explicitOnlineContext: true,
        profile: {
          ...normalizeBotAudioVoiceProfileV1(undefined),
          elevenLabsVoiceId: "avatar-preview-provider-voice",
          systemVoiceName: "Fred",
        },
      }),
    );
    assert.equal(conversationFallback.status, 200);
    assert.equal(
      conversationFallback.headers.get("x-prism-voice-engine"),
      "builtin-provider-fallback",
    );
    assert.equal(builtinVoiceCalls.length, beforeFallbackCalls + 1);

    const explicitPreview = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        text: "Do not silently substitute Fred for Sheldon.",
        mode: "english",
        engine: "elevenlabs",
        explicitOnlineContext: true,
        explicitVoicePreview: true,
        profile: {
          ...normalizeBotAudioVoiceProfileV1(undefined),
          elevenLabsVoiceId: "avatar-preview-provider-voice",
          systemVoiceName: "Fred",
        },
      }),
    );
    assert.equal(explicitPreview.status, 503);
    assert.match(
      String((await json(explicitPreview)).error),
      /ElevenLabs is not connected/,
    );
    assert.equal(builtinVoiceCalls.length, beforeFallbackCalls + 1);
  });

  it("persists hidden spoken names and scopes self-referral to the speaking bot", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({
        username: "bot-pronunciation@example.com",
        password: "voice-password",
      }),
    );
    assert.equal(register.status, 201);

    const created = await client.request(
      "/api/bots",
      jsonInit({
        name: "Light Yagami",
        namePronunciation: "  Light   Yah-gah-mee  ",
        selfReferral: "  Light  ",
      }),
    );
    assert.equal(created.status, 201);
    const createdBot = (await json(created)).bot;
    assert.equal(createdBot.name, "Light Yagami");
    assert.equal(createdBot.name_pronunciation, "Light Yah-gah-mee");
    assert.equal(createdBot.self_referral, "Light");

    const listed = await client.request("/api/bots");
    assert.equal(listed.status, 200);
    const listedBot = (await json(listed)).bots.find(
      (bot: { id?: string }) => bot.id === createdBot.id,
    );
    assert.equal(listedBot.name, "Light Yagami");
    assert.equal(listedBot.name_pronunciation, "Light Yah-gah-mee");
    assert.equal(listedBot.self_referral, "Light");

    const beforeSelfVoiceCount = builtinVoiceTexts.length;
    const selfVoice = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        text: "Light Yagami will answer.",
        speakerBotId: createdBot.id,
        mode: "english",
        engine: "builtin",
      }),
    );
    assert.equal(selfVoice.status, 200);
    assert.equal(builtinVoiceTexts.length, beforeSelfVoiceCount + 1);
    assert.equal(builtinVoiceTexts.at(-1), "Light will answer.");

    const updated = await client.request(`/api/bots/${createdBot.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ namePronunciation: "Light Ya-ga-mi", selfReferral: "   " }),
    });
    assert.equal(updated.status, 200);
    const updatedBot = (await json(updated)).bot;
    assert.equal(updatedBot.name_pronunciation, "Light Ya-ga-mi");
    assert.equal(updatedBot.self_referral, "");

    const beforeVoiceCount = builtinVoiceTexts.length;
    const response = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        text: "Ask Light Yagami now.",
        mode: "english",
        engine: "builtin",
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(builtinVoiceTexts.length, beforeVoiceCount + 1);
    assert.equal(builtinVoiceTexts.at(-1), "Ask Light Ya-ga-mi now.");

    const blankSelfVoice = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        text: "Light Yagami will answer.",
        speakerBotId: createdBot.id,
        mode: "english",
        engine: "builtin",
      }),
    );
    assert.equal(blankSelfVoice.status, 200);
    assert.equal(builtinVoiceTexts.at(-1), "Light Yagami will answer.");
  });

  it("preserves legacy ElevenLabs slot and account mappings during synthesis", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({
        username: "voice-legacy-bank@example.com",
        password: "voice-password",
      })
    );
    assert.equal(register.status, 201);
    const userId = String((await json(register)).user.id);
    db.prepare(
      "UPDATE users SET preferred_provider = 'openai', voice_mode = 'english', english_voice_engine = 'elevenlabs', default_elevenlabs_voice_id = ?, elevenlabs_voice_bank = ? WHERE id = ?"
    ).run(
      "legacy-default-provider-voice",
      JSON.stringify({ "voice-1": "legacy-provider-voice" }),
      userId,
    );

    const beforeCalls = fetchRecorder.calls.length;
    config.elevenLabsApiKey = "integration-elevenlabs-key";
    try {
      const response = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          text: "Keep the voice I selected before the update.",
          mode: "english",
          engine: "elevenlabs",
          explicitOnlineContext: true,
          profile: {
            v: 1,
            baseVoiceId: "voice-1",
            pitch: 0,
            warmth: 0,
            pace: 0,
            lilt: 0,
          },
        })
      );

      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get("x-prism-voice-engine"),
        "elevenlabs"
      );
      assert.match(
        fetchRecorder.calls.at(-1)?.input ?? "",
        /text-to-speech\/legacy-provider-voice\/stream/,
      );

      const defaultVoiceResponse = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          text: "Keep my former account default too.",
          mode: "english",
          engine: "elevenlabs",
          explicitOnlineContext: true,
          profile: {
            ...normalizeBotAudioVoiceProfileV1(undefined),
            baseVoiceId: "voice-2",
          },
        }),
      );
      assert.equal(defaultVoiceResponse.status, 200);
      assert.equal(
        defaultVoiceResponse.headers.get("x-prism-voice-engine"),
        "elevenlabs",
      );
      assert.match(
        fetchRecorder.calls.at(-1)?.input ?? "",
        /text-to-speech\/legacy-default-provider-voice\/stream/,
      );

      const selectedVoiceResponse = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          text: "Use the voice selected for this bot.",
          mode: "english",
          engine: "elevenlabs",
          explicitOnlineContext: true,
          profile: {
            ...normalizeBotAudioVoiceProfileV1(undefined),
            elevenLabsVoiceId: "chosen-provider-voice",
          },
        })
      );
      assert.equal(selectedVoiceResponse.status, 200);
      assert.equal(
        selectedVoiceResponse.headers.get("x-prism-voice-engine"),
        "elevenlabs"
      );
      const providerCalls = fetchRecorder.calls.slice(beforeCalls);
      assert.equal(providerCalls.length, 3);
      assert.match(
        providerCalls.at(-1)?.input ?? "",
        /text-to-speech\/chosen-provider-voice\/stream/
      );
    } finally {
      config.elevenLabsApiKey = "";
    }
  });

  it("honors saved OS voices even when the new voice catalog opt-in is off", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({
        username: "voice-legacy-os@example.com",
        password: "voice-password",
      }),
    );
    assert.equal(register.status, 201);
    const userId = String((await json(register)).user.id);
    db.prepare(
      "UPDATE users SET operating_system_voices_enabled = 0, default_system_voice_name = ? WHERE id = ?",
    ).run("Alex", userId);

    const beforeCalls = builtinVoiceCalls.length;
    const response = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        text: "Keep my saved Mac voice.",
        mode: "english",
        engine: "builtin",
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(builtinVoiceCalls.length, beforeCalls + 1);
    assert.deepEqual(builtinVoiceCalls.at(-1), {
      text: "Keep my saved Mac voice.",
      systemVoiceName: "Alex",
      allowOperatingSystemVoices: true,
    });

    const explicitResponse = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        text: "Keep this bot's saved Mac voice.",
        mode: "english",
        engine: "builtin",
        profile: {
          ...normalizeBotAudioVoiceProfileV1(undefined),
          systemVoiceName: "Samantha",
        },
      }),
    );
    assert.equal(explicitResponse.status, 200);
    assert.deepEqual(builtinVoiceCalls.at(-1), {
      text: "Keep this bot's saved Mac voice.",
      systemVoiceName: "Samantha",
      allowOperatingSystemVoices: true,
    });
  });

  it("synthesizes a private reply by message id without persisting it", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "voice-private@example.com", password: "voice-password" })
    );
    assert.equal(register.status, 201);
    const userId = String((await json(register)).user.id);
    const messageId = "voice-private-message";
    const spokenText = "This private reply exists only in the live envelope.";

    const untrustedMissingMessage = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        messageId,
        spokenText,
        mode: "english",
        engine: "builtin",
      })
    );
    assert.equal(untrustedMissingMessage.status, 404);

    const response = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        messageId,
        spokenText,
        ephemeralMessage: true,
        mode: "english",
        engine: "builtin",
        includeAlignment: true,
      })
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-prism-voice-engine"), "builtin");
    assert.equal(
      response.headers.get("x-prism-voice-characters"),
      String(spokenText.length)
    );
    assert.equal(
      db.prepare("SELECT 1 AS found FROM messages WHERE id = ? AND user_id = ?")
        .get(messageId, userId),
      undefined
    );
  });

  it("synthesizes Babble through a local voice and keeps Bottish client-procedural", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "voice-babble@example.com", password: "voice-password" })
    );
    assert.equal(register.status, 201);
    const beforeCalls = fetchRecorder.calls.length;
    const response = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        text: "Hello, curious robot 42!",
        mode: "babble",
        engine: "elevenlabs",
        explicitOnlineContext: true,
        seed: "babble-integration",
        profile: {
          v: 2,
          enabled: true,
          baseVoiceId: "voice-1",
          pitch: 0.1,
          warmth: 0,
          pace: 0,
          lilt: 0.2,
          bottishTone: 0.5,
          volume: 1,
          texture: {
            preset: "clean",
            amount: 0,
            bandwidth: 1,
            noise: 0,
            instability: 0,
            distortion: 0,
            damage: 0,
          },
        },
      })
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-prism-voice-engine"), "builtin-babble");
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(), "RIFF");
    assert.deepEqual(fetchRecorder.calls.slice(beforeCalls), []);
    const bottishResponse = await client.request(
      "/api/voices/synthesize",
      jsonInit({ text: "Hello robot", mode: "bottish", engine: "builtin" })
    );
    assert.equal(bottishResponse.status, 409);
    assert.equal((await json(bottishResponse)).code, "procedural-client-only");
    assert.deepEqual(fetchRecorder.calls.slice(beforeCalls), []);
    const unavailableResponse = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        text: "Try again shortly",
        mode: "babble",
        engine: "builtin",
        profile: {
          ...normalizeBotAudioVoiceProfileV1(undefined),
          systemVoiceName: "Unavailable Test",
        },
      })
    );
    assert.equal(unavailableResponse.status, 503);
    assert.equal((await json(unavailableResponse)).code, "babble-system-unavailable");
  });

  it("ignores legacy per-bot model fields on create and update", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "inherited-models@example.com", password: "model-password" })
    );
    assert.equal(register.status, 201);

    const created = await client.request(
      "/api/bots",
      jsonInit({
        name: "Inherited model bot",
        model: "legacy-default",
        localModel: "legacy-local",
        onlineModel: "legacy-online",
        localImageModel: "legacy-local-image",
        openaiImageModel: "legacy-online-image",
      })
    );
    assert.equal(created.status, 201);
    const createdPayload = await json(created);
    const botId = String(createdPayload.bot.id);
    assert.deepEqual(
      [
        createdPayload.bot.model,
        createdPayload.bot.local_model,
        createdPayload.bot.online_model,
        createdPayload.bot.local_image_model,
        createdPayload.bot.openai_image_model,
      ],
      [null, null, null, null, null]
    );

    const updated = await client.request(`/api/bots/${encodeURIComponent(botId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        color: "#123456",
        model: "patched-default",
        localModel: "patched-local",
        onlineModel: "patched-online",
        localImageModel: "patched-local-image",
        openaiImageModel: "patched-online-image",
      }),
    });
    assert.equal(updated.status, 200);
    const row = db
      .prepare(
        `SELECT color, model, local_model, online_model, local_image_model, openai_image_model
           FROM bots WHERE id = ?`
      )
      .get(botId) as {
        color: string | null;
        model: string | null;
        local_model: string | null;
        online_model: string | null;
        local_image_model: string | null;
        openai_image_model: string | null;
      };
    assert.equal(row.color, "#123456");
    assert.deepEqual(
      [
        row.model,
        row.local_model,
        row.online_model,
        row.local_image_model,
        row.openai_image_model,
      ],
      [null, null, null, null, null]
    );
  });

  it("persists applied avatar details immediately and supports clearing them", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "avatar-details@example.com", password: "details-password" })
    );
    assert.equal(register.status, 201);
    const created = await client.request(
      "/api/bots",
      jsonInit({ name: "Detailed bot" })
    );
    assert.equal(created.status, 201);
    const botId = String((await json(created)).bot.id);
    const details = {
      version: 1,
      screen: {
        stamps: [
          { id: "round-glasses", offsetX: 2, offsetY: -1, scalePct: 105 },
        ],
        paintMaskBase64: null,
      },
    };

    const updated = await client.request(`/api/bots/${botId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ avatarDetails: details }),
    });
    assert.equal(updated.status, 200);
    assert.deepEqual((await json(updated)).bot.avatarDetails, details);

    const reopened = await client.request("/api/bots");
    assert.equal(reopened.status, 200);
    assert.deepEqual(
      (await json(reopened)).bots.find((bot: { id: string }) => bot.id === botId)
        ?.avatarDetails,
      details
    );

    const cleared = await client.request(`/api/bots/${botId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ avatarDetails: null }),
    });
    assert.equal(cleared.status, 200);
    assert.equal((await json(cleared)).bot.avatarDetails, null);
  });

  it("persists authored bot voices separately from user overrides", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "voice-profile@example.com", password: "voice-password" })
    );
    assert.equal(register.status, 201);
    const authored = {
      v: 1,
      baseVoiceId: "voice-4",
      pitch: 0.2,
      warmth: -0.1,
      pace: 0.15,
      lilt: 0.35,
    };
    const created = await client.request(
      "/api/bots",
      jsonInit({ name: "Voiced bot", authoredAudioVoiceProfile: authored })
    );
    assert.equal(created.status, 201);
    const createdPayload = await json(created);
    assert.deepEqual(
      createdPayload.bot.authored_audio_voice_profile,
      normalizeBotAudioVoiceProfileV1(authored)
    );
    assert.equal(createdPayload.bot.audio_voice_profile_override, null);

    const generatedPreview = await client.request(
      "/api/voices/preview-line",
      jsonInit({
        botId: createdPayload.bot.id,
        botName: "Voiced bot",
        systemPrompt: "A careful voice tester.",
      })
    );
    assert.equal(generatedPreview.status, 200);
    const generatedPreviewLine = (await json(generatedPreview)).line;
    assert.equal(typeof generatedPreviewLine, "string");
    assert.equal(
      (db.prepare("SELECT voice_preview_line FROM bots WHERE id = ?")
        .get(createdPayload.bot.id) as { voice_preview_line?: string }).voice_preview_line,
      generatedPreviewLine
    );

    const cachedPreview = await client.request(
      "/api/voices/preview-line",
      jsonInit({ botId: createdPayload.bot.id, botName: "Voiced bot" })
    );
    assert.equal((await json(cachedPreview)).line, generatedPreviewLine);

    const capabilitiesResponse = await client.request("/api/voices/capabilities");
    assert.equal(capabilitiesResponse.status, 200);
    const capabilitiesPayload = await json(capabilitiesResponse);
    const systemVoices = capabilitiesPayload.capabilities?.builtinEnglish?.voices;
    assert.equal(Array.isArray(systemVoices), true);
    assert.equal(
      systemVoices.every((voice: unknown) => {
        const record = voice as { name?: unknown; locale?: unknown };
        return typeof record.name === "string" && typeof record.locale === "string";
      }),
      true
    );

    const override = {
      baseVoiceId: "voice-2",
      pitch: -0.25,
      warmth: authored.warmth,
      pace: authored.pace,
      lilt: -0.4,
      systemVoiceName: "Alex",
      elevenLabsVoiceId: "eleven-voice-id",
      elevenLabsVoiceIdOverride: "portable-exact-voice-id",
      elevenLabsEffect: "deep-space",
      elevenLabsDirection: "warm, conspiratorial",
    };
    const updated = await client.request(`/api/bots/${createdPayload.bot.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ audioVoiceProfileOverride: override }),
    });
    assert.equal(updated.status, 200);
    const updatedPayload = await json(updated);
    assert.deepEqual(
      updatedPayload.bot.authored_audio_voice_profile,
      normalizeBotAudioVoiceProfileV1(authored)
    );
    assert.deepEqual(
      updatedPayload.bot.audio_voice_profile_override,
      normalizeBotAudioVoiceProfileV1(override)
    );
    assert.equal(updatedPayload.bot.audio_voice_profile_override.elevenLabsEffect, "deep-space");
    assert.equal(
      updatedPayload.bot.audio_voice_profile_override.elevenLabsVoiceIdOverride,
      "portable-exact-voice-id"
    );
    assert.equal(
      updatedPayload.bot.audio_voice_profile_override.elevenLabsDirection,
      "warm, conspiratorial"
    );

    const secondCreated = await client.request(
      "/api/bots",
      jsonInit({
        name: "Second voiced bot",
        authoredAudioVoiceProfile: { ...authored, pitch: 0.65 },
      })
    );
    assert.equal(secondCreated.status, 201);
    const secondPayload = await json(secondCreated);
    const secondOverride = { ...override, pitch: 0.8, lilt: 0.6 };
    const secondUpdated = await client.request(`/api/bots/${secondPayload.bot.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ audioVoiceProfileOverride: secondOverride }),
    });
    assert.equal(secondUpdated.status, 200);

    const botsResponse = await client.request("/api/bots");
    assert.equal(botsResponse.status, 200);
    const persistedBots = (await json(botsResponse)).bots as Array<{
      id: string;
      audio_voice_profile_override: {
        pitch: number;
        lilt: number;
        elevenLabsVoiceIdOverride?: string | null;
      } | null;
    }>;
    assert.equal(
      persistedBots.find((bot) => bot.id === createdPayload.bot.id)
        ?.audio_voice_profile_override?.pitch,
      -0.25
    );
    assert.equal(
      persistedBots.find((bot) => bot.id === createdPayload.bot.id)
        ?.audio_voice_profile_override?.lilt,
      -0.4
    );
    assert.equal(
      persistedBots.find((bot) => bot.id === createdPayload.bot.id)
        ?.audio_voice_profile_override?.elevenLabsVoiceIdOverride,
      "portable-exact-voice-id"
    );
    assert.equal(
      persistedBots.find((bot) => bot.id === secondPayload.bot.id)
        ?.audio_voice_profile_override?.pitch,
      0.8
    );
    assert.equal(
      persistedBots.find((bot) => bot.id === secondPayload.bot.id)
        ?.audio_voice_profile_override?.lilt,
      0.6
    );

    const settingsResponse = await client.request("/api/settings");
    assert.equal(settingsResponse.status, 200);
    const accountDefaultVoice = (await json(settingsResponse)).settings
      .prismDefaultBotAudioVoiceProfile;
    assert.equal(accountDefaultVoice.pitch, 0);
    assert.equal(accountDefaultVoice.lilt, 0);
  });

  it("derives clone lineage from an owned source and retains it through clone-of-clone", async () => {
    const client = createClient();
    const registration = await client.request(
      "/api/auth/register",
      jsonInit({ username: "clone-lineage@example.com", password: "clone-password" }),
    );
    assert.equal(registration.status, 201);

    const originalResponse = await client.request(
      "/api/bots",
      jsonInit({ name: "Original" }),
    );
    assert.equal(originalResponse.status, 201);
    const originalId = String((await json(originalResponse)).bot.id);

    const cloneResponse = await client.request(
      "/api/bots",
      jsonInit({ name: "Original Copy", cloneSourceBotId: originalId }),
    );
    assert.equal(cloneResponse.status, 201);
    const cloneId = String((await json(cloneResponse)).bot.id);

    const cloneOfCloneResponse = await client.request(
      "/api/bots",
      jsonInit({ name: "Original Copy 2", cloneSourceBotId: cloneId }),
    );
    assert.equal(cloneOfCloneResponse.status, 201);
    const cloneOfCloneId = String((await json(cloneOfCloneResponse)).bot.id);

    const rows = db
      .prepare(
        "SELECT id, clone_family_id FROM bots WHERE id IN (?, ?) ORDER BY id",
      )
      .all(cloneId, cloneOfCloneId) as Array<{
      id: string;
      clone_family_id: string | null;
    }>;
    assert.deepEqual(
      rows.map((row) => row.clone_family_id),
      [originalId, originalId],
    );

    const otherClient = createClient();
    const otherRegistration = await otherClient.request(
      "/api/auth/register",
      jsonInit({ username: "clone-other@example.com", password: "clone-password" }),
    );
    assert.equal(otherRegistration.status, 201);
    const crossTenantClone = await otherClient.request(
      "/api/bots",
      jsonInit({ name: "Unauthorized copy", cloneSourceBotId: originalId }),
    );
    assert.equal(crossTenantClone.status, 404);

    db.prepare("UPDATE bots SET visibility = 'public' WHERE id = ?").run(
      originalId,
    );
    const publicSourceClone = await otherClient.request(
      "/api/bots",
      jsonInit({ name: "Public Original Copy", cloneSourceBotId: originalId }),
    );
    assert.equal(publicSourceClone.status, 201);
    const publicSourceCloneId = String((await json(publicSourceClone)).bot.id);
    assert.equal(
      (
        db
          .prepare("SELECT clone_family_id FROM bots WHERE id = ?")
          .get(publicSourceCloneId) as { clone_family_id: string | null }
      ).clone_family_id,
      originalId,
    );
  });
});

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
  botPowerSourceHashV1,
  normalizeBotAudioVoiceProfileV1,
} from "@localai/shared";
import {
  createDeterministicProvider,
  createFetchRecorder,
  createTestDatabase,
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
    builtinVoiceWaveGenerator: async ({ profile, text }) => {
      builtinVoiceTexts.push(text);
      if (normalizeBotAudioVoiceProfileV1(profile).systemVoiceName === "Unavailable Test") {
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
    const uploadedImageIds: string[] = [];
    for (const slot of ["day-studio", "night-studio", "logo"] as const) {
      const uploadResponse = await owner.request(
        `/api/botcast/shows/${encodeURIComponent(showId)}/assets/${slot}/upload`,
        jsonInit({ dataUrl: uploadedAssetDataUrl }),
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
        faceMouthCharacter: "△",
        faceMouthAnimation: "wobble",
        faceMouthCoffeePucker: true,
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
    assert.equal(updatedPayload.bot.face_mouth_animation, "pulsate");
    assert.equal(updatedPayload.bot.face_mouth_coffee_pucker, 0);
    assert.equal(updatedPayload.bot.face_blink_scale, 0.85);
    assert.equal(updatedPayload.bot.face_blink_offset_x, 0.1);
    assert.equal(updatedPayload.bot.face_blink_offset_y, -0.12);

    const updatedDefault = await client.request("/api/default-bot", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        faceEyeCharacter: "8",
        faceEyeAnimation: "spin",
        faceEyeRotationDeg: -45,
        faceMouthCharacter: "△",
        faceMouthAnimation: "wobble",
        faceMouthCoffeePucker: true,
        faceBlinkScale: 1.25,
        faceBlinkOffsetX: -0.06,
        faceBlinkOffsetY: 0.08,
      }),
    });
    assert.equal(updatedDefault.status, 200);
    const defaultPayload = await json(updatedDefault);
    assert.equal(defaultPayload.defaultBot.prismDefaultBotFaceEyeAnimation, undefined);
    assert.equal(defaultPayload.defaultBot.prismDefaultBotFaceEyeRotationDeg, -45);
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

  it("synthesizes persisted LOCAL replies offline even when ElevenLabs is requested", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "voice-local@example.com", password: "voice-password" })
    );
    assert.equal(register.status, 201);
    const userId = String((await json(register)).user.id);
    db.prepare("UPDATE users SET english_voice_engine = 'elevenlabs' WHERE id = ?").run(
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
    assert.deepEqual(fetchRecorder.calls.slice(beforeCalls), []);
  });

  it("uses System TTS until the profile selects an ElevenLabs voice", async () => {
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
    assert.equal((await json(initialSettings)).settings.englishVoiceEngine, "elevenlabs");
    db.prepare("UPDATE users SET preferred_provider = 'openai' WHERE id = ?").run(
      userId
    );

    const beforeCalls = fetchRecorder.calls.length;
    config.elevenLabsApiKey = "integration-elevenlabs-key";
    try {
      const response = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          text: "Keep using System TTS without an online voice override.",
          mode: "english",
          engine: "elevenlabs",
          explicitOnlineContext: true,
          profile: normalizeBotAudioVoiceProfileV1(undefined),
        })
      );

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-prism-voice-engine"), "builtin");
      assert.equal(
        Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(),
        "RIFF"
      );
      assert.deepEqual(fetchRecorder.calls.slice(beforeCalls), []);
    } finally {
      config.elevenLabsApiKey = "";
    }
  });

  it("persists a bot name pronunciation and uses it only for synthesized speech", async () => {
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
      }),
    );
    assert.equal(created.status, 201);
    const createdBot = (await json(created)).bot;
    assert.equal(createdBot.name, "Light Yagami");
    assert.equal(createdBot.name_pronunciation, "Light Yah-gah-mee");

    const listed = await client.request("/api/bots");
    assert.equal(listed.status, 200);
    const listedBot = (await json(listed)).bots.find(
      (bot: { id?: string }) => bot.id === createdBot.id,
    );
    assert.equal(listedBot.name, "Light Yagami");
    assert.equal(listedBot.name_pronunciation, "Light Yah-gah-mee");

    const updated = await client.request(`/api/bots/${createdBot.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ namePronunciation: "Light Ya-ga-mi" }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await json(updated)).bot.name_pronunciation, "Light Ya-ga-mi");

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
  });

  it("ignores legacy ElevenLabs slot mappings during synthesis", async () => {
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
      "UPDATE users SET preferred_provider = 'openai', english_voice_engine = 'elevenlabs', elevenlabs_voice_bank = ? WHERE id = ?"
    ).run(JSON.stringify({ "voice-1": "legacy-provider-voice" }), userId);

    const beforeCalls = fetchRecorder.calls.length;
    config.elevenLabsApiKey = "integration-elevenlabs-key";
    try {
      const response = await client.request(
        "/api/voices/synthesize",
        jsonInit({
          text: "A legacy slot must not select my voice.",
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
        "builtin"
      );
      assert.deepEqual(fetchRecorder.calls.slice(beforeCalls), []);

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
      assert.equal(providerCalls.length, 1);
      assert.match(
        providerCalls[0]?.input ?? "",
        /text-to-speech\/chosen-provider-voice\/stream/
      );
    } finally {
      config.elevenLabsApiKey = "";
    }
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

  it("synthesizes Babble through the system voice and keeps Bottish client-procedural", async () => {
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
      audio_voice_profile_override: { pitch: number; lilt: number } | null;
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
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const serverSource = readFileSync(
  new URL("../server.ts", import.meta.url),
  "utf8",
);
const botcastSource = readFileSync(
  new URL("../botcast.ts", import.meta.url),
  "utf8",
);

describe("Prism Refract API contract", () => {
  it("requires auth and routes Refract through its own account-persisted, mode-bound runtime", () => {
    const route = serverSource.match(
      /route\("POST", "\/api\/prism\/refract"[\s\S]*?route\("GET", "\/api\/botcast\/shows"/u,
    )?.[0] ?? "";
    assert.match(route, /const userId = requireAuth\(ctx\)/u);
    assert.match(route, /normalizePrismRefractRequest\(ctx\.body\)/u);
    assert.match(route, /user\.preferred_provider === "local" \? "local" : "online"/u);
    assert.match(route, /user\.prism_refract_local_model/u);
    assert.match(route, /user\.prism_refract_online_model/u);
    assert.match(route, /fallbackWhenExplicitModelIsUnavailable: true/u);
    assert.doesNotMatch(route, /request\.preferredProvider/u);
    assert.doesNotMatch(route, /request\.modelOverride/u);
    assert.match(route, /contextualTextRuntimeForUser\(/u);
    assert.doesNotMatch(route, /requestedReasoningEffort: request\.reasoningEffort/u);
    assert.doesNotMatch(route, /requestedTurbo: request\.turbo/u);
    assert.doesNotMatch(route, /resolveAuxiliaryOllamaModel\(/u);
    assert.match(route, /isPrismRefractDebateTextTarget\(request\.target\)/u);
    assert.match(route, /isPrismRefractInputTextTarget\(request\.target\)/u);
    assert.match(route, /generatePrismInputRefractDraft/u);
    assert.match(route, /buildPrismCompanionAuthoritativeContext/u);
    assert.match(route, /surface: "prism-refract"/u);
    assert.match(route, /providerFactoryOverride/u);
    assert.match(route, /refractRuntime\.reasoningEffort/u);
    assert.match(route, /refractRuntime\.turbo/u);
    const globalRuntime = serverSource.match(
      /async function contextualTextRuntimeForUser[\s\S]*?async function contextualSignalRuntimeForEpisode/u,
    )?.[0] ?? "";
    assert.match(
      globalRuntime,
      /Max reasoning requires an explicitly selected compatible native model/u,
    );
    assert.match(
      globalRuntime,
      /resolveUserAutoTurboMode[\s\S]*turboOnly: autoTurboEnabled/u,
    );
    assert.match(route, /generateDebateRefractDraft/u);
    assert.match(route, /generateBotcastRefractDraft/u);
  });

  it("saves Refract choices in the authenticated user's visible picker lane without a brittle catalog probe", () => {
    const route = serverSource.match(
      /route\("PATCH", "\/api\/settings\/prism-refract-model"[\s\S]*?route\("PATCH", "\/api\/default-bot"/u,
    )?.[0] ?? "";
    assert.match(route, /const userId = requireAuth\(ctx\)/u);
    assert.match(
      route,
      /body\.responseMode === "local" \|\| body\.responseMode === "online"/u,
    );
    assert.match(route, /user\.preferred_provider === "local"/u);
    assert.doesNotMatch(route, /buildModelCatalog/u);
    assert.doesNotMatch(route, /That model is unavailable in Prism's/u);
    assert.match(route, /prism_refract_local_model/u);
    assert.match(route, /prism_refract_online_model/u);
  });

  it("keeps Prism Home and the floating companion on the same dedicated local model", () => {
    const chatRoute = serverSource.match(
      /route\("POST", "\/api\/chat"[\s\S]*?route\("GET", "\/api\/image-jobs\/:id"/u,
    )?.[0] ?? "";
    assert.match(
      chatRoute,
      /const prismHomeTurn = mode === "zen" && runtimeBotId == null/u,
    );
    assert.match(
      chatRoute,
      /prismHomeTurn[\s\S]*provider: "local" as const[\s\S]*resolveAuxiliaryOllamaModel\(user\.prism_default_llm_model\)/u,
    );
    assert.match(
      chatRoute,
      /if \(prismHomeTurn\) \{[\s\S]*effectiveProvider = "local"/u,
    );
    assert.match(
      chatRoute,
      /responseMode: effectiveProvider === "local" \? "local" : "online"/u,
    );

    const companionRoute = serverSource.match(
      /route\("POST", "\/api\/prism-companion"[\s\S]*?route\("GET", "\/api\/library\/groups"/u,
    )?.[0] ?? "";
    assert.match(companionRoute, /const providerName = "local" as const/u);
    assert.match(
      companionRoute,
      /const model = resolveAuxiliaryOllamaModel\([\s\S]*user\.prism_default_llm_model/u,
    );
    assert.doesNotMatch(companionRoute, /preferred_online_model/u);
    assert.doesNotMatch(companionRoute, /getOpenAiApiKeyForUser/u);
    assert.doesNotMatch(companionRoute, /getAnthropicApiKeyForUser/u);
  });

  it("keeps name and premise candidates draft-only until existing PATCH paths accept them", () => {
    const refractDraft = botcastSource.match(
      /export async function generateBotcastRefractDraft[\s\S]*?export async function generateBotcastShowAtmosphere/u,
    )?.[0] ?? "";
    assert.match(refractDraft, /persist: false/u);
    assert.match(refractDraft, /value: value \?\? ""/u);
    assert.doesNotMatch(
      refractDraft,
      /updateBotcastShow\(db, userId, target\.showId/u,
    );
  });

  it("resolves a directed Book for me guest from the authenticated bot library", () => {
    const directed = botcastSource.match(
      /export async function generateBotcastDirectedBooking[\s\S]*?\/\*\*/u,
    )?.[0] ?? "";
    assert.match(
      directed,
      /SELECT id FROM bots WHERE user_id = \? AND chat_enabled = 1 AND id <> \?/u,
    );
    assert.match(directed, /generateBotcastBookingSuggestion/u);
    assert.match(directed, /\{ \.\.\.generation, direction \}/u);
    assert.doesNotMatch(directed, /keywords: \[direction\]/u);
  });

  it("keeps a directed logo pass scoped to its thesis and LOCAL boundary", () => {
    const logoRoute = serverSource.match(
      /route\("POST", "\/api\/botcast\/shows\/:id\/logo-direction"[\s\S]*?route\("POST", "\/api\/botcast\/shows\/:id\/blurbs"/u,
    )?.[0] ?? "";
    assert.match(logoRoute, /const userId = requireAuth\(ctx\)/u);
    assert.match(
      logoRoute,
      /user\.preferred_provider === "local"[\s\S]*\? "local"/u,
    );
    assert.match(logoRoute, /generateBotcastShowLogoThesis/u);
    const logoGenerator = botcastSource.match(
      /export async function generateBotcastShowLogoThesis[\s\S]*?export async function generateBotcastShowMusicIdentity/u,
    )?.[0] ?? "";
    assert.match(logoGenerator, /logoThesis,[\s\S]*regenerateLogo: true/u);
    assert.doesNotMatch(
      logoGenerator,
      /updateBotcastShow\([\s\S]{0,220}(?:name|premise|studioIdentity):/u,
    );
  });
});

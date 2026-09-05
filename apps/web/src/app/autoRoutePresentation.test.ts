import assert from "node:assert/strict";
import test from "node:test";

import {
  finalActualAppletRoute,
  latestActualAppletRoute,
  presentAppletModelRoute,
} from "./autoRoutePresentation.ts";

test("recovery final wins the initial Auto route", () => {
  const route = finalActualAppletRoute({
    provider: "openai",
    model: "gpt-primary",
    autoRecovery: {
      v: 1,
      attempts: [],
      finalProvider: "openai",
      finalModel: "gpt-recovered",
      crossedOnline: false,
    },
  });
  assert.deepEqual(route && { provider: route.provider, model: route.model }, {
    provider: "openai",
    model: "gpt-recovered",
  });
});

test("Auto label is applet/lane isolated and never discovers a model", () => {
  const local = presentAppletModelRoute({
    modelIsAuto: true,
    fixedModelLabel: "should not be used",
    lane: "local",
    actualRoute: { provider: "openai", model: "gpt-online" },
  });
  assert.equal(local.modelLabel, "Auto");
  assert.equal(local.effort, null);
  const online = presentAppletModelRoute({
    modelIsAuto: true,
    fixedModelLabel: "should not be used",
    actualModelLabel: "Claude Sonnet 4.6",
    lane: "online",
    actualRoute: {
      provider: "anthropic",
      model: "claude-routed",
      effort: "high",
    },
  });
  assert.equal(online.modelLabel, "Claude Sonnet 4.6");
  assert.equal(online.effort, "high");
});

test("observed Auto effort updates with each completed route", () => {
  const first = presentAppletModelRoute({
    modelIsAuto: true,
    fixedModelLabel: "Auto",
    lane: "online",
    actualRoute: { provider: "openai", model: "gpt-first", effort: "low" },
  });
  const later = presentAppletModelRoute({
    modelIsAuto: true,
    fixedModelLabel: "Auto",
    lane: "online",
    actualRoute: {
      provider: "anthropic",
      model: "claude-later",
      effort: "xhigh",
    },
  });
  assert.equal(first.effort, "low");
  assert.equal(later.effort, "xhigh");
});

test("newest persisted completion wins and freezes its recovery final", () => {
  const route = latestActualAppletRoute(
    [
      {
        role: "assistant",
        provider: "openai",
        model: "gpt-earlier",
        autoRoute: {
          v: 1,
          lane: "online",
          provider: "openai",
          model: "gpt-earlier",
          reasoningEffort: "low",
          reasonCodes: ["light_request"],
        },
      },
      {
        role: "assistant",
        provider: "openai",
        model: "gpt-primary",
        reasoningEffort: "high",
        turbo: true,
        autoRoute: {
          v: 1,
          lane: "online",
          provider: "openai",
          model: "gpt-primary",
          reasoningEffort: "high",
          reasonCodes: ["deep_request"],
        },
        autoRecovery: {
          v: 1,
          attempts: [
            {
              provider: "openai",
              model: "gpt-primary",
              reasoningEffort: "high",
              durationMs: 10,
              outcome: "failed",
              reason: "provider_error",
            },
            {
              provider: "anthropic",
              model: "claude-recovered",
              reasoningEffort: "xhigh",
              durationMs: 20,
              outcome: "succeeded",
            },
          ],
          finalProvider: "anthropic",
          finalModel: "claude-recovered",
          crossedOnline: false,
        },
      },
    ],
    "online",
  );
  assert.deepEqual(route && {
    provider: route.provider,
    model: route.model,
    effort: route.effort,
    turbo: route.turbo,
  }, {
    provider: "anthropic",
    model: "claude-recovered",
    effort: "xhigh",
    turbo: false,
  });
});

test("deterministic and wrong-lane rows never become Auto status", () => {
  assert.equal(
    latestActualAppletRoute(
      [
        {
          role: "assistant",
          provider: "openai",
          model: "gpt-online",
          botPowerExactResponse: "speech_copy",
        },
      ],
      "online",
    ),
    null,
  );
  assert.equal(
    latestActualAppletRoute(
      [{ role: "assistant", provider: "openai", model: "gpt-online" }],
      "local",
    ),
    null,
  );
});

test("a fixed turn cannot become Auto status after the picker changes", () => {
  assert.equal(
    latestActualAppletRoute(
      [{ role: "assistant", provider: "openai", model: "fixed-model" }],
      "online",
    ),
    null,
  );
});

test("ONLINE Auto rejects a stale cross-lane local recovery", () => {
  const route = latestActualAppletRoute(
    [
      {
        role: "assistant",
        provider: "openai",
        model: "gpt-primary",
        autoRoute: {
          v: 1,
          lane: "online",
          provider: "openai",
          model: "gpt-primary",
          reasoningEffort: "high",
          reasonCodes: ["deep_request"],
        },
        autoRecovery: {
          v: 1,
          attempts: [],
          finalProvider: "local",
          finalModel: "qwen-recovery",
          crossedOnline: false,
        },
      },
    ],
    "online",
  );
  assert.equal(route, null);
});

test("a deterministic completion cannot eclipse an earlier server route", () => {
  const route = latestActualAppletRoute(
    [
      {
        role: "assistant",
        provider: "local",
        model: "qwen-routed",
        autoRoute: {
          v: 1,
          lane: "local",
          provider: "local",
          model: "qwen-routed",
          reasoningEffort: "low",
          reasonCodes: ["light_request"],
        },
      },
      {
        role: "assistant",
        provider: "local",
        model: "deterministic-template",
        botPowerExactResponse: "speech_copy",
      },
    ],
    "local",
  );
  assert.equal(route?.model, "qwen-routed");
});

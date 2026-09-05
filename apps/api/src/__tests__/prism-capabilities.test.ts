import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRISM_ORCHESTRATION_VERSION,
  type PrismCapabilityDescriptorV1,
  type PrismJsonObject,
} from "@localai/shared";
import { PrismCapabilityRegistry } from "../prism-capabilities.ts";
import {
  createPrismContextToken,
  readPrismContextToken,
} from "../prism-action-journal.ts";
import {
  closeTestDatabase,
  createTestDatabase,
} from "../test-support.ts";

const descriptor: PrismCapabilityDescriptorV1 = {
  schemaVersion: PRISM_ORCHESTRATION_VERSION,
  id: "settings.online-model.update",
  version: 1,
  label: "Change primary online model",
  description: "Changes preferredOnlineModel without changing provider mode.",
  execution: "server",
  inputSchema: { type: "object" },
  resultSchema: { type: "object" },
  surfaces: [],
  unavailableWhileLive: true,
  risk: "reversible",
  confirmation: "none",
  privacy: "private",
  provider: "none",
  cost: "none",
  undo: "inverse",
  idempotent: true,
};

function stringField(
  value: PrismJsonObject,
  field: string,
): string {
  const entry = value[field];
  if (typeof entry !== "string" || !entry.trim()) {
    throw new Error(`${field} is required.`);
  }
  return entry.trim();
}

describe("Prism capability registry and action journal", () => {
  it("executes, journals encrypted inverse state, replays idempotently, and undoes", async () => {
    const db = createTestDatabase();
    const userKey = Buffer.alloc(32, 7);
    try {
      db.prepare(
        `INSERT INTO users
          (id, email, display_name, password_hash, password_salt,
           wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
           preferred_online_model, created_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "u1",
        "prism@example.com",
        "Prism",
        "hash",
        "salt",
        "cipher",
        "iv",
        "tag",
        "gpt-5",
        "2026-07-26T00:00:00.000Z",
        "2026-07-26T00:00:00.000Z",
      );

      const registry = new PrismCapabilityRegistry();
      registry.register({
        descriptor,
        validateInput: (input) => ({ model: stringField(input, "model") }),
        preview: (_context, input) => ({
          summary: `Use ${String(input.model)} as the primary online model.`,
          consequences: [],
          targets: [],
          diffs: [],
          provider: null,
          model: null,
          estimatedCostMicroUsd: null,
        }),
        execute: (context, input) => {
          const previous = (
            context.db
              .prepare(
                "SELECT preferred_online_model FROM users WHERE id = ?",
              )
              .get(context.userId) as { preferred_online_model: string | null }
          ).preferred_online_model;
          const model = stringField(input, "model");
          context.db
            .prepare(
              "UPDATE users SET preferred_online_model = ? WHERE id = ?",
            )
            .run(model, context.userId);
          return {
            result: { preferredOnlineModel: model },
            affectedEntities: [],
            inverse: { preferredOnlineModel: previous },
          };
        },
        undo: (context, inverse) => {
          const previous = inverse.preferredOnlineModel;
          context.db
            .prepare(
              "UPDATE users SET preferred_online_model = ? WHERE id = ?",
            )
            .run(
              typeof previous === "string" ? previous : null,
              context.userId,
            );
          return { affectedEntities: [] };
        },
      });
      const context = {
        db,
        userId: "u1",
        userKey,
        source: "prism" as const,
        surfaceId: "settings" as const,
        hardLocal: false,
        live: false,
        now: new Date("2026-07-26T01:00:00.000Z"),
      };
      const proposal = registry.createProposal({
        context,
        capabilityId: descriptor.id,
        input: { model: "claude-opus-4-6" },
      });
      const run = await registry.executeProposal({
        context,
        proposalId: proposal.id,
        confirmation: false,
        idempotencyKey: "change-model-1",
      });
      assert.equal(run.status, "committed");
      assert.equal(run.undoAvailable, true);
      assert.equal(
        (
          db
            .prepare(
              "SELECT preferred_online_model FROM users WHERE id = 'u1'",
            )
            .get() as { preferred_online_model: string }
        ).preferred_online_model,
        "claude-opus-4-6",
      );
      const encrypted = db
        .prepare(
          `SELECT inverse_ciphertext, input_json
             FROM prism_action_runs
            WHERE id = ?`,
        )
        .get(run.id) as { inverse_ciphertext: string; input_json: string };
      assert.doesNotMatch(encrypted.inverse_ciphertext, /gpt-5/u);
      assert.doesNotMatch(encrypted.input_json, /claude-opus-4-6/u);
      const encryptedPreview = db
        .prepare(
          "SELECT preview_json FROM prism_action_proposals WHERE id = ?",
        )
        .get(proposal.id) as { preview_json: string };
      assert.doesNotMatch(encryptedPreview.preview_json, /Claude Opus 4\.6/u);
      assert.equal(
        (
          await registry.executeProposal({
          context,
          proposalId: proposal.id,
          confirmation: false,
          idempotencyKey: "change-model-1",
          })
        ).id,
        run.id,
      );

      const undone = registry.undo({ context });
      assert.equal(undone.status, "undone");
      assert.equal(
        (
          db
            .prepare(
              "SELECT preferred_online_model FROM users WHERE id = 'u1'",
            )
            .get() as { preferred_online_model: string }
        ).preferred_online_model,
        "gpt-5",
      );

      const workflowProposal = registry.createWorkflowProposal({
        context,
        steps: [
          {
            capabilityId: descriptor.id,
            input: { model: "claude-opus-4-6" },
          },
          {
            capabilityId: descriptor.id,
            input: { model: "gpt-5.6" },
          },
        ],
      });
      const workflow = await registry.executeProposal({
        context,
        proposalId: workflowProposal.id,
        confirmation: true,
        idempotencyKey: "model-workflow",
      });
      assert.equal(workflow.status, "committed", workflow.error ?? undefined);
      assert.equal(workflow.capabilityId, "prism.workflow");
      assert.equal(workflow.undoAvailable, true);
      assert.equal(
        (
          db
            .prepare(
              "SELECT preferred_online_model FROM users WHERE id = 'u1'",
            )
            .get() as { preferred_online_model: string }
        ).preferred_online_model,
        "gpt-5.6",
      );
      assert.equal(
        registry.undo({ context, runId: workflow.id }).status,
        "undone",
      );
      assert.equal(
        (
          db
            .prepare(
              "SELECT preferred_online_model FROM users WHERE id = 'u1'",
            )
            .get() as { preferred_online_model: string }
        ).preferred_online_model,
        "gpt-5",
      );
    } finally {
      closeTestDatabase(db);
    }
  });

  it("keeps context tokens tenant-scoped and expiring", () => {
    const db = createTestDatabase();
    try {
      for (const id of ["u1", "u2"]) {
        db.prepare(
          `INSERT INTO users
            (id, email, display_name, password_hash, password_salt,
             wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
             created_at, last_active_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          `${id}@example.com`,
          id,
          "hash",
          "salt",
          "cipher",
          "iv",
          "tag",
          "2026-07-26T00:00:00.000Z",
          "2026-07-26T00:00:00.000Z",
        );
      }
      const token = createPrismContextToken({
        db,
        userId: "u1",
        purpose: "favorite those",
        entities: [
          {
            schemaVersion: PRISM_ORCHESTRATION_VERSION,
            entityType: "bot",
            id: "bot-1",
            label: "Lux",
            revision: "rev-1",
          },
        ],
      });
      assert.equal(readPrismContextToken(db, "u1", token.id)?.entities[0]?.id, "bot-1");
      assert.equal(readPrismContextToken(db, "u2", token.id), null);
      db.prepare(
        "UPDATE prism_context_tokens SET expires_at = ? WHERE id = ?",
      ).run("2000-01-01T00:00:00.000Z", token.id);
      assert.equal(readPrismContextToken(db, "u1", token.id), null);
    } finally {
      closeTestDatabase(db);
    }
  });
});

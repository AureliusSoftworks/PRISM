import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { listSlateProjectSections } from "../slate-continuity.ts";
import {
  applySlateWritingOperationProposal,
  createSlateWritingOperation,
  SlateWritingOperationError,
} from "../slate-writing-operations.ts";
import { createSlateProject, updateSlateProject } from "../slate.ts";
import {
  closeTestDatabase,
  createTestDatabase,
} from "../test-support.ts";

function seedUser(db: DatabaseSync, id: string): void {
  const now = "2026-07-30T00:00:00.000Z";
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'wrapped', 'iv', 'tag', ?, ?)`,
  ).run(id, `${id}@example.test`, id, now, now);
}

describe("Slate writing operation scope safety", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDatabase();
    seedUser(db, "author-a");
  });

  afterEach(() => closeTestDatabase(db));

  it("refuses a whole-manuscript rewrite but allows an exact imported passage", () => {
    const project = createSlateProject(db, "author-a", {
      title: "The Monolithic Import",
      spark: "A full draft was pasted before chapter-aware import existed.",
    });
    const manuscript = "The city remembered every footstep. ".repeat(8_001);
    updateSlateProject(db, "author-a", project.id, { manuscript });
    const [section] = listSlateProjectSections(db, "author-a", project.id);
    assert.ok(section);

    assert.throws(
      () =>
        createSlateWritingOperation(db, "author-a", project.id, {
          sectionId: section.id,
          operation: "rewrite",
          direction: "Make the opening more immediate.",
          scope: "scene",
          idempotencyKey: "unsafe-whole-import",
        }),
      (error: unknown) => {
        assert.ok(error instanceof SlateWritingOperationError);
        assert.equal(error.status, 409);
        assert.equal(error.code, "slate_writing_import_scope_too_broad");
        return true;
      },
    );

    const selectionEnd = manuscript.indexOf(".") + 1;
    const scoped = createSlateWritingOperation(
      db,
      "author-a",
      project.id,
      {
        sectionId: section.id,
        operation: "rewrite",
        direction: "Make the opening more immediate.",
        scope: "passage",
        idempotencyKey: "safe-import-passage",
        selection: {
          sourceId: "",
          sectionId: section.id,
          sectionRevision: section.revision,
          start: 0,
          end: selectionEnd,
          startPosition: null,
          endPosition: null,
          quoteHash: "",
        },
      },
    );
    assert.equal(scoped.operation.status, "generating");
    assert.equal(scoped.operation.intent.target.selection?.end, selectionEnd);

    db.prepare(
      `UPDATE slate_writing_operations
          SET status = 'proposed', direction_intent_json = ?,
              provider = 'local', model = 'fixture-model',
              proposal_text = 'Unsafe replacement.',
              proposal_hash = 'unsafe-proposal-hash'
        WHERE id = ?`,
    ).run(
      JSON.stringify({
        ...scoped.operation.intent,
        target: {
          ...scoped.operation.intent.target,
          selection: null,
        },
      }),
      scoped.operation.id,
    );
    assert.throws(
      () =>
        applySlateWritingOperationProposal(
          db,
          "author-a",
          project.id,
          scoped.operation.id,
          {
            revisionFingerprint:
              scoped.operation.revisionFingerprint.value,
            idempotencyKey: "reject-legacy-unsafe-accept",
          },
          () => {
            assert.fail("Unsafe imported proposal reached manuscript apply.");
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof SlateWritingOperationError);
        assert.equal(error.code, "slate_writing_import_scope_too_broad");
        return true;
      },
    );
  });
});

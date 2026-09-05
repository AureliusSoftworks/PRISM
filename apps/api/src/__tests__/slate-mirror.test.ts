import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestDatabase } from "../test-support.ts";
import {
  bindSlateMirrorToProject,
  createSlateMirrorProfile,
  getSlateMirrorProfile,
  getSlateMirrorProjectBinding,
  listSlateMirrorProfileVersions,
  listSlateMirrorProfiles,
  listSlateMirrorSamples,
  normalizeSlateMirrorVoiceCard,
  publishSlateMirrorProfileVersion,
  setSlateMirrorProfileFrozen,
  slateMirrorEligibleSamplesForSynthesis,
  SlateMirrorError,
} from "../slate-mirror.ts";
import { createSlateProject } from "../slate.ts";

function insertUser(
  db: ReturnType<typeof createTestDatabase>,
  id: string,
  email: string,
): void {
  const now = "2026-07-29T12:00:00.000Z";
  db.prepare(
    `INSERT INTO users (
       id, email, display_name, password_hash, password_salt,
       wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
       created_at, last_active_at
     ) VALUES (?, ?, 'Mirror Author', 'hash', 'salt', 'cipher', 'iv', 'tag', ?, ?)`,
  ).run(id, email, now, now);
}

function fixture(): {
  db: ReturnType<typeof createTestDatabase>;
  userId: string;
  otherUserId: string;
  projectId: string;
} {
  const db = createTestDatabase();
  const userId = "mirror-author";
  const otherUserId = "other-author";
  insertUser(db, userId, "mirror@example.test");
  insertUser(db, otherUserId, "other-mirror@example.test");
  const project = createSlateProject(db, userId, {
    title: "The Salt Bell",
    spark: "A drowned bell rings when the reservoir empties.",
  });
  return { db, userId, otherUserId, projectId: project.id };
}

function voiceCard(
  distance = "Close third, held just behind the viewpoint character's senses.",
): Record<string, unknown> {
  return {
    narrativeDistance: distance,
    diction: ["Concrete verbs", "Plain nouns with one luminous detail"],
    rhythm: ["Short pressure sentences opening into measured clauses"],
    imagery: ["Salt, glass, drought, and submerged machinery"],
    dialogueHabits: ["Subtext before explanation", "Sparse attribution"],
    exposition: ["Embedded in action"],
    humor: ["Dry and rare"],
    density: ["Tactile but restrained"],
    preferences: ["Earn emotional turns through physical action"],
    avoidances: ["No ornamental throat-clearing"],
    exemplars: ["The rope remembered the lake better than Mara did."],
    wordTarget: 2_000,
    outputLength: "scene",
  };
}

const WRITER_SAMPLE = {
  sourceKind: "writer_owned_sample" as const,
  text: "The rope remembered the lake better than Mara did.",
  explicitlyIncluded: true,
  writerOwnsRights: true,
  containsThirdPartyMaterial: false,
};

describe("Slate Mirror profiles", () => {
  it("keeps account profiles tenant-scoped and derives their current immutable version", () => {
    const { db, userId, otherUserId } = fixture();
    try {
      const profile = createSlateMirrorProfile(db, userId, {
        name: "Reservoir voice",
        penName: "M. Vale",
      });
      assert.equal(profile.penName, "M. Vale");
      assert.equal(profile.currentVersionId, null);
      assert.equal(listSlateMirrorProfiles(db, userId).length, 1);
      assert.equal(listSlateMirrorProfiles(db, otherUserId).length, 0);
      assert.throws(
        () => getSlateMirrorProfile(db, otherUserId, profile.id),
        (error: unknown) =>
          error instanceof SlateMirrorError &&
          error.code === "slate_mirror_profile_not_found",
      );

      const published = publishSlateMirrorProfileVersion(
        db,
        userId,
        profile.id,
        {
          voiceCard: voiceCard(),
          samples: [
            WRITER_SAMPLE,
            {
              sourceKind: "direction",
              text: "Make this more lyrical.",
              explicitlyIncluded: true,
              writerOwnsRights: true,
            },
          ],
        },
      );
      assert.equal(published.version.version, 1);
      assert.equal(published.version.parentVersionId, null);
      assert.equal(published.version.status, "published");
      assert.equal(published.version.sampleIds.length, 1);
      assert.deepEqual(
        published.samples.map((sample) => sample.eligibilityReason),
        ["eligible", "forbidden_source_kind"],
      );
      assert.equal(
        getSlateMirrorProfile(db, userId, profile.id).currentVersionId,
        published.version.id,
      );

      const storedVoice = db
        .prepare(
          `SELECT voice_card_json FROM slate_mirror_profile_versions
            WHERE id = ?`,
        )
        .get(published.version.id) as { voice_card_json: string };
      const parsed = JSON.parse(storedVoice.voice_card_json) as Record<
        string,
        unknown
      >;
      assert.equal(Object.hasOwn(parsed, "wordTarget"), false);
      assert.equal(Object.hasOwn(parsed, "outputLength"), false);
      assert.deepEqual(
        Object.keys(parsed).sort(),
        [
          "avoidances",
          "density",
          "dialogueHabits",
          "diction",
          "exemplars",
          "exposition",
          "humor",
          "imagery",
          "narrativeDistance",
          "preferences",
          "rhythm",
        ].sort(),
      );
    } finally {
      db.close();
    }
  });

  it("excludes forbidden provenance and rolls back a publish with no eligible sample", () => {
    const { db, userId } = fixture();
    try {
      const profile = createSlateMirrorProfile(db, userId, {
        name: "Careful provenance",
      });
      assert.throws(
        () =>
          publishSlateMirrorProfileVersion(db, userId, profile.id, {
            voiceCard: voiceCard(),
            samples: [
              {
                sourceKind: "untouched_ai_prose",
                text: "Generated prose cannot teach Mirror.",
                explicitlyIncluded: true,
                writerOwnsRights: true,
              },
              {
                sourceKind: "quotation",
                text: "A quotation remains outside the voice model.",
                explicitlyIncluded: true,
                writerOwnsRights: true,
                containsThirdPartyMaterial: true,
              },
            ],
          }),
        (error: unknown) =>
          error instanceof SlateMirrorError &&
          error.code === "slate_mirror_no_eligible_samples",
      );
      assert.equal(listSlateMirrorSamples(db, userId, profile.id).length, 0);
      assert.equal(
        listSlateMirrorProfileVersions(db, userId, profile.id).length,
        0,
      );
    } finally {
      db.close();
    }
  });

  it("never sends forbidden source kinds to the Voice Card synthesizer", () => {
    const { db, userId } = fixture();
    try {
      const eligible = slateMirrorEligibleSamplesForSynthesis(db, userId, [
        WRITER_SAMPLE,
        {
          sourceKind: "research",
          text: "Research belongs in the Source Shelf, not the author's voice.",
          explicitlyIncluded: true,
          writerOwnsRights: true,
        },
        {
          sourceKind: "untouched_ai_prose",
          text: "Untouched generated prose cannot recursively train Mirror.",
          explicitlyIncluded: true,
          writerOwnsRights: true,
        },
      ]);
      assert.deepEqual(eligible, [
        {
          sourceKind: "writer_owned_sample",
          text: WRITER_SAMPLE.text,
        },
      ]);
    } finally {
      db.close();
    }
  });

  it("publishes new versions without mutating old versions or silently repinning projects", () => {
    const { db, userId, projectId } = fixture();
    try {
      const profile = createSlateMirrorProfile(db, userId, {
        name: "M. Vale / restrained",
      });
      const first = publishSlateMirrorProfileVersion(
        db,
        userId,
        profile.id,
        { voiceCard: voiceCard(), samples: [WRITER_SAMPLE] },
      ).version;
      const initialBinding = bindSlateMirrorToProject(
        db,
        userId,
        projectId,
        { profileVersionId: first.id },
      );
      assert.equal(initialBinding.binding.profileVersionId, first.id);

      const firstBefore = JSON.stringify(first);
      const second = publishSlateMirrorProfileVersion(
        db,
        userId,
        profile.id,
        {
          voiceCard: voiceCard("First person with controlled retrospection."),
          samples: [
            {
              sourceKind: "dialogue_exercise",
              text: '"You heard it." Mara kept both hands on the dry rope.',
              explicitlyIncluded: true,
              writerOwnsRights: true,
            },
          ],
        },
      ).version;
      assert.equal(second.version, 2);
      assert.equal(second.parentVersionId, first.id);
      assert.equal(
        getSlateMirrorProjectBinding(db, userId, projectId)?.binding
          .profileVersionId,
        first.id,
      );
      assert.equal(
        JSON.stringify(
          listSlateMirrorProfileVersions(db, userId, profile.id).find(
            (version) => version.id === first.id,
          ),
        ),
        firstBefore,
      );

      assert.throws(
        () =>
          bindSlateMirrorToProject(db, userId, projectId, {
            profileVersionId: second.id,
          }),
        (error: unknown) =>
          error instanceof SlateMirrorError &&
          error.code === "slate_mirror_repin_confirmation_required",
      );
      assert.throws(
        () =>
          bindSlateMirrorToProject(db, userId, projectId, {
            profileVersionId: second.id,
            repin: true,
            expectedCurrentVersionId: "stale-version",
          }),
        (error: unknown) =>
          error instanceof SlateMirrorError &&
          error.code === "slate_mirror_repin_confirmation_required",
      );

      const repinned = bindSlateMirrorToProject(
        db,
        userId,
        projectId,
        {
          profileVersionId: second.id,
          repin: true,
          expectedCurrentVersionId: first.id,
          projectOverlay: {
            label: "The Salt Bell",
            direction:
              "Preserve the restrained voice; make water imagery more mechanical.",
          },
          povOverlays: [
            {
              label: "Mara",
              povCharacterId: "mara-vale",
              direction:
                "Her attention goes first to pressure, weight, and what hands conceal.",
            },
          ],
        },
      );
      assert.equal(repinned.binding.profileVersionId, second.id);
      assert.equal(
        repinned.binding.projectOverlay?.direction,
        "Preserve the restrained voice; make water imagery more mechanical.",
      );
      assert.equal(repinned.binding.povOverlays[0]?.povCharacterId, "mara-vale");
    } finally {
      db.close();
    }
  });

  it("freezes evolution without changing any already-pinned project", () => {
    const { db, userId, projectId } = fixture();
    try {
      const profile = createSlateMirrorProfile(db, userId, {
        name: "Frozen voice",
      });
      const first = publishSlateMirrorProfileVersion(
        db,
        userId,
        profile.id,
        { voiceCard: voiceCard(), samples: [WRITER_SAMPLE] },
      ).version;
      bindSlateMirrorToProject(db, userId, projectId, {
        profileVersionId: first.id,
      });
      const frozen = setSlateMirrorProfileFrozen(
        db,
        userId,
        profile.id,
        true,
      );
      assert.equal(frozen.frozen, true);
      assert.throws(
        () =>
          publishSlateMirrorProfileVersion(db, userId, profile.id, {
            voiceCard: voiceCard("More distant third."),
            samples: [WRITER_SAMPLE],
          }),
        (error: unknown) =>
          error instanceof SlateMirrorError &&
          error.code === "slate_mirror_profile_frozen",
      );
      assert.equal(
        getSlateMirrorProjectBinding(db, userId, projectId)?.binding
          .profileVersionId,
        first.id,
      );
    } finally {
      db.close();
    }
  });

  it("normalizes only style and density fields", () => {
    const normalized = normalizeSlateMirrorVoiceCard(voiceCard());
    assert.equal(normalized.narrativeDistance.startsWith("Close third"), true);
    assert.equal(
      Object.hasOwn(normalized as unknown as Record<string, unknown>, "wordTarget"),
      false,
    );
  });
});

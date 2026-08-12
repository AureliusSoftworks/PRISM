import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL(".", import.meta.url));
const srcDir = join(appDir, "..");

/** Native dialogs that predate the policy. Keyed on file plus the opening of
 *  the copy, because line numbers in page.tsx churn constantly and copy is
 *  stable and unique per site. `count` pins duplicate copy so removing one of
 *  a pair is still noticed. */
const GRANDFATHERED_NATIVE_DIALOGS: ReadonlyArray<{
  file: string;
  copy: string;
  count: number;
}> = [
  // Two entry points — a cockpit drawer callback and the toolbar button —
  // raise the same dialog with the same copy for the same operation.
  {
    file: "SlateWorkspace.tsx",
    copy: "Replace the current plan with a newly sh",
    count: 2,
  },
  // Reversible today: story.session.delete is undo:"quarantine". Becomes
  // `undo` on migration.
  { file: "page.tsx", copy: "${session.title}", count: 1 },
  // Reversible today: the generation snapshot ref already exists.
  {
    file: "page.tsx",
    copy: "Cancel this in-flight bot draft and retu",
    count: 1,
  },
  {
    file: "page.tsx",
    copy: "Generate a new draft from this brief? Th",
    count: 1,
  },
  // Stays `confirm`: this is the terminal purge of the quarantine that backs
  // image undo, so there is nothing further to recover from.
  {
    file: "page.tsx",
    copy: "Permanently delete this recovery batch? ",
    count: 1,
  },
  // Stays `confirm`: a cleared key is not re-derivable.
  {
    file: "page.tsx",
    copy: "Remove the saved ${providerName} API key",
    count: 1,
  },
  // Stays `confirm`: import overwrites the existing bot row in place.
  {
    file: "page.tsx",
    copy: "${entry.importedName} already exists. Cl",
    count: 1,
  },
  // Not a confirmation at all — this collects a name. It needs a real input
  // surface rather than a tier.
  { file: "page.tsx", copy: "Name this Wildcard Deck", count: 1 },
];

/** Confirmation-shaped surfaces that predate the policy, and legitimate
 *  non-confirmations the heuristic cannot help matching. */
const GRANDFATHERED_SURFACES = new Set<string>([
  // --- Never were confirmations. These stay here permanently; migrating them
  // would be a category error. Consent gates and password-match fields simply
  // contain the word.
  "EulaAgreement.tsx :: minimumAgeConfirmed",
  "SlateMirrorDesk.tsx :: rightsConfirmed",
  "page.tsx :: confirmPassword",
  "page.tsx :: changePasswordConfirm",
  "page.tsx :: bot-avatar-save-prompt-title",
  // Flow control, not data destruction — these gate leaving or interrupting a
  // session, and destroy nothing on their own.
  "DebateExperience.tsx :: debate-judge-objection-title",
  "DebateExperience.tsx :: debate-exhausted-exit-title",

  // --- A real inverse exists today, so these drop below `confirm` when they
  // are migrated. This is the backlog the policy exists to create.
  "page.tsx :: delete-bot-panel-title", // bots.delete, undo:"quarantine"
  "BotcastExperience.tsx :: signal-delete-title", // signal.episodes.delete
  "DebateExperience.tsx :: debate-delete-title", // debate.session.delete
  "DebateExperience.tsx :: debate-end-early-title", // recover-final-recess
  "AssetLibrary.tsx :: deleteConfirmationId", // quarantine + restore
  "AssetLibrary.tsx :: magentaConfirmation", // /magenta-pass/undo
  "AssetLibrary.tsx :: compressConfirmation", // /compress/undo
  "DebateExhibitMagentaControls.tsx :: confirming", // /magenta-pass/undo
  "SlateMirrorDesk.tsx :: confirmRepin", // prior version retained

  // --- Bulk. An inverse exists for several of these and they still confirm,
  // because per-item undo is not recovery at library scale.
  "page.tsx :: delete-all-title", // conversations.quarantine
  "page.tsx :: sweep-confirm-title", // /conversations/sweep/undo
  "page.tsx :: sweepConfirmOpen",
  "page.tsx :: image-cleanup-confirm-title", // recovery batch + restore
  "page.tsx :: imageCleanupConfirmOpen",
  "MemorySettings.tsx :: memory-clear-title", // memories.delete + /restore
  "AssetLibrary.tsx :: cleanupConfirmation",

  // --- Genuinely irreversible today. These keep `confirm` and owe a reason.
  "page.tsx :: delete-selected-bots-title", // raw SQL, no quarantine
  "page.tsx :: selectedBotDeleteConfirm",
  "page.tsx :: delete-images-all-title", // raw SQL + file unlink
  "page.tsx :: imagesDeleteAllConfirmOpen",
  "page.tsx :: delete-conversation-group-title", // raw, not a capability
  "page.tsx :: conversationGroupDeleteConfirm",
  "page.tsx :: delete-bot-library-group-title", // client state, no inverse
  "page.tsx :: botLibraryGroupDeleteConfirm",
  "page.tsx :: panelBotDeleteConfirm",
  "PrismCompanion.tsx :: personalNoteDeleteConfirm",
  "BotcastExperience.tsx :: signal-studio-cut-title",
  "BotcastExperience.tsx :: studioCutConfirmation",
  "ActionSfxPackMagicButton.tsx :: awaitingRegenerateConfirm",
  "EnglishPacingCalibrateMagicButton.tsx :: awaitingRegenerateConfirm",

  // --- Confirm-before-cancel on an in-flight operation, already pinned by
  // PrismBlockingLoader.test.ts.
  "PrismBlockingLoader.tsx :: (unlabelled dialog)",
  "PrismBlockingLoader.tsx :: confirming",
]);

/** Surfaces migrated onto the canonical mechanism. Empty until call sites are
 *  migrated; an entry here is what lets one leave the list above. */
const REGISTERED_CONFIRMATION_SURFACES = new Set<string>([]);

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return collectSourceFiles(full);
    return /\.(tsx|ts)$/u.test(entry) && !/\.test\.ts$/u.test(entry)
      ? [full]
      : [];
  });
}

const sources = collectSourceFiles(srcDir).map(
  (file) => [file, readFileSync(file, "utf8")] as const,
);

function basename(file: string): string {
  return file.split("/").pop() ?? file;
}

describe("confirmation contract", () => {
  it("routes every confirmation through the app, not the browser chrome", () => {
    // A native dialog cannot be styled, cannot name the specific consequence
    // in the app's own voice, and blocks the main thread — so it can never be
    // the canonical mechanism, only a thing to migrate off.
    const nativeDialog = /\bwindow\.(?:confirm|alert|prompt)\s*\(/gu;
    const found = new Map<string, { file: string; copy: string }>();
    const counts = new Map<string, number>();

    for (const [file, source] of sources) {
      const lines = source.split("\n");
      lines.forEach((line, index) => {
        if (!nativeDialog.test(line)) return;
        nativeDialog.lastIndex = 0;
        // The copy may sit on a following line when the call is wrapped.
        const window4 = lines.slice(index, index + 4).join(" ");
        const copy = /["'`]([^"'`]{8,})["'`]/u.exec(window4)?.[1] ?? "(no copy)";
        const key = `${basename(file)} :: ${copy.slice(0, 40)}`;
        found.set(key, { file: basename(file), copy: copy.slice(0, 40) });
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    }

    const allowed = new Map(
      GRANDFATHERED_NATIVE_DIALOGS.map((entry) => [
        `${entry.file} :: ${entry.copy}`,
        entry.count,
      ]),
    );

    const unexpected: string[] = [];
    for (const [key] of found) {
      const budget = allowed.get(key);
      const actual = counts.get(key) ?? 0;
      if (budget === undefined) {
        unexpected.push(`new native dialog — ${key}`);
      } else if (actual > budget) {
        unexpected.push(`${key} grew from ${budget} to ${actual} call sites`);
      }
    }

    assert.deepEqual(
      unexpected.sort(),
      [],
      "native browser dialogs are not a confirmation mechanism — see " +
        "docs/design-system.md § Confirmation and reversibility",
    );
  });

  it("keeps the grandfathered native-dialog list from going stale", () => {
    // A ratchet only ratchets if removing the last call site also removes the
    // entry, otherwise the list slowly becomes fiction.
    const present = new Set<string>();
    for (const [file, source] of sources) {
      const lines = source.split("\n");
      lines.forEach((line, index) => {
        if (!/\bwindow\.(?:confirm|alert|prompt)\s*\(/u.test(line)) return;
        const window4 = lines.slice(index, index + 4).join(" ");
        const copy = /["'`]([^"'`]{8,})["'`]/u.exec(window4)?.[1] ?? "(no copy)";
        present.add(`${basename(file)} :: ${copy.slice(0, 40)}`);
      });
    }

    const stale = GRANDFATHERED_NATIVE_DIALOGS.map(
      (entry) => `${entry.file} :: ${entry.copy}`,
    ).filter((key) => !present.has(key));

    assert.deepEqual(
      stale,
      [],
      "these native dialogs are gone — delete their allowlist entries",
    );
  });

  it("registers or grandfathers every confirmation-shaped surface", () => {
    const surfaces = new Set<string>();

    for (const [file, source] of sources) {
      const lines = source.split("\n");

      lines.forEach((line, index) => {
        // A JSX attribute is `role="alertdialog"`; a CSS selector is
        // `[role="alertdialog"]`. The bracket is the whole discriminator —
        // without it the two selector strings in page.tsx and
        // prismUniversalInputRefract.ts read as confirmation dialogs.
        if (!/(?<!\[)role="alertdialog"/u.test(line)) return;
        const ahead = lines.slice(index, index + 30).join(" ");
        const label = /aria-labelledby="([^"]+)"/u.exec(ahead)?.[1];
        surfaces.add(`${basename(file)} :: ${label ?? "(unlabelled dialog)"}`);
      });

      // State named for confirmation is the other shape a bespoke inline
      // confirmation takes when it is not a dialog at all.
      for (const [, id] of source.matchAll(
        /const \[([a-zA-Z0-9_$]*[Cc]onfirm[a-zA-Z0-9_$]*)\s*,/gu,
      )) {
        surfaces.add(`${basename(file)} :: ${id}`);
      }
    }

    const unregistered = [...surfaces].filter(
      (surface) =>
        !REGISTERED_CONFIRMATION_SURFACES.has(surface) &&
        !GRANDFATHERED_SURFACES.has(surface),
    );

    assert.deepEqual(
      unregistered.sort(),
      [],
      "new confirmation surfaces must declare their tier via " +
        "confirmationPolicy.ts — see docs/design-system.md"
    );
  });

  it("keeps the grandfathered surface list from going stale", () => {
    const present = new Set<string>();
    for (const [file, source] of sources) {
      const lines = source.split("\n");
      lines.forEach((line, index) => {
        if (!/(?<!\[)role="alertdialog"/u.test(line)) return;
        const ahead = lines.slice(index, index + 30).join(" ");
        const label = /aria-labelledby="([^"]+)"/u.exec(ahead)?.[1];
        present.add(`${basename(file)} :: ${label ?? "(unlabelled dialog)"}`);
      });
      for (const [, id] of source.matchAll(
        /const \[([a-zA-Z0-9_$]*[Cc]onfirm[a-zA-Z0-9_$]*)\s*,/gu,
      )) {
        present.add(`${basename(file)} :: ${id}`);
      }
    }

    assert.deepEqual(
      [...GRANDFATHERED_SURFACES].filter((key) => !present.has(key)).sort(),
      [],
      "these surfaces are gone — delete their allowlist entries",
    );
  });
});

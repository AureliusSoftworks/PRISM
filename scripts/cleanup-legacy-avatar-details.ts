import { cleanupLegacyAvatarData, type LegacyAvatarCleanupMode } from "../apps/api/src/legacy-avatar-cleanup.ts";

function usage(): string {
  return [
    "Usage:",
    "  npm run cleanup:legacy-avatar-details -- --db /explicit/path/to/localai.db --dry-run",
    "  npm run cleanup:legacy-avatar-details -- --db /explicit/path/to/localai.db --apply",
    "",
    "Backups are written under .codex/output/avatar-details/ before apply removes legacy data.",
  ].join("\n");
}

function parseArgs(argv: string[]): { databasePath: string; mode: LegacyAvatarCleanupMode } {
  let databasePath = "";
  let mode: LegacyAvatarCleanupMode = "dry-run";
  let sawMode = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--db") {
      databasePath = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--dry-run" || arg === "--apply") {
      if (sawMode) throw new Error("Choose exactly one of --dry-run or --apply.");
      sawMode = true;
      mode = arg === "--apply" ? "apply" : "dry-run";
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!databasePath.trim()) {
    throw new Error("--db with an explicit SQLite path is required.");
  }
  return { databasePath, mode };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const result = await cleanupLegacyAvatarData({
    databasePath: args.databasePath,
    mode: args.mode,
  });
  if (result.plan.imageRows.length !== 8) {
    console.warn(
      `Inventory note: expected the current workstation snapshot to contain 8 legacy image rows, but discovered ${result.plan.imageRows.length}. Runtime discovery remains authoritative.`
    );
  }
  const summary = `${result.plan.botReferences.length} bot references, ${result.plan.imageRows.length} image rows, ${result.plan.files.filter((file) => file.exists).length} files`;
  if (result.mode === "dry-run") {
    console.log(`Dry run: found ${summary}. No changes made.`);
  } else if (!result.applied) {
    console.log("Apply: no legacy avatar data found. No changes made.");
  } else {
    console.log(
      `Apply complete: cleared ${result.clearedBotReferences} bot references, deleted ${result.deletedImageRows} image rows and ${result.deletedFiles} files.`
    );
    console.log(`Verified backup: ${result.backupDirectory}`);
    if (result.stagedFilesRemaining.length > 0) {
      console.warn(
        `Warning: ${result.stagedFilesRemaining.length} staged files remain and are listed in cleanup-result.json.`
      );
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(usage());
  process.exitCode = 1;
}

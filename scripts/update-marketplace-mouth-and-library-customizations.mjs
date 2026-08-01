#!/usr/bin/env node
/**
 * Compatibility entrypoint for the canonical Library-to-Marketplace design
 * promoter. The canonical promoter synchronizes face/ink/spinner and portable
 * PRISM/base voice shaping while stripping account-bound ElevenLabs identity.
 */

import { execFileSync } from "node:child_process";
import { join } from "node:path";

const canonicalScript = join(
  import.meta.dirname,
  "promote-library-design-to-marketplace.mjs",
);

execFileSync(
  process.execPath,
  ["--experimental-strip-types", canonicalScript, ...process.argv.slice(2)],
  { stdio: "inherit" },
);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8").replace(
  /\s+/gu,
  " ",
);

function sourceBlockAfter(needle: string, terminator: string): string {
  const start = pageSource.indexOf(needle);
  assert.notEqual(start, -1, `Missing source needle: ${needle}`);
  const end = pageSource.indexOf(terminator, start);
  assert.notEqual(
    end,
    -1,
    `Missing source terminator after ${needle}: ${terminator}`,
  );
  return pageSource.slice(start, end);
}

test("ElevenLabs balance leads the Usage panel and exposes key management", () => {
  const usagePanel = sourceBlockAfter(
    "const renderUsagePanel = ():",
    "// ── Shared right-hand panels",
  );
  const balanceIndex = usagePanel.indexOf(
    "className={styles.elevenLabsCreditsCard}",
  );
  const prismUsageIndex = usagePanel.indexOf(
    "className={styles.usageHero}",
  );

  assert.ok(balanceIndex >= 0, "Usage should render the ElevenLabs balance");
  assert.ok(
    prismUsageIndex > balanceIndex,
    "ElevenLabs balance should appear before PRISM usage totals",
  );
  assert.match(
    usagePanel,
    /onClick=\{\(\) => openSettingsPanel\("connections"\)\}/,
  );
  assert.match(usagePanel, /Account key connected/);
  assert.match(usagePanel, /Connect key/);
});

test("ElevenLabs balance is no longer duplicated in Connections", () => {
  assert.equal(
    pageSource.match(/className=\{styles\.elevenLabsCreditsCard\}/gu)?.length,
    1,
  );
});

test("opening Usage loads a saved online ElevenLabs balance once", () => {
  const autoRefresh = sourceBlockAfter(
    "useEffect(() => { if ( panel !== \"usage\"",
    "const [settingsScope, setSettingsScope]",
  );

  assert.match(autoRefresh, /elevenLabsCreditAvailability\.canCheck/);
  assert.match(autoRefresh, /visibleElevenLabsCreditBalance/);
  assert.match(autoRefresh, /elevenLabsCreditStatus === "checking"/);
  assert.match(autoRefresh, /elevenLabsCreditStatus === "error"/);
  assert.match(autoRefresh, /void refreshElevenLabsCreditBalance\(\)/);
});

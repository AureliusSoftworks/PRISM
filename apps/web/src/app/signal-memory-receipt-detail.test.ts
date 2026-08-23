import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);

describe("Signal memory receipt detail", () => {
  it("toggles the selected live receipt and scopes detail to its active Signal session", () => {
    assert.match(pageSource, /toggleSignalMemoryAcquisitionReceipt/u);
    assert.match(pageSource, /selectedMemoryReceipt\?\.id === receipt\.id/u);
    assert.match(pageSource, /receipt\?\.conversationId !== signalLiveSessionId/u);
    assert.match(pageSource, /sessionId: signalLiveSessionId,[\s\S]{0,100}signalToggle: true/u);
  });

  it("places the receipt detail after the Signal stage and producer controls", () => {
    assert.match(pageSource, /signalMemoryReceiptDetail=\{renderSignalMemoryAcquisitionReceiptCard\(\)\}/u);
    const detailIndex = signalSource.indexOf("data-signal-memory-receipt-detail");
    const stageIndex = signalSource.lastIndexOf("renderStage({", detailIndex);
    const controlsIndex = signalSource.lastIndexOf("className={styles.controlRoom}", detailIndex);
    assert.ok(stageIndex >= 0 && controlsIndex > stageIndex && detailIndex > controlsIndex);
    assert.match(signalSource, /aria-label="New Signal memory details"/u);
    assert.doesNotMatch(
      signalSource.slice(stageIndex, detailIndex),
      /data-signal-memory-receipt-detail/u,
    );
  });
});

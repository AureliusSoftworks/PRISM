import assert from "node:assert/strict";
import test from "node:test";
import {
  BOT_DIAGNOSTIC_CLIPBOARD_SCHEMA,
  formatBotDiagnosticClipboardText,
} from "./botDiagnosticClipboard.ts";

test("formats a versioned, paste-ready bot diagnostic record", () => {
  const copied = formatBotDiagnosticClipboardText({
    prismVersion: "0.15.0",
    capturedAt: "2026-08-15T12:00:00.000Z",
    bot: {
      name: "Cursing Curtis",
      identity: { id: "bot-curtis", color: "#ff3b30", glyph: "zap" },
      personality: {
        systemPrompt: "A friendly baker.",
        profile: { core: { traits: "patient" } },
      },
      powers: [
        {
          name: "Cursed Tongue",
          compileStatus: "ready",
          compiled: { sourceHash: "power-source-hash" },
        },
      ],
    },
  });

  assert.match(copied, /^# PRISM Bot Diagnostic/mu);
  assert.match(
    copied,
    new RegExp(`Format: ${BOT_DIAGNOSTIC_CLIPBOARD_SCHEMA}`, "u"),
  );
  assert.match(copied, /"name": "Cursed Tongue"/u);
  assert.match(copied, /"systemPrompt": "A friendly baker\."/u);
  assert.match(copied, /"sourceHash": "power-source-hash"/u);
});

test("omits private context and summarizes embedded bot media", () => {
  const copied = formatBotDiagnosticClipboardText({
    prismVersion: "0.15.0",
    capturedAt: "2026-08-15T12:00:00.000Z",
    bot: {
      name: "Private Percy",
      openAiApiKey: "should-never-copy",
      memories: ["private learned memory"],
      voice: {
        audioDataUrl: "data:audio/wav;base64,TOPSECRET",
        fileName: "presence.wav",
      },
      appearance: {
        paintMaskBase64: "QUJDREVGRw==",
      },
    },
  });

  assert.doesNotMatch(
    copied,
    /should-never-copy|private learned memory|TOPSECRET|QUJDREVGRw==/u,
  );
  assert.match(copied, /"openAiApiKey": "\[redacted\]"/u);
  assert.match(copied, /\[omitted: learned or conversation context\]/u);
  assert.match(copied, /"omitted": "embedded audio"/u);
  assert.match(copied, /"omitted": "encoded avatar mask"/u);
  assert.match(copied, /"fileName": "presence\.wav"/u);
});

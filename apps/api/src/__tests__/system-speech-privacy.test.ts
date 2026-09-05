import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { isPlayablePcmWave, runSystemSpeechCommand } from "../builtin-tts.ts";

const READ_PRIVATE_INPUT = `
process.stdin.setEncoding('utf8');
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  process.stdout.write(JSON.stringify({
    input,
    argvLeak: process.argv.some(value => value.includes(input)),
    envLeak: Object.values(process.env).some(value => value.includes(input)),
  }));
});
`;

describe("private operating-system speech transport", () => {
  it("keeps four concurrent inputs in separate pipes, outside argv and environment", async () => {
    const texts = Array.from({ length: 4 }, (_, index) =>
      `private-account-${index}-speech-canary: café, 日本語, 🌈\nsecond line`,
    );
    const outputs = await Promise.all(texts.map((input) =>
      runSystemSpeechCommand({
        command: process.execPath,
        parameters: ["-e", READ_PRIVATE_INPUT],
        input,
      }),
    ));
    for (let index = 0; index < texts.length; index += 1) {
      const output = JSON.parse(outputs[index]!);
      assert.equal(output.input, texts[index]);
      assert.equal(output.argvLeak, false);
      assert.equal(output.envLeak, false);
      for (let other = 0; other < texts.length; other += 1) {
        if (other !== index) assert.equal(outputs[index]!.includes(texts[other]!), false);
      }
    }
  });

  it("does not forward engine-echoed speech into failure diagnostics", async () => {
    const canary = "private-speech-diagnostic-canary";
    await assert.rejects(
      runSystemSpeechCommand({
        command: process.execPath,
        parameters: ["-e", `
          process.stdin.on('data', chunk => process.stderr.write(chunk));
          process.stdin.on('end', () => { process.exitCode = 7; });
        `],
        input: canary,
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "System speech command stopped (7).");
        assert.equal(String(error.stack).includes(canary), false);
        return true;
      },
    );
  });

  it("handles early child exit without an unhandled private-input pipe error", async () => {
    await assert.rejects(
      runSystemSpeechCommand({
        command: process.execPath,
        parameters: ["-e", "process.exit(7)"],
        input: "private-pipe-canary".repeat(100_000),
      }),
      /System speech (input could not be delivered|command stopped)/u,
    );
  });

  it("preserves cancellation before and during synthesis", async () => {
    await assert.rejects(
      runSystemSpeechCommand({
        command: process.execPath,
        parameters: ["-e", "process.exit(0)"],
        input: "private-aborted-input",
        signal: AbortSignal.abort(),
      }),
      { name: "AbortError" },
    );
    const controller = new AbortController();
    const pending = runSystemSpeechCommand({
      command: process.execPath,
      parameters: ["-e", "setInterval(() => {}, 1000)"],
      input: "private-inflight-input",
      signal: controller.signal,
    });
    const timer = setTimeout(() => controller.abort(), 30);
    try {
      await assert.rejects(pending, { name: "AbortError" });
    } finally {
      clearTimeout(timer);
    }
  });

  it("keeps voice enumeration working without speech input", async () => {
    assert.equal(await runSystemSpeechCommand({
      command: process.execPath,
      parameters: ["-e", "process.stdout.write('voice inventory')"],
    }), "voice inventory");
  });

  it("does not resolve cancellation while a speech child can still write scratch files", {
    skip: process.platform === "win32",
    timeout: 10_000,
  }, async () => {
    const directory = mkdtempSync(join(tmpdir(), "prism-speech-stop-test-"));
    const marker = join(directory, "child-pid");
    const controller = new AbortController();
    const pending = runSystemSpeechCommand({
      command: process.execPath,
      parameters: ["-e", `
        process.on('SIGTERM', () => {});
        require('node:fs').writeFileSync(process.argv[1], String(process.pid));
        setInterval(() => {}, 1000);
      `, marker],
      input: "private-cancelled-speech",
      signal: controller.signal,
    });
    const rejected = assert.rejects(pending, { name: "AbortError" });
    try {
      for (let attempt = 0; !existsSync(marker) && attempt < 100; attempt += 1) {
        await delay(20);
      }
      assert.equal(existsSync(marker), true);
      const pid = Number(readFileSync(marker, "utf8"));
      controller.abort();
      await rejected;
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    } finally {
      controller.abort();
      await rejected;
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("synthesizes playable macOS speech directly from stdin", {
    skip: process.platform !== "darwin",
    timeout: 30_000,
  }, async () => {
    const directory = mkdtempSync(join(tmpdir(), "prism-speech-pipe-test-"));
    const intermediate = join(directory, "speech.caf");
    const output = join(directory, "speech.wav");
    const canary = "Private pipe fixture. Café, rainbow.";
    const signal = AbortSignal.timeout(25_000);
    try {
      await runSystemSpeechCommand({
        command: "/usr/bin/say",
        parameters: ["-r", "180", "--data-format=LEI16@24000", "-o", intermediate, "-f", "-"],
        input: canary,
        signal,
      });
      await runSystemSpeechCommand({
        command: "/usr/bin/afconvert",
        parameters: [intermediate, output, "-f", "WAVE", "-d", "LEI16"],
        signal,
      });
      assert.equal(isPlayablePcmWave(readFileSync(output)), true);
      assert.deepEqual(readdirSync(directory).sort(), ["speech.caf", "speech.wav"]);
      for (const filename of readdirSync(directory)) {
        assert.equal(readFileSync(join(directory, filename)).includes(Buffer.from(canary)), false);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("wires both operating-system engines to stdin, not a plaintext scratch file", () => {
    const source = readFileSync(new URL("../builtin-tts.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /speech\.txt|PRISM_TTS_INPUT|writeFile\(/u);
    assert.match(source, /"-f",\s*"-"/u);
    assert.match(source, /\$synth\.Speak\(\[Console\]::In\.ReadToEnd\(\)\)/u);
    assert.match(source, /\[Console\]::InputEncoding = New-Object System\.Text\.UTF8Encoding/u);
    assert.equal(source.match(/input: args\.text/g)?.length, 2);
  });
});

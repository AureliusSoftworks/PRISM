import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEV_SECRET_ENV_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "ELEVENLABS_API_KEY",
  "BRAVE_SEARCH_API_KEY",
  "BRAVE_API_KEY",
];

function expandHomePath(value) {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  return trimmed;
}

function defaultSecretPaths(env) {
  const paths = [
    env.PRISM_DEV_SECRETS_ENV,
    env.CODEX_SECRETS_ENV,
    join(homedir(), "secrets.env"),
  ]
    .map(expandHomePath)
    .filter(Boolean);
  return [...new Set(paths)];
}

function stripInlineComment(value) {
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote && value[index - 1] !== "\\") quote = "";
      continue;
    }
    if ((char === '"' || char === "'" || char === "`") && index === 0) {
      quote = char;
      continue;
    }
    if (char === "#" && /\s/.test(value[index - 1] ?? "")) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value.trimEnd();
}

function unwrapQuotedValue(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'" || quote === "`") && trimmed.endsWith(quote)) {
    const inner = trimmed.slice(1, -1);
    if (quote === '"') {
      return inner
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"');
    }
    return inner.replace(new RegExp(`\\\\${quote}`, "g"), quote);
  }
  return stripInlineComment(trimmed);
}

export function parseEnvFileForKeys(source, allowedKeys = DEV_SECRET_ENV_KEYS) {
  const allowed = new Set(allowedKeys);
  const parsed = {};
  for (const rawLine of source.split(/\n/)) {
    const line = rawLine.replace(/\r$/, "");
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/,
    );
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!allowed.has(key)) continue;
    const value = unwrapQuotedValue(rawValue);
    if (value.trim()) parsed[key] = value;
  }
  return parsed;
}

export function loadDevSecretDefaults(env = process.env, options = {}) {
  const paths = options.paths ?? defaultSecretPaths(env);
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const parsed = parseEnvFileForKeys(
      readFileSync(path, "utf8"),
      options.allowedKeys,
    );
    const loadedKeys = [];
    for (const [key, value] of Object.entries(parsed)) {
      if (env[key]?.trim()) continue;
      env[key] = value;
      loadedKeys.push(key);
    }
    return { path, loadedKeys };
  }
  return { path: undefined, loadedKeys: [] };
}

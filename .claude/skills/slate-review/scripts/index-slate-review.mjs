#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

function usage() {
  return "Usage: node .claude/skills/slate-review/scripts/index-slate-review.mjs <export-path|-> [--json]";
}

function parseArgs(argv) {
  const json = argv.includes("--json");
  const paths = argv.filter((value) => value !== "--json");
  if (paths.length !== 1) throw new Error(usage());
  return { path: paths[0], json };
}

async function readInput(path) {
  if (path !== "-") return readFile(path, "utf8");
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function extractJson(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const fenced = /```json\s*([\s\S]*?)```/giu;
  let match;
  let candidate = null;
  while ((match = fenced.exec(text)) !== null) {
    const parsed = JSON.parse(match[1]);
    if (parsed?.format === "prism-slate-review-v1") candidate = parsed;
  }
  if (!candidate) {
    throw new Error("No prism-slate-review-v1 JSON envelope found.");
  }
  return candidate;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function string(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function validateExport(value) {
  if (!value || typeof value !== "object") throw new Error("Export must be an object.");
  if (value.format !== "prism-slate-review-v1") {
    throw new Error(`Unsupported Slate Review format: ${String(value.format)}`);
  }
  if (!value.project || typeof value.project !== "object") {
    throw new Error("Export is missing project metadata.");
  }
  if (!Array.isArray(value.sections) || value.sections.length === 0) {
    throw new Error("Export must contain at least one synthesized section.");
  }
  return value;
}

function countBy(items, key) {
  const result = {};
  for (const item of items) {
    const label = string(item?.[key], "unknown");
    result[label] = (result[label] ?? 0) + 1;
  }
  return result;
}

function hasCustomVibeAnswer(item) {
  if (item?.answer?.kind === "custom_vibe") {
    return Boolean(string(item.answer.vibe).trim());
  }
  if (typeof item?.customVibe === "string") {
    return Boolean(item.customVibe.trim());
  }
  return Boolean(string(item?.customVibe?.value).trim());
}

function sectionIndex(section) {
  const metadata = section?.section ?? {};
  const events = array(section?.developerEvents);
  const operations = array(section?.operations);
  const clarifications = array(section?.clarifications);
  const prose = string(section?.acceptedProse);
  return {
    id: string(metadata.id, "unknown"),
    title: string(metadata.title, "Untitled section"),
    kind: string(metadata.kind, "unknown"),
    revision: Number.isInteger(metadata.revision) ? metadata.revision : null,
    proseWords: prose.trim() ? prose.trim().split(/\s+/u).length : 0,
    operationCount: operations.length,
    operationStatuses: countBy(operations, "status"),
    clarificationCount: clarifications.length,
    customVibeCount: clarifications.filter(hasCustomVibeAnswer).length,
    eventCount: events.length,
    eventStages: countBy(events, "stage"),
    concernCount: array(section?.storyBible?.concerns).length,
    sourceCount: array(section?.sources).length,
    firstEventAt: string(events[0]?.createdAt) || null,
    lastEventAt: string(events.at(-1)?.createdAt) || null,
  };
}

export function indexSlateReviewExport(value) {
  const envelope = validateExport(value);
  return {
    format: envelope.format,
    exportedAt: string(envelope.exportedAt) || null,
    project: {
      id: string(envelope.project.id, "unknown"),
      title: string(envelope.project.title, "Untitled project"),
      proseMode: string(envelope.project.proseMode, "unknown"),
      continuityVersion: string(envelope.project.continuityVersion, "unknown"),
      activeGeneration: Number.isInteger(envelope.project.activeGeneration)
        ? envelope.project.activeGeneration
        : null,
      mirrorProfileVersionId:
        string(envelope.project.mirrorProfileVersionId) || null,
      codeRevision: string(envelope.project.codeRevision) || null,
    },
    sections: envelope.sections.map(sectionIndex),
  };
}

function renderText(index) {
  const lines = [
    `Slate Review: ${index.project.title}`,
    `Format: ${index.format}`,
    `Route: ${index.project.proseMode}`,
    `Continuity: ${index.project.continuityVersion} · generation ${index.project.activeGeneration ?? "unknown"}`,
    `Sections: ${index.sections.length}`,
  ];
  for (const section of index.sections) {
    lines.push(
      "",
      `${section.title} (${section.kind}, revision ${section.revision ?? "unknown"})`,
      `  Prose: ${section.proseWords} words`,
      `  Operations: ${section.operationCount}`,
      `  Clarifications: ${section.clarificationCount} (${section.customVibeCount} custom vibe)`,
      `  Developer events: ${section.eventCount}`,
      `  Concerns: ${section.concernCount}`,
      `  Event stages: ${JSON.stringify(section.eventStages)}`,
    );
  }
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = await readInput(args.path);
  const index = indexSlateReviewExport(extractJson(raw));
  process.stdout.write(`${args.json ? JSON.stringify(index, null, 2) : renderText(index)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

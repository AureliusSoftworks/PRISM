import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { PRISM_APPLET_ORDER, PRISM_APPLETS } from "./appletVersions.ts";
import {
  PRISM_LIGHT_MODE_APPLET_CONTRACTS,
  PRISM_LIGHT_MODE_FILE_GROUPS,
  PRISM_LIGHT_MODE_FORCED_DARK_ROOTS,
  PRISM_LIGHT_MODE_INTENTIONAL_DARK_MATERIALS,
  PRISM_LIGHT_MODE_OPEN_EXCEPTIONS,
  PRISM_LIGHT_MODE_PHASE_FIVE_ACCESSIBILITY_STATES,
  PRISM_LIGHT_MODE_PHASE_FIVE_INTERACTION_STATES,
  PRISM_LIGHT_MODE_PHASE_FIVE_LIFECYCLE_STATES,
  PRISM_LIGHT_MODE_PHASE_FIVE_RESPONSIVE_STATES,
  PRISM_LIGHT_MODE_PHASE_FIVE_SIGNAL_BASELINES,
  PRISM_LIGHT_MODE_PHASE_FIVE_SURFACE_FAMILIES,
  PRISM_LIGHT_MODE_PHASE_FIVE_VIEWPORT_SCENARIOS,
  PRISM_LIGHT_MODE_PHASE_FOUR_INTERACTION_STATES,
  PRISM_LIGHT_MODE_PHASE_FOUR_SURFACE_FAMILIES,
  PRISM_LIGHT_MODE_SHARED_PRIMITIVE_CONTRACTS,
  PRISM_LIGHT_MODE_SHARED_PRIMITIVE_FAMILIES,
  PRISM_LIGHT_MODE_SHARED_SOURCE_AUDIT,
  PRISM_LIGHT_MODE_STATE_FAMILIES,
  PRISM_LIGHT_MODE_SURFACE_CONTRACTS,
} from "./lightModeSurfaceInventory.ts";
import {
  PRISM_SURFACE_ORDER,
  PRISM_SURFACES,
} from "./prismSurfaceRegistry.ts";

const appDirectory = dirname(fileURLToPath(import.meta.url));

function discoverRenderSurfaceFiles(directory: string): string[] {
  const discovered: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      discovered.push(...discoverRenderSurfaceFiles(absolutePath));
      continue;
    }
    if (
      entry.name.includes(".test.") ||
      !(
        entry.name.endsWith(".tsx") ||
        entry.name.endsWith(".module.css") ||
        entry.name === "globals.css"
      )
    ) {
      continue;
    }
    discovered.push(relative(appDirectory, absolutePath));
  }
  return discovered.sort();
}

const assignedFiles = PRISM_LIGHT_MODE_FILE_GROUPS.flatMap((group) =>
  group.files.map((file) => ({ file, group })),
);

function source(file: string): string {
  return readFileSync(resolve(appDirectory, file), "utf8");
}

describe("whole-product Light-mode surface inventory", () => {
  it("assigns every render-bearing TSX/CSS file exactly once", () => {
    const counts = new Map<string, number>();
    for (const { file } of assignedFiles) {
      counts.set(file, (counts.get(file) ?? 0) + 1);
    }

    const duplicates = [...counts.entries()]
      .filter(([, count]) => count !== 1)
      .map(([file]) => file)
      .sort();
    assert.deepEqual(duplicates, [], `duplicate assignments: ${duplicates.join(", ")}`);
    assert.deepEqual(
      [...counts.keys()].sort(),
      discoverRenderSurfaceFiles(appDirectory),
    );
  });

  it("tracks the authoritative applet and living-shell registries", () => {
    assert.deepEqual(
      Object.keys(PRISM_LIGHT_MODE_APPLET_CONTRACTS),
      [...PRISM_APPLET_ORDER],
    );
    for (const appletId of PRISM_APPLET_ORDER) {
      assert.equal(
        PRISM_LIGHT_MODE_APPLET_CONTRACTS[appletId].status,
        PRISM_APPLETS[appletId].status,
      );
      assert.deepEqual(
        Object.keys(PRISM_LIGHT_MODE_APPLET_CONTRACTS[appletId].states),
        [...PRISM_LIGHT_MODE_STATE_FAMILIES],
      );
    }

    assert.deepEqual(
      Object.keys(PRISM_LIGHT_MODE_SURFACE_CONTRACTS),
      [...PRISM_SURFACE_ORDER],
    );
    const groupsById = new Map(
      PRISM_LIGHT_MODE_FILE_GROUPS.map((group) => [group.id, group]),
    );
    for (const surfaceId of PRISM_SURFACE_ORDER) {
      assert.equal(PRISM_LIGHT_MODE_SURFACE_CONTRACTS[surfaceId].id, surfaceId);
      assert.equal(PRISM_SURFACES[surfaceId].id, surfaceId);
      for (const groupId of PRISM_LIGHT_MODE_SURFACE_CONTRACTS[surfaceId]
        .fileGroupIds) {
        const group = groupsById.get(groupId);
        assert.ok(group, `${surfaceId} references missing ${groupId}`);
        assert.ok(
          new Set<string>(group.surfaceIds).has(surfaceId),
          `${groupId} does not classify ${surfaceId}`,
        );
      }
    }
  });

  it("keeps every open exception attached to a classified player surface", () => {
    const classified = new Map<
      string,
      (typeof assignedFiles)[number]["group"]
    >(assignedFiles.map(({ file, group }) => [file, group]));
    for (const exception of PRISM_LIGHT_MODE_OPEN_EXCEPTIONS) {
      const group = classified.get(exception.file);
      assert.ok(group, `${exception.file} is not classified`);
      assert.notEqual(group.classification, "qa-fixture");
      assert.notEqual(group.classification, "nonvisual-runtime");
      assert.equal(group.classification, exception.owner);
      assert.ok(exception.reason.length >= 24);
    }
  });

  it("audits every shared-source file exactly once", () => {
    const sharedFiles = PRISM_LIGHT_MODE_FILE_GROUPS
      .filter((group) => group.classification === "shared-source")
      .flatMap((group) => group.files)
      .sort();
    const auditedFiles = PRISM_LIGHT_MODE_SHARED_SOURCE_AUDIT.flatMap(
      (group) => group.files,
    ).sort();
    assert.deepEqual(auditedFiles, sharedFiles);
    for (const group of PRISM_LIGHT_MODE_SHARED_SOURCE_AUDIT) {
      assert.ok(group.reason.length >= 48, `${group.contract} needs audit rationale`);
    }
  });

  it("covers every shared primitive family with classified sources", () => {
    assert.deepEqual(
      PRISM_LIGHT_MODE_SHARED_PRIMITIVE_CONTRACTS.map(({ id }) => id),
      [...PRISM_LIGHT_MODE_SHARED_PRIMITIVE_FAMILIES],
    );
    const sharedFiles = new Set(
      PRISM_LIGHT_MODE_FILE_GROUPS
        .filter((group) => group.classification === "shared-source")
        .flatMap((group) => group.files),
    );
    for (const primitive of PRISM_LIGHT_MODE_SHARED_PRIMITIVE_CONTRACTS) {
      assert.ok(primitive.contract.length >= 48, `${primitive.id} needs a contract`);
      assert.ok(primitive.sourceFiles.length > 0, `${primitive.id} needs a source`);
      for (const file of primitive.sourceFiles) {
        assert.ok(sharedFiles.has(file), `${primitive.id} references non-shared ${file}`);
      }
    }
  });

  it("keeps intentional dark scene materials narrow and documented", () => {
    const sharedFiles = new Set(
      PRISM_LIGHT_MODE_FILE_GROUPS
        .filter((group) => group.classification === "shared-source")
        .flatMap((group) => group.files),
    );
    for (const material of PRISM_LIGHT_MODE_INTENTIONAL_DARK_MATERIALS) {
      assert.ok(sharedFiles.has(material.file));
      assert.ok(source(material.file).includes(material.selector));
      assert.ok(material.reason.length >= 48);
    }
  });

  it("uses the canonical body theme marker for portaled Light surfaces", () => {
    const page = source("page.tsx");
    assert.match(page, /document\.body\.dataset\.prismTheme = resolvedTheme/u);
    assert.doesNotMatch(page, /delete document\.body\.dataset\.prismTheme/u);

    const productionCssFiles = assignedFiles
      .filter(
        ({ file, group }) =>
          file.endsWith(".css") && group.classification !== "qa-fixture",
      )
      .map(({ file }) => file);
    const staleHtmlSelectors = productionCssFiles.filter((file) =>
      /html\[data-theme=["']light["']\]/u.test(source(file)),
    );
    assert.deepEqual(staleHtmlSelectors, []);

    const staleModuleClassSelectors = productionCssFiles.filter((file) =>
      /:global\(\.theme(?:Light|Dark)\)/u.test(source(file)),
    );
    assert.deepEqual(staleModuleClassSelectors, []);

    for (const file of [
      "prismCompanion.module.css",
      "prism-blocking-loader.module.css",
      "ControlShortcutGuide.module.css",
      "PrismMenu.module.css",
    ]) {
      assert.match(source(file), /body\[data-prism-theme="light"\]/u);
    }
  });

  it("does not force optional shared portal themes back to Dark", () => {
    assert.doesNotMatch(source("PrismBlockingLoader.tsx"), /theme = "dark"/u);
    assert.doesNotMatch(
      source("PrismMenu.tsx"),
      /request\.theme \?\? "dark"/u,
    );
    assert.doesNotMatch(
      source("prismRefractionGate.tsx"),
      /loader\?\.theme \?\? "dark"/u,
    );
    const botPicker = source("BotPicker.tsx");
    assert.match(botPicker, /groupTheme: BotPickerGroupTheme/u);
    assert.doesNotMatch(botPicker, /groupTheme = "dark"/u);
    assert.match(botPicker, /data-theme=\{groupTheme\}/u);

    const globals = source("globals.css");
    assert.match(
      globals,
      /body\[data-prism-theme="light"\]\s*\{[\s\S]*--prism-document-bg:\s*#edf5fc/u,
    );
    assert.match(globals, /--bg:\s*var\(--prism-document-bg\)/u);
    assert.match(globals, /--prism-document-selection-bg/u);
  });

  it("exact-counts literal forced-dark applet roots as unresolved exceptions", () => {
    const actual = assignedFiles
      .filter(
        ({ file, group }) =>
          file.endsWith(".tsx") && group.classification !== "qa-fixture",
      )
      .map(({ file }) => ({
        file,
        occurrences: source(file).match(/data-theme="dark"/gu)?.length ?? 0,
      }))
      .filter(({ occurrences }) => occurrences > 0)
      .sort((left, right) => left.file.localeCompare(right.file));
    const expected = [...PRISM_LIGHT_MODE_FORCED_DARK_ROOTS].sort((left, right) =>
      left.file.localeCompare(right.file),
    );
    assert.deepEqual(actual, expected);

    const exceptionFiles = new Set<string>(
      PRISM_LIGHT_MODE_OPEN_EXCEPTIONS.map((exception) => exception.file),
    );
    for (const root of actual) {
      assert.ok(exceptionFiles.has(root.file), `${root.file} needs an exception owner`);
    }
  });

  it("keeps every PRISM-biijf.4 surface family lifecycle and interaction state executable", () => {
    assert.deepEqual(
      PRISM_LIGHT_MODE_PHASE_FOUR_SURFACE_FAMILIES.map(({ id }) => id),
      [
        "avatar-and-identity",
        "slate",
        "images-assets-audio",
        "bots-marketplace-history",
        "settings-administration-legal",
        "public-prism-handoff",
        "planned-utility-placeholders",
      ],
    );

    const groups = new Map(
      PRISM_LIGHT_MODE_FILE_GROUPS.map((group) => [group.id, group]),
    );
    const classifiedFiles = new Map(
      assignedFiles.map(({ file, group }) => [file, group]),
    );
    for (const family of PRISM_LIGHT_MODE_PHASE_FOUR_SURFACE_FAMILIES) {
      assert.deepEqual(Object.keys(family.states), [
        ...PRISM_LIGHT_MODE_STATE_FAMILIES,
      ]);
      assert.deepEqual(Object.keys(family.interactions), [
        ...PRISM_LIGHT_MODE_PHASE_FOUR_INTERACTION_STATES,
      ]);
      for (const groupId of family.fileGroupIds) {
        assert.ok(groups.has(groupId), `${family.id} references missing ${groupId}`);
      }
      for (const file of family.evidenceFiles) {
        const group = classifiedFiles.get(file);
        assert.ok(group, `${family.id} references unclassified ${file}`);
        assert.notEqual(group.classification, "qa-fixture");
        assert.notEqual(group.classification, "nonvisual-runtime");
      }
    }

    for (const requiredGroup of [
      "libraries-and-settings",
      "identity-and-avatar",
      "slate",
      "prism-public-route",
      "legal",
    ]) {
      assert.ok(
        PRISM_LIGHT_MODE_PHASE_FOUR_SURFACE_FAMILIES.some((family) =>
          new Set<string>(family.fileGroupIds).has(requiredGroup),
        ),
        `${requiredGroup} is missing from the phase .4 matrix`,
      );
    }
    assert.equal(
      PRISM_LIGHT_MODE_OPEN_EXCEPTIONS.some(
        (exception) => String(exception.followup) === "PRISM-biijf.4",
      ),
      false,
    );
  });

  it("exact-partitions every PRISM-biijf.5 transient and responsive owner", () => {
    assert.deepEqual(PRISM_LIGHT_MODE_PHASE_FIVE_INTERACTION_STATES, [
      "rest",
      "hover",
      "focus-visible",
      "pressed-active",
      "selected-checked",
      "disabled",
      "busy",
      "drag-drop",
      "resize",
      "resizable-modal-limits",
      "file-chooser-drop-zone",
      "range-slider",
      "scroll-boundary",
      "keyboard-navigation",
      "tooltip-context-menu-portal",
      "modal-popover-stacking",
    ]);
    assert.deepEqual(PRISM_LIGHT_MODE_PHASE_FIVE_LIFECYCLE_STATES, [
      "loading",
      "streaming",
      "thinking",
      "synthesis",
      "empty",
      "permission",
      "privacy",
      "offline",
      "error",
      "retry",
      "reconnect",
      "cancellation",
      "completion",
      "toast-status",
      "destructive-confirmation",
      "progress",
      "suspense",
      "route-recovery",
      "global-recovery",
    ]);
    assert.deepEqual(PRISM_LIGHT_MODE_PHASE_FIVE_RESPONSIVE_STATES, [
      "reference-1440x900",
      "narrower-width",
      "shorter-height",
      "no-page-scroll-live",
      "stable-transcript",
      "overflow-clipping",
      "modal-panel-resizing",
      "header-composer-collision",
      "safe-area",
      "zoom-friendly-units",
    ]);
    assert.deepEqual(PRISM_LIGHT_MODE_PHASE_FIVE_ACCESSIBILITY_STATES, [
      "theme-native-color-scheme",
      "semantic-contrast-tokens",
      "visible-focus",
      "disabled-affordance",
      "reduced-motion",
      "forced-colors",
      "screen-reader-status",
    ]);

    const groups = new Map(
      PRISM_LIGHT_MODE_FILE_GROUPS.map((group) => [group.id, group]),
    );
    const familyByGroup = new Map<string, (typeof PRISM_LIGHT_MODE_PHASE_FIVE_SURFACE_FAMILIES)[number]>();
    for (const family of PRISM_LIGHT_MODE_PHASE_FIVE_SURFACE_FAMILIES) {
      assert.deepEqual(Object.keys(family.interactions), [
        ...PRISM_LIGHT_MODE_PHASE_FIVE_INTERACTION_STATES,
      ]);
      assert.deepEqual(Object.keys(family.lifecycle), [
        ...PRISM_LIGHT_MODE_PHASE_FIVE_LIFECYCLE_STATES,
      ]);
      assert.deepEqual(Object.keys(family.responsive), [
        ...PRISM_LIGHT_MODE_PHASE_FIVE_RESPONSIVE_STATES,
      ]);
      assert.deepEqual(Object.keys(family.accessibility), [
        ...PRISM_LIGHT_MODE_PHASE_FIVE_ACCESSIBILITY_STATES,
      ]);
      for (const groupId of family.fileGroupIds) {
        assert.ok(groups.has(groupId), `${family.id} references missing ${groupId}`);
        assert.equal(
          familyByGroup.has(groupId),
          false,
          `${groupId} has multiple phase .5 owners`,
        );
        familyByGroup.set(groupId, family);
      }
      for (const file of family.evidenceFiles) {
        assert.ok(
          assignedFiles.some((entry) => entry.file === file),
          `${family.id} references unclassified ${file}`,
        );
      }
    }
    assert.deepEqual(
      [...familyByGroup.keys()].sort(),
      [...groups.keys()].sort(),
    );

    for (const state of PRISM_LIGHT_MODE_PHASE_FIVE_INTERACTION_STATES) {
      assert.ok(
        PRISM_LIGHT_MODE_PHASE_FIVE_SURFACE_FAMILIES.some(
          (family) => family.interactions[state] === "code-covered",
        ),
        `${state} has no executable interaction owner`,
      );
    }
    for (const state of PRISM_LIGHT_MODE_PHASE_FIVE_LIFECYCLE_STATES) {
      assert.ok(
        PRISM_LIGHT_MODE_PHASE_FIVE_SURFACE_FAMILIES.some(
          (family) => family.lifecycle[state] === "code-covered",
        ),
        `${state} has no executable lifecycle owner`,
      );
    }
    for (const state of PRISM_LIGHT_MODE_PHASE_FIVE_RESPONSIVE_STATES) {
      assert.ok(
        PRISM_LIGHT_MODE_PHASE_FIVE_SURFACE_FAMILIES.some(
          (family) => family.responsive[state] === "code-covered",
        ),
        `${state} has no executable responsive owner`,
      );
    }
    for (const state of PRISM_LIGHT_MODE_PHASE_FIVE_ACCESSIBILITY_STATES) {
      assert.ok(
        PRISM_LIGHT_MODE_PHASE_FIVE_SURFACE_FAMILIES.some(
          (family) => family.accessibility[state] === "code-covered",
        ),
        `${state} has no executable accessibility owner`,
      );
    }

    const sourceSignals = {
      interactions:
        /:hover|:focus-visible|:active|:disabled|aria-(?:pressed|checked|disabled|busy)|data-(?:selected|active|checked|disabled|busy|drag|drop)|on(?:DragEnter|DragLeave|DragOver|DragStart|DragEnd|Drop|KeyDown)|createPortal\(|type=["'](?:checkbox|radio|file|range)["']/u,
      lifecycle:
        /loading|streaming|thinking|synthesis|empty|permission|privacy|offline|error|retry|reconnect|cancel|complete|toast|status|progress|suspense|recovery/iu,
      responsive:
        /@media\s*\(|@container\s*\(|clamp\(|dvh|dvw|svh|svw|safe-area|overflow|resize|ResizeObserver|useViewport(?:Width|Height)|getBoundingClientRect/iu,
      accessibility:
        /prefers-reduced-motion|forced-colors|color-scheme|role=["{](?:status|alert)|aria-live|aria-busy|focus-visible/iu,
    } as const;
    for (const { file, group } of assignedFiles) {
      const fileSource = source(file);
      for (const [signal, pattern] of Object.entries(sourceSignals)) {
        if (!pattern.test(fileSource)) continue;
        const family = familyByGroup.get(group.id);
        assert.ok(family, `${file} has an unclassified ${signal} signal`);
        if (
          group.classification !== "qa-fixture" &&
          group.classification !== "nonvisual-runtime"
        ) {
          assert.equal(
            family.playerVisible,
            true,
            `${file} hides a player-visible ${signal} signal`,
          );
        }
      }
    }

    assert.equal(PRISM_LIGHT_MODE_OPEN_EXCEPTIONS.length, 0);
  });

  it("keeps the desktop viewport matrix axis-independent and non-fixed", () => {
    assert.deepEqual(
      PRISM_LIGHT_MODE_PHASE_FIVE_VIEWPORT_SCENARIOS.map(({ id }) => id),
      [
        "reference-1440x900",
        "narrower-1180x900",
        "shorter-1440x720",
        "narrower-shorter-1180x720",
      ],
    );
    assert.ok(
      PRISM_LIGHT_MODE_PHASE_FIVE_VIEWPORT_SCENARIOS.every(
        ({ fixedRequirement }) => fixedRequirement === false,
      ),
    );
    const reference = PRISM_LIGHT_MODE_PHASE_FIVE_VIEWPORT_SCENARIOS[0];
    const narrower = PRISM_LIGHT_MODE_PHASE_FIVE_VIEWPORT_SCENARIOS[1];
    const shorter = PRISM_LIGHT_MODE_PHASE_FIVE_VIEWPORT_SCENARIOS[2];
    assert.equal(narrower.logicalHeight, reference.logicalHeight);
    assert.ok(narrower.logicalWidth < reference.logicalWidth);
    assert.equal(shorter.logicalWidth, reference.logicalWidth);
    assert.ok(shorter.logicalHeight < reference.logicalHeight);
  });

  it("fails loudly when structural phase .5 state signals change", () => {
    const patterns = {
      interaction:
        /:hover\b|:focus-visible\b|:active\b|:disabled\b|\baria-(?:pressed|checked|disabled|busy)\b|\bdata-(?:selected|active|checked|disabled|busy|dragging|drag-over|drop-active)\b|\bon(?:DragEnter|DragLeave|DragOver|DragStart|DragEnd|Drop|KeyDown)\b|\bdraggable(?:=|\b)|\btabIndex=|\btype=["'](?:checkbox|radio|file|range)["']|\brole=["{](?:dialog|alertdialog|menu|menuitem|listbox|option|tab|switch)\b|\bcreatePortal\(/gu,
      lifecycle:
        /\baria-live\b|\brole=["{](?:status|alert)\b|\baria-busy\b|\bdata-(?:loading|streaming|thinking|synthesis|empty|permission|privacy|offline|error|retry|reconnect|cancelled|completed|progress)\b|\bSuspense\b/gu,
      responsive:
        /@media\s*\(|@container\s*\(|\bclamp\(|\b(?:dvh|dvw|svh|svw)\b|\benv\(safe-area|\boverflow(?:-[xy])?\s*:|\bresize\s*:|\bResizeObserver\b|\buseViewport(?:Width|Height)\b|\bgetBoundingClientRect\b/gu,
      accessibility:
        /:focus-visible\b|prefers-reduced-motion|forced-colors|color-scheme\s*:|\baria-live\b|\baria-busy\b|\brole=["{](?:status|alert)\b/gu,
    } as const;

    const actual = PRISM_LIGHT_MODE_FILE_GROUPS.map((group) => {
      const row: {
        groupId: string;
        interaction: { files: number; count: number };
        lifecycle: { files: number; count: number };
        responsive: { files: number; count: number };
        accessibility: { files: number; count: number };
      } = {
        groupId: group.id,
        interaction: { files: 0, count: 0 },
        lifecycle: { files: 0, count: 0 },
        responsive: { files: 0, count: 0 },
        accessibility: { files: 0, count: 0 },
      };
      for (const [signal, pattern] of Object.entries(patterns)) {
        for (const file of group.files) {
          const matches = [
            ...source(file).matchAll(
              new RegExp(pattern.source, pattern.flags),
            ),
          ].length;
          if (matches === 0) continue;
          row[signal as keyof typeof patterns].files += 1;
          row[signal as keyof typeof patterns].count += matches;
        }
      }
      return row;
    });

    assert.deepEqual(actual, PRISM_LIGHT_MODE_PHASE_FIVE_SIGNAL_BASELINES);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  clampTextContextMenuPosition,
  isTextEntryInputType,
  resolveTextFieldCommandState,
} from "./editableTextContextMenuModel.ts";

test("recognizes text-entry input types", () => {
  assert.equal(isTextEntryInputType("text"), true);
  assert.equal(isTextEntryInputType("SEARCH"), true);
  assert.equal(isTextEntryInputType("password"), true);
  assert.equal(isTextEntryInputType("number"), true);
  assert.equal(isTextEntryInputType("checkbox"), false);
  assert.equal(isTextEntryInputType("range"), false);
});

test("resolves command availability from text field state", () => {
  assert.deepEqual(
    resolveTextFieldCommandState({
      mutable: true,
      hasSelection: true,
      hasText: true,
    }),
    {
      cut: true,
      copy: true,
      paste: true,
      selectAll: true,
    }
  );

  assert.deepEqual(
    resolveTextFieldCommandState({
      mutable: false,
      hasSelection: true,
      hasText: true,
    }),
    {
      cut: false,
      copy: true,
      paste: false,
      selectAll: true,
    }
  );

  assert.deepEqual(
    resolveTextFieldCommandState({
      mutable: true,
      hasSelection: false,
      hasText: false,
    }),
    {
      cut: false,
      copy: false,
      paste: true,
      selectAll: false,
    }
  );
});

test("clamps context menu position inside the viewport", () => {
  assert.deepEqual(
    clampTextContextMenuPosition({
      x: 790,
      y: 590,
      menuWidth: 160,
      menuHeight: 120,
      viewportWidth: 800,
      viewportHeight: 600,
    }),
    {
      x: 632,
      y: 472,
    }
  );

  assert.deepEqual(
    clampTextContextMenuPosition({
      x: -50,
      y: -20,
      menuWidth: 160,
      menuHeight: 120,
      viewportWidth: 800,
      viewportHeight: 600,
    }),
    {
      x: 8,
      y: 8,
    }
  );
});

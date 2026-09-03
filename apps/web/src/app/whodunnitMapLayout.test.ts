import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("found assets are a map companion rail, never part of the heading", () => {
  const source = readFileSync(new URL("./DebateMysteryV2Experience.tsx", import.meta.url), "utf8");
  const root = ts.createSourceFile("experience.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const element = (className: string): ts.JsxElement => {
    let result: ts.JsxElement | undefined;
    const visit = (node: ts.Node): void => {
      if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some((property) => ts.isJsxAttribute(property) && property.name.getText(root) === "className" && property.initializer?.getText(root) === `{styles.${className}}`)) result = node;
      ts.forEachChild(node, visit);
    };
    visit(root);
    assert.ok(result, className);
    return result;
  };
  assert.doesNotMatch(element("mansionHeading").getText(root), /foundItemVisualsPanel/u);
  const workspace = element("mansionWorkspace").getText(root);
  assert.match(workspace, /foundItemVisualsPanel/u);
  assert.match(workspace, /mansionMapStage/u);
  assert.match(element("mansionMapStage").getText(root), /mansionViewport/u);
  const css = readFileSync(new URL("./debateMysteryV2.module.css", import.meta.url), "utf8");
  assert.match(css, /\.mansionMapStage\s*\{[^}]*container-type: size/u);
  assert.match(css, /\.mansionViewport\s*\{[^}]*height: min\(100cqh, 75cqw, 51rem\);[^}]*aspect-ratio: 4 \/ 3/u);
  assert.match(css, /\.foundItemVisualsPanel > header strong\s*\{[^}]*font: 700 1rem/u);
  assert.match(css, /\.foundItemVisualsPanel > div\s*\{[^}]*overflow: auto/u);
  assert.match(css, /\.foundItemVisualsPanel \{ grid-column: 1; grid-row: 2;/u);
});
